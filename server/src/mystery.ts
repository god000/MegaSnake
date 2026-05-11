import {
  type BoostId,
  type BoostKind,
  BOOSTS,
  type GameState,
  MYSTERY_KIND_WEIGHTS,
  MYSTERY_POOL,
  MYSTERY_BOX_MAX_ON_FIELD,
  type Snake,
  type Vec2,
} from "@megasnake/shared";
import { applyBoost, setMysteryResolver } from "./boosts/index.js";
import { pickFoodSpot } from "./food.js";
import { pickWeighted, rndInt } from "./rng.js";

/**
 * Spawn cadence: a mystery box is rolled every 3-4.5 seconds. With max 6 on field.
 */
export function rollMysteryInterval(rng: () => number): number {
  return rndInt(rng, 3000, 4500);
}

let mboxCounter = 0;

export function spawnMysteryBox(state: GameState, rng: () => number): void {
  if (state.mysteryBoxes.length >= MYSTERY_BOX_MAX_ON_FIELD) return;
  const pos = pickFoodSpot(state, rng);
  if (!pos) return;
  state.mysteryBoxes.push({
    id: `mb${++mboxCounter}`,
    pos,
    spawnTick: state.tick,
  });
}

function pickMysteryKind(rng: () => number): BoostKind {
  const r = rng() * (MYSTERY_KIND_WEIGHTS.buff + MYSTERY_KIND_WEIGHTS.debuff + MYSTERY_KIND_WEIGHTS.global);
  if (r < MYSTERY_KIND_WEIGHTS.buff) return "buff";
  if (r < MYSTERY_KIND_WEIGHTS.buff + MYSTERY_KIND_WEIGHTS.debuff) return "debuff";
  return "global";
}

function pickFromPool(rng: () => number, pool: BoostId[]): BoostId | null {
  if (pool.length === 0) return null;
  return pickWeighted(rng, pool, (id) => BOOSTS[id].mysteryWeight);
}

/**
 * Resolve a mystery box opening. Anti-frustration: if `debuff` was rolled but
 * the only candidate target is on cooldown, fall back to a buff.
 */
export function resolveMysteryBox(
  state: GameState,
  opener: Snake,
  pos: Vec2,
  rng: () => number,
): void {
  let kind = pickMysteryKind(rng);
  if (kind === "debuff") {
    const enemiesEligible = state.snakes.filter(
      (s) => s.id !== opener.id && s.alive && state.elapsedMs - s.lastHardDebuffAt > 4000,
    );
    if (enemiesEligible.length === 0) kind = "buff";
  }
  const pool = MYSTERY_POOL[kind];
  const boostId = pickFromPool(rng, pool);
  if (!boostId) {
    // Fallback to any buff
    const fallback = pickFromPool(rng, MYSTERY_POOL.buff);
    if (!fallback) return;
    applyBoost(state, opener, fallback, rng);
    state.events.push({ kind: "mystery", snakeId: opener.id, boostId: fallback, pos, targetIds: [opener.id] });
    return;
  }

  if (BOOSTS[boostId].kind === "debuff") {
    // applyBoost already targets random enemies.
    applyBoost(state, opener, boostId, rng);
    state.events.push({ kind: "mystery", snakeId: opener.id, boostId, pos, targetIds: [] });
  } else if (BOOSTS[boostId].kind === "global") {
    applyBoost(state, opener, boostId, rng);
    state.events.push({ kind: "mystery", snakeId: opener.id, boostId, pos, targetIds: state.snakes.map((s) => s.id) });
  } else {
    applyBoost(state, opener, boostId, rng);
    state.events.push({ kind: "mystery", snakeId: opener.id, boostId, pos, targetIds: [opener.id] });
  }
}

setMysteryResolver(resolveMysteryBox);
