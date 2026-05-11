import { WS_DEFAULT_PORT, type AbilityId, type Direction, type GameState, type ServerMessage } from "@megasnake/shared";
import { connect, sendAbility, sendInput, type Net } from "./network.js";
import { bindKeyboard } from "./input.js";
import { pushEvents, render } from "./render.js";
import {
  renderHud,
  renderRoomLobby,
  setMenuError,
  showJoinPanel,
  showMainMenu,
  showMenuOverlay,
  showReportOverlay,
} from "./hud.js";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;

let state: GameState | null = null;
let net: Net | null = null;
let selfId: string | null = null;
let inRoom = false;
let intentDir: Direction | null = null;

const OPPOSITE_DIR: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function selfSnakeDir(): Direction | null {
  if (!state || !selfId) return null;
  const s = state.snakes.find((sn) => sn.id === selfId);
  return s?.dir ?? null;
}

function wsUrl(): string {
  const custom = import.meta.env.VITE_WS_URL as string | undefined;
  if (custom) return custom;

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  if (import.meta.env.DEV) {
    const host = location.hostname || "localhost";
    return `${proto}//${host}:${WS_DEFAULT_PORT}`;
  }
  return `${proto}//${location.host}/ws`;
}

function playerProfile(): { name: string; abilityId: AbilityId } {
  const input = document.getElementById("name-input") as HTMLInputElement;
  const abilityInput = document.getElementById("ability-input") as HTMLSelectElement | null;
  return {
    name: input.value.trim() || "Player",
    abilityId: (abilityInput?.value as AbilityId | undefined) ?? "dashAbility",
  };
}

function focusGame(): void {
  const input = document.getElementById("name-input") as HTMLInputElement;
  const abilityInput = document.getElementById("ability-input") as HTMLSelectElement | null;
  input.blur();
  abilityInput?.blur();
  canvas.focus({ preventScroll: true });
}

function syncMenuVisibility(): void {
  if (!inRoom || !state) return;
  if (state.phase === "playing" || (state.phase === "lobby" && state.lobbyMs > 0)) {
    showMenuOverlay(false);
    return;
  }
  if (state.phase === "lobby" && state.lobbyMs === 0) {
    showMenuOverlay(true);
  }
}

async function init(): Promise<void> {
  const initial = await connect(wsUrl(), onServerMessage);
  net = initial;
  selfId = initial.selfId;
  showMainMenu();

  bindKeyboard(
    (d) => {
      const cur = selfSnakeDir();
      if (cur && OPPOSITE_DIR[cur] === d) return;
      intentDir = d;
      if (net) sendInput(net, d);
    },
    () => {
      if (net) sendAbility(net);
    },
    {
      isEnabled: () => document.getElementById("menu-overlay")!.style.display === "none",
    },
  );

  canvas.tabIndex = 0;
  canvas.addEventListener("pointerdown", () => {
    canvas.focus({ preventScroll: true });
  });

  document.getElementById("create-room-btn")!.addEventListener("click", () => {
    const { name, abilityId } = playerProfile();
    setMenuError("menu-error", "");
    if (net) net.send({ t: "createRoom", name, abilityId });
  });

  document.getElementById("open-join-panel-btn")!.addEventListener("click", () => {
    showJoinPanel();
  });

  document.getElementById("back-to-main-btn")!.addEventListener("click", () => {
    showMainMenu();
  });

  document.getElementById("join-room-btn")!.addEventListener("click", () => {
    const { name, abilityId } = playerProfile();
    const code = (document.getElementById("room-code-input") as HTMLInputElement).value;
    setMenuError("join-error", "");
    if (net) net.send({ t: "joinRoom", code, name, abilityId });
  });

  document.getElementById("debug-bots-btn")!.addEventListener("click", () => {
    const { name, abilityId } = playerProfile();
    setMenuError("menu-error", "");
    if (net) net.send({ t: "debugBots", name, abilityId });
  });

  document.getElementById("start-room-btn")!.addEventListener("click", () => {
    if (net) net.send({ t: "startRoom" });
  });

  document.getElementById("name-input")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      (document.getElementById("create-room-btn") as HTMLButtonElement).click();
    }
  });

  document.getElementById("room-code-input")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      (document.getElementById("join-room-btn") as HTMLButtonElement).click();
    }
  });

  requestAnimationFrame(loop);
}

function onServerMessage(m: ServerMessage): void {
  switch (m.t) {
    case "welcome":
      selfId = m.selfId;
      break;
    case "room":
      inRoom = true;
      renderRoomLobby(m.code, m.players, m.isHost);
      focusGame();
      break;
    case "state":
      state = m.s;
      pushEvents(state.events ?? [], performance.now());
      if (state.phase !== "ended") showReportOverlay(null);
      syncMenuVisibility();
      break;
    case "report":
      showReportOverlay(m.r);
      break;
    case "error":
      if (document.getElementById("join-panel")!.style.display !== "none") {
        setMenuError("join-error", m.msg);
      } else {
        setMenuError("menu-error", m.msg);
      }
      break;
    case "pong":
      break;
  }
}

function loop(): void {
  const now = performance.now();
  if (state) {
    if (selfId && intentDir) {
      const s = state.snakes.find((sn) => sn.id === selfId);
      if (s && OPPOSITE_DIR[s.dir] === intentDir) intentDir = null;
    }
    render(ctx, state, selfId, now, intentDir);
    renderHud(state, selfId);
  }
  requestAnimationFrame(loop);
}

void init();
