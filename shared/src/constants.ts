/**
 * Game-wide tuning constants.
 * Values are chosen so the server tick is 20Hz, the field is small enough that
 * the average distance to the nearest food is roughly 3.8-4.2 seconds at base speed.
 */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

export const FIELD_W = 60;
export const FIELD_H = 36;
export const CELL_SIZE = 16;

export const MATCH_DURATION_MS = 180_000;
export const ENDGAME_MULTIPLIER_START_MS = 150_000;
export const ENDGAME_SCORE_MULTIPLIER = 1.5;
/** С этой же отметки: еда и бонусы спавнятся в 1.5 раза чаще (задержка × этот множитель). */
export const ENDGAME_SPAWN_INTERVAL_MUL = 2 / 3;
/** С этой же отметки: шаг змейки примерно в ENDGAME_MOVEMENT_STEP_DIVISOR раз быстрее базового. */
export const ENDGAME_MOVEMENT_STEP_DIVISOR = 2;

export const MAX_PLAYERS = 5;

export const BOT_FILL_DELAY_MS = 5_000;
/** После нажатия «Старт» хостом — отсчёт до матча (мс). */
export const HOST_START_COUNTDOWN_MS = 5_000;
/** Длина кода комнаты (A–Z, 2–9). */
export const ROOM_CODE_LENGTH = 6;

/** How many ticks pass between snake step at base speed. 3 ticks → ~6.7 cells/s. */
export const BASE_TICKS_PER_STEP = 3;

/** Initial snake length in segments. */
export const INITIAL_LENGTH = 4;

/** Length given by regular food / golden food. */
export const FOOD_GROWTH = 1;
export const GOLDEN_FOOD_GROWTH = 3;

/** Minimum distance (cells) between newly spawned food and any snake. */
export const FOOD_MIN_DISTANCE = 6;
/** Maximum allowed distance from at least one snake (anti-emptiness). */
export const FOOD_MAX_DISTANCE = 25;

/** Soft caps for entities on the field (tuned so 3-min lengths stay ~80–120 with tighter spread). */
export const FOOD_MAX_ON_FIELD = 50;
export const PICKUP_MAX_ON_FIELD = 16;
export const MYSTERY_BOX_MAX_ON_FIELD = 6;

/** MVP mechanics tuning */
export const SPEED_ZONE_DURATION_MS = 12_000;
export const SPEED_ZONE_BOOST_MS = 1_500;
export const SPEED_ZONE_SPEED_MULTIPLIER = 1.25;
export const SPEED_ZONE_SPAWN_INTERVAL_MS = 26_000;

export const DASH_ABILITY_COST = 40;
export const DASH_ABILITY_RECHARGE_MS = 7_000;
export const DASH_ABILITY_DISTANCE = 5;

/** Первые N мс матча погоды нет. */
export const WEATHER_CLEAR_UNTIL_MS = 30_000;
/** Одна фаза погоды; дальше цикл fog → ice → wind (без рандома). */
export const WEATHER_PHASE_MS = 30_000;
export const WEATHER_FOG_RADIUS = 6;
export const WEATHER_ICE_SPEED_MULTIPLIER = 1.2;
export const WEATHER_WIND_SPEED_MULTIPLIER = 1.25;

export const LEADER_PRESSURE_RADIUS = 6;
export const LEADER_PRESSURE_BONUS_POINTS = 1;
export const LEADER_PRESSURE_GROWTH_BONUS = 0;

export const COMEBACK_FOOD_SPAWN_BONUS = 0.08;
export const TELEPORT_PAIR_SPAWN_CHANCE = 0.5;

export const CORE_EVENT_WINDOW_MS = 15_000;
export const CORE_EVENT_POINTS = 10;

/** Player palette (5 high-contrast colors). */
export const PLAYER_COLORS: readonly string[] = [
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#eab308", // yellow
  "#a855f7", // purple
];

/** Background and foreground colors for canvas. */
export const COLOR_BG = "#0b0f1a";
/** Резерв: сплошная сетка (клиент по умолчанию рисует полупрозрачную сетку по погоде). */
export const COLOR_GRID = "#11182a";
/** Внешняя рамка поля в финальную фазу (последние ~30 с). */
export const COLOR_FRAME_ENDGAME = "#ca8a04";
export const COLOR_FOOD = "#fb7185";
export const COLOR_FOOD_GOLDEN = "#facc15";
export const COLOR_BOOST_PICKUP = "#38bdf8";
export const COLOR_MYSTERY_BOX = "#f472b6";
export const COLOR_FAKE_FOOD = "#fb7185";
