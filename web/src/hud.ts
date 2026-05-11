import {
  BOOSTS,
  type GameState,
  type MatchReport,
  PLAYER_COLORS,
  type RoomPlayer,
} from "@megasnake/shared";
export function renderHud(state: GameState, selfId: string | null): void {
  const timerEl = document.getElementById("timer")!;
  const lbEl = document.getElementById("leaderboard")!;
  const stEl = document.getElementById("statuses")!;

  if (state.phase === "lobby") {
    timerEl.textContent = `Лобби ${(state.lobbyMs / 1000).toFixed(0)}с`;
  } else if (state.phase === "playing") {
    const remaining = Math.max(0, 180_000 - state.elapsedMs);
    const m = Math.floor(remaining / 60_000);
    const s = Math.floor((remaining % 60_000) / 1000);
    timerEl.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  } else {
    timerEl.textContent = "Финиш";
  }

  // Leaderboard
  const sorted = [...state.snakes].sort((a, b) => b.body.length - a.body.length);
  lbEl.innerHTML = "";
  for (const s of sorted) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.className = "name";
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = PLAYER_COLORS[s.colorIdx % PLAYER_COLORS.length]!;
    name.appendChild(swatch);
    const nm = document.createElement("span");
    nm.textContent = s.name + (s.isBot ? " (bot)" : "");
    if (s.id === selfId) nm.style.fontWeight = "700";
    name.appendChild(nm);
    const len = document.createElement("span");
    len.className = "len";
    len.textContent = String(s.body.length);
    row.appendChild(name);
    row.appendChild(len);
    lbEl.appendChild(row);
  }

  // Self statuses
  stEl.innerHTML = "";
  if (selfId) {
    const me = state.snakes.find((s) => s.id === selfId);
    if (me) {
      const meta = document.createElement("div");
      meta.className = "chip";
      const cd = Math.max(0, me.energyCooldownUntil - state.elapsedMs);
      meta.textContent = `Очки ${me.score} · Энергия ${Math.floor(me.energy)}${cd > 0 ? ` · CD ${(cd / 1000).toFixed(1)}s` : ""}`;
      stEl.appendChild(meta);
      if (state.weather) {
        const weather = document.createElement("span");
        weather.className = "chip";
        weather.textContent = `Погода: ${state.weather}`;
        stEl.appendChild(weather);
      }
      for (const st of me.statuses) {
        if (st.expiresAt <= state.elapsedMs) continue;
        const chip = document.createElement("span");
        chip.className = "chip";
        const remaining = Math.max(0, st.expiresAt - state.elapsedMs);
        chip.textContent = `${BOOSTS[st.id].name} ${(remaining / 1000).toFixed(1)}s`;
        stEl.appendChild(chip);
      }
    }
  }
}

export function showMenuOverlay(visible: boolean): void {
  const el = document.getElementById("menu-overlay")!;
  el.style.display = visible ? "flex" : "none";
}

export function showMainMenu(): void {
  showMenuOverlay(true);
  document.getElementById("main-menu-panel")!.style.display = "block";
  document.getElementById("join-panel")!.style.display = "none";
  document.getElementById("room-panel")!.style.display = "none";
}

export function showJoinPanel(): void {
  showMenuOverlay(true);
  document.getElementById("main-menu-panel")!.style.display = "none";
  document.getElementById("join-panel")!.style.display = "block";
  document.getElementById("room-panel")!.style.display = "none";
  setMenuError("join-error", "");
}

export function showRoomPanel(): void {
  showMenuOverlay(true);
  document.getElementById("main-menu-panel")!.style.display = "none";
  document.getElementById("join-panel")!.style.display = "none";
  document.getElementById("room-panel")!.style.display = "block";
}

export function renderRoomLobby(code: string, players: RoomPlayer[], isHost: boolean): void {
  showRoomPanel();
  document.getElementById("room-code")!.textContent = code;
  const list = document.getElementById("room-players")!;
  list.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.textContent = p.name + (p.isHost ? " · хост" : "");
    list.appendChild(li);
  }
  const startBtn = document.getElementById("start-room-btn") as HTMLButtonElement;
  const waitHint = document.getElementById("room-wait-hint")!;
  startBtn.style.display = isHost ? "block" : "none";
  waitHint.style.display = isHost ? "none" : "block";
}

export function setMenuError(targetId: "menu-error" | "join-error", msg: string): void {
  document.getElementById(targetId)!.textContent = msg;
}
export function showReportOverlay(report: MatchReport | null): void {
  const el = document.getElementById("report-overlay")!;
  const body = document.getElementById("report-body")!;
  if (!report) {
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";

  const sorted = [...report.perSnake].sort((a, b) => b.finalLength - a.finalLength);
  let html = `<p>Матч окончен за ${(report.durationMs / 1000).toFixed(0)} сек.</p>`;
  html += `<p style="font-size:12px;color:#94a3b8">Смен лидера: ${report.leaderChanges} · Разрыв 1↔5: ${report.spreadTopBottom}${
    report.avgWowIntervalMs != null
      ? ` · Вау-события в среднем каждые ${(report.avgWowIntervalMs / 1000).toFixed(1)}с`
      : ""
  }</p>`;
  html += `<table class="report-table"><thead><tr><th>#</th><th>Игрок</th><th>Длина</th><th>Очки</th><th>Еда</th><th>Бусты</th><th>Mystery</th></tr></thead><tbody>`;
  sorted.forEach((p, i) => {
    html += `<tr><td>${i + 1}</td><td>${p.name}</td><td>${p.finalLength}</td><td>${p.score}</td><td>${p.foodEaten}</td><td>${p.boostsCollected}</td><td>${p.mysteryOpened}</td></tr>`;
  });
  html += "</tbody></table>";
  body.innerHTML = html;
}
