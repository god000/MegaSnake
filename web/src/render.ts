/**
 * Simple Canvas 2D renderer.
 *
 * Snake bodies are drawn as cell-aligned squares with the player's color.
 * Heads get a small white directional pip.
 * When two snakes share a tile, the top segment receives a 1px white outline.
 * Active boost statuses appear as a halo around the head and chips above it.
 *
 * Visual effects driven by per-tick events (eat, pickup, mystery, dash) are
 * cached for ~250ms so they remain visible despite the 20Hz tick.
 */
import {
  BOOSTS,
  type BoostId,
  CELL_SIZE,
  COLOR_BG,
  COLOR_BOOST_PICKUP,
  COLOR_FAKE_FOOD,
  COLOR_FOOD,
  COLOR_FOOD_GOLDEN,
  COLOR_FRAME_ENDGAME,
  COLOR_MYSTERY_BOX,
  ENDGAME_MULTIPLIER_START_MS,
  type Direction,
  FIELD_H,
  FIELD_W,
  type GameEvent,
  type GameState,
  PLAYER_COLORS,
  type Snake,
  type SpeedZone,
  torusDelta,
  type Vec2,
} from "@megasnake/shared";

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function hexToRgba(hex: string, a: number): string {
  const n = hex.slice(1);
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Заливка клеток мягче линий сетки (ниже — ближе к «только сетка»). */
const WEATHER_CELL_ALPHA_RATIO = 0.46;

/**
 * Тон поля по погоде: лёгкий сдвиг палитры + чуть плотнее сетка; без сильного «засвета».
 */
function weatherFieldTint(state: GameState): {
  gridStroke: string;
  cellFill: string;
  atmosphere: string | null;
} {
  let r: number;
  let g: number;
  let b: number;
  let gridA: number;
  let atmosphereA = 0;
  if (state.phase !== "playing" || state.weather == null) {
    r = 248;
    g = 250;
    b = 252;
    gridA = 0.055;
  } else {
    switch (state.weather) {
      case "fog":
        r = 224;
        g = 232;
        b = 244;
        gridA = 0.072;
        atmosphereA = 0.022;
        break;
      case "ice":
        r = 150;
        g = 200;
        b = 252;
        gridA = 0.086;
        atmosphereA = 0.026;
        break;
      case "wind":
        r = 198;
        g = 182;
        b = 252;
        gridA = 0.078;
        atmosphereA = 0.024;
        break;
      default:
        r = 248;
        g = 250;
        b = 252;
        gridA = 0.055;
    }
  }
  const cellA = gridA * WEATHER_CELL_ALPHA_RATIO;
  return {
    gridStroke: `rgba(${r},${g},${b},${gridA})`,
    cellFill: `rgba(${r},${g},${b},${cellA})`,
    atmosphere:
      atmosphereA > 0 ? `rgba(${r},${g},${b},${atmosphereA})` : null,
  };
}

interface FxItem {
  expiresAt: number;
  ev: GameEvent;
  durationMs: number;
}

const fxBuffer: FxItem[] = [];

function fxDurationMs(ev: GameEvent): number {
  if (ev.kind === "debuffBeam") return 260;
  if (ev.kind === "empWave") return 300;
  return 350;
}

export function pushEvents(events: GameEvent[], now: number): void {
  for (const ev of events) {
    const d = fxDurationMs(ev);
    fxBuffer.push({ ev, expiresAt: now + d, durationMs: d });
  }
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  selfId: string | null,
  now: number,
  intentDir: Direction | null = null,
): void {
  const W = state.fieldW * CELL_SIZE;
  const H = state.fieldH * CELL_SIZE;

  // Background
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, W, H);

  const fieldTint = weatherFieldTint(state);
  // Лёгкая заливка клеток тем же тоном, что и сетка (альфа ниже — не режет глаз).
  ctx.fillStyle = fieldTint.cellFill;
  for (let cx = 0; cx < state.fieldW; cx++) {
    for (let cy = 0; cy < state.fieldH; cy++) {
      ctx.fillRect(cx * CELL_SIZE, cy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }
  if (fieldTint.atmosphere) {
    ctx.fillStyle = fieldTint.atmosphere;
    ctx.fillRect(0, 0, W, H);
  }

  // Сетка: чуть заметнее заливки. Золото — только внешняя рамка в финале.
  const finaleFrame =
    state.phase === "playing" && state.elapsedMs >= ENDGAME_MULTIPLIER_START_MS;
  ctx.strokeStyle = fieldTint.gridStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= state.fieldW; x++) {
    ctx.moveTo(x * CELL_SIZE + 0.5, 0);
    ctx.lineTo(x * CELL_SIZE + 0.5, H);
  }
  for (let y = 0; y <= state.fieldH; y++) {
    ctx.moveTo(0, y * CELL_SIZE + 0.5);
    ctx.lineTo(W, y * CELL_SIZE + 0.5);
  }
  ctx.stroke();

  if (finaleFrame) {
    const pulse = 0.45 + 0.25 * Math.sin(now / 420);
    ctx.strokeStyle = hexToRgba(COLOR_FRAME_ENDGAME, pulse);
    ctx.lineWidth = 2.5;
    ctx.strokeRect(1.25, 1.25, W - 2.5, H - 2.5);
    ctx.lineWidth = 1;
  }

  // Food
  if (state.weather === "fog") {
    ctx.fillStyle = "rgba(148,163,184,0.10)";
    for (let i = 0; i < 6; i++) {
      const x = ((now / 20 + i * 140) % W) - 120;
      const y = 40 + i * 80;
      ctx.fillRect(x, y, 220, 54);
    }
  }
  for (const f of state.food) {
    drawFoodLike(ctx, f.pos, f.kind === "golden" ? COLOR_FOOD_GOLDEN : f.kind === "fake" ? COLOR_FAKE_FOOD : COLOR_FOOD);
  }
  // Pickups
  for (const p of state.pickups) {
    drawPickup(ctx, p.pos, COLOR_BOOST_PICKUP, BOOSTS[p.boostId].short);
  }
  // Mystery boxes
  for (const b of state.mysteryBoxes) {
    drawMysteryBox(ctx, b.pos, now);
  }
  for (const z of state.speedZones ?? []) {
    drawSpeedZone(ctx, z, now);
  }
  for (const tp of state.teleportPairs ?? []) {
    drawPortal(ctx, tp.a, now);
    drawPortal(ctx, tp.b, now);
  }
  if (state.coreEvent?.corePos) drawCore(ctx, state.coreEvent.corePos, "#fde047");
  if (state.coreEvent?.deliveryPos) drawCore(ctx, state.coreEvent.deliveryPos, "#22d3ee");

  // Build occupancy: tile -> top snake id
  const tileTop = new Map<string, string>();
  for (const s of state.snakes) {
    for (const seg of s.body) {
      tileTop.set(`${seg.x}|${seg.y}`, s.id);
    }
  }

  // Determine "near self" filtering for invisible/chameleon
  const selfSnake = state.snakes.find((s) => s.id === selfId) ?? null;

  // Snakes
  for (const s of state.snakes) {
    const isSelf = s.id === selfId;
    const dirOverride = isSelf && intentDir && intentDir !== OPPOSITE[s.dir] ? intentDir : null;
    drawSnake(ctx, s, selfSnake, state, tileTop, now, dirOverride);
  }

  // Radar: highlight nearest food for self
  if (selfSnake && selfSnake.statuses.some((st) => st.id === "radar" && st.expiresAt > state.elapsedMs)) {
    if (!selfSnake.statuses.some((st) => st.id === "radarJam" && st.expiresAt > state.elapsedMs)) {
      drawRadar(ctx, selfSnake, state);
    }
  }

  // Particle FX from buffered events: drop expired, then draw the rest.
  for (let i = fxBuffer.length - 1; i >= 0; i--) {
    if (fxBuffer[i]!.expiresAt <= now) fxBuffer.splice(i, 1);
  }
  for (const fx of fxBuffer) {
    drawFx(ctx, fx, now);
  }
}

function drawFoodLike(ctx: CanvasRenderingContext2D, pos: Vec2, color: string): void {
  const cx = pos.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = pos.y * CELL_SIZE + CELL_SIZE / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function drawPickup(ctx: CanvasRenderingContext2D, pos: Vec2, color: string, label: string): void {
  const x = pos.x * CELL_SIZE + 1;
  const y = pos.y * CELL_SIZE + 1;
  const sz = CELL_SIZE - 2;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, sz, sz);
  ctx.fillStyle = "#082f49";
  ctx.font = "bold 9px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + sz / 2, y + sz / 2 + 0.5);
}

function drawMysteryBox(ctx: CanvasRenderingContext2D, pos: Vec2, now: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 200);
  const x = pos.x * CELL_SIZE + 1;
  const y = pos.y * CELL_SIZE + 1;
  const sz = CELL_SIZE - 2;
  ctx.fillStyle = COLOR_MYSTERY_BOX;
  ctx.fillRect(x, y, sz, sz);
  ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.5 * pulse})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, sz - 1, sz - 1);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x + sz / 2, y + sz / 2 + 0.5);
}

