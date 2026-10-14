// The posting window for assisted posting (ARCHITECTURE.md section 8.4): a small Startica
// bar on top and the site below, on a persistent session so each site's sign-in is
// done once. Startica fills the form in; the user presses the site's own button;
// the window recognizes the post and reports its link. It never submits anything.
import { join } from "node:path";
import { BaseWindow, clipboard, ipcMain, session, shell, WebContentsView } from "electron";
import { fillScript, latestHnItem, sites, SIGN_IN_HOSTS } from "./sites.mjs";

const BAR_HEIGHT = 64;
const ISOLATED_WORLD = 1077; // any id > 0 that the app doesn't use elsewhere
let sessionReady = false;

/**
 * @param {{ dir: string; icon: string; partition?: string; testBase?: string | null; onPosted: (request: object, url: string | null, text: string | null) => void }} opts
 *   partition: the session holding the sites' sign-ins ("persist:posting"; tests pass a throwaway one).
 *   testBase: development-only stand-in for the real sites (smoke tests).
 *   onPosted: text is what the user finally submitted, when the site's request shows it.
 */
export function createPosting({ dir, icon, partition = "persist:posting", testBase = null, onPosted }) {
  /** @type {null | { win: BaseWindow; bar: WebContentsView; site: WebContentsView; request: any; baselineHn: number | null; hnUser: string | null; done: boolean; submitting: boolean; postedText: string | null; last: object | null; barReady: boolean }} */
  let current = null;
  const postingSession = () => {
    const s = session.fromPartition(partition);
    if (!sessionReady) {
      // A plain Chrome user agent: some sign-in pages refuse "embedded" browsers.
      s.setUserAgent(s.getUserAgent().replace(/ (Electron|Startica|startica)\/\S+/g, ""));
      s.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      sessionReady = true;
    }
    return s;
  };

  // In tests the sites are served locally: same paths, different origin.
  const rebase = (url) => (testBase ? url.replace(/^https:\/\/[^/]+/, testBase) : url);
  const hnApi = () => (testBase ? `${testBase}/hn-api` : "https://hacker-news.firebaseio.com/v0");

  const allowedHost = (url, request) => {
    try {
      const u = new URL(url);
      if (testBase && u.origin === new URL(testBase).origin) return true;
      const own = sites[request.site].hosts;
      const hosts = [...(typeof own === "function" ? own(request) : own), ...SIGN_IN_HOSTS];
      return u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
    } catch {
      return false;
    }
  };

  // The bar may still be loading; it gets the latest state once it's ready.
  function state(status, detail = {}) {
    if (!current) return;
    current.last = { status, site: current.request.site, mode: current.request.mode, button: sites[current.request.site].submitLabel(current.request), ...detail };
    if (current.barReady) current.bar.webContents.send("posting:state", current.last);
  }

  function layout() {
    if (!current) return;
    const { width, height } = current.win.getContentBounds();
    current.bar.setBounds({ x: 0, y: 0, width, height: BAR_HEIGHT });
    current.site.setBounds({ x: 0, y: BAR_HEIGHT, width, height: Math.max(0, height - BAR_HEIGHT) });
  }

  async function fill() {
    if (!current) return;
    const { request, site } = current;
    state("filling");
    try {
      const result = await site.webContents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: fillScript(request.site, request) }]);
      // The user's latest HN item before posting; the new one is whatever comes after it.
      if (request.site === "hackernews" && result?.me && current.baselineHn === null) current.baselineHn = await hnLatest(result.me).catch(() => null);
      if (current) current.hnUser = result?.me ?? null;
      // Rich editors: the fill-in focused the editor; type the text in as trusted input.
      if (result?.ok && result.insert && current?.site === site) {
        site.webContents.focus();
        await site.webContents.insertText(request.text);
      }
      if (result?.ok) state("filled");
      else if (result?.reason === "signed-out") state("signed-out");
      else {
        clipboard.writeText(request.text);
        state("no-box");
      }
    } catch {
      clipboard.writeText(request.text);
      state("no-box");
    }
  }

  async function hnLatest(user) {
    const res = await fetch(`${hnApi()}/user/${encodeURIComponent(user)}.json`, { signal: AbortSignal.timeout(8000) });
    return latestHnItem(await res.json());
  }

  /** The user submitted on HN: wait for the new item to show up as their latest submission. */
  async function hnPosted() {
    const user = current?.hnUser;
    for (let i = 0; user && i < 10; i++) {
      const latest = await hnLatest(user).catch(() => null);
      if (latest && latest !== current?.baselineHn) return `https://news.ycombinator.com/item?id=${latest}`;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return null;
  }

  /** pending: the site accepted it but holds it for a moderator (Discourse), so there's no link yet. */
  function posted(url, pending = false) {
    if (!current || current.done) return;
    current.done = true;
    current.pending = pending;
    onPosted(current.request, url, current.postedText);
    state("posted", { url, pending });
  }

  /** Watches the site's own traffic for the request its Submit button sends. */
  function watchSubmissions(view, request) {
    const dbg = view.webContents.debugger;
    const site = sites[request.site];
    const submits = new Set();
    try {
      dbg.attach("1.3");
    } catch {
      return; // already attached (devtools open); fall back to "Save link"
    }
    void dbg.sendCommand("Network.enable");
    dbg.on("message", async (_event, method, params) => {
      try {
        if (method === "Network.requestWillBeSent") {
          if (params.redirectResponse && submits.has(params.requestId) && site.result === "redirect") {
            submits.delete(params.requestId);
            if (current) current.submitting = false;
            if (params.redirectResponse.status >= 300 && params.redirectResponse.status < 400) {
              state("detecting");
              const url = await hnPosted();
              if (url) posted(url);
              else state("detect-failed");
            }
          } else if (params.request.method === "POST") {
            // The body is needed to tell a post from e.g. a like (Bluesky), and to keep
            // what was actually submitted: the user may have edited it on the page.
            const cheap = site.isSubmit(params.request.url, "POST", null);
            if (!cheap && !site.needsBody) return;
            const postData =
              params.request.postData ??
              (params.request.hasPostData ? (await dbg.sendCommand("Network.getRequestPostData", { requestId: params.requestId }).catch(() => null))?.postData : null);
            if (!site.isSubmit(params.request.url, "POST", postData)) return;
            submits.add(params.requestId);
            if (current) current.submitting = true;
            const text = site.postedText(postData);
            if (current && text) current.postedText = text;
          }
        } else if (method === "Network.loadingFinished" && submits.has(params.requestId)) {
          submits.delete(params.requestId);
          if (current) current.submitting = false;
          if (site.result === "redirect") {
            // No redirect: the site answered with a page (an error such as "posting too fast").
            state("detect-failed");
            return;
          }
          const { body, base64Encoded } = await dbg.sendCommand("Network.getResponseBody", { requestId: params.requestId });
          const text = base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
          const result = site.parse(text, request);
          if (result) posted(result.url, Boolean(result.pending));
          else state("detect-failed");
        }
      } catch {
        state("detect-failed");
      }
    });
  }

  function close() {
    if (!current) return;
    const { win } = current;
    current = null;
    if (!win.isDestroyed()) win.close();
  }

  function open(request) {
    close();
    const win = new BaseWindow({ width: 1100, height: 860, minWidth: 700, minHeight: 500, title: "Post with Startica", icon });
    const bar = new WebContentsView({
      webPreferences: { preload: join(dir, "bar-preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    const site = new WebContentsView({
      webPreferences: { session: postingSession(), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false },
    });
    win.contentView.addChildView(bar);
    win.contentView.addChildView(site);
    current = { win, bar, site, request: { ...request, openUrl: rebase(request.openUrl) }, baselineHn: null, hnUser: null, done: false, submitting: false, postedText: null, last: null, barReady: false };
    layout();
    win.on("resize", layout);
    win.on("closed", () => {
      if (current?.win === win) current = null;
    });

    // Only the site (and sign-in pages) load here; every other link opens in the normal browser.
    const guard = (event, url) => {
      if (!allowedHost(url, request)) {
        event.preventDefault();
        if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      }
    };
    site.webContents.on("will-navigate", guard);
    site.webContents.on("will-redirect", guard);
    // Sign-in popups (e.g. "Sign in with Google") stay in the posting session, under the same host rules.
    site.webContents.setWindowOpenHandler(({ url }) => {
      if (allowedHost(url, request)) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: { webPreferences: { session: postingSession(), sandbox: true, contextIsolation: true, nodeIntegration: false } },
        };
      }
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    site.webContents.on("did-create-window", (popup) => {
      popup.webContents.on("will-navigate", guard);
      popup.webContents.on("will-redirect", guard);
      popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    });
    bar.webContents.on("will-navigate", (event) => event.preventDefault());
    bar.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

    watchSubmissions(site, current.request);
    // Fill in after each full page load of the target page (e.g. after signing in and coming back).
    site.webContents.on("did-finish-load", () => {
      // Not while a post is on its way: the page reloading after Submit isn't a new form.
      if (current?.site === site && !current.done && !current.submitting) void fill();
    });
    const entry = current;
    void bar.webContents.loadFile(join(dir, "bar.html")).then(() => {
      entry.barReady = true;
      if (current === entry) bar.webContents.send("posting:state", entry.last ?? { status: "loading", site: request.site, mode: request.mode, button: sites[request.site].submitLabel(request) });
    });
    void site.webContents.loadURL(current.request.openUrl);
    win.focus();
  }

  ipcMain.handle("posting", async (event, action, arg) => {
    if (!current || event.sender !== current.bar.webContents) return;
    if (action === "fill") {
      current.submitting = false; // the user asked: fill in whatever state a failed submit left
      // Back to the target page (e.g. after signing in somewhere else), then fill in.
      if (current.site.webContents.getURL() !== current.request.openUrl) await current.site.webContents.loadURL(current.request.openUrl);
      else await fill();
    } else if (action === "copy") {
      clipboard.writeText(current.request.text);
    } else if (action === "save-link") {
      const url = String(arg ?? "").trim();
      if (!/^https?:\/\/\S+$/.test(url)) return false;
      posted(url);
      return true;
    } else if (action === "close") {
      close();
    }
  });

  return {
    open,
    close,
    /** The server recorded (or failed to record) the post. */
    recorded(requestId, ok, error) {
      if (!current || current.request.id !== requestId) return;
      if (ok) {
        state("recorded", { tracked: current.request.tracked ?? sites[current.request.site].tracked, pending: current.pending });
        const win = current.win;
        setTimeout(() => {
          if (current?.win === win) close();
        }, 1800);
      } else state("record-failed", { error });
    },
    /** For tests: the site and bar views' webContents. */
    siteContents: () => current?.site.webContents ?? null,
    barContents: () => current?.bar.webContents ?? null,
  };
}
