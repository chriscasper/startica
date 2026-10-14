import "server-only";

/**
 * What the server knows about the desktop app around it (the Electron process sets
 * these when it starts the server), and the messages it can send it over the
 * child-process IPC channel. In a plain browser run none of this is available.
 */
export function desktopApp() {
  const electron = process.env.STARTICA_ELECTRON === "1" && typeof process.send === "function";
  return {
    electron,
    /** The installed app (launch at login only works there). */
    packaged: electron && process.env.STARTICA_PACKAGED === "1",
    /** Demo mode: the sample product in its own data folder. */
    demo: process.env.STARTICA_DEMO === "1",
  };
}

type DesktopMessage = { type: "switch-mode"; demo: boolean } | { type: "launch-at-login"; enabled: boolean } | { type: "open-data-folder" };

export function sendToDesktop(message: DesktopMessage): void {
  if (!desktopApp().electron) throw new Error("That needs the desktop app");
  process.send!(message);
}

const WAITING = Symbol.for("startica.desktopQueries");
const g = globalThis as unknown as { [WAITING]?: Map<string, (value: unknown) => void> };

/** Asks the Electron process a question (e.g. whether launch at login is on); null outside the desktop app or on no answer. */
export function askDesktop<T>(what: "launch-at-login"): Promise<T | null> {
  if (!desktopApp().electron) return Promise.resolve(null);
  if (!g[WAITING]) {
    g[WAITING] = new Map();
    process.on("message", (m: { type?: string; requestId?: string; value?: unknown }) => {
      if (m?.type !== "desktop-answer" || !m.requestId) return;
      g[WAITING]!.get(m.requestId)?.(m.value ?? null);
      g[WAITING]!.delete(m.requestId);
    });
  }
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    g[WAITING]!.set(requestId, (v) => resolve(v as T | null));
    setTimeout(() => {
      if (g[WAITING]!.delete(requestId)) resolve(null);
    }, 3000);
    process.send!({ type: "desktop-query", requestId, what });
  });
}
