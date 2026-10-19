// The About window (app menu → About Startica): icon, name, version, copyright and a
// "Check for Updates" button. Replaces the native About panel, which can't hold a button.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";

/**
 * @param {{ dir: string, icon: string, updater: () => ReturnType<typeof import("../updater.mjs").createUpdater> | null }} opts
 */
export function createAbout({ dir, icon, updater }) {
  let win = null;
  let copyright = "";
  try {
    copyright = JSON.parse(readFileSync(join(dir, "..", "package.json"), "utf8")).build?.copyright ?? "";
  } catch {}

  ipcMain.handle("about", (event, action) => {
    if (event.sender !== win?.webContents) return null;
    if (action === "info") return { name: app.getName(), version: app.getVersion(), copyright, status: updater()?.status() ?? { state: "idle" } };
    if (action === "check") updater()?.check("about");
    return null;
  });

  return {
    open() {
      if (win) return win.focus();
      win = new BrowserWindow({
        width: 320,
        height: 270,
        useContentSize: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        show: false,
        title: `About ${app.getName()}`,
        icon,
        autoHideMenuBar: true,
        webPreferences: { preload: join(dir, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
      });
      win.setMenu(null); // Windows/Linux: no menu bar on this small window
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      win.once("ready-to-show", () => win?.show());
      win.on("closed", () => (win = null));
      void win.loadFile(join(dir, "about.html"));
    },
    /** Sends the updater's latest status to the open window. */
    statusChanged() {
      if (win && !win.isDestroyed()) win.webContents.send("about:status", updater()?.status());
    },
  };
}
