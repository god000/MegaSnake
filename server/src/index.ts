/**
 * WebSocket entrypoint with private rooms.
 *
 * Flow:
 *   1. createRoom / joinRoom / debugBots
 *   2. host presses startRoom -> 5s lobby countdown
 *   3. fill remaining slots with bots, then play()
 *   4. on match end -> short cool-down -> lobby in the same room
 */
import { WebSocketServer, type WebSocket } from "ws";
import {
  type AbilityId,
  type ClientMessage,
  type Direction,
  type ServerMessage,
  TICK_MS,
  WS_DEFAULT_PORT,
} from "@megasnake/shared";
import { RoomManager, type RoomConnection } from "./rooms.js";

interface Connection extends RoomConnection {
  ws: WebSocket;
}

const PORT = Number(process.env.PORT ?? WS_DEFAULT_PORT);

const wss = new WebSocketServer({ port: PORT });
console.log(`[server] MegaRace Chaos listening on ws://0.0.0.0:${PORT}`);

const rooms = new RoomManager();
const conns = new Map<string, Connection>();
let connCounter = 0;

const VALID_DIRS = new Set<Direction>(["up", "down", "left", "right"]);
/** Антиспам ввода: не чаще одного принятого направления за этот интервал (мс). */
const MIN_INPUT_INTERVAL_MS = 45;
const lastHumanInputAt = new Map<string, number>();

function sendTo(id: string, msg: ServerMessage): void {
  const c = conns.get(id);
  if (c && c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

function makeConnection(id: string, ws: WebSocket): Connection {
  const conn: Connection = {
    id,
    ws,
    name: "",
    joined: false,
    send: (msg) => sendTo(id, msg),
  };
  conns.set(id, conn);
  return conn;
}

wss.on("connection", (ws) => {
  const id = `c_${++connCounter}_${Date.now().toString(36)}`;
  makeConnection(id, ws);
  sendTo(id, { t: "welcome", selfId: id, tickRate: 1000 / TICK_MS });

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const conn = conns.get(id);
    if (!conn) return;

    switch (msg.t) {
      case "createRoom":
        try {
          rooms.createRoom(conn, msg.name, msg.abilityId);
        } catch (err) {
          sendTo(id, { t: "error", msg: err instanceof Error ? err.message : "Не удалось создать комнату" });
        }
        break;
      case "joinRoom":
        try {
          rooms.joinRoom(conn, msg.code, msg.name, msg.abilityId);
        } catch (err) {
          sendTo(id, { t: "error", msg: err instanceof Error ? err.message : "Не удалось войти в комнату" });
        }
        break;
      case "startRoom":
        try {
          rooms.startRoom(id);
        } catch (err) {
          sendTo(id, { t: "error", msg: err instanceof Error ? err.message : "Не удалось запустить матч" });
        }
        break;
      case "debugBots":
        try {
          rooms.debugWithBots(conn, msg.name, msg.abilityId);
        } catch (err) {
          sendTo(id, { t: "error", msg: err instanceof Error ? err.message : "Не удалось запустить отладку" });
        }
        break;
      case "input": {
        if (!VALID_DIRS.has(msg.dir)) break;
        const room = rooms.getRoomForConnection(id);
        if (!room) break;
        const t = Date.now();
        const prev = lastHumanInputAt.get(id) ?? 0;
        if (t - prev < MIN_INPUT_INTERVAL_MS) break;
        lastHumanInputAt.set(id, t);
        room.match.setInput(id, msg.dir);
        break;
      }
      case "ping":
        sendTo(id, { t: "pong", ts: msg.ts });
        break;
      case "ready":
        break;
      case "ability":
        rooms.getRoomForConnection(id)?.match.useAbility(id);
        break;
    }
  });

  ws.on("close", () => {
    conns.delete(id);
    lastHumanInputAt.delete(id);
    rooms.leaveRoom(id);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.allRooms()) {
    if (room.connections.size === 0) continue;
    rooms.tickRoom(room, now);
  }
}, TICK_MS);
