/**
 * MegaRace Chaos match: holds the authoritative game state for a single match
 * and ticks at TICK_RATE Hz.
 */
import {
  BASE_TICKS_PER_STEP,
  BOOSTS,
  COMEBACK_FOOD_SPAWN_BONUS,
  CORE_EVENT_POINTS,
  CORE_EVENT_WINDOW_MS,
  DASH_ABILITY_COST,
  DASH_ABILITY_DISTANCE,
  DASH_ABILITY_RECHARGE_MS,
  type Direction,
  ENDGAME_MULTIPLIER_START_MS,
  ENDGAME_SPAWN_INTERVAL_MUL,
  FIELD_H,
  FIELD_W,
  type GameState,
  INITIAL_LENGTH,
  LEADER_PRESSURE_BONUS_POINTS,
  LEADER_PRESSURE_GROWTH_BONUS,
  LEADER_PRESSURE_RADIUS,
  type LeaderboardEntry,
  type MatchReport,
  MATCH_DURATION_MS,
  PICKUP_MAX_ON_FIELD,
  PICKUP_POOL,
  PLAYER_COLORS,
  SPEED_ZONE_BOOST_MS,
  SPEED_ZONE_DURATION_MS,
  SPEED_ZONE_SPAWN_INTERVAL_MS,
  SPEED_ZONE_SPEED_MULTIPLIER,
  type Snake,
  TELEPORT_PAIR_SPAWN_CHANCE,
  TICK_MS,
  torusChebyshev,
  WEATHER_CLEAR_UNTIL_MS,
  WEATHER_ICE_SPEED_MULTIPLIER,
  WEATHER_PHASE_MS,
  WEATHER_WIND_SPEED_MULTIPLIER,
  type Vec2,
  type WeatherState,
  wrap,
} from "@megasnake/shared";
import {
  applyBoost as _applyBoost,
  consumeAt,
  consumeHammerHeadSweep,
  effectiveTicksPerStep,
  stepOrBounceOnOtherSnakeHit,
  stepHeadTo,
  tickStatuses,
} from "./boosts/index.js";
import { foodSpawnIntervalMs, goldenChance, spawnFood, spawnFoodCluster } from "./food.js";
import { rollMysteryInterval, spawnMysteryBox } from "./mystery.js";
// Import mystery.ts for its side-effect (registers the resolver) before any consumeAt fires.
import "./mystery.js";
import { botStep } from "./bots.js";
import { buildReport, logReport } from "./metrics.js";
import { makeRng, pickWeighted, rndInt } from "./rng.js";

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const SAMPLE_INTERVAL_MS = 1000;

let snakeCounter = 0;
let pickupCounter = 0;

export interface MatchOptions {
  seed?: number;
}

export class Match {
  state: GameState;
  rng: () => number;

  /** Time of next regular food spawn (in match ms). */
  private nextFoodAt = 0;
  private nextPickupAt = 750;
  private nextMysteryAt = 1000;
  private nextSampleAt = 0;
  private nextSpeedZoneAt = 8000;
  private nextTeleportPairAt = 18_000;
  private nextCoreAt = 60_000;

  private lastReport: MatchReport | null = null;

  /** Timestamps (match ms) of «wow» events: mystery open, dash, global blackout. */
  private wowMoments: number[] = [];

  /** Индекс 30-сек слота погоды, для которого уже выбран тип (рандом на слот). */
  private weatherScheduleSlot = -1;

  constructor(opts: MatchOptions = {}) {
    this.rng = makeRng(opts.seed ?? Date.now());
    this.state = {
      phase: "lobby",
      tick: 0,
      elapsedMs: 0,
      lobbyMs: 0,
      fieldW: FIELD_W,
      fieldH: FIELD_H,
      snakes: [],
      food: [],
      pickups: [],
      mysteryBoxes: [],
      globalEffects: [],
      events: [],
      speedZones: [],
      weather: null,
      weatherEndsAt: 0,
      teleportPairs: [],
      coreEvent: null,
    };
  }

  // ------------------------ Lifecycle ------------------------

  setLobbyMs(ms: number): void {
    this.state.lobbyMs = Math.max(0, ms);
  }

