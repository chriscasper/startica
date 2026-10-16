// Startica desktop app (Electron main process).
// Owns the window and the OS keychain. The server (Next.js + SQLite + jobs) runs
// as a child process using this same Electron binary in Node mode, so its own
// helper processes start as Node too. See ARCHITECTURE.md section 6.
import { fork } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu, nativeImage, safeStorage, session, shell, Tray } from "electron";
import { createPosting } from "./posting/window.mjs";
import { createHighlighter } from "./scanner/highlight.mjs";
import { createRenderer } from "./renderer/render.mjs";
import { createScanner } from "./scanner/scanner.mjs";
import { createUpdater } from "./updater.mjs";

// Dev runs (`yarn dev:desktop`) are "Startica Dev": their own data folder, keychain entry
// ("Startica Dev Safe Storage"), single-instance lock and port, so they never touch an installed
// Startica and both can run at once. Set before anything reads userData.
const APP_NAME = app.isPackaged ? "Startica" : "Startica Dev";
const PORT = process.env.PORT ?? (app.isPackaged ? "58300" : "58301");
app.setName(APP_NAME);
app.setPath("userData", join(app.getPath("appData"), APP_NAME));
const here = dirname(fileURLToPath(import.meta.url));
// Dev: the web app's source (Next dev server). Packaged: the standalone server
// assembled by scripts/build.mjs into resources/server.
const webDir = app.isPackaged ? join(process.resourcesPath, "server", "apps", "desktop-web") : join(here, "..", "desktop-web");
const serverEntry = app.isPackaged ? join(webDir, "serve-prod.mjs") : join(webDir, "scripts", "serve.mjs");

const assetsDir = join(here, "assets");
const HIDDEN_ARG = "--hidden"; // passed by the login item: start in the tray, no window

let server = null; // child process
let serverInfo = null; // { url, token }
let mainWindow = null;
let quitting = false;
let tray = null;
let posting = null; // assisted posting window (posting/window.mjs)
let scanner = null; // accessibility scanner (scanner/scanner.mjs)
let renderer = null; // ad creatives (renderer/render.mjs)
let updater = null; // auto-update (updater.mjs)
let highlighter = null; // "Open with highlights" viewer (accessibility A2)

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
}

// --- Data folder and demo mode -------------------------------------------------------
// Demo mode ("Look around with a sample product") uses its own folder, <data>/demo, so
// the sample product never mixes with the user's own; a small file remembers the mode.

const baseDataDir = () => process.env.STARTICA_DATA_DIR ?? app.getPath("userData");
const modeFile = () => join(baseDataDir(), "startica-mode.json");

function demoMode() {
  try {
    return JSON.parse(readFileSync(modeFile(), "utf8")).demo === true;
  } catch {
    return false;
  }
}

/** Switches between the user's data and the demo, then restarts the app. */
function switchMode(demo) {
  mkdirSync(baseDataDir(), { recursive: true });
  writeFileSync(modeFile(), JSON.stringify({ demo }));
  quitting = true;
  app.relaunch();
  app.quit();
}

// --- OS keychain for the server's secrets ----------------------------------------

