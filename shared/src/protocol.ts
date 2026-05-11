import type { AbilityId, Direction, GameState, MatchReport, RoomPlayer } from "./types.js";

/** Client → Server messages. */
export type ClientMessage =
  | { t: "createRoom"; name: string; abilityId?: AbilityId }
  | { t: "joinRoom"; code: string; name: string; abilityId?: AbilityId }
  | { t: "startRoom" }
  | { t: "debugBots"; name: string; abilityId?: AbilityId }
  | { t: "input"; dir: Direction; seq: number }
  | { t: "ability"; ability: "dash" }
  | { t: "ready" }
  | { t: "ping"; ts: number };

/** Server → Client messages. */
export type ServerMessage =
  | { t: "welcome"; selfId: string; tickRate: number }
  | { t: "room"; code: string; isHost: boolean; hostId: string; players: RoomPlayer[] }
  | { t: "state"; s: GameState }
  | { t: "report"; r: MatchReport }
  | { t: "pong"; ts: number }
  | { t: "error"; msg: string };

export const WS_DEFAULT_PORT = 8787;
