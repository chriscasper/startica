// Auto-update (ARCHITECTURE.md section 6): checks GitHub Releases for a newer signed build,
// downloads it in the background and offers to restart. Installed app only. The only
// request it makes is to GitHub's release files for this repository; no usage data.
// Automatic checks can be turned off in the tray menu; "Check for Updates…" always works.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, dialog } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const FIRST_CHECK_MS = 30_000;
const EVERY_MS = 6 * 3600_000;

/**
 * @param {{ prefsDir: string, onChange: () => void }} opts
 */
export function createUpdater({ prefsDir, onChange }) {
  const prefsFile = join(prefsDir, "updates.json");
  /** @type {{ state: "idle" | "checking" | "downloading" | "ready" | "error", version?: string, error?: string }} */
  let status = { state: "idle" };
  let manual = false;
  let timer = null;

  const set = (next) => {
    status = next;
    onChange();
  };
  const readAuto = () => {
    try {
      return existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, "utf8")).auto !== false : true;
    } catch {
      return true;
    }
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: (m) => console.log("[updates]", m), warn: (m) => console.warn("[updates]", m), error: (m) => console.error("[updates]", m), debug: () => {} };
  autoUpdater.on("checking-for-update", () => set({ state: "checking" }));
  autoUpdater.on("update-available", (info) => set({ state: "downloading", version: info.version }));
  autoUpdater.on("update-not-available", () => {
    set({ state: "idle" });
    if (manual) void dialog.showMessageBox({ type: "info", message: "Startica is up to date", detail: `You have version ${app.getVersion()}, the latest.` });
    manual = false;
  });
  autoUpdater.on("error", (error) => {
    set({ state: "error", error: error?.message ?? String(error) });
    if (manual) void dialog.showMessageBox({ type: "warning", message: "Couldn't check for updates", detail: status.error });
    manual = false;
  });
  autoUpdater.on("update-downloaded", async (info) => {
    set({ state: "ready", version: info.version });
    manual = false;
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Startica ${info.version} is ready`,
      detail: "Restart to update now, or it updates the next time you quit Startica.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  const check = (byUser = false) => {
    if (!app.isPackaged) {
      if (byUser) void dialog.showMessageBox({ type: "info", message: "Updates work in the installed app", detail: "This is a development build." });
      return;
    }
    if (status.state === "checking" || status.state === "downloading") return;
    if (status.state === "ready") return autoUpdater.quitAndInstall();
    manual = byUser;
    autoUpdater.checkForUpdates().catch(() => {}); // reported through the "error" event
  };

  const schedule = () => {
    clearTimeout(timer);
    clearInterval(timer);
    if (!app.isPackaged || !readAuto()) return;
    timer = setTimeout(() => {
      check();
      timer = setInterval(check, EVERY_MS);
    }, FIRST_CHECK_MS);
  };
  schedule();

  return {
    /** The tray menu's update items. */
    menuItems() {
      const label =
        status.state === "ready"
          ? `Restart to Update to ${status.version}`
          : status.state === "downloading"
            ? `Downloading ${status.version ?? "update"}…`
            : status.state === "checking"
              ? "Checking for Updates…"
              : "Check for Updates…";
      return [
        { label, enabled: status.state !== "checking" && status.state !== "downloading", click: () => check(true) },
        {
          label: "Check for Updates Automatically",
          type: "checkbox",
          checked: readAuto(),
          enabled: app.isPackaged,
          click: (item) => {
            writeFileSync(prefsFile, JSON.stringify({ auto: item.checked }));
            schedule();
          },
        },
      ];
    },
    check,
  };
}
