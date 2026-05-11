import type { ClientMessage, Direction, ServerMessage } from "@megasnake/shared";

export interface Net {
  ws: WebSocket;
  selfId: string | null;
  send(msg: ClientMessage): void;
}

export function connect(
  url: string,
  onMsg: (m: ServerMessage) => void,
): Promise<Net> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const net: Net = {
      ws,
      selfId: null,
      send(msg) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    ws.addEventListener("open", () => resolve(net));
    ws.addEventListener("error", (e) => reject(e));
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data) as ServerMessage;
        if (m.t === "welcome") net.selfId = m.selfId;
        onMsg(m);
      } catch {
        /* ignore */
      }
    });
  });
}

let inputSeq = 0;
export function sendInput(net: Net, dir: Direction): void {
  net.send({ t: "input", dir, seq: ++inputSeq });
}

export function sendAbility(net: Net): void {
  net.send({ t: "ability", ability: "dash" });
}
