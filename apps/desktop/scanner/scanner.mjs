// Accessibility scanner (ARCHITECTURE.md sections 9.2 and 9.3): opens pages the server asks
// for in hidden windows on an isolated, in-memory session, runs the server's axe-core
// script in an isolated world, and answers with the result. The server builds every
// script, so this file only loads pages safely and runs what it's given.
import { BrowserWindow, session } from "electron";
import { privateHost } from "./address.mjs";

const WORLD = 1088; // isolated world id (the posting window uses 1077)
const POOL_SIZE = 2;
const RECYCLE_AFTER = 50; // fresh windows every 50 pages
const SETTLE_MS = 1000; // after load, let late scripts render
const POLL_MS = 200;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "";
  }
};
const siteHost = (url) => hostOf(url).toLowerCase().replace(/^www\./, "");

/**
 * @param {{ appPort: () => number | null, partition?: string }} opts appPort: Startica's own server's port, which scanned pages must never reach.
 */
export function createScanner({ appPort, partition = "scan" }) {
  const ses = session.fromPartition(partition); // no "persist:": nothing survives a restart
  ses.setUserAgent(`${ses.getUserAgent().replace(/ (Electron|Startica|startica)\/\S+/g, "")} StarticaAccessibilityScan/0.1`);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.on("will-download", (event) => event.preventDefault());

  /** Which site each scan window is checking, for the request guard below. */
  const siteOf = new Map(); // webContents id → site URL
  ses.webRequest.onBeforeRequest((details, callback) => {
    const site = siteOf.get(details.webContentsId);
    let target;
    try {
      target = new URL(details.url);
    } catch {
      return callback({});
    }
    if (!/^(https?|wss?):$/.test(target.protocol)) return callback({});
    const host = hostOf(details.url);
    const port = Number(target.port || (/^(https|wss):$/.test(target.protocol) ? 443 : 80));
    const privateTarget = privateHost(host);
    // Never Startica itself; private-network addresses only when the scanned site is local too.
    const blocked = (privateTarget && port === appPort()) || (privateTarget && !(site && privateHost(hostOf(site))));
    callback({ cancel: blocked });
  });

  // The main document's response headers, per window: X-Robots-Tag for SEO site health,
  // the rest for Security's page checks (the server keeps only the ones it reads).
  const robotsHeader = new Map(); // webContents id → header value
  const mainHeaders = new Map(); // webContents id → response headers
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType === "mainFrame" && details.webContentsId != null) {
      const entry = Object.entries(details.responseHeaders ?? {}).find(([k]) => k.toLowerCase() === "x-robots-tag");
      robotsHeader.set(details.webContentsId, entry ? [].concat(entry[1]).join(", ") : null);
      mainHeaders.set(details.webContentsId, details.responseHeaders ?? {});
    }
    callback({});
  });

  const pool = [];
  const waiting = [];

  function makeWindow() {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => {
      // Scripted navigation stays on the site being checked.
      const site = siteOf.get(win.webContents.id);
      if (site && siteHost(url) !== siteHost(site)) event.preventDefault();
    });
    // "Leave this page?" prompts never block the next load. (A page that blocks on alert()
    // runs into the per-page timeout, and its window is replaced.)
    win.webContents.on("will-prevent-unload", (event) => event.preventDefault());
    return { win, uses: 0, busy: false };
  }

  async function acquire() {
    for (const dead of pool.filter((s) => !s.busy && s.win.isDestroyed())) pool.splice(pool.indexOf(dead), 1);
    let slot = pool.find((s) => !s.busy);
    if (!slot && pool.length < POOL_SIZE) {
      slot = makeWindow();
      pool.push(slot);
    }
    if (!slot) {
      await new Promise((resolve) => waiting.push(resolve));
      return acquire();
    }
    slot.busy = true;
    return slot;
  }

  function release(slot) {
    slot.busy = false;
    slot.uses++;
    if (slot.uses >= RECYCLE_AFTER || slot.win.isDestroyed()) {
      pool.splice(pool.indexOf(slot), 1);
      if (!slot.win.isDestroyed()) slot.win.destroy();
    }
    waiting.shift()?.();
  }

  /**
   * A JPEG of the page for highlights (A2), the window's width and up to 4,000 px tall,
   * through Chromium's own screenshot command (it can capture below the visible area of a
   * hidden window). Null if it fails: the results don't depend on it.
   */
  async function capture(wc, pageHeight) {
    const height = Math.min(Math.max(Number(pageHeight) || 900, 1), 4000);
    try {
      wc.debugger.attach("1.3");
    } catch {
      return null; // already attached elsewhere
    }
    try {
      const { data } = await wc.debugger.sendCommand("Page.captureScreenshot", {
        format: "jpeg",
        quality: 60,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1280, height, scale: 1 },
      });
      return data ? { data, width: 1280, height } : null;
    } catch {
      return null;
    } finally {
      try {
        wc.debugger.detach();
      } catch {
        // window already gone
      }
    }
  }

  /** Loads one page and runs the server's script in it: { httpStatus, finalUrl, result }. */
  async function scan(request) {
    const slot = await acquire();
    const wc = slot.win.webContents;
    siteOf.set(wc.id, request.url);
    let httpStatus = null;
    const onNavigate = (_event, _url, code) => {
      if (code) httpStatus = code;
    };
    wc.on("did-navigate", onNavigate);
    let timer;
    try {
      const work = (async () => {
        await wc.loadURL(request.url);
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        // Start the check in the isolated world and keep its answer there, then poll for it
        // (an isolated world's script result isn't awaited when it's a promise).
        await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: request.axeSource }]);
        await wc.executeJavaScriptInIsolatedWorld(WORLD, [
          {
            code: `window.__starticaScan = null; (${request.runScript}).then((r) => { window.__starticaScan = r; }, (e) => { window.__starticaScan = JSON.stringify({ error: String(e && e.message || e) }); }); 0`,
          },
        ]);
        let json = null;
        while (json === null) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          json = await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: "window.__starticaScan" }]);
        }
        const result = JSON.parse(json);
        if (result.error) throw new Error(`The check failed in the page: ${result.error}`);
        const screenshot = request.screenshot && (result.violations?.length || result.incomplete?.length) ? await capture(wc, result.page?.height) : null;
        return { httpStatus, finalUrl: wc.getURL(), result, xRobotsTag: robotsHeader.get(wc.id) ?? null, headers: mainHeaders.get(wc.id) ?? {}, screenshot };
      })();
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`The page took longer than ${Math.round(request.timeoutMs / 1000)} s`)), request.timeoutMs);
      });
      return await Promise.race([work, timeout]);
    } catch (error) {
      // A timed-out or broken page: start fresh next time.
      slot.uses = RECYCLE_AFTER;
      throw error;
    } finally {
      clearTimeout(timer);
      wc.off("did-navigate", onNavigate);
      siteOf.delete(wc.id);
      robotsHeader.delete(wc.id);
      if (!wc.isDestroyed()) await wc.loadURL("about:blank").catch(() => {});
      release(slot);
    }
  }

  function close() {
    for (const slot of pool.splice(0)) if (!slot.win.isDestroyed()) slot.win.destroy();
  }

  return { scan, close };
}
