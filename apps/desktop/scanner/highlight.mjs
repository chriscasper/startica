// "Open with highlights" (ARCHITECTURE.md section 9.3, A2): the live page in a visible viewer
// window with each failing element outlined. Same rules as the scanner: an in-memory
// session, sandboxed, no preload or Node, permissions refused, navigation kept on the
// page's site. The outlines are plain CSS; nothing runs in the page.
import { BrowserWindow, session, shell } from "electron";

const COLORS = { critical: "#d92d20", serious: "#e8590c", moderate: "#b7791f", minor: "#6b7280" };

const siteHost = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** One CSS rule per selector, so a selector the browser can't parse only drops its own rule. */
export function highlightCss(elements) {
  return elements
    .filter((e) => typeof e.selector === "string" && e.selector && !/[{}]/.test(e.selector))
    .map((e) => `${e.selector} { outline: 3px solid ${COLORS[e.impact] ?? COLORS.moderate} !important; outline-offset: 2px !important; }`)
    .join("\n");
}

export function createHighlighter() {
  const ses = session.fromPartition("highlight"); // in memory: nothing survives a restart
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());

  return {
    open({ url, elements }) {
      if (!/^https?:\/\//i.test(url)) return;
      const win = new BrowserWindow({
        width: 1280,
        height: 900,
        title: `Highlights: ${url}`,
        webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
      });
      const css = highlightCss(elements ?? []);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event, next) => {
        if (siteHost(next) !== siteHost(url)) {
          event.preventDefault();
          if (/^https?:\/\//i.test(next)) void shell.openExternal(next);
        }
      });
      win.webContents.on("did-finish-load", () => {
        if (css) void win.webContents.insertCSS(css, { cssOrigin: "user" }).catch(() => {});
      });
      void win.loadURL(url).catch(() => {});
    },
  };
}
