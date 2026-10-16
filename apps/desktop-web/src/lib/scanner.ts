import "server-only";
import { randomUUID } from "node:crypto";
import { playwrightScanner } from "@startica/core/a11y/playwright-backend";
import { pickHeaders, setScanner, type ScannerBackend, type ScanRequest, type ScanResponse } from "@startica/core/a11y/scanner";
import { playwrightRenderer, RENDER_TIMEOUT_MS, setRenderer, type Renderer, type RenderOutput, type RenderRequest } from "@startica/core/ads/render";

/**
 * Picks the accessibility scanner backend at startup (ARCHITECTURE.md section 9.2): the
 * Electron process in the desktop app, Playwright's Chromium in browser dev mode,
 * none in the demo (no outside calls there) or when neither is available.
 */

type ScanResult = { type: "scan-result"; requestId: string; response?: ScanResponse; error?: string };

/** Asks the Electron process to open the page in its scan window (apps/desktop/scanner). */
function electronScanner(): ScannerBackend {
  const pending = new Map<string, { resolve: (r: ScanResponse) => void; reject: (e: Error) => void }>();
  process.on("message", (message: ScanResult) => {
    if (message?.type !== "scan-result") return;
    const waiter = pending.get(message.requestId);
    if (!waiter) return;
    pending.delete(message.requestId);
    // The Electron side sends every main-document header; keep the ones Security reads.
    if (message.response) waiter.resolve({ ...message.response, headers: pickHeaders(message.response.headers ?? {}) });
    else waiter.reject(new Error(message.error ?? "The scan window failed"));
  });
  return {
    name: "electron",
    scan(request: ScanRequest) {
      const requestId = randomUUID();
      return new Promise<ScanResponse>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        // Safety net: the Electron side times out itself; this catches a lost answer.
        setTimeout(() => {
          if (pending.delete(requestId)) reject(new Error("The scan window didn't answer"));
        }, request.timeoutMs + 30_000);
        process.send!({ type: "scan-page", requestId, request });
      });
    },
  };
}

type RenderResult = { type: "render-result"; requestId: string; data?: string; ready?: string; error?: string };

/** Asks the Electron process to render an ad template offscreen (apps/desktop/renderer). */
function electronRenderer(): Renderer {
  const pending = new Map<string, { resolve: (out: RenderOutput) => void; reject: (e: Error) => void }>();
  process.on("message", (message: RenderResult) => {
    if (message?.type !== "render-result") return;
    const waiter = pending.get(message.requestId);
    if (!waiter) return;
    pending.delete(message.requestId);
    if (message.data) waiter.resolve({ data: Buffer.from(message.data, "base64"), ready: message.ready ?? "1" });
    else waiter.reject(new Error(message.error ?? "The render window failed"));
  });
  return {
    name: "electron",
    render(request: RenderRequest) {
      const requestId = randomUUID();
      return new Promise<RenderOutput>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        setTimeout(() => {
          if (pending.delete(requestId)) reject(new Error("The render window didn't answer"));
        }, RENDER_TIMEOUT_MS + 15_000);
        process.send!({ type: "render-creative", requestId, request });
      });
    },
  };
}

export async function startScanner(): Promise<void> {
  // Ad creatives render locally (no outside requests), so the demo has a renderer too.
  const electron = process.env.STARTICA_ELECTRON === "1" && typeof process.send === "function";
  setRenderer(electron ? electronRenderer() : await playwrightRenderer());
  if (process.env.STARTICA_DEMO === "1") return setScanner(null);
  if (process.env.STARTICA_ELECTRON === "1" && typeof process.send === "function") return setScanner(electronScanner());
  setScanner(await playwrightScanner(Number(process.env.PORT ?? 58301)));
}