  startMatch(): void {
    this.state.phase = "playing";
    this.state.elapsedMs = 0;
    this.state.tick = 0;
    this.state.food = [];
    this.state.pickups = [];
    this.state.mysteryBoxes = [];
    this.state.globalEffects = [];
    this.state.events = [];
    this.nextFoodAt = 0;
    this.nextPickupAt = 600;
    this.nextMysteryAt = 750;
    this.nextSampleAt = 0;
    this.nextSpeedZoneAt = 8000;
    this.nextTeleportPairAt = 18_000;
    this.nextCoreAt = 60_000;
    this.wowMoments = [];
    this.weatherScheduleSlot = -1;
    this.placeSnakes();
    // Pre-seed: 12 food + 1 box so opening seconds aren't empty.
    for (let i = 0; i < 12; i++) spawnFood(this.state, this.rng, this.rng() < 0.1 ? "golden" : "normal");
    spawnMysteryBox(this.state, this.rng);
    // Seed 1-2 pickups too
    this.spawnPickup();
  }

  endMatch(): MatchReport {
    this.state.phase = "ended";
    const r = buildReport(this.state, this.wowMoments);
    this.lastReport = r;
    logReport(r);
    return r;
  }

  getReport(): MatchReport | null {
    return this.lastReport;
  }

  // ------------------------ Players ------------------------

  addPlayer(opts: { id: string; name: string; isBot: boolean; abilityId?: Snake["abilityId"] }): Snake {
    const colorIdx = this.state.snakes.length % PLAYER_COLORS.length;
    const snake: Snake = {
      id: opts.id,
      name: opts.name,
      colorIdx,
      isBot: opts.isBot,
      alive: true,
      body: [],
      dir: "right",
      nextDir: "right",
      lastStepTick: 0,
      ticksPerStep: BASE_TICKS_PER_STEP,
      pendingGrowth: 0,
      statuses: [],
      lastHardDebuffAt: -10_000,
      stats: {
        foodEaten: 0,
        goldenEaten: 0,
        boostsCollected: 0,
        mysteryOpened: 0,
        dashesUsed: 0,
        lengthSamples: [],
      },
      score: 0,
      energy: 100,
      energyCooldownUntil: 0,
      abilityId: opts.abilityId ?? "dashAbility",
    };
    this.state.snakes.push(snake);
    return snake;
  }

  removePlayer(id: string): void {
    this.state.snakes = this.state.snakes.filter((s) => s.id !== id);
  }

  setInput(id: string, dir: Direction): void {
    if (dir !== "up" && dir !== "down" && dir !== "left" && dir !== "right") return;
    const s = this.state.snakes.find((sn) => sn.id === id);
    if (!s || !s.alive) return;
    if (dir === OPPOSITE[s.dir]) return;
    // Turn invert active?
    const inv = s.statuses.find(
      (st) => st.id === "turnInvert" && st.expiresAt > this.state.elapsedMs,
    );
    if (inv) {
      // Flip lateral inputs
      if (dir === "left") dir = "right";
      else if (dir === "right") dir = "left";
    }
    s.nextDir = dir;
  }

