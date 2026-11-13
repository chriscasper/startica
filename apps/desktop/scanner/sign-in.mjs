// Security S3 (ARCHITECTURE.md section 11.5): the visible window where the owner signs in to
// their own site by hand, on the site's own persistent partition ("persist:signin-<site>"),
// which the signed-in checks then use. Startica never types into it or submits anything:
// the owner signs in and closes it. Navigation stays on the site and the extra hosts the
// owner allowed (a separate login domain); other links open in the default browser.
import { BrowserWindow, shell } from "electron";

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The partition holding a site's sign-in session. */
export const signInPartition = (siteId) => `persist:signin-${String(siteId).replace(/[^\w-]/g, "")}`;

/**
 * Opens the sign-in window on the site's sign-in session, set up by its scanner (whose request
 * guard then treats the window like a scan window of that site: a local site loads, Startica doesn't).
 * @param {{ session: Electron.Session, allowWindow: (wc: Electron.WebContents, siteUrl: string, extraHosts: string[]) => void }} scanner
 * @param {{ url: string, siteUrl: string, extraHosts?: string[] }} request
 */
export function openSignInWindow(scanner, { url, siteUrl, extraHosts = [] }) {
  const ses = scanner.session;
  if (!/^https?:\/\//i.test(url)) return null;
  const allowed = new Set([hostOf(siteUrl), ...extraHosts.map((h) => String(h).toLowerCase().replace(/^www\./, ""))]);
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    title: `Sign in to ${hostOf(siteUrl)}: close this window when you're signed in`,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  scanner.allowWindow(win.webContents, siteUrl, extraHosts);
  // Keep the title: it tells the owner what this window is for.
  win.on("page-title-updated", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url: next }) => {
    // A sign-in popup on an allowed host opens here instead; anything else in the default browser.
    if (allowed.has(hostOf(next))) void win.loadURL(next).catch(() => {});
    else if (/^https?:\/\//i.test(next)) void shell.openExternal(next);
    return { action: "deny" };
  });
  const guard = (event, next) => {
    if (allowed.has(hostOf(next))) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(next)) void shell.openExternal(next);
  };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
  void win.loadURL(url).catch(() => {});
  return win;
}
