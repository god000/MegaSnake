import {
  FIELD_H,
  FIELD_W,
  FOOD_MAX_DISTANCE,
  FOOD_MAX_ON_FIELD,
  FOOD_MIN_DISTANCE,
  type Food,
  type FoodKind,
  type GameState,
  torusChebyshev,
  vecEq,
} from "@megasnake/shared";
import { rndInt } from "./rng.js";

/**
 * Tempo curve for regular food spawn interval (ms). Bodier start, meatier end.
 *  0 - 60s   : ~1 every 0.7s
 *  60 - 135s : ~1 every 0.5s
 *  135-180s  : ~1 every 0.35s
 */
export function foodSpawnIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 60_000) return 1000;
  if (elapsedMs < 135_000) return 720;
  return 520;
}

export function goldenChance(elapsedMs: number): number {
  return elapsedMs >= 150_000 ? 0.15 : 0.08;
}

/**
 * Find a tile that:
 *  - is not on any snake body
 *  - is not on existing food / pickup / box
 *  - is at least FOOD_MIN_DISTANCE from any snake head
 *  - is at most FOOD_MAX_DISTANCE from at least one snake head
 *
 * Falls back gracefully (relaxes constraints) if no spot is found quickly.
 */
export function pickFoodSpot(state: GameState, rng: () => number): { x: number; y: number } | null {
  const occupied = new Set<string>();
  for (const s of state.snakes) for (const seg of s.body) occupied.add(`${seg.x}|${seg.y}`);
  for (const f of state.food) occupied.add(`${f.pos.x}|${f.pos.y}`);
  for (const p of state.pickups) occupied.add(`${p.pos.x}|${p.pos.y}`);
  for (const b of state.mysteryBoxes) occupied.add(`${b.pos.x}|${b.pos.y}`);

  const heads = state.snakes.filter((s) => s.alive).map((s) => s.body[0]!);

  for (let attempt = 0; attempt < 80; attempt++) {
    const x = rndInt(rng, 0, FIELD_W - 1);
    const y = rndInt(rng, 0, FIELD_H - 1);
    if (occupied.has(`${x}|${y}`)) continue;

    if (heads.length === 0) return { x, y };

    let okMin = true;
    let nearestAny = false;
    for (const h of heads) {
      const d = torusChebyshev({ x, y }, h, FIELD_W, FIELD_H);
      if (d < FOOD_MIN_DISTANCE) {
        okMin = false;
        break;
      }
      if (d <= FOOD_MAX_DISTANCE) nearestAny = true;
    }
    if (okMin && nearestAny) return { x, y };
  }

  // Relaxed pass: just avoid occupied.
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = rndInt(rng, 0, FIELD_W - 1);
    const y = rndInt(rng, 0, FIELD_H - 1);
    if (!occupied.has(`${x}|${y}`)) return { x, y };
  }
  return null;
}

let foodCounter = 0;
export function spawnFood(state: GameState, rng: () => number, kind: FoodKind = "normal"): Food | null {
  if (state.food.length >= FOOD_MAX_ON_FIELD) return null;
  const pos = pickFoodSpot(state, rng);
  if (!pos) return null;
  const food: Food = {
    id: `f${++foodCounter}`,
    pos,
    kind,
    spawnTick: state.tick,
  };
  state.food.push(food);
  return food;
}

export function spawnFoodCluster(state: GameState, rng: () => number, count: number): void {
  const first = spawnFood(state, rng, rng() < goldenChance(state.elapsedMs) ? "golden" : "normal");
  if (!first) return;
  for (let i = 1; i < count; i++) {
    const dx = rndInt(rng, -2, 2);
    const dy = rndInt(rng, -2, 2);
    const x = ((first.pos.x + dx) % FIELD_W + FIELD_W) % FIELD_W;
    const y = ((first.pos.y + dy) % FIELD_H + FIELD_H) % FIELD_H;
    if (state.food.some((f) => vecEq(f.pos, { x, y }))) continue;
    state.food.push({
      id: `f${++foodCounter}`,
      pos: { x, y },
      kind: "normal",
      spawnTick: state.tick,
    });
    if (state.food.length >= FOOD_MAX_ON_FIELD) return;
  }
}
