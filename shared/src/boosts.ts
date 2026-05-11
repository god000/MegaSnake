/**
 * Catalog of all boosts (pickups + внутренние статусы вроде empFreeze). Used by:
 *  - server: to resolve gameplay effects (server/src/boosts/*).
 *  - shared: for spawn weights & mystery-box selection.
 *  - client: for icons, names, tooltip-style overlays.
 */

export type BoostCategory = "mobility" | "food" | "growth" | "sabotage" | "chaos";

/** "buff" applies to self, "debuff" applies to a foreign snake. "global" affects all/world. */
export type BoostKind = "buff" | "debuff" | "global";

export interface BoostDef {
  id: BoostId;
  name: string;
  category: BoostCategory;
  kind: BoostKind;
  /** Effect duration in ms (0 if instant / one-shot). */
  durationMs: number;
  /** Spawn weight as a regular pickup on the field (0 = only via mystery box). */
  pickupWeight: number;
  /** Weight inside a mystery box of matching kind. */
  mysteryWeight: number;
  /** Considered a "hard" debuff for anti-frustration logic. */
  hardDebuff?: boolean;
  /** Optional numeric parameters (radius, multiplier, etc.). */
  params?: Record<string, number>;
  /** Short label for HUD (1-2 chars or short word). */
  short: string;
  /** Hint description for tooltips / mystery reveal. */
  description: string;
}

export const BOOST_IDS = [
  // mobility
  "x2Speed",
  "dash",
  "superTurn",
  "phantomPass",
  "microTeleport",
  // food
  "magnet",
  "hammerHead",
  "radar",
  "foodClone",
  "foodRain",
  "goldenBite",
  // growth
  "x2Growth",
  "combo5in3",
  "critBite",
  "safeBank",
  "streak3rd",
  // sabotage
  "slowWave",
  "turnInvert",
  "fakeFood",
  "radarJam",
  "boostCorrupt",
  // chaos
  "invisible",
  "chameleon",
  "emp",
  "empFreeze",
  "blackout",
] as const;

export type BoostId = (typeof BOOST_IDS)[number];

