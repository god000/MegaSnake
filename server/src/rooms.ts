import {
  HOST_START_COUNTDOWN_MS,
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  type AbilityId,
  type RoomPlayer,
  type ServerMessage,
} from "@megasnake/shared";
import { Match } from "./match.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface RoomConnection {
  id: string;
  name: string;
  abilityId?: AbilityId;
  joined: boolean;
  send: (msg: ServerMessage) => void;
}

export interface Room {
  code: string;
  hostId: string;
  match: Match;
  connections: Map<string, RoomConnection>;
  lobbyDeadline: number | null;
  postMatchAt: number | null;
  /** Только режим «Играть с ботами» добивает слоты ботами. */
  withBots: boolean;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly connRoom = new Map<string, string>();

  getRoomForConnection(connId: string): Room | null {
    const code = this.connRoom.get(connId);
    return code ? (this.rooms.get(code) ?? null) : null;
  }

  allRooms(): Room[] {
    return [...this.rooms.values()];
  }

  createRoom(conn: RoomConnection, name: string, abilityId?: AbilityId): Room {
    this.leaveRoom(conn.id);

    const code = this.generateCode();
    const room: Room = {
      code,
      hostId: conn.id,
      match: new Match({ seed: Date.now() }),
      connections: new Map([[conn.id, conn]]),
      lobbyDeadline: null,
      postMatchAt: null,
      withBots: false,
    };
    this.rooms.set(code, room);
    this.connRoom.set(conn.id, code);
    this.addPlayerToRoom(room, conn, name, abilityId);
    return room;
  }

  joinRoom(conn: RoomConnection, code: string, name: string, abilityId?: AbilityId): Room {
    this.leaveRoom(conn.id);

    const room = this.rooms.get(this.normalizeCode(code));
    if (!room) throw new Error("Комната не найдена");
    if (room.match.state.phase !== "lobby") throw new Error("Матч уже идёт, дождитесь конца");
    if (room.lobbyDeadline !== null) throw new Error("Старт уже запущен");

    const humans = room.match.state.snakes.filter((s) => !s.isBot).length;
    if (humans >= MAX_PLAYERS) throw new Error("Комната заполнена");

    room.connections.set(conn.id, conn);
    this.connRoom.set(conn.id, room.code);
    this.addPlayerToRoom(room, conn, name, abilityId);
    return room;
  }

  startRoom(connId: string): void {
    const room = this.getRoomForConnection(connId);
    if (!room) throw new Error("Вы не в комнате");
    if (room.hostId !== connId) throw new Error("Старт может нажать только хост");
    if (room.match.state.phase !== "lobby") throw new Error("Матч уже идёт");
    if (room.lobbyDeadline !== null) return;

    const humans = room.match.state.snakes.filter((s) => !s.isBot).length;
    if (humans < 1) throw new Error("Нужен хотя бы один игрок");

    room.lobbyDeadline = Date.now() + HOST_START_COUNTDOWN_MS;
  }

  debugWithBots(conn: RoomConnection, name: string, abilityId?: AbilityId): Room {
    const room = this.createRoom(conn, name, abilityId);
    room.withBots = true;
    this.startRoomMatch(room);
    return room;
  }

  leaveRoom(connId: string): void {
    const code = this.connRoom.get(connId);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) {
      this.connRoom.delete(connId);
      return;
    }

    room.connections.delete(connId);
    this.connRoom.delete(connId);

    if (room.match.state.phase === "lobby") {
      room.match.removePlayer(connId);
    }

    if (room.connections.size === 0) {
      this.rooms.delete(code);
      return;
    }

    if (room.hostId === connId) {
      const next = room.connections.keys().next().value as string | undefined;
      if (next) room.hostId = next;
    }

    this.syncRoomLobby(room);
  }

  tickRoom(room: Room, now: number): void {
    if (room.match.state.phase === "lobby") {
      if (room.lobbyDeadline !== null) {
        room.match.setLobbyMs(Math.max(0, room.lobbyDeadline - now));
        if (now >= room.lobbyDeadline) this.startRoomMatch(room);
      } else {
        room.match.setLobbyMs(0);
      }
    }

    room.match.tick();

    if (room.match.state.phase === "ended" && room.postMatchAt === null) {
      const report = room.match.getReport();
      if (report) this.broadcast(room, { t: "report", r: report });
      room.postMatchAt = now + 8000;
    }

    if (room.postMatchAt !== null && now >= room.postMatchAt) {
      const humans = room.match.state.snakes.filter((s) => !s.isBot);
      room.match = new Match({ seed: Date.now() });
      for (const h of humans) {
        const c = room.connections.get(h.id);
        if (c) {
          room.match.addPlayer({
            id: h.id,
            name: h.name,
            isBot: false,
            abilityId: h.abilityId,
          });
        }
      }
      room.lobbyDeadline = null;
      room.postMatchAt = null;
      this.syncRoomLobby(room);
    }

    this.broadcast(room, { t: "state", s: room.match.state });
  }

  startRoomMatch(room: Room): void {
    if (room.withBots) {
      const need = MAX_PLAYERS - room.match.state.snakes.length;
      const botAbilities: AbilityId[] = ["dashAbility", "burstRun", "headTailSwap", "foodPulse", "phaseShift"];
      for (let i = 0; i < need; i++) {
        room.match.addPlayer({
          id: `bot_${room.code}_${i + 1}_${Date.now().toString(36)}`,
          name: `Bot${i + 1}`,
          isBot: true,
          abilityId: botAbilities[i % botAbilities.length],
        });
      }
    }
    room.match.startMatch();
    room.lobbyDeadline = null;
  }

  syncRoomLobby(room: Room): void {
    const players = this.roomPlayers(room);
    for (const [id, conn] of room.connections) {
      conn.send({
        t: "room",
        code: room.code,
        isHost: id === room.hostId,
        hostId: room.hostId,
        players,
      });
    }
  }

  private addPlayerToRoom(room: Room, conn: RoomConnection, name: string, abilityId?: AbilityId): void {
    const humanCount = room.match.state.snakes.filter((s) => !s.isBot).length;
    conn.joined = true;
    conn.name = name.slice(0, 16) || `Player${humanCount + 1}`;
    conn.abilityId = abilityId;
    room.match.addPlayer({
      id: conn.id,
      name: conn.name,
      isBot: false,
      abilityId,
    });
    this.syncRoomLobby(room);
  }

  private roomPlayers(room: Room): RoomPlayer[] {
    return [...room.connections.values()].map((c) => ({
      id: c.id,
      name: c.name,
      isHost: c.id === room.hostId,
    }));
  }

  private broadcast(room: Room, msg: ServerMessage): void {
    for (const conn of room.connections.values()) {
      conn.send(msg);
    }
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  private generateCode(): string {
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
    }
    if (this.rooms.has(code)) return this.generateCode();
    return code;
  }
}
