/**
 * Greedy-pathfinder bot AI on a torus.
 *
 * Picks the closest target (food / boost pickup / mystery box), prefers higher-value
 * pickups when within reach. Avoids reversing direction. Picks the axis with the
 * larger remaining distance first, breaking ties randomly so bots don't all herd.
 */
import {
  type Direction,
  FIELD_H,
  FIELD_W,
  type GameState,
  type Snake,
  type Vec2,
  torusDelta,
  torusManhattan,
} from "@megasnake/shared";
import type { BoostId } from "@megasnake/shared";
import { rndInt } from "./rng.js";

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

interface Target {
  pos: Vec2;
  weight: number;
  kind: "food" | "pickup" | "mystery";
  boostId?: BoostId;
}

function targetWeight(kind: Target["kind"], _boostId?: BoostId): number {
  if (kind === "mystery") return 1.6;
  if (kind === "pickup") return 1.3;
  return 1.0;
}

function gatherTargets(state: GameState, self: Snake): Target[] {
  const out: Target[] = [];
  const head = self.body[0]!;
  for (const f of state.food) {
    if (f.kind === "fake") continue;
    out.push({
      pos: f.pos,
      kind: "food",
      weight:
        targetWeight("food") *
        (f.kind === "golden" ? 2 : 1) /
        Math.max(1, torusManhattan(head, f.pos, FIELD_W, FIELD_H)),
    });
  }
  for (const p of state.pickups) {
    out.push({
      pos: p.pos,
      kind: "pickup",
      boostId: p.boostId,
      weight: targetWeight("pickup", p.boostId) / Math.max(1, torusManhattan(head, p.pos, FIELD_W, FIELD_H)),
    });
  }
  for (const b of state.mysteryBoxes) {
    out.push({
      pos: b.pos,
      kind: "mystery",
      weight: targetWeight("mystery") / Math.max(1, torusManhattan(head, b.pos, FIELD_W, FIELD_H)),
    });
  }
  return out;
}

function pickBestTarget(state: GameState, self: Snake): Target | null {
  const all = gatherTargets(state, self);
  if (all.length === 0) return null;
  let best = all[0]!;
  for (const t of all) if (t.weight > best.weight) best = t;
  return best;
}

function chooseDir(
  head: Vec2,
  target: Vec2,
  current: Direction,
  rng: () => number,
): Direction {
  const dx = torusDelta(head.x, target.x, FIELD_W);
  const dy = torusDelta(head.y, target.y, FIELD_H);

  const candidates: Direction[] = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx !== 0) candidates.push(dx > 0 ? "right" : "left");
    if (dy !== 0) candidates.push(dy > 0 ? "down" : "up");
  } else {
    if (dy !== 0) candidates.push(dy > 0 ? "down" : "up");
    if (dx !== 0) candidates.push(dx > 0 ? "right" : "left");
  }

  // Filter out 180° flip
  const allowed = candidates.filter((d) => d !== OPPOSITE[current]);
  if (allowed.length > 0) return allowed[0]!;

  // Otherwise keep going forward
  return current;
}

export function botStep(state: GameState, self: Snake, rng: () => number): void {
  if (!self.isBot || !self.alive) return;
  if (self.statuses.some((st) => st.id === "empFreeze" && st.expiresAt > state.elapsedMs)) return;

  // ~30% of decisions: occasional jitter so bots don't all behave identically
  const target = pickBestTarget(state, self);
  if (!target) {
    // Wander
    if (rng() < 0.05) {
      const dirs: Direction[] = ["up", "down", "left", "right"];
      const next = dirs[rndInt(rng, 0, 3)]!;
      if (next !== OPPOSITE[self.dir]) self.nextDir = next;
    }
    return;
  }

  const wantedDir = chooseDir(self.body[0]!, target.pos, self.dir, rng);
  // Tiny noise so multiple bots don't path-perfect identically
  if (rng() < 0.07) {
    const dirs: Direction[] = ["up", "down", "left", "right"];
    const next = dirs[rndInt(rng, 0, 3)]!;
    if (next !== OPPOSITE[self.dir]) self.nextDir = next;
    return;
  }
  self.nextDir = wantedDir;
}