export const BOOSTS: Record<BoostId, BoostDef> = {
  // ---------- Mobility ----------
  x2Speed: {
    id: "x2Speed",
    name: "x2 Speed",
    category: "mobility",
    kind: "buff",
    durationMs: 3000,
    pickupWeight: 12,
    mysteryWeight: 10,
    short: "2x",
    params: { multiplier: 2 },
    description: "Двойная скорость на 3 секунды.",
  },
  dash: {
    id: "dash",
    name: "Dash",
    category: "mobility",
    kind: "buff",
    durationMs: 0,
    pickupWeight: 10,
    mysteryWeight: 8,
    short: "→",
    params: { cells: 5 },
    description: "Мгновенный рывок на 5 клеток вперёд.",
  },
  superTurn: {
    id: "superTurn",
    name: "Super Turn",
    category: "mobility",
    kind: "buff",
    durationMs: 3000,
    pickupWeight: 6,
    mysteryWeight: 6,
    short: "↻",
    description: "3 секунды повороты без задержки между шагами.",
  },
  phantomPass: {
    id: "phantomPass",
    name: "Phantom Pass",
    category: "mobility",
    kind: "buff",
    durationMs: 2500,
    pickupWeight: 5,
    mysteryWeight: 5,
    short: "Ph",
    description: "2.5 секунды проходишь сквозь чужие тела без эффектов.",
  },
  microTeleport: {
    id: "microTeleport",
    name: "Micro Teleport",
    category: "mobility",
    kind: "buff",
    durationMs: 0,
    pickupWeight: 5,
    mysteryWeight: 6,
    short: "TP",
    params: { radius: 8 },
    description: "Случайный прыжок в радиусе 8 клеток.",
  },

  // ---------- Food ----------
  magnet: {
    id: "magnet",
    name: "Food Magnet",
    category: "food",
    kind: "buff",
    durationMs: 4000,
    pickupWeight: 12,
    mysteryWeight: 8,
    short: "M",
    params: { radius: 5 },
    description: "4 секунды притягивает еду в радиусе 5 клеток.",
  },
  hammerHead: {
    id: "hammerHead",
    name: "Hammer Head",
    category: "food",
    kind: "buff",
    durationMs: 5000,
    pickupWeight: 8,
    mysteryWeight: 6,
    short: "HH",
    params: { width: 5 },
    description: "5 секунд голова собирает еду полосой шириной 5 клеток.",
  },
  radar: {
    id: "radar",
    name: "Radar",
    category: "food",
    kind: "buff",
    durationMs: 5000,
    pickupWeight: 6,
    mysteryWeight: 6,
    short: "R",
    description: "5 секунд видишь подсветку ближайшей еды.",
  },
  foodClone: {
    id: "foodClone",
    name: "Food Clone",
    category: "food",
    kind: "buff",
    durationMs: 8000,
    pickupWeight: 8,
    mysteryWeight: 6,
    short: "C",
    description: "Следующая съеденная еда дублируется рядом.",
  },
  foodRain: {
    id: "foodRain",
    name: "Food Rain",
    category: "food",
    kind: "buff",
    durationMs: 2000,
    pickupWeight: 4,
    mysteryWeight: 6,
    short: "*",
    params: { radius: 6, count: 6 },
    description: "Вокруг тебя 2 секунды льёт еда.",
  },
  goldenBite: {
    id: "goldenBite",
    name: "Golden Bite",
    category: "food",
    kind: "buff",
    durationMs: 8000,
    pickupWeight: 6,
    mysteryWeight: 5,
    short: "G",
    params: { growth: 4 },
    description: "Следующая еда даст +4 длины.",
  },

  // ---------- Growth ----------
  x2Growth: {
    id: "x2Growth",
    name: "x2 Growth",
    category: "growth",
    kind: "buff",
    durationMs: 5000,
    pickupWeight: 10,
    mysteryWeight: 9,
    short: "2G",
    params: { multiplier: 2 },
    description: "5 секунд еда даёт двойной рост.",
  },
  combo5in3: {
    id: "combo5in3",
    name: "Combo 5-in-3",
    category: "growth",
    kind: "buff",
    durationMs: 3000,
    pickupWeight: 4,
    mysteryWeight: 5,
    short: "5",
    params: { needed: 5, bonus: 5 },
    description: "Съешь 5 еды за 3 секунды — бонус +5 длины.",
  },
  critBite: {
    id: "critBite",
    name: "Crit Bite",
    category: "growth",
    kind: "buff",
    durationMs: 5000,
    pickupWeight: 5,
    mysteryWeight: 5,
    short: "Cr",
    params: { chance: 0.25, bonus: 1 },
    description: "5 секунд: 25% шанс что еда даст +2.",
  },
  safeBank: {
    id: "safeBank",
    name: "Safe Bank",
    category: "growth",
    kind: "buff",
    durationMs: 2000,
    pickupWeight: 4,
    mysteryWeight: 4,
    short: "$",
    params: { bonus: 6, slowdown: 0.85 },
    description: "+6 длины, но -15% скорости на 2 секунды.",
  },
  streak3rd: {
    id: "streak3rd",
    name: "Streak Marker",
    category: "growth",
    kind: "buff",
    durationMs: 8000,
    pickupWeight: 4,
    mysteryWeight: 4,
    short: "St",
    description: "8 секунд: каждая 3-я еда даёт +1 сверху.",
  },

  // ---------- Sabotage ----------
  slowWave: {
    id: "slowWave",
    name: "Slow Wave",
    category: "sabotage",
    kind: "debuff",
    durationMs: 2000,
    pickupWeight: 8,
    mysteryWeight: 8,
    short: "Sl",
    params: { radius: 6, multiplier: 0.5 },
    description: "Враги в радиусе 6 клеток замедляются в 2 раза на 2 секунды.",
  },
  turnInvert: {
    id: "turnInvert",
    name: "Turn Invert",
    category: "sabotage",
    kind: "debuff",
    durationMs: 3000,
    pickupWeight: 0,
    mysteryWeight: 6,
    hardDebuff: true,
    short: "Iv",
    description: "3 секунды: у случайного врага меняются лево/право.",
  },
  fakeFood: {
    id: "fakeFood",
    name: "Fake Food",
    category: "sabotage",
    kind: "buff",
    durationMs: 0,
    pickupWeight: 5,
    mysteryWeight: 4,
    short: "Fk",
    params: { slowdown: 0.7, slowMs: 1500, lifetimeMs: 12000 },
    description: "Ставишь приманку: кто съел — теряет 30% скорости на 1.5 секунды.",
  },
  radarJam: {
    id: "radarJam",
    name: "Radar Jam",
    category: "sabotage",
    kind: "debuff",
    durationMs: 3000,
    pickupWeight: 0,
    mysteryWeight: 5,
    short: "Jm",
    description: "3 секунды у соперников отключаются индикаторы еды/радара.",
  },
  boostCorrupt: {
    id: "boostCorrupt",
    name: "Boost Corrupt",
    category: "sabotage",
    kind: "debuff",
    durationMs: 0,
    pickupWeight: 0,
    mysteryWeight: 5,
    short: "Co",
    description: "У случайного врага текущий баф укорачивается вдвое.",
  },

  // ---------- Chaos ----------
  invisible: {
    id: "invisible",
    name: "Invisible",
    category: "chaos",
    kind: "buff",
    durationMs: 3000,
    pickupWeight: 8,
    mysteryWeight: 6,
    short: "Iv",
    description: "3 секунды твоё тело почти не видно сопернику.",
  },
  chameleon: {
    id: "chameleon",
    name: "Chameleon",
    category: "chaos",
    kind: "buff",
    durationMs: 4000,
    pickupWeight: 4,
    mysteryWeight: 4,
    short: "Ch",
    description: "4 секунды твой цвет совпадает с ближайшим соперником.",
  },
  emp: {
    id: "emp",
    name: "EMP Pulse",
    category: "chaos",
    kind: "buff",
    durationMs: 0,
    pickupWeight: 0,
    mysteryWeight: 4,
    short: "EM",
    params: { radius: 7, freezeMs: 1000 },
    description: "Волна: в радиусе 7 клеток враги на 1 с не двигаются.",
  },
  empFreeze: {
    id: "empFreeze",
    name: "EMP Freeze",
    category: "chaos",
    kind: "debuff",
    durationMs: 1000,
    pickupWeight: 0,
    mysteryWeight: 0,
    short: "‖",
    description: "Заморозка от EMP — нет движения.",
  },
  blackout: {
    id: "blackout",
    name: "Blackout",
    category: "chaos",
    kind: "global",
    durationMs: 3000,
    pickupWeight: 0,
    mysteryWeight: 5,
    short: "Bl",
    description: "Глобальное ослепление на 3 секунды.",
  },
};

