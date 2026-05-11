import type { BoostId } from "./boosts.js";

export type Direction = "up" | "down" | "left" | "right";

export interface Vec2 {
  x: number;
  y: number;
}

export interface ActiveStatus {
  /** Boost / debuff identifier. */
  id: BoostId;
  /** When this status expires, in match-time ms. */
  expiresAt: number;
  /** Optional payload (e.g. radius, multiplier, source player id). */
  data?: Record<string, number | string | boolean>;
}

export interface Snake {
  id: string;
  name: string;
  /** Index in PLAYER_COLORS palette. */
  colorIdx: number;
  isBot: boolean;
  alive: boolean;

  /** Head is index 0, tail is last. */
  body: Vec2[];
  /** Current heading (already validated, no 180° flip). */
  dir: Direction;
  /** Buffered next direction from input. */
  nextDir: Direction;

  /** Server-tick the snake last stepped. */
  lastStepTick: number;
  /** How many ticks between steps right now (mutated by speed boosts). */
  ticksPerStep: number;

  /** Pending segments to grow (added to tail when stepping). */
  pendingGrowth: number;

  /** Active timed effects on this snake. */
  statuses: ActiveStatus[];

  /** Anti-frustration: tick at which last hard debuff was applied. */
  lastHardDebuffAt: number;

  /** Stats for end-of-match metrics. */
  stats: SnakeStats;
  score: number;
  energy: number;
  energyCooldownUntil: number;
  abilityId: AbilityId;
}

export interface SnakeStats {
  foodEaten: number;
  goldenEaten: number;
  boostsCollected: number;
  mysteryOpened: number;
  dashesUsed: number;
  /** Length progression sample (tick → length), used to count lead changes. */
  lengthSamples: Array<[number, number]>;
}

export type FoodKind = "normal" | "golden" | "fake";

export interface Food {
  id: string;
  pos: Vec2;
  kind: FoodKind;
  /** For fake food: which player placed it. */
  ownerId?: string;
  /** Spawn tick (for cleanup of fake food after timeout). */
  spawnTick: number;
}

export interface BoostPickup {
  id: string;
  pos: Vec2;
  boostId: BoostId;
  spawnTick: number;
}

export interface MysteryBox {
  id: string;
  pos: Vec2;
  spawnTick: number;
}

export type GamePhase = "lobby" | "playing" | "ended";

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
}

export interface GameState {
  phase: GamePhase;
  /** Server tick counter. */
  tick: number;
  /** Match elapsed time in ms (0 at phase=playing start). */
  elapsedMs: number;
  /** Lobby countdown remaining ms (only meaningful in lobby). */
  lobbyMs: number;

  fieldW: number;
  fieldH: number;

  snakes: Snake[];
  food: Food[];
  pickups: BoostPickup[];
  mysteryBoxes: MysteryBox[];

  /** Global hud effects active (e.g. blackout timestamp). */
  globalEffects: ActiveStatus[];

  /** Per-tick events for clients (visual flashes, popups). Cleared each tick. */
  events: GameEvent[];

  speedZones: SpeedZone[];
  weather: WeatherState | null;
  weatherEndsAt: number;
  teleportPairs: TeleportPair[];
  coreEvent: CoreEvent | null;
}

export type GameEvent =
  | { kind: "pickup"; snakeId: string; boostId: BoostId; pos: Vec2 }
  | { kind: "mystery"; snakeId: string; boostId: BoostId; pos: Vec2; targetIds: string[] }
  | { kind: "eat"; snakeId: string; pos: Vec2; foodKind: FoodKind }
  | { kind: "dash"; snakeId: string; from: Vec2; to: Vec2 }
  /** Визуал: луч от головы source к голове target при наложении дебаффа/EMP. */
  | { kind: "debuffBeam"; sourceId: string; targetId: string; from: Vec2; to: Vec2 }
  /** Визуал EMP: быстро расширяющийся круг от центра (клетка головы источника). */
  | { kind: "empWave"; pos: Vec2; radiusCells: number }
  | { kind: "blackout"; durationMs: number }
  | { kind: "corePicked"; snakeId: string; pos: Vec2 }
  | { kind: "coreDelivered"; snakeId: string; points: number };

export type AbilityId = "dashAbility" | "burstRun" | "headTailSwap" | "foodPulse" | "phaseShift";

export interface SpeedZone {
  id: string;
  pos: Vec2;
  radius: number;
  expiresAt: number;
}

export type WeatherState = "fog" | "ice" | "wind";

export interface TeleportPair {
  id: string;
  a: Vec2;
  b: Vec2;
}

export interface CoreEvent {
  state: "idle" | "carried" | "deliver";
  corePos: Vec2 | null;
  carriedBy: string | null;
  deliveryPos: Vec2 | null;
  expiresAt: number;
}

export interface Leaderboard {
  entries: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  snakeId: string;
  name: string;
  colorIdx: number;
  length: number;
  rank: number;
}

export interface MatchReport {
  durationMs: number;
  winnerId: string | null;
  leaderChanges: number;
  /** Средний интервал между «вау»-событиями (mystery / dash / blackout), мс; null если событий меньше двух. */
  avgWowIntervalMs: number | null;
  totalBoostsPicked: number;
  totalMysteryOpened: number;
  totalFoodEaten: number;
  longestStreak: { snakeId: string; length: number };
  spreadTopBottom: number;
  perSnake: Array<{
    snakeId: string;
    name: string;
    finalLength: number;
    foodEaten: number;
    goldenEaten: number;
    boostsCollected: number;
    mysteryOpened: number;
    dashesUsed: number;
    score: number;
  }>;
}
