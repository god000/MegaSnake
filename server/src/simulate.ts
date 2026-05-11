/**
 * Headless smoke test — runs a 3-minute match with 5 bots and prints the report.
 * Run with: npx tsx server/src/simulate.ts
 */
import { TICK_MS } from "@megasnake/shared";
import { Match } from "./match.js";

const m = new Match({ seed: 42 });
for (let i = 0; i < 5; i++) m.addPlayer({ id: `bot${i}`, name: `Bot${i + 1}`, isBot: true });
m.startMatch();

const totalTicks = (180 * 1000) / TICK_MS;
const start = Date.now();
for (let i = 0; i < totalTicks + 5; i++) {
  m.tick();
  if (m.state.phase === "ended") break;
}
const elapsed = Date.now() - start;
console.log(`[sim] simulated ${m.state.elapsedMs}ms in real ${elapsed}ms`);
console.log(
  `[sim] food on field: ${m.state.food.length}, pickups: ${m.state.pickups.length}, mystery: ${m.state.mysteryBoxes.length}`,
);
