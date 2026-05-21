/**
 * All 24 boosts handled here. Three integration points:
 *   - applyBoost: invoked when a snake picks up a regular pickup or
 *     receives an effect from a mystery box.
 *   - tickStatuses: per-tick logic for active timed effects (drains, magnet, etc.).
 *   - onEatFood: hook called whenever a snake eats food (for foodClone, x2Growth,
 *     critBite, comboNinM, streak, goldenBite).
 *
 * Anti-frustration: hard debuffs (turnInvert, blackout) cannot stack on the
 * same player within HARD_DEBUFF_COOLDOWN.
 */
import {
  BASE_TICKS_PER_STEP,
  BOOSTS,
  ENDGAME_MOVEMENT_STEP_DIVISOR,
  ENDGAME_MULTIPLIER_START_MS,
  ENDGAME_SCORE_MULTIPLIER,
  type ActiveStatus,
  type BoostId,
  type Direction,
  FIELD_H,
  FIELD_W,
  FOOD_GROWTH,
  GOLDEN_FOOD_GROWTH,
  LEADER_PRESSURE_BONUS_POINTS,
  LEADER_PRESSURE_GROWTH_BONUS,
  LEADER_PRESSURE_RADIUS,
  type Food,
  type GameState,
  type Snake,
  torusChebyshev,
  torusDelta,
  type Vec2,
  vecEq,
  wrap,
} from "@megasnake/shared";
import { rndInt } from "./rng.js";

const HARD_DEBUFF_COOLDOWN_MS = 4000;

const OPPOSITE_DIR: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

let dynCounter = 0;

/** Pick an enemy of `self` with optional filter. */
function pickEnemy(state: GameState, selfId: string, rng: () => number): Snake | null {
  const candidates = state.snakes.filter((s) => s.id !== selfId && s.alive);
  if (candidates.length === 0) return null;
  return candidates[rndInt(rng, 0, candidates.length - 1)] ?? null;
}