  /** Place all current snakes evenly around the field with a small body. */
  private placeSnakes(): void {
    const n = this.state.snakes.length;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      const s = this.state.snakes[i]!;
      const angle = (i / n) * Math.PI * 2;
      const cx = Math.floor(FIELD_W / 2 + Math.cos(angle) * (FIELD_W / 3));
      const cy = Math.floor(FIELD_H / 2 + Math.sin(angle) * (FIELD_H / 3));
      const dirs: Direction[] = ["right", "down", "left", "up"];
      s.dir = dirs[i % 4]!;
      s.nextDir = s.dir;
      s.body = [];
      const dx = s.dir === "left" ? 1 : s.dir === "right" ? -1 : 0;
      const dy = s.dir === "up" ? 1 : s.dir === "down" ? -1 : 0;
      for (let k = 0; k < INITIAL_LENGTH; k++) {
        s.body.push({ x: wrap(cx + dx * k, FIELD_W), y: wrap(cy + dy * k, FIELD_H) });
      }
      s.lastStepTick = -BASE_TICKS_PER_STEP;
      s.statuses = [];
      s.pendingGrowth = 0;
      s.alive = true;
      s.energy = 100;
      s.energyCooldownUntil = 0;
    }
  }

  // ------------------------ Tick ------------------------

  tick(): void {
    this.state.events = [];
    this.state.tick++;

    if (this.state.phase !== "playing") return;
    this.state.elapsedMs += TICK_MS;
    this.syncWeatherForTimeline();

    // 1. Bots think
    for (const s of this.state.snakes) {
      if (s.isBot) botStep(this.state, s, this.rng);
    }

    // 2. Move snakes that are due
    for (const s of this.state.snakes) {
      if (!s.alive) continue;
      const tps = effectiveTicksPerStep(s, this.state.elapsedMs);
      let effectiveTps = tps;
      if (this.state.weather === "ice") effectiveTps = Math.max(1, Math.round(tps / WEATHER_ICE_SPEED_MULTIPLIER));
      if (this.state.weather === "wind") effectiveTps = Math.max(1, Math.round(tps / WEATHER_WIND_SPEED_MULTIPLIER));
      s.ticksPerStep = effectiveTps;
      if (this.state.tick - s.lastStepTick < effectiveTps) continue;
      s.lastStepTick = this.state.tick;

      const empFrozen = s.statuses.some((st) => st.id === "empFreeze" && st.expiresAt > this.state.elapsedMs);
      if (empFrozen) continue;

      // Apply buffered direction (ignore 180°)
      if (s.nextDir !== OPPOSITE[s.dir]) s.dir = s.nextDir;
      const head = s.body[0]!;
      const dx = s.dir === "left" ? -1 : s.dir === "right" ? 1 : 0;
      const dy = s.dir === "up" ? -1 : s.dir === "down" ? 1 : 0;
      const next = { x: wrap(head.x + dx, FIELD_W), y: wrap(head.y + dy, FIELD_H) };
      const moved = stepOrBounceOnOtherSnakeHit(this.state, s, next);
      this.applyTerrainAndEventEffects(s);
      if (moved) {
        consumeAt(this.state, s, next, this.rng);
        consumeHammerHeadSweep(this.state, s, this.rng);
        this.handleTeleport(s);
        this.handleCoreCarry(s);
      }
    }

    // 3. Update statuses (drain, magnet pulls, fake food cleanup)
    tickStatuses(this.state);

    // 4. Spawn food per tempo curve
    const endgamePace = this.state.elapsedMs >= ENDGAME_MULTIPLIER_START_MS;
    const spawnGapMul = endgamePace ? ENDGAME_SPAWN_INTERVAL_MUL : 1;
    if (this.state.elapsedMs >= this.nextFoodAt) {
      const interval = foodSpawnIntervalMs(this.state.elapsedMs);
      // Cluster chance 25-30%
      if (this.rng() < 0.2) {
        spawnFoodCluster(this.state, this.rng, rndInt(this.rng, 2, 4));
      } else {
        const kind = this.rng() < goldenChance(this.state.elapsedMs) ? "golden" : "normal";
        spawnFood(this.state, this.rng, kind);
      }
      const foodDelay = interval * (0.85 + this.rng() * 0.3) * spawnGapMul;
      this.nextFoodAt = this.state.elapsedMs + Math.max(200, Math.round(foodDelay));
      if (this.rng() < COMEBACK_FOOD_SPAWN_BONUS) this.spawnComebackFood();
    }

    // 5. Spawn boost pickups: roughly every 1-1.55s, capped.
    if (this.state.elapsedMs >= this.nextPickupAt) {
      this.spawnPickup();
      const pickupDelay = rndInt(this.rng, 1000, 1550) * spawnGapMul;
      this.nextPickupAt = this.state.elapsedMs + Math.max(350, Math.round(pickupDelay));
    }

    // 6. Mystery boxes
    if (this.state.elapsedMs >= this.nextMysteryAt) {
      spawnMysteryBox(this.state, this.rng);
      let mysteryDelay = rollMysteryInterval(this.rng);
      if (endgamePace) mysteryDelay = Math.round(mysteryDelay * ENDGAME_SPAWN_INTERVAL_MUL);
      this.nextMysteryAt = this.state.elapsedMs + Math.max(800, mysteryDelay);
    }

    if (this.state.elapsedMs >= this.nextSpeedZoneAt) {
      this.spawnSpeedZone();
      this.nextSpeedZoneAt = this.state.elapsedMs + SPEED_ZONE_SPAWN_INTERVAL_MS;
    }

    if (this.state.elapsedMs >= this.nextTeleportPairAt) {
      this.trySpawnTeleportPair();
      this.nextTeleportPairAt = this.state.elapsedMs + 28_000;
    }

    if (this.state.elapsedMs >= this.nextCoreAt && !this.state.coreEvent) {
      this.spawnCoreEvent();
      this.nextCoreAt = this.state.elapsedMs + 65_000;
    }

    // 7. Sample lengths for leader-change metric
    if (this.state.elapsedMs >= this.nextSampleAt) {
      for (const s of this.state.snakes) {
        s.stats.lengthSamples.push([this.state.elapsedMs, s.body.length]);
      }
      this.nextSampleAt += SAMPLE_INTERVAL_MS;
    }

    // 8. Wow-moment metric (mystery / dash / blackout)
    for (const ev of this.state.events) {
      if (ev.kind === "mystery" || ev.kind === "dash" || ev.kind === "blackout") {
        this.wowMoments.push(this.state.elapsedMs);
      }
    }

    // 9. End condition
    if (this.state.elapsedMs >= MATCH_DURATION_MS) {
      this.endMatch();
    }
  }

  useAbility(id: string): void {
    const s = this.state.snakes.find((sn) => sn.id === id);
    if (!s || !s.alive || this.state.phase !== "playing") return;
    if (s.energy < DASH_ABILITY_COST) return;
    if (this.state.elapsedMs < s.energyCooldownUntil) return;
    s.energy -= DASH_ABILITY_COST;
    s.energyCooldownUntil = this.state.elapsedMs + DASH_ABILITY_RECHARGE_MS;
    switch (s.abilityId) {
      case "dashAbility":
        _applyBoost(this.state, s, "dash", this.rng);
        break;
      case "burstRun":
        s.statuses.push({
          id: "x2Speed",
          expiresAt: this.state.elapsedMs + 2200,
          data: { multiplier: 1.65 },
        });
        break;
      case "headTailSwap":
        if (s.body.length > 2) {
          const rev = [...s.body].reverse();
          s.body = rev;
        }
        break;
      case "foodPulse":
        for (let i = 0; i < 3; i++) this.spawnComebackFood();
        break;
      case "phaseShift":
        s.statuses.push({ id: "phantomPass", expiresAt: this.state.elapsedMs + 1800 });
        break;
    }
  }

  private spawnPickup(): void {
    if (this.state.pickups.length >= PICKUP_MAX_ON_FIELD) return;
    if (PICKUP_POOL.length === 0) return;
    const boostId = pickWeighted(this.rng, PICKUP_POOL, (id) => BOOSTS[id].pickupWeight);
    // Place
    const target: Vec2 | null = (() => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = rndInt(this.rng, 0, FIELD_W - 1);
        const y = rndInt(this.rng, 0, FIELD_H - 1);
        if (this.state.snakes.some((s) => s.body.some((b) => b.x === x && b.y === y))) continue;
        if (this.state.food.some((f) => f.pos.x === x && f.pos.y === y)) continue;
        if (this.state.pickups.some((p) => p.pos.x === x && p.pos.y === y)) continue;
        if (this.state.mysteryBoxes.some((b) => b.pos.x === x && b.pos.y === y)) continue;
        return { x, y };
      }
      return null;
    })();
    if (!target) return;
    this.state.pickups.push({
      id: `pk${++pickupCounter}`,
      pos: target,
      boostId,
      spawnTick: this.state.tick,
    });
  }

  private applyTerrainAndEventEffects(snake: Snake): void {
    const head = snake.body[0]!;
    for (const z of this.state.speedZones) {
      const dx = Math.abs(head.x - z.pos.x);
      const dy = Math.abs(head.y - z.pos.y);
      if (Math.max(dx, dy) <= z.radius) {
        const idx = snake.statuses.findIndex((s) => s.id === "x2Speed");
        const st: Snake["statuses"][number] = {
          id: "x2Speed",
          expiresAt: this.state.elapsedMs + SPEED_ZONE_BOOST_MS,
          data: { multiplier: SPEED_ZONE_SPEED_MULTIPLIER },
        };
        if (idx >= 0) snake.statuses[idx] = st;
        else snake.statuses.push(st);
        break;
      }
    }
    this.state.speedZones = this.state.speedZones.filter((z) => z.expiresAt > this.state.elapsedMs);
    if (snake.energy < 100) {
      snake.energy = Math.min(100, snake.energy + 0.8);
    }
  }

  private spawnSpeedZone(): void {
    const x = rndInt(this.rng, 0, FIELD_W - 1);
    const y = rndInt(this.rng, 0, FIELD_H - 1);
    this.state.speedZones.push({
      id: `sz_${Date.now().toString(36)}`,
      pos: { x, y },
      radius: 3,
      expiresAt: this.state.elapsedMs + SPEED_ZONE_DURATION_MS,
    });
  }

  /**
   * 0–30 с и с 2:30 до конца — без погоды.
   * 30 с–2:30: всегда какая-то погода; каждые 30 с новый случайный тип (fog / ice / wind).
   */
  private syncWeatherForTimeline(): void {
    const t = this.state.elapsedMs;
    if (t < WEATHER_CLEAR_UNTIL_MS || t >= ENDGAME_MULTIPLIER_START_MS) {
      this.state.weather = null;
      this.state.weatherEndsAt = 0;
      this.weatherScheduleSlot = -1;
      return;
    }
    const slot = Math.floor((t - WEATHER_CLEAR_UNTIL_MS) / WEATHER_PHASE_MS);
    if (slot !== this.weatherScheduleSlot) {
      this.weatherScheduleSlot = slot;
      const all: WeatherState[] = ["fog", "ice", "wind"];
      const prev = this.state.weather;
      const options = prev != null ? all.filter((w) => w !== prev) : all;
      this.state.weather = options[rndInt(this.rng, 0, options.length - 1)]!;
    }
    this.state.weatherEndsAt = WEATHER_CLEAR_UNTIL_MS + (slot + 1) * WEATHER_PHASE_MS;
  }

  private trySpawnTeleportPair(): void {
    if (this.rng() > TELEPORT_PAIR_SPAWN_CHANCE) return;
    // Гарантируем, что концы пары не оказываются рядом: минимум половина
    // короткой стороны поля (chebyshev на торе) — иначе телепорт лишён смысла.
    const minDist = Math.floor(Math.min(FIELD_W, FIELD_H) / 2);
    let a = { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) };
    let b = { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) };
    let bestDist = torusChebyshev(a, b, FIELD_W, FIELD_H);
    for (let attempt = 0; attempt < 30 && bestDist < minDist; attempt++) {
      const ca = { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) };
      const cb = { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) };
      const d = torusChebyshev(ca, cb, FIELD_W, FIELD_H);
      if (d > bestDist) {
        a = ca;
        b = cb;
        bestDist = d;
      }
    }
    this.state.teleportPairs = [{ id: `tp_${Date.now().toString(36)}`, a, b }];
  }

  private handleTeleport(snake: Snake): void {
    const head = snake.body[0]!;
    for (const tp of this.state.teleportPairs) {
      if (head.x === tp.a.x && head.y === tp.a.y) {
        stepHeadTo(snake, { ...tp.b });
        break;
      }
      if (head.x === tp.b.x && head.y === tp.b.y) {
        stepHeadTo(snake, { ...tp.a });
        break;
      }
    }
  }

  private spawnComebackFood(): void {
    const sorted = [...this.state.snakes].sort((a, b) => a.body.length - b.body.length);
    const targets = sorted.slice(0, 2);
    for (const s of targets) {
      const h = s.body[0];
      if (!h) continue;
      this.state.food.push({
        id: `cb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
        pos: { x: wrap(h.x + rndInt(this.rng, -3, 3), FIELD_W), y: wrap(h.y + rndInt(this.rng, -3, 3), FIELD_H) },
        kind: "normal",
        spawnTick: this.state.tick,
      });
    }
  }

  private spawnCoreEvent(): void {
    this.state.coreEvent = {
      state: "idle",
      corePos: { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) },
      carriedBy: null,
      deliveryPos: null,
      expiresAt: this.state.elapsedMs + CORE_EVENT_WINDOW_MS,
    };
  }

  private handleCoreCarry(snake: Snake): void {
    const ev = this.state.coreEvent;
    if (!ev) return;
    if (this.state.elapsedMs > ev.expiresAt) {
      this.state.coreEvent = null;
      return;
    }
    const head = snake.body[0]!;
    if (ev.state === "idle" && ev.corePos && head.x === ev.corePos.x && head.y === ev.corePos.y) {
      ev.state = "carried";
      ev.carriedBy = snake.id;
      ev.corePos = null;
      ev.deliveryPos = { x: rndInt(this.rng, 0, FIELD_W - 1), y: rndInt(this.rng, 0, FIELD_H - 1) };
      this.state.events.push({ kind: "corePicked", snakeId: snake.id, pos: { ...head } });
      return;
    }
    if (ev.state === "carried" && ev.carriedBy === snake.id && ev.deliveryPos) {
      if (head.x === ev.deliveryPos.x && head.y === ev.deliveryPos.y) {
        snake.score += CORE_EVENT_POINTS;
        this.state.events.push({ kind: "coreDelivered", snakeId: snake.id, points: CORE_EVENT_POINTS });
        this.state.coreEvent = null;
      }
    }
  }

  // ------------------------ View ------------------------

  leaderboard(): LeaderboardEntry[] {
    return [...this.state.snakes]
      .map((s) => ({ snakeId: s.id, name: s.name, colorIdx: s.colorIdx, length: s.body.length, rank: 0 }))
      .sort((a, b) => b.length - a.length)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }
}

export { _applyBoost as applyBoost, snakeCounter };
