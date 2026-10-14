// Ad creative renderer (ARCHITECTURE.md section 8.6, AD2): turns a template page (a folder with
// index.html, the picture and the logo) into a PNG or JPEG at an exact pixel size, in a
// hidden window. Only files inside that folder may load; everything else is blocked.
import { pathToFileURL } from "node:url";
import { BrowserWindow, session } from "electron";

const TIMEOUT_MS = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createRenderer() {
  const ses = session.fromPartition("startica-render"); // in memory, nothing kept
  let allowed = null; // the folder being rendered, as a file:// URL ending in "/"
  ses.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    callback({ cancel: !(url.startsWith("data:") || url === "about:blank" || (allowed && url.startsWith(allowed))) });
  });
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  let win = null;
  let idle = null;
  // Closed when idle, so a hidden window never keeps the app open (window-all-closed).
  const closeLater = () => {
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
    }, 30_000);
  };

  /** One hidden window, reused; recreated after a failure. */
  async function renderWindow() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    const wc = win.webContents;
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-navigate", (event) => event.preventDefault());
    // Something must be loaded before the size override: sent to an empty window, it crashes Electron 44.
    await win.loadURL("about:blank");
    wc.debugger.attach("1.3");
    return win;
  }

  async function renderOne({ dir, width, height, format, quality }) {
    clearTimeout(idle);
    allowed = pathToFileURL(dir).href.replace(/\/?$/, "/");
    const w = await renderWindow();
    const wc = w.webContents;
    try {
      // The page lays out at exactly the ad's size, at 1 device pixel per CSS pixel, whatever the screen.
      await wc.debugger.sendCommand("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await w.loadURL(`${allowed}index.html`);
      const deadline = Date.now() + TIMEOUT_MS;
      let ready = "";
      while (!(ready = await wc.executeJavaScript("document.documentElement.dataset.ready || ''"))) {
        if (Date.now() > deadline) throw new Error("The template took too long to render");
        await sleep(50);
      }
      const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", {
        format,
        ...(format === "jpeg" ? { quality: quality ?? 90 } : {}),
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      });
      return { data: Buffer.from(data, "base64"), ready: String(ready) };
    } catch (error) {
      if (!w.isDestroyed()) w.destroy();
      win = null;
      throw error;
    } finally {
      allowed = null;
      closeLater();
    }
  }

  // One at a time: the allowed folder is shared by the session's request filter.
  let queue = Promise.resolve();
  return {
    close() {
      if (win && !win.isDestroyed()) win.destroy();
      win = null;
    },
    render(request) {
      const run = queue.then(() => renderOne(request));
      queue = run.catch(() => {});
      return run;
    },
  };
}