function nearestEnemy(state: GameState, self: Snake): Snake | null {
  let best: Snake | null = null;
  let bestDist = Infinity;
  const head = self.body[0]!;
  for (const s of state.snakes) {
    if (s.id === self.id || !s.alive) continue;
    const d = torusChebyshev(head, s.body[0]!, FIELD_W, FIELD_H);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function applyHardDebuffOk(state: GameState, snake: Snake): boolean {
  const elapsed = state.elapsedMs;
  return elapsed - snake.lastHardDebuffAt > HARD_DEBUFF_COOLDOWN_MS;
}

function addStatus(snake: Snake, status: ActiveStatus): void {
  // Replace existing instance of the same id (refresh).
  const idx = snake.statuses.findIndex((s) => s.id === status.id);
  if (idx >= 0) snake.statuses[idx] = status;
  else snake.statuses.push(status);
}

/** Apply a boost effect to a snake. `source` is the snake that triggered it. */
export function applyBoost(
  state: GameState,
  source: Snake,
  boostId: BoostId,
  rng: () => number,
): void {
  const def = BOOSTS[boostId];
  const now = state.elapsedMs;

  switch (boostId) {
    // ---- Mobility ----
    case "x2Speed":
    case "superTurn":
    case "phantomPass":
    case "invisible":
    case "chameleon":
    case "magnet":
    case "hammerHead":
    case "radar":
    case "x2Growth":
    case "critBite":
    case "streak3rd":
    case "goldenBite":
    case "foodClone":
    case "combo5in3":
      addStatus(source, {
        id: boostId,
        expiresAt: now + def.durationMs,
        data: { ...(def.params ?? {}), startedAt: now, hits: 0 },
      });
      break;

    case "dash": {
      const cells = def.params?.cells ?? 5;
      const head = source.body[0]!;
      const dx = source.dir === "left" ? -1 : source.dir === "right" ? 1 : 0;
      const dy = source.dir === "up" ? -1 : source.dir === "down" ? 1 : 0;
      const from = { ...head };
      // Step forward `cells` times, eating food along the way.
      for (let i = 0; i < cells; i++) {
        const nx = wrap(source.body[0]!.x + dx, FIELD_W);
        const ny = wrap(source.body[0]!.y + dy, FIELD_H);
        const to = { x: nx, y: ny };
        if (!stepOrBounceOnOtherSnakeHit(state, source, to)) break;
        consumeAt(state, source, source.body[0]!, rng);
        consumeHammerHeadSweep(state, source, rng);
      }
      source.stats.dashesUsed++;
      state.events.push({ kind: "dash", snakeId: source.id, from, to: { ...source.body[0]! } });
      break;
    }

    case "microTeleport": {
      const r = def.params?.radius ?? 8;
      const head = source.body[0]!;
      for (let attempt = 0; attempt < 20; attempt++) {
        const nx = wrap(head.x + rndInt(rng, -r, r), FIELD_W);
        const ny = wrap(head.y + rndInt(rng, -r, r), FIELD_H);
        if (nx === head.x && ny === head.y) continue;
        stepHeadTo(source, { x: nx, y: ny });
        consumeAt(state, source, source.body[0]!, rng);
        consumeHammerHeadSweep(state, source, rng);
        break;
      }
      break;
    }

    case "foodRain": {
      const head = source.body[0]!;
      const radius = def.params?.radius ?? 6;
      const count = def.params?.count ?? 6;
      for (let i = 0; i < count; i++) {
        const nx = wrap(head.x + rndInt(rng, -radius, radius), FIELD_W);
        const ny = wrap(head.y + rndInt(rng, -radius, radius), FIELD_H);
        if (state.food.some((f) => vecEq(f.pos, { x: nx, y: ny }))) continue;
        if (state.snakes.some((s) => s.body.some((b) => vecEq(b, { x: nx, y: ny })))) continue;
        state.food.push({
          id: `fr${++dynCounter}`,
          pos: { x: nx, y: ny },
          kind: "normal",
          spawnTick: state.tick,
        });
      }
      break;
    }

    case "safeBank": {
      const bonus = def.params?.bonus ?? 6;
      source.pendingGrowth += bonus;
      addStatus(source, {
        id: "safeBank",
        expiresAt: now + def.durationMs,
        data: { multiplier: def.params?.slowdown ?? 0.85 },
      });
      break;
    }

    // ---- Sabotage placed by self (debuffs targets later) ----
    case "fakeFood": {
      const head = source.body[0]!;
      let placed: Vec2 | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const dx = rndInt(rng, -3, 3);
        const dy = rndInt(rng, -3, 3);
        const x = wrap(head.x + dx, FIELD_W);
        const y = wrap(head.y + dy, FIELD_H);
        if (vecEq({ x, y }, head)) continue;
        if (state.food.some((f) => vecEq(f.pos, { x, y }))) continue;
        if (state.snakes.some((s) => s.body.some((b) => vecEq(b, { x, y })))) continue;
        placed = { x, y };
        break;
      }
      if (placed) {
        state.food.push({
          id: `ff${++dynCounter}`,
          pos: placed,
          kind: "fake",
          ownerId: source.id,
          spawnTick: state.tick,
        });
      }
      break;
    }

    // ---- Sabotage / direct enemy effects ----
    case "slowWave": {
      const radius = def.params?.radius ?? 6;
      const head = source.body[0]!;
      const mult = def.params?.multiplier ?? BOOSTS.slowWave.params?.multiplier ?? 0.5;
      for (const s of state.snakes) {
        if (s.id === source.id || !s.alive) continue;
        if (torusChebyshev(head, s.body[0]!, FIELD_W, FIELD_H) <= radius) {
          addStatus(s, {
            id: "slowWave",
            expiresAt: now + def.durationMs,
            data: { multiplier: mult },
          });
          state.events.push({
            kind: "debuffBeam",
            sourceId: source.id,
            targetId: s.id,
            from: { ...head },
            to: { ...s.body[0]! },
          });
        }
      }
      break;
    }

    case "turnInvert": {
      const target = pickEnemy(state, source.id, rng);
      if (target && applyHardDebuffOk(state, target)) {
        target.lastHardDebuffAt = now;
        addStatus(target, { id: "turnInvert", expiresAt: now + def.durationMs });
        state.events.push({
          kind: "debuffBeam",
          sourceId: source.id,
          targetId: target.id,
          from: { ...source.body[0]! },
          to: { ...target.body[0]! },
        });
      }
      break;
    }

    case "radarJam": {
      const head = source.body[0]!;
      for (const s of state.snakes) {
        if (s.id === source.id || !s.alive) continue;
        addStatus(s, { id: "radarJam", expiresAt: now + def.durationMs });
        state.events.push({
          kind: "debuffBeam",
          sourceId: source.id,
          targetId: s.id,
          from: { ...head },
          to: { ...s.body[0]! },
        });
      }
      break;
    }

    case "boostCorrupt": {
      const target = pickEnemy(state, source.id, rng);
      if (target) {
        for (const st of target.statuses) {
          if (BOOSTS[st.id].kind === "buff" && st.expiresAt > now) {
            const remaining = st.expiresAt - now;
            st.expiresAt = now + Math.floor(remaining / 2);
          }
        }
        state.events.push({
          kind: "debuffBeam",
          sourceId: source.id,
          targetId: target.id,
          from: { ...source.body[0]! },
          to: { ...target.body[0]! },
        });
      }
      break;
    }

    case "emp": {
      const radius = def.params?.radius ?? 7;
      const freezeMs = Math.max(1, Math.floor(def.params?.freezeMs ?? BOOSTS.empFreeze.durationMs));
      const head = source.body[0]!;
      state.events.push({ kind: "empWave", pos: { ...head }, radiusCells: radius });
      for (const s of state.snakes) {
        if (s.id === source.id || !s.alive) continue;
        if (torusChebyshev(head, s.body[0]!, FIELD_W, FIELD_H) <= radius) {
          addStatus(s, { id: "empFreeze", expiresAt: now + freezeMs });
        }
      }
      break;
    }

    case "blackout": {
      state.globalEffects.push({ id: "blackout", expiresAt: now + def.durationMs });
      state.events.push({ kind: "blackout", durationMs: def.durationMs });
      break;
    }

    case "empFreeze":
      break;
  }
}

/** Move a snake's head to an absolute new tile, keep tail length unchanged. */
export function stepHeadTo(snake: Snake, to: Vec2): void {
  snake.body.unshift({ x: to.x, y: to.y });
  if (snake.pendingGrowth > 0) {
    snake.pendingGrowth -= 1;
  } else {
    snake.body.pop();
  }
}

function hasPhantomPass(snake: Snake, elapsedMs: number): boolean {
  return snake.statuses.some((st) => st.id === "phantomPass" && st.expiresAt > elapsedMs);
}

/** True if `pos` is occupied by any segment of another alive snake (unless phantom pass). */
export function occupiesOtherSnake(state: GameState, snake: Snake, pos: Vec2): boolean {
  if (hasPhantomPass(snake, state.elapsedMs)) return false;
  for (const other of state.snakes) {
    if (other.id === snake.id || !other.alive) continue;
    for (let i = 0; i < other.body.length; i++) {
      if (vecEq(pos, other.body[i]!)) return true;
    }
  }
  return false;
}

/**
 * Step into `to` unless another snake blocks the tile — then reverse 180° and stay put.
 * Returns whether the head actually moved.
 */
export function stepOrBounceOnOtherSnakeHit(state: GameState, snake: Snake, to: Vec2): boolean {
  if (!occupiesOtherSnake(state, snake, to)) {
    stepHeadTo(snake, to);
    return true;
  }
  const reversed = OPPOSITE_DIR[snake.dir];
  snake.dir = reversed;
  snake.nextDir = reversed;
  return false;
}

/**
 * Hammer Head collects food across the current head tile, perpendicular to the
 * snake direction. It intentionally consumes only food, not pickups/boxes.
 */
export function consumeHammerHeadSweep(state: GameState, snake: Snake, rng: () => number): void {
  const st = snake.statuses.find((s) => s.id === "hammerHead" && s.expiresAt > state.elapsedMs);
  if (!st) return;

  const width = Math.max(1, Math.floor(Number(st.data?.["width"] ?? BOOSTS.hammerHead.params?.width ?? 5)));
  const half = Math.floor(width / 2);
  const head = snake.body[0]!;
  for (let offset = -half; offset <= half; offset++) {
    const pos =
      snake.dir === "up" || snake.dir === "down"
        ? { x: wrap(head.x + offset, FIELD_W), y: head.y }
        : { x: head.x, y: wrap(head.y + offset, FIELD_H) };
    consumeFoodAt(state, snake, pos, rng);
  }
}

/** Resolve eating at a position. Returns true if something was consumed. */
export function consumeAt(state: GameState, snake: Snake, pos: Vec2, rng: () => number): boolean {
  // Boost pickup
  const pickupIdx = state.pickups.findIndex((p) => vecEq(p.pos, pos));
  if (pickupIdx >= 0) {
    const pickup = state.pickups[pickupIdx]!;
    state.pickups.splice(pickupIdx, 1);
    snake.stats.boostsCollected++;
    state.events.push({ kind: "pickup", snakeId: snake.id, boostId: pickup.boostId, pos });
    applyBoost(state, snake, pickup.boostId, rng);
    return true;
  }

  // Mystery box
  const boxIdx = state.mysteryBoxes.findIndex((b) => vecEq(b.pos, pos));
  if (boxIdx >= 0) {
    const box = state.mysteryBoxes[boxIdx]!;
    state.mysteryBoxes.splice(boxIdx, 1);
    snake.stats.mysteryOpened++;
    // Resolved by caller (mystery.ts) — but to keep coupling low we import lazily.
    // To avoid a circular import we expose a callback set externally.
    if (mysteryResolver) mysteryResolver(state, snake, box.pos, rng);
    return true;
  }

  return consumeFoodAt(state, snake, pos, rng);
}

/** Resolve food-only eating at a position. Returns true if food was consumed. */
function consumeFoodAt(state: GameState, snake: Snake, pos: Vec2, rng: () => number): boolean {
  const foodIdx = state.food.findIndex((f) => vecEq(f.pos, pos));
  if (foodIdx >= 0) {
    const food = state.food[foodIdx]!;
    state.food.splice(foodIdx, 1);

    if (food.kind === "fake") {
      // Slow the eater. Don't grow.
      const slowMs = BOOSTS.fakeFood.params?.slowMs ?? 1500;
      const mult = BOOSTS.fakeFood.params?.slowdown ?? 0.7;
      addStatus(snake, {
        id: "slowWave", // reuse generic slow channel
        expiresAt: state.elapsedMs + slowMs,
        data: { multiplier: mult },
      });
      state.events.push({ kind: "eat", snakeId: snake.id, pos, foodKind: "fake" });
      return true;
    }

    let growth = food.kind === "golden" ? GOLDEN_FOOD_GROWTH : FOOD_GROWTH;
    let scoreGain = food.kind === "golden" ? GOLDEN_FOOD_GROWTH : FOOD_GROWTH;

    // Apply x2Growth
    if (snake.statuses.some((s) => s.id === "x2Growth" && s.expiresAt > state.elapsedMs)) {
      growth *= 2;
    }
    // Golden bite consumes itself once
    const gb = snake.statuses.find((s) => s.id === "goldenBite" && s.expiresAt > state.elapsedMs);
    if (gb) {
      growth = Math.max(growth, BOOSTS.goldenBite.params?.growth ?? 4);
      snake.statuses = snake.statuses.filter((s) => s !== gb);
    }
    // Crit bite chance
    const cb = snake.statuses.find((s) => s.id === "critBite" && s.expiresAt > state.elapsedMs);
    if (cb) {
      const chance = BOOSTS.critBite.params?.chance ?? 0.25;
      if (rng() < chance) growth += BOOSTS.critBite.params?.bonus ?? 1;
    }
    // Combo5in3
    const combo = snake.statuses.find((s) => s.id === "combo5in3" && s.expiresAt > state.elapsedMs);
    if (combo) {
      combo.data ??= {};
      const hits = Number(combo.data["hits"] ?? 0) + 1;
      combo.data["hits"] = hits;
      const needed = BOOSTS.combo5in3.params?.needed ?? 5;
      if (hits >= needed) {
        growth += BOOSTS.combo5in3.params?.bonus ?? 5;
        // consume
        snake.statuses = snake.statuses.filter((s) => s !== combo);
      }
    }
    // Streak3rd: every 3rd food gives +1
    const streak = snake.statuses.find((s) => s.id === "streak3rd" && s.expiresAt > state.elapsedMs);
    if (streak) {
      streak.data ??= {};
      const cnt = Number(streak.data["hits"] ?? 0) + 1;
      streak.data["hits"] = cnt;
      if (cnt % 3 === 0) growth += 1;
    }
    // FoodClone: spawn duplicate near the eaten location (consumes one charge)
    const clone = snake.statuses.find((s) => s.id === "foodClone" && s.expiresAt > state.elapsedMs);
    if (clone) {
      for (let i = 0; i < 8; i++) {
        const dx = rndInt(rng, -2, 2);
        const dy = rndInt(rng, -2, 2);
        const x = wrap(pos.x + dx, FIELD_W);
        const y = wrap(pos.y + dy, FIELD_H);
        if (vecEq({ x, y }, pos)) continue;
        if (state.food.some((f) => vecEq(f.pos, { x, y }))) continue;
        if (state.snakes.some((s) => s.body.some((b) => vecEq(b, { x, y })))) continue;
        state.food.push({ id: `fc${++dynCounter}`, pos: { x, y }, kind: "normal", spawnTick: state.tick });
        break;
      }
      snake.statuses = snake.statuses.filter((s) => s !== clone);
    }

    snake.pendingGrowth += growth;
    const leader = [...state.snakes].sort((a, b) => b.body.length - a.body.length)[0] ?? null;
    if (leader && leader.id !== snake.id) {
      const lh = leader.body[0];
      if (lh && torusChebyshev(pos, lh, FIELD_W, FIELD_H) <= LEADER_PRESSURE_RADIUS) {
        scoreGain += LEADER_PRESSURE_BONUS_POINTS;
        snake.pendingGrowth += LEADER_PRESSURE_GROWTH_BONUS;
      }
    }
    if (state.elapsedMs >= ENDGAME_MULTIPLIER_START_MS) {
      scoreGain = Math.ceil(scoreGain * ENDGAME_SCORE_MULTIPLIER);
    }
    snake.score += scoreGain;
    snake.stats.foodEaten++;
    if (food.kind === "golden") snake.stats.goldenEaten++;
    state.events.push({ kind: "eat", snakeId: snake.id, pos, foodKind: food.kind });
    return true;
  }
  return false;
}

/** External hook so mystery.ts can resolve box payloads without a cyclic import. */
let mysteryResolver:
  | ((state: GameState, snake: Snake, pos: Vec2, rng: () => number) => void)
  | null = null;

export function setMysteryResolver(
  fn: (state: GameState, snake: Snake, pos: Vec2, rng: () => number) => void,
): void {
  mysteryResolver = fn;
}

/** Drain expired statuses and apply per-tick effects (e.g. magnet, fake food cleanup). */
export function tickStatuses(state: GameState): void {
  const now = state.elapsedMs;
  for (const s of state.snakes) {
    if (!s.alive) continue;
    s.statuses = s.statuses.filter((st) => st.expiresAt > now);
  }
  state.globalEffects = state.globalEffects.filter((g) => g.expiresAt > now);

  // Magnet: every 2 ticks, pull each food within radius one tile toward head.
  if (state.tick % 2 === 0) {
    for (const s of state.snakes) {
      if (!s.alive) continue;
      const magnet = s.statuses.find((st) => st.id === "magnet" && st.expiresAt > now);
      if (!magnet) continue;
      const radius = BOOSTS.magnet.params?.radius ?? 5;
      const head = s.body[0]!;
      for (const f of state.food) {
        if (f.kind === "fake") continue;
        if (torusChebyshev(head, f.pos, FIELD_W, FIELD_H) > radius) continue;
        const dx = torusDelta(f.pos.x, head.x, FIELD_W);
        const dy = torusDelta(f.pos.y, head.y, FIELD_H);
        if (Math.abs(dx) >= Math.abs(dy)) f.pos.x = wrap(f.pos.x + Math.sign(dx), FIELD_W);
        else f.pos.y = wrap(f.pos.y + Math.sign(dy), FIELD_H);
      }
    }
  }

  // Cleanup orphaned fake food after lifetime.
  const lifetime = BOOSTS.fakeFood.params?.lifetimeMs ?? 12_000;
  const lifetimeTicks = (lifetime / 1000) * 20;
  state.food = state.food.filter((f) => {
    if (f.kind !== "fake") return true;
    return state.tick - f.spawnTick < lifetimeTicks;
  });
}

/** Compute the effective ticksPerStep from base + active speed-modifying statuses. */
export function effectiveTicksPerStep(snake: Snake, now: number): number {
  let mult = 1;
  for (const st of snake.statuses) {
    if (st.expiresAt <= now) continue;
    if (st.id === "x2Speed") mult *= Number(st.data?.["multiplier"] ?? BOOSTS.x2Speed.params?.multiplier ?? 2);
    if (st.id === "superTurn") mult *= 1.0; // turn speedup, not raw speed
    if (st.id === "slowWave") mult *= Number(st.data?.["multiplier"] ?? 0.75);
    if (st.id === "safeBank") mult *= Number(st.data?.["multiplier"] ?? 0.85);
  }
  let v = Math.max(1, Math.round(BASE_TICKS_PER_STEP / mult));
  if (now >= ENDGAME_MULTIPLIER_START_MS) {
    v = Math.max(1, Math.round(v / ENDGAME_MOVEMENT_STEP_DIVISOR));
  }
  return v;
}