function handleCipher(message) {
  try {
    let result;
    if (message.op === "encrypt") result = `ss1.${safeStorage.encryptString(message.data).toString("base64")}`;
    else {
      if (!message.data.startsWith("ss1.")) throw new Error("This secret was saved outside the desktop app; save it again in Settings.");
      result = safeStorage.decryptString(Buffer.from(message.data.slice(4), "base64"));
    }
    server?.send({ type: "cipher-result", id: message.id, result });
  } catch (error) {
    server?.send({ type: "cipher-result", id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
}

// --- Launch at login ----------------------------------------------------------------
// Only for the installed app: in dev it would register the bare Electron binary.
// macOS/Windows use the OS login items; Linux uses an XDG autostart entry.

const linuxAutostart = () => join(app.getPath("appData"), "autostart", "startica.desktop");

function launchAtLogin() {
  if (!app.isPackaged) return false;
  if (process.platform === "linux") return existsSync(linuxAutostart());
  return app.getLoginItemSettings({ args: [HIDDEN_ARG] }).openAtLogin;
}

function setLaunchAtLogin(enabled) {
  if (process.platform === "linux") {
    if (!enabled) rmSync(linuxAutostart(), { force: true });
    else {
      // An AppImage runs from a temporary mount; $APPIMAGE is the file itself.
      const exec = process.env.APPIMAGE ?? process.execPath;
      mkdirSync(dirname(linuxAutostart()), { recursive: true });
      writeFileSync(
        linuxAutostart(),
        `[Desktop Entry]\nType=Application\nName=Startica\nExec="${exec}" ${HIDDEN_ARG}\nX-GNOME-Autostart-enabled=true\n`,
      );
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
  }
  updateTrayMenu();
}

const openedAtLogin = () => process.argv.includes(HIDDEN_ARG) || (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin);

// --- Tray / menu-bar icon -----------------------------------------------------------
// Keeps Startica reachable while the window is closed, since scheduled jobs (listening,
// engagement, metrics, the weekly replan) only run while the app is open.

function createTray() {
  const icon =
    process.platform === "darwin"
      ? nativeImage.createFromPath(join(assetsDir, "trayTemplate.png")) // @2x picked up automatically
      : nativeImage.createFromPath(join(assetsDir, "tray.png"));
  if (process.platform === "darwin") icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  // Windows/Linux convention: clicking the tray icon opens the app.
  if (process.platform !== "darwin") tray.on("click", () => void showWindow());
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  const go = (path) => () => void showWindow(path);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${APP_NAME}`, click: go() },
      { type: "separator" },
      { label: "Dashboard", click: go("/dashboard") },
      { label: "Today", click: go("/today") },
      { label: "Inbox", click: go("/inbox") },
      { label: "Content Studio", click: go("/content") },
      { label: "Roadmap", click: go("/roadmap") },
      { type: "separator" },
      {
        label: "Launch at Login",
        type: "checkbox",
        checked: launchAtLogin(),
        enabled: app.isPackaged,
        click: (item) => setLaunchAtLogin(item.checked),
      },
      { type: "separator" },
      ...(updater ? updater.menuItems() : []),
      { type: "separator" },
      { label: `Quit ${APP_NAME}`, role: "quit" },
    ]),
  );
}

// --- Server child process -----------------------------------------------------------

function startServer() {
  return new Promise((resolve, reject) => {
    server = fork(serverEntry, [], {
      cwd: webDir,
      execPath: process.execPath,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        STARTICA_ELECTRON: "1",
        PORT,
        STARTICA_DATA_DIR: demoMode() ? join(baseDataDir(), "demo") : baseDataDir(),
        ...(demoMode() ? { STARTICA_DEMO: "1" } : {}),
        ...(app.isPackaged ? { STARTICA_PACKAGED: "1" } : {}),
        NODE_ENV: app.isPackaged ? "production" : "development",
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    server.on("message", (message) => {
      if (message?.type === "ready") resolve(message);
      else if (message?.type === "cipher") handleCipher(message);
      else if (message?.type === "posting-open") posting?.open(message.request);
      else if (message?.type === "posting-recorded") posting?.recorded(message.requestId, message.ok, message.error);
      else if (message?.type === "scan-page") scanPage(message);
      else if (message?.type === "render-creative") renderCreative(message);
      else if (message?.type === "a11y-highlight") (highlighter ??= createHighlighter()).open(message);
      else if (message?.type === "save-pdf") void savePdf(message);
      else if (message?.type === "switch-mode") switchMode(Boolean(message.demo));
      else if (message?.type === "launch-at-login" && app.isPackaged) setLaunchAtLogin(Boolean(message.enabled));
      else if (message?.type === "open-data-folder") void shell.openPath(baseDataDir());
      else if (message?.type === "desktop-query") answerQuery(message);
    });
    server.once("exit", (code) => {
      server = null;
      if (!serverInfo) reject(new Error(`The Startica server stopped while starting (exit code ${code}).`));
      else if (!quitting) {
        dialog.showErrorBox("Startica stopped", `The Startica server exited unexpectedly (code ${code}). Please reopen the app.`);
        app.quit();
      }
    });
  });
}

/**
 * Saves one of Startica's own report pages as a PDF (accessibility A4): renders it in a
 * hidden window on the app's session (it carries the launch token), asks where to save,
 * and writes the file. Only the report's path is accepted.
 */
async function savePdf({ path, filename }) {
  if (!serverInfo || typeof path !== "string" || !/^\/accessibility\/report\/print\?site=[0-9a-f-]{36}$/i.test(path)) return;
  const win = new BrowserWindow({ show: false, webPreferences: { session: session.defaultSession, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadURL(new URL(path, serverInfo.url).toString());
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { marginType: "default" } });
    const parent = BrowserWindow.getAllWindows().find((w) => w.isVisible());
    const { canceled, filePath } = await dialog.showSaveDialog(parent ?? undefined, {
      defaultPath: join(app.getPath("downloads"), String(filename || "accessibility-report.pdf").replace(/[^\w.-]+/g, "-")),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!canceled && filePath) writeFileSync(filePath, pdf);
  } catch (error) {
    dialog.showErrorBox("Couldn't save the PDF", error instanceof Error ? error.message : String(error));
  } finally {
    win.destroy();
  }
}

/** Answers the server's questions about the app (Settings → General shows them). */
function answerQuery({ requestId, what }) {
  const value = what === "launch-at-login" ? (app.isPackaged ? launchAtLogin() : null) : undefined;
  server?.send({ type: "desktop-answer", requestId, value });
}

// --- Accessibility scanner (ARCHITECTURE.md 9.3) ---------------------------------------------

/** Runs a page check the server asked for and answers with the result or the error. */
function scanPage({ requestId, request }) {
  if (!scanner) return server?.send({ type: "scan-result", requestId, error: "The scanner isn't ready yet" });
  scanner.scan(request).then(
    (response) => server?.send({ type: "scan-result", requestId, response }),
    (error) => server?.send({ type: "scan-result", requestId, error: error instanceof Error ? error.message : String(error) }),
  );
}

// --- Ad creatives (ARCHITECTURE.md 8.6, AD2) -------------------------------------------------

/** Renders one size of an ad template the server asked for; answers with the image as base64. */
function renderCreative({ requestId, request }) {
  renderer ??= createRenderer();
  renderer.render(request).then(
    ({ data, ready }) => server?.send({ type: "render-result", requestId, data: data.toString("base64"), ready }),
    (error) => server?.send({ type: "render-result", requestId, error: error instanceof Error ? error.message : String(error) }),
  );
}

// --- Window -----------------------------------------------------------------------

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(
  `<!doctype html><title>Startica</title><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui;background:#fafafa;color:#555">Starting Startica…</body>`,
)}`;

function isAppUrl(url) {
  return serverInfo && url.startsWith(serverInfo.url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Startica",
    icon: join(assetsDir, "icon.png"), // Windows/Linux; macOS uses the app bundle's icon
    show: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links to other sites (and sign-in pages) open in the normal browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !isAppUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url) && !url.startsWith("data:")) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.on("closed", () => (mainWindow = null));
  return mainWindow;
}

async function showWindow(path) {
  const fresh = !mainWindow;
  if (fresh) createWindow();
  // Reuse the open page unless asked for a specific one (keeps unsaved edits).
  if (serverInfo && (fresh || path)) await mainWindow.loadURL(`${serverInfo.url}${path ?? "/dashboard"}`);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (process.platform === "darwin") app.dock?.show();
}

app.whenReady().then(async () => {
  updater = createUpdater({ prefsDir: baseDataDir(), onChange: () => updateTrayMenu() });
  createTray();
  // Assisted posting (ARCHITECTURE.md 8.4): the server asks for the window; the window reports
  // the post the user submitted, and the server records it.
  posting = createPosting({
    dir: join(here, "posting"),
    icon: join(assetsDir, "icon.png"),
    // Development only: smoke tests serve stand-in sites locally, in a throwaway session
    // (never the developer's own sign-ins).
    testBase: app.isPackaged ? null : (process.env.STARTICA_POSTING_TEST_BASE ?? null),
    partition: (!app.isPackaged && process.env.STARTICA_POSTING_PARTITION) || "persist:posting",
    onPosted: (request, url, text) => server?.send({ type: "posting-result", requestId: request.id, target: request.target, url, text }),
  });
  if (!app.isPackaged) globalThis.__starticaPosting = posting; // for the desktop smoke test
  scanner = createScanner({ appPort: () => (serverInfo ? Number(new URL(serverInfo.url).port) : null) });
  const hidden = openedAtLogin();
  if (hidden && process.platform === "darwin") app.dock?.hide();
  if (!hidden) {
    createWindow();
    await mainWindow.loadURL(LOADING_HTML);
  }
  if (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text") {
    console.warn("[startica] No system keyring found; secrets are only lightly protected on this computer.");
  }
  try {
    serverInfo = await startServer();
    await session.defaultSession.cookies.set({
      url: serverInfo.url,
      name: "startica_session",
      value: serverInfo.token,
      httpOnly: true,
      sameSite: "strict",
    });
    if (mainWindow) await showWindow("/dashboard");
  } catch (error) {
    dialog.showErrorBox("Startica couldn't start", error instanceof Error ? error.message : String(error));
    app.quit();
  }
});

// Closing the window keeps Startica running in the tray (so scheduled jobs continue)
// until you choose Quit. Without a tray to come back from, closing quits.
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
app.on("activate", () => {
  if (serverInfo) void showWindow();
});
app.on("before-quit", () => {
  quitting = true;
  server?.kill("SIGTERM");
});
