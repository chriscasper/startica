import { existsSync } from "node:fs";
import { pickHeaders, SCREENSHOT_MAX_HEIGHT, SCREENSHOT_QUALITY, VIEWPORT, wantsScreenshot, type PageResult, type ScannerBackend, type ScanRequest, type ScanResponse } from "./scanner.ts";
import { scanRequestAllowed } from "./urls.ts";

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

  return {
    name: "playwright",
    async scan(request: ScanRequest): Promise<ScanResponse> {
      browser ??= await pw.chromium.launch();
      const context = await browser.newContext({ viewport: VIEWPORT, bypassCSP: true, acceptDownloads: false, serviceWorkers: "block" });
      try {
        await context.route("**/*", (route) => (scanRequestAllowed(route.request().url(), request.url, appPort) ? route.continue() : route.abort()));
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
        return { httpStatus: response?.status() ?? null, finalUrl: page.url(), result, xRobotsTag: headers["x-robots-tag"] ?? null, headers: pickHeaders(headers), screenshot };
      } finally {
        await context.close();
      }
    },
    async close() {
      await browser?.close();
      browser = null;
    },
  };
}
