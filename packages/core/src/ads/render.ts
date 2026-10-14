import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { templateHtml, type TemplateInput } from "./templates.ts";

/**
 * Renders ad templates to images offscreen (ARCHITECTURE.md section 8.6, AD2). The Electron
 * process does it in the app (apps/desktop/renderer), Playwright's Chromium in browser
 * dev mode and tests. Rendering is local: the page and its picture are files in a
 * temporary folder, and every other request is blocked.
 */

export type RenderRequest = {
  /** A folder holding index.html and the files it uses. */
  dir: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  /** JPEG quality, 0–100. */
  quality?: number;
};

/** The image, and the page's data-ready value: for templates, how the words fitted ("1", "small", "overflow"). */
export type RenderOutput = { data: Buffer; ready: string };

export interface Renderer {
  name: "electron" | "playwright";
  render(request: RenderRequest): Promise<RenderOutput>;
  close?(): Promise<void>;
}

export const RENDER_TIMEOUT_MS = 20_000;

const KEY = Symbol.for("startica.renderer");
const g = globalThis as unknown as { [KEY]?: Renderer | null };

/** Set at startup (shared through globalThis: Next bundles modules more than once). */
export function setRenderer(renderer: Renderer | null): void {
  g[KEY] = renderer;
}

export function getRenderer(): Renderer | null {
  return g[KEY] ?? null;
}

/** Whether a URL may load while rendering: only files inside the render folder. */
export function renderRequestAllowed(url: string, dir: string): boolean {
  if (url.startsWith("data:") || url === "about:blank") return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "file:") return false;
    const base = pathToFileURL(dir).href.replace(/\/?$/, "/");
    return u.href.startsWith(base);
  } catch {
    return false;
  }
}

/** Playwright's Chromium (dev mode and tests; never in the installed app). Null if it isn't installed. */
export async function playwrightRenderer(): Promise<Renderer | null> {
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
    async render(request) {
      browser ??= await pw.chromium.launch();
      const context = await browser.newContext({ viewport: { width: request.width, height: request.height }, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false });
      try {
        await context.route("**/*", (route) => (renderRequestAllowed(route.request().url(), request.dir) ? route.continue() : route.abort()));
        const page = await context.newPage();
        await page.goto(pathToFileURL(join(request.dir, "index.html")).href, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
        await page.waitForFunction("document.documentElement.dataset.ready", null, { timeout: RENDER_TIMEOUT_MS });
        const ready = String(await page.evaluate("document.documentElement.dataset.ready"));
        const data = await page.screenshot({ type: request.format, ...(request.format === "jpeg" ? { quality: request.quality ?? 90 } : {}), clip: { x: 0, y: 0, width: request.width, height: request.height } });
        return { data, ready };
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

export type TemplateFit = "ok" | "small" | "overflow";

/** Renders one size of a template to an image, keeping under maxBytes (PNG first, then JPEG), and says how the words fitted. */
export async function renderTemplate(
  input: TemplateInput & { imagePath: string | null; logoPath: string | null },
  maxBytes: number,
): Promise<{ data: Buffer; format: "png" | "jpeg"; fit: TemplateFit }> {
  const renderer = getRenderer();
  if (!renderer) throw new Error("Images can't be rendered here: open Startica's desktop app (or install Playwright's Chromium for browser dev mode)");
  const dir = mkdtempSync(join(tmpdir(), "startica-render-"));
  try {
    const image = input.imagePath ? `picture-${basename(input.imagePath)}` : null;
    const logo = input.logoPath ? `logo-${basename(input.logoPath)}` : null;
    if (image) copyFileSync(input.imagePath!, join(dir, image));
    if (logo) copyFileSync(input.logoPath!, join(dir, logo));
    writeFileSync(join(dir, "index.html"), templateHtml({ ...input, image, logo }));
    const base = { dir, width: input.width, height: input.height };
    // Text stays crispest as PNG; photos can make PNGs bigger than a platform takes.
    const png = await renderer.render({ ...base, format: "png" });
    const fit: TemplateFit = png.ready === "overflow" || png.ready === "small" ? png.ready : "ok";
    if (png.data.length <= maxBytes) return { data: png.data, format: "png", fit };
    for (const quality of [92, 85, 75]) {
      const jpeg = await renderer.render({ ...base, format: "jpeg", quality });
      if (jpeg.data.length <= maxBytes) return { data: jpeg.data, format: "jpeg", fit };
    }
    throw new Error(`The ${input.width}×${input.height} image is bigger than the platform takes`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