/** Boosts that can spawn as regular field pickups (positive `pickupWeight`). */
export const PICKUP_POOL: BoostId[] = (BOOST_IDS as readonly BoostId[]).filter(
  (id) => BOOSTS[id].pickupWeight > 0,
);

/** Boosts available inside a mystery box, partitioned by kind. */
export const MYSTERY_POOL: Record<BoostKind, BoostId[]> = {
  buff: (BOOST_IDS as readonly BoostId[]).filter(
    (id) => BOOSTS[id].mysteryWeight > 0 && BOOSTS[id].kind === "buff",
  ),
  debuff: (BOOST_IDS as readonly BoostId[]).filter(
    (id) => BOOSTS[id].mysteryWeight > 0 && BOOSTS[id].kind === "debuff",
  ),
  global: (BOOST_IDS as readonly BoostId[]).filter(
    (id) => BOOSTS[id].mysteryWeight > 0 && BOOSTS[id].kind === "global",
  ),
};

export const MYSTERY_KIND_WEIGHTS: Record<BoostKind, number> = {
  buff: 60,
  debuff: 30,
  global: 10,
};

export const MVP_BOOST_IDS: BoostId[] = [
  "x2Speed",
  "magnet",
  "x2Growth",
  "dash",
  "invisible",
  "slowWave",
  "radar",
  "foodClone",
];
