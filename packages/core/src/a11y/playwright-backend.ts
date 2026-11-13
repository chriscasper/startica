import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@startica/db/paths";
import { cookieFlags, pickHeaders, SCREENSHOT_MAX_HEIGHT, SCREENSHOT_QUALITY, VIEWPORT, wantsScreenshot, type PageResult, type ScannerBackend, type ScanRequest, type ScanResponse } from "./scanner.ts";
import { scanRequestAllowed } from "./urls.ts";

/**
 * S3: a site's sign-in session in dev mode and tests: a Chromium profile in the data folder
 * (Electron uses a `persist:` partition that lives as long as the app). Each check opens the
 * profile anew, so only cookies with an expiry survive here; session cookies need the desktop app.
 */
export const signInProfileDir = (siteId: string) => join(dataDir(), "sign-in", siteId.replace(/[^\w-]/g, ""));

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * Scanner backend on Playwright's Chromium (ARCHITECTURE.md section 9.2), for browser dev mode
 * and tests. The installed app never uses it: Playwright is a development dependency.
 * Returns null when Playwright or its Chromium isn't installed.
 */
export async function playwrightScanner(appPort: number): Promise<ScannerBackend | null> {
  let pw: typeof import("playwright");
  try {
    pw = await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ "playwright");
  } catch {
    return null;
  }
  if (!existsSync(pw.chromium.executablePath())) return null;
  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | null = null;
  const options = { viewport: VIEWPORT, bypassCSP: true, acceptDownloads: false, serviceWorkers: "block" as const };

  return {
    name: "playwright",
    async scan(request: ScanRequest): Promise<ScanResponse> {
      // Signed-in checks (S3) use the site's own profile, where the owner signed in by hand.
      const context = request.signIn
        ? await pw.chromium.launchPersistentContext(signInProfileDir(request.signIn.siteId), { ...options, headless: true })
        : await (browser ??= await pw.chromium.launch()).newContext(options);
      const allowedHosts = new Set([hostOf(request.url), ...(request.signIn?.extraHosts ?? []).map((h) => h.toLowerCase().replace(/^www\./, ""))]);
      try {
        await context.route("**/*", (route) => {
          const target = route.request().url();
          // A signed-in page may redirect through the login host, but nowhere else.
          const navigationOk = !request.signIn || !route.request().isNavigationRequest() || allowedHosts.has(hostOf(target));
          return navigationOk && scanRequestAllowed(target, request.url, appPort) ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        page.on("dialog", (dialog) => void dialog.dismiss());
        const response = await page.goto(request.url, { waitUntil: "load", timeout: request.timeoutMs });
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        await page.evaluate(request.axeSource);
        const json = (await page.evaluate(request.runScript)) as string;
        const headers = (await response?.allHeaders()) ?? {};
        const result = JSON.parse(json) as PageResult;
        let screenshot: ScanResponse["screenshot"] = null;
        if (request.screenshot && Array.isArray(result.violations) && wantsScreenshot(result)) {
          const height = Math.min(Math.max(result.page?.height ?? VIEWPORT.height, 1), SCREENSHOT_MAX_HEIGHT);
          const data = await page.screenshot({ type: "jpeg", quality: SCREENSHOT_QUALITY, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height } }).catch(() => null);
          if (data) screenshot = { data: data.toString("base64"), width: VIEWPORT.width, height };
        }
        // Chromium's own view of the jar (sameSite is left out when the cookie didn't set it): names and flags only.
        let cookies: ScanResponse["cookies"];
        if (request.signIn) {
          const cdp = await context.newCDPSession(page);
          const jar = (await cdp.send("Network.getCookies", { urls: [page.url()] })) as { cookies: { name: string; secure: boolean; httpOnly: boolean; sameSite?: string }[] };
          cookies = jar.cookies.map(cookieFlags);
        }
        return { httpStatus: response?.status() ?? null, finalUrl: page.url(), result, xRobotsTag: headers["x-robots-tag"] ?? null, headers: pickHeaders(headers), screenshot, ...(cookies ? { cookies } : {}) };
      } finally {
        await context.close();
      }
    },
    /** Dev mode: a visible Chromium on the site's profile; the owner signs in and closes it. */
    async signIn(req) {
      const context = await pw.chromium.launchPersistentContext(signInProfileDir(req.siteId), { viewport: null, headless: false, acceptDownloads: false });
      const allowed = new Set([hostOf(req.siteUrl), ...req.extraHosts.map((h) => h.toLowerCase().replace(/^www\./, ""))]);
      await context.route("**/*", (route) => (!route.request().isNavigationRequest() || allowed.has(hostOf(route.request().url())) ? route.continue() : route.abort()));
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(req.url).catch(() => {});
    },
    async forgetSignIn(siteId) {
      rmSync(signInProfileDir(siteId), { recursive: true, force: true });
    },
    async close() {
      await browser?.close();
      browser = null;
    },
  };
}
