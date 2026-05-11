import type { GameState, MatchReport } from "@megasnake/shared";

/** Count how many times the leader (#1 by length) changed during the match. */
export function countLeaderChanges(state: GameState): number {
  const samples = new Map<string, Array<[number, number]>>();
  for (const s of state.snakes) samples.set(s.id, s.stats.lengthSamples);

  if (samples.size === 0) return 0;

  let changes = 0;
  let lastLeader: string | null = null;

  // Build merged time axis
  const times = new Set<number>();
  for (const arr of samples.values()) for (const [t] of arr) times.add(t);
  const sortedTimes = [...times].sort((a, b) => a - b);

  // For each timestamp, find leader and compare to previous
  const lastLenById = new Map<string, number>();
  const sampleIdx = new Map<string, number>();
  for (const id of samples.keys()) {
    sampleIdx.set(id, 0);
    lastLenById.set(id, 0);
  }

  for (const t of sortedTimes) {
    for (const [id, arr] of samples) {
      let i = sampleIdx.get(id)!;
      while (i < arr.length && arr[i]![0] <= t) {
        lastLenById.set(id, arr[i]![1]);
        i++;
      }
      sampleIdx.set(id, i);
    }
    let leaderId: string | null = null;
    let leaderLen = -1;
    for (const [id, len] of lastLenById) {
      if (len > leaderLen) {
        leaderLen = len;
        leaderId = id;
      }
    }
    if (leaderId !== null && leaderId !== lastLeader) {
      if (lastLeader !== null) changes++;
      lastLeader = leaderId;
    }
  }
  return changes;
}

function avgWowInterval(wowTimestampsMs: number[]): number | null {
  if (wowTimestampsMs.length < 2) return null;
  const sorted = [...wowTimestampsMs].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) sum += sorted[i]! - sorted[i - 1]!;
  return sum / (sorted.length - 1);
}

export function buildReport(state: GameState, wowTimestampsMs: number[]): MatchReport {
  const snakes = state.snakes;
  const leaderChanges = countLeaderChanges(state);
  const avgWowIntervalMs = avgWowInterval(wowTimestampsMs);

  let winner: { id: string; len: number } | null = null;
  let lowest = Infinity;
  let totalBoosts = 0;
  let totalMystery = 0;
  let totalFood = 0;
  for (const s of snakes) {
    if (!winner || s.body.length > winner.len) winner = { id: s.id, len: s.body.length };
    if (s.body.length < lowest) lowest = s.body.length;
    totalBoosts += s.stats.boostsCollected;
    totalMystery += s.stats.mysteryOpened;
    totalFood += s.stats.foodEaten;
  }

  let longest = { snakeId: "", length: 0 };
  for (const s of snakes) {
    if (s.body.length > longest.length) longest = { snakeId: s.id, length: s.body.length };
  }

  return {
    durationMs: state.elapsedMs,
    winnerId: winner?.id ?? null,
    leaderChanges,
    avgWowIntervalMs,
    totalBoostsPicked: totalBoosts,
    totalMysteryOpened: totalMystery,
    totalFoodEaten: totalFood,
    longestStreak: longest,
    spreadTopBottom: winner ? winner.len - lowest : 0,
    perSnake: snakes.map((s) => ({
      snakeId: s.id,
      name: s.name,
      finalLength: s.body.length,
      foodEaten: s.stats.foodEaten,
      goldenEaten: s.stats.goldenEaten,
      boostsCollected: s.stats.boostsCollected,
      mysteryOpened: s.stats.mysteryOpened,
      dashesUsed: s.stats.dashesUsed,
      score: s.score,
    })),
  };
}

export function logReport(report: MatchReport): void {
  const dur = (report.durationMs / 1000).toFixed(1);
  console.log(`\n=== Match report (${dur}s) ===`);
  console.log(`Leader changes: ${report.leaderChanges}`);
  console.log(
    `Avg wow interval: ${report.avgWowIntervalMs != null ? `${(report.avgWowIntervalMs / 1000).toFixed(1)}s` : "n/a"}`,
  );
  console.log(`Spread top↔bottom: ${report.spreadTopBottom}`);
  console.log(`Food eaten: ${report.totalFoodEaten}, boosts: ${report.totalBoostsPicked}, mystery: ${report.totalMysteryOpened}`);
  for (const p of [...report.perSnake].sort((a, b) => b.finalLength - a.finalLength)) {
    console.log(
      `  ${p.name.padEnd(12)} len=${String(p.finalLength).padStart(3)}  score=${String(p.score).padStart(3)}  food=${p.foodEaten}  gold=${p.goldenEaten}  boosts=${p.boostsCollected}  mystery=${p.mysteryOpened}  dash=${p.dashesUsed}`,
    );
  }
  console.log("============================\n");
}