function drawSpeedZone(ctx: CanvasRenderingContext2D, z: SpeedZone, now: number): void {
  const cx = z.pos.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = z.pos.y * CELL_SIZE + CELL_SIZE / 2;
  const R = (z.radius + 0.5) * CELL_SIZE;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);

  ctx.save();
  ctx.fillStyle = `rgba(56,189,248,${0.05 + pulse * 0.02})`;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(56,189,248,${0.45 + pulse * 0.15})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(125,211,252,0.9)";
  ctx.font = "bold 15px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(">>>", cx, cy + 0.5);
  ctx.restore();
}

function drawPortal(ctx: CanvasRenderingContext2D, pos: Vec2, now: number): void {
  const cx = pos.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = pos.y * CELL_SIZE + CELL_SIZE / 2;
  const pulse = 0.5 + 0.5 * Math.sin(now / 140);
  ctx.strokeStyle = `rgba(167,139,250,${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 0.4, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCore(ctx: CanvasRenderingContext2D, pos: Vec2, color: string): void {
  const cx = pos.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = pos.y * CELL_SIZE + CELL_SIZE / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake(
  ctx: CanvasRenderingContext2D,
  s: Snake,
  selfSnake: Snake | null,
  _state: GameState,
  tileTop: Map<string, string>,
  now: number,
  dirOverride: Direction | null = null,
): void {
  let color = PLAYER_COLORS[s.colorIdx % PLAYER_COLORS.length]!;
  // Chameleon: copy nearest enemy color (visual only here for simplicity).
  if (s.statuses.some((st) => st.id === "chameleon" && st.expiresAt > _state.elapsedMs)) {
    color = "#cbd5e1";
  }

  const isSelf = selfSnake?.id === s.id;
  const isInvisible = !isSelf && s.statuses.some((st) => st.id === "invisible" && st.expiresAt > _state.elapsedMs);
  const alpha = isInvisible ? 0.2 : 1;

  ctx.globalAlpha = alpha;
  for (let i = s.body.length - 1; i >= 0; i--) {
    const seg = s.body[i]!;
    const x = seg.x * CELL_SIZE;
    const y = seg.y * CELL_SIZE;
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    // White outline if this tile has another snake too AND we are the top one
    const owner = tileTop.get(`${seg.x}|${seg.y}`);
    if (owner === s.id) {
      let overlap = false;
      for (const other of _state.snakes) {
        if (other.id === s.id) continue;
        for (const oseg of other.body) {
          if (oseg.x === seg.x && oseg.y === seg.y) {
            overlap = true;
            break;
          }
        }
        if (overlap) break;
      }
      if (overlap) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
      }
    }
  }

  // Head pip (uses dirOverride if input intent differs from current dir)
  if (s.body.length > 0) {
    const head = s.body[0]!;
    const hx = head.x * CELL_SIZE;
    const hy = head.y * CELL_SIZE;
    const effectiveDir = dirOverride ?? s.dir;
    const turning = dirOverride !== null && dirOverride !== s.dir;
    const hammerHead = s.statuses.find((st) => st.id === "hammerHead" && st.expiresAt > _state.elapsedMs);

    if (hammerHead) {
      const width = Math.max(1, Math.floor(Number(hammerHead.data?.["width"] ?? BOOSTS.hammerHead.params?.width ?? 5)));
      drawHammerHead(ctx, hx, hy, effectiveDir, width, now);
    }
    drawHeadPip(ctx, hx, hy, effectiveDir, turning, now);

    if (s.statuses.some((st) => st.id === "empFreeze" && st.expiresAt > _state.elapsedMs)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 180);
      ctx.strokeStyle = `rgba(147,197,253,${0.55 + 0.25 * pulse})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 0.5, hy + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    }

    // Halo for active buffs: gentle slow pulse so the snake feels "alive" while
    // buffed, without the high-frequency flicker that used to feel jittery.
    const buffActive = s.statuses.some((st) => {
      if (st.expiresAt <= _state.elapsedMs) return false;
      const def = BOOSTS[st.id];
      return def.kind === "buff";
    });
    if (buffActive) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.strokeStyle = `rgba(255,255,255,${0.28 + 0.18 * pulse})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(hx + 0.5, hy + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
    }

    // Status chips above head
    drawStatusChips(ctx, s, hx, hy, _state.elapsedMs);
  }
  ctx.globalAlpha = 1;
}

function drawHeadPip(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  dir: Direction,
  turning: boolean,
  now: number,
): void {
  const cx = hx + CELL_SIZE / 2;
  const cy = hy + CELL_SIZE / 2;

  let mx = cx;
  let my = cy;
  switch (dir) {
    case "up":
      my = hy + 3;
      break;
    case "down":
      my = hy + CELL_SIZE - 3;
      break;
    case "left":
      mx = hx + 3;
      break;
    case "right":
      mx = hx + CELL_SIZE - 3;
      break;
  }

  const pulse = turning ? 0.5 + 0.5 * Math.sin(now / 70) : 0;
  const r = turning ? 2.1 + pulse * 0.35 : 2;
  ctx.fillStyle = turning ? `rgba(250,204,21,${0.9 + 0.1 * pulse})` : "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(mx, my, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawHammerHead(
  ctx: CanvasRenderingContext2D,
  hx: number,
  hy: number,
  dir: Direction,
  width: number,
  now: number,
): void {
  const pulse = 0.5 + 0.5 * Math.sin(now / 110);
  const span = CELL_SIZE * width - 2;
  const thickness = 4;
  ctx.fillStyle = `rgba(56,189,248,${0.18 + 0.12 * pulse})`;
  ctx.strokeStyle = `rgba(255,255,255,${0.18 + 0.12 * pulse})`;
  ctx.lineWidth = 1;

  if (dir === "up" || dir === "down") {
    const x = hx + CELL_SIZE / 2 - span / 2;
    const y = hy + CELL_SIZE / 2 - thickness / 2;
    ctx.fillRect(x, y, span, thickness);
    ctx.strokeRect(x + 0.5, y + 0.5, span - 1, thickness - 1);
  } else {
    const x = hx + CELL_SIZE / 2 - thickness / 2;
    const y = hy + CELL_SIZE / 2 - span / 2;
    ctx.fillRect(x, y, thickness, span);
    ctx.strokeRect(x + 0.5, y + 0.5, thickness - 1, span - 1);
  }
}

function drawStatusChips(
  ctx: CanvasRenderingContext2D,
  s: Snake,
  hx: number,
  hy: number,
  now: number,
): void {
  const active = s.statuses.filter((st) => st.expiresAt > now);
  if (active.length === 0) return;
  ctx.font = "bold 8px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  let cx = hx;
  for (const st of active.slice(0, 4)) {
    const def = BOOSTS[st.id];
    const label = def.short;
    const w = ctx.measureText(label).width + 4;
    ctx.fillStyle = def.kind === "debuff" ? "rgba(239,68,68,0.85)" : "rgba(56,189,248,0.85)";
    ctx.fillRect(cx, hy - 10, w, 9);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, cx + 2, hy - 3);
    cx += w + 2;
  }
}

function drawRadar(ctx: CanvasRenderingContext2D, self: Snake, state: GameState): void {
  const head = self.body[0]!;
  let nearest: Vec2 | null = null;
  let bestDist = Infinity;
  for (const f of state.food) {
    if (f.kind === "fake") continue;
    const dx = f.pos.x - head.x;
    const dy = f.pos.y - head.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      nearest = f.pos;
    }
  }
  if (!nearest) return;
  const x = nearest.x * CELL_SIZE;
  const y = nearest.y * CELL_SIZE;
  ctx.strokeStyle = "rgba(56,189,248,0.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 2, y - 2, CELL_SIZE + 4, CELL_SIZE + 4);
}

function drawFx(ctx: CanvasRenderingContext2D, fx: FxItem, now: number): void {
  const remaining = fx.expiresAt - now;
  const t = Math.max(0, Math.min(1, remaining / fx.durationMs));
  const alpha = t;
  switch (fx.ev.kind) {
    case "eat": {
      const pos = fx.ev.pos;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha})`;
      ctx.lineWidth = 1.25;
      const r = (1 - t) * CELL_SIZE * 0.9 + 3;
      ctx.beginPath();
      ctx.arc(pos.x * CELL_SIZE + CELL_SIZE / 2, pos.y * CELL_SIZE + CELL_SIZE / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "pickup":
    case "mystery": {
      const pos = fx.ev.pos;
      ctx.strokeStyle =
        fx.ev.kind === "mystery"
          ? `rgba(244,114,182,${0.75 * alpha})`
          : `rgba(56,189,248,${0.75 * alpha})`;
      ctx.lineWidth = 1.5;
      const r = (1 - t) * CELL_SIZE * 1.4 + 5;
      ctx.beginPath();
      ctx.arc(pos.x * CELL_SIZE + CELL_SIZE / 2, pos.y * CELL_SIZE + CELL_SIZE / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "dash": {
      // Torus-aware short trail; visible enough as feedback without flashing across
      // the field on wrap-crossing dashes.
      const fromX = fx.ev.from.x * CELL_SIZE + CELL_SIZE / 2;
      const fromY = fx.ev.from.y * CELL_SIZE + CELL_SIZE / 2;
      const dx = torusDelta(fx.ev.from.x, fx.ev.to.x, FIELD_W) * CELL_SIZE;
      const dy = torusDelta(fx.ev.from.y, fx.ev.to.y, FIELD_H) * CELL_SIZE;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, FIELD_W * CELL_SIZE, FIELD_H * CELL_SIZE);
      ctx.clip();
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(fromX + dx, fromY + dy);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "debuffBeam": {
      drawDebuffBeamFx(ctx, fx.ev, fx.durationMs, remaining);
      break;
    }
    case "empWave": {
      drawEmpWaveFx(ctx, fx.ev, fx.durationMs, remaining);
      break;
    }
    case "blackout":
      // Handled as global overlay in render()
      break;
  }
}

/** Короткий «луч»: сегмент быстро едет от атакующего к цели, мягкое свечение. */
function drawDebuffBeamFx(
  ctx: CanvasRenderingContext2D,
  ev: Extract<GameEvent, { kind: "debuffBeam" }>,
  durationMs: number,
  remainingMs: number,
): void {
  const elapsed = durationMs - remainingMs;
  const travel = Math.min(1, elapsed / 95);
  const ease = 1 - (1 - travel) ** 3;
  const tailFade = Math.max(0, Math.min(1, remainingMs / (durationMs * 0.65)));
  const alpha = tailFade * (0.55 + 0.45 * Math.sin(Math.min(1, elapsed / 70) * Math.PI));

  const fromX = ev.from.x * CELL_SIZE + CELL_SIZE / 2;
  const fromY = ev.from.y * CELL_SIZE + CELL_SIZE / 2;
  const dx = torusDelta(ev.from.x, ev.to.x, FIELD_W) * CELL_SIZE;
  const dy = torusDelta(ev.from.y, ev.to.y, FIELD_H) * CELL_SIZE;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;

  const ux = dx / len;
  const uy = dy / len;
  const headX = fromX + ux * len * ease;
  const headY = fromY + uy * len * ease;
  const segLen = Math.min(CELL_SIZE * 2.4, Math.max(CELL_SIZE * 0.75, len * 0.22));
  let tailX = headX - ux * segLen;
  let tailY = headY - uy * segLen;
  if (travel < 0.08) {
    tailX = fromX;
    tailY = fromY;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FIELD_W * CELL_SIZE, FIELD_H * CELL_SIZE);
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const layers = [
    { w: 7, a: 0.12 * alpha },
    { w: 3.5, a: 0.28 * alpha },
    { w: 1.25, a: 0.72 * alpha },
  ];
  for (const { w, a } of layers) {
    ctx.strokeStyle = `rgba(232,121,249,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(headX, headY);
    ctx.stroke();
  }
  ctx.strokeStyle = `rgba(255,255,255,${0.35 * alpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(headX, headY);
  ctx.stroke();
  ctx.restore();
}

/** Быстро расширяющееся кольцо EMP (мягкое голубое свечение). */
function drawEmpWaveFx(
  ctx: CanvasRenderingContext2D,
  ev: Extract<GameEvent, { kind: "empWave" }>,
  durationMs: number,
  remainingMs: number,
): void {
  const elapsed = durationMs - remainingMs;
  const u = Math.max(0, Math.min(1, elapsed / 210));
  const ease = 1 - (1 - u) ** 2.2;
  const fade = Math.max(0, Math.min(1, remainingMs / (durationMs * 0.55)));
  const alpha = fade * (0.92 - 0.35 * u);

  const cx = ev.pos.x * CELL_SIZE + CELL_SIZE / 2;
  const cy = ev.pos.y * CELL_SIZE + CELL_SIZE / 2;
  const maxR = ev.radiusCells * CELL_SIZE + CELL_SIZE * 0.55;
  const r = maxR * ease;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, FIELD_W * CELL_SIZE, FIELD_H * CELL_SIZE);
  ctx.clip();

  ctx.fillStyle = `rgba(56,189,248,${0.07 * alpha * (1 - u * 0.6)})`;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  const rings = [
    { w: 5, a: 0.11 * alpha },
    { w: 2.5, a: 0.38 * alpha },
    { w: 1, a: 0.75 * alpha },
  ];
  for (const { w, a } of rings) {
    ctx.strokeStyle = `rgba(186,230,253,${a})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function boostNameById(id: BoostId): string {
  return BOOSTS[id].name;
}
