import type { Direction } from "@megasnake/shared";

export interface KeyboardBindOptions {
  isEnabled?: () => boolean;
}

function directionFromEvent(e: KeyboardEvent): Direction | null {
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
  }
  switch (e.code) {
    case "ArrowUp":
    case "KeyW":
      return "up";
    case "ArrowDown":
    case "KeyS":
      return "down";
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
  }
  return null;
}

export function bindKeyboard(
  onDir: (d: Direction) => void,
  onDash: () => void,
  opts: KeyboardBindOptions = {},
): void {
  let lastCode = "";
  let lastAt = 0;
  const enabled = () => opts.isEnabled?.() ?? true;

  document.addEventListener(
    "keydown",
    (e) => {
      if (!enabled()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const dir = directionFromEvent(e);
      if (!dir) return;

      e.preventDefault();
      onDir(dir);

      const now = performance.now();
      if (lastCode === e.code && now - lastAt <= 260) onDash();
      lastCode = e.code;
      lastAt = now;
    },
    { capture: true },
  );
}