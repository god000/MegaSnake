import type { Vec2 } from "./types.js";

/**
 * Toroidal helpers — the field wraps around in both axes.
 */

export function wrap(v: number, max: number): number {
  const m = ((v % max) + max) % max;
  return m;
}

export function wrapVec(v: Vec2, w: number, h: number): Vec2 {
  return { x: wrap(v.x, w), y: wrap(v.y, h) };
}

/** Shortest signed delta on a 1D ring of size `max`. */
export function torusDelta(a: number, b: number, max: number): number {
  let d = b - a;
  if (d > max / 2) d -= max;
  if (d < -max / 2) d += max;
  return d;
}

/** Manhattan distance on a torus. */
export function torusManhattan(a: Vec2, b: Vec2, w: number, h: number): number {
  return Math.abs(torusDelta(a.x, b.x, w)) + Math.abs(torusDelta(a.y, b.y, h));
}

/** Chebyshev distance on a torus (used for "within radius" checks). */
export function torusChebyshev(a: Vec2, b: Vec2, w: number, h: number): number {
  return Math.max(Math.abs(torusDelta(a.x, b.x, w)), Math.abs(torusDelta(a.y, b.y, h)));
}

export function vecEq(a: Vec2, b: Vec2): boolean {
  return a.x === b.x && a.y === b.y;
}
