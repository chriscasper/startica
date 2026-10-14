import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * Scanner backends (ARCHITECTURE.md section 9.2): something that opens a page in a real
 * Chromium, runs axe-core in it and returns what it found. The desktop app's backend
 * asks the Electron process over IPC; browser dev mode and the smoke tests use
 * Playwright. Core builds the in-page script, so every backend runs the same checks.
 */

/** Where an element was, in CSS pixels from the document's top left (for highlights, A2). */
export type Box = { x: number; y: number; width: number; height: number };
export type RawNode = { target: string; html: string; failureSummary: string | null; impact: string | null; box?: Box | null };
export type RawRuleResult = { id: string; impact: string | null; help: string; description: string; helpUrl: string; tags: string[]; nodes: RawNode[] };

/** Search-relevant facts about a page (SEO & GEO site health, ARCHITECTURE.md section 10.2). */
export type SeoFacts = {
  description: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string[];
  ogTitle: string | null;
  ogImage: string | null;
  /** The raw text of each JSON-LD block (parsed in core). */
  jsonLd: string[];
  wordCount: number;
};

/** What a page loads and submits, for Security's page checks (ARCHITECTURE.md section 11.2). */
export type SecurityFacts = {
  /** http:// resources on the page: scripts, styles, frames (active) and images, media (passive). */
  insecureResources: { active: string[]; passive: string[] };
  forms: { action: string; hasPassword: boolean }[];
  /** External scripts and whether they carry a Subresource Integrity hash. */
  scripts: { src: string; integrity: boolean }[];
  generator: string | null;
  directoryListing: boolean;
  /** Client-side libraries and their versions, from globals and script addresses (S2). */
  libraries?: { name: string; version: string; via: "global" | "url" }[];
};

/** What the in-page script returns. */
export type PageResult = {
  seo?: SeoFacts;
  security?: SecurityFacts;
  /** The main content's visible text (A5: spelling, readability, content rules), at most 30,000 characters. */
  text?: string;
  /** How many elements match each content-rule selector the request asked about (A5); -1 for an invalid selector. */
  selectorCounts?: number[];
  /** The page's images for the alt text review (A3), at most 100. */
  images?: { src: string; alt: string | null; decorative: boolean; link: string | null; nearby: string; width: number; height: number }[];
  /** The document's full size, for the screenshot (A2). */
  page?: { width: number; height: number };
  url: string;
  title: string;
  lang: string;
  links: string[];
  axeVersion: string;
  violations: RawRuleResult[];
  incomplete: RawRuleResult[];
  passes: string[];
};

export type ScanRequest = {
  url: string;
  /** axe-core's source, run in the page first. */
  axeSource: string;
  /** An expression that runs axe and resolves to a JSON string of PageResult. */
  runScript: string;
  timeoutMs: number;
  /** Take a screenshot when the page has issues (A2): JPEG, the viewport's width, at most SCREENSHOT_MAX_HEIGHT tall. */
  screenshot?: boolean;
};

export const SCREENSHOT_MAX_HEIGHT = 4000;
export const SCREENSHOT_QUALITY = 60;
export const VIEWPORT = { width: 1280, height: 900 };

/** Whether a result is worth a screenshot: something to highlight. */
export const wantsScreenshot = (result: Pick<PageResult, "violations" | "incomplete">) => result.violations.length + result.incomplete.length > 0;

export type ScanResponse = {
  httpStatus: number | null;
  finalUrl: string;
  result: PageResult;
  /** The page's X-Robots-Tag header, if any. */
  xRobotsTag?: string | null;
  /** A JPEG of the page (base64) when it had issues and the request asked for one, with its size. */
  screenshot?: { data: string; width: number; height: number } | null;
  /** The main document's security-relevant response headers (`RESPONSE_HEADERS`), lowercase names; Set-Cookie lines joined with "\n". */
  headers?: Record<string, string>;
};

/** Response headers the backends keep from each page's main document. */
export const RESPONSE_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "server",
  "x-powered-by",
  "set-cookie",
] as const;

/** Keeps the response headers Security reads: lowercase names, repeats joined (Set-Cookie with "\n"). */
export function pickHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = k.toLowerCase();
    if (v === undefined || !(RESPONSE_HEADERS as readonly string[]).includes(name)) continue;
    const sep = name === "set-cookie" ? "\n" : ", ";
    const value = (Array.isArray(v) ? v : [v]).join(sep);
    out[name] = out[name] ? `${out[name]}${sep}${value}` : value;
  }
  return out;
}

export interface ScannerBackend {
  name: "electron" | "playwright";
  scan(request: ScanRequest): Promise<ScanResponse>;
  close?(): Promise<void>;
}

const KEY = Symbol.for("startica.scanner");
const g = globalThis as unknown as { [KEY]?: ScannerBackend | null };

/** Set by the app's startup (shared through globalThis: Next bundles modules more than once). */
export function setScanner(backend: ScannerBackend | null): void {
  g[KEY] = backend;
}

export function getScanner(): ScannerBackend | null {
  return g[KEY] ?? null;
}

let axe: string | undefined;
/**
 * The minified axe-core build, read once. Resolved from the working directory at run
 * time (the name is built so bundlers don't rewrite it); falls back to the unminified
 * copy axe-core exports.
 */
export function axeSource(): string {
  if (axe) return axe;
  try {
    const require = createRequire(join(process.cwd(), "noop.js"));
    axe = readFileSync(require.resolve(["axe-core", "axe.min.js"].join("/")), "utf8");
  } catch {
    axe = (createRequire(import.meta.url)("axe-core") as { source: string }).source;
  }
  return axe;
}

export const PAGE_TIMEOUT_MS = 30_000;
const MAX_NODES_PER_RULE = 50;
const MAX_HTML_CHARS = 600;
const MAX_LINKS = 1000;

/** Tags passed to axe for a site's profile: WCAG 2.2 A/AA by default, optionally AAA and best practices. */
export function profileTags(site: { includeAaa: boolean; includeBestPractice: boolean }): string[] {
  return [
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
    ...(site.includeAaa ? ["wcag2aaa", "wcag21aaa", "wcag22aaa"] : []),
    ...(site.includeBestPractice ? ["best-practice"] : []),
  ];
}

/**
 * The in-page expression. Runs after axe-core's source; resolves to a JSON string so
 * every backend gets the same plain data back. Iframes aren't checked yet (A6).
 */
export function runScript(tags: string[], selectors: string[] = []): string {
  return `(async () => {
  const limit = (s, n) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");
  const box = (target) => {
    try {
      const selector = Array.isArray(target) && typeof target[0] === "string" ? target[0] : null;
      const el = selector ? document.querySelector(selector) : null;
      const r = el && el.getBoundingClientRect();
      if (!r || r.width + r.height === 0) return null;
      return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
    } catch {
      return null;
    }
  };
  const rule = (r) => ({
    id: r.id, impact: r.impact || null, help: r.help, description: r.description, helpUrl: r.helpUrl, tags: r.tags,
    nodes: r.nodes.slice(0, ${MAX_NODES_PER_RULE}).map((n) => ({
      target: Array.isArray(n.target) ? n.target.map(String).join(" ") : String(n.target),
      html: limit(n.html, ${MAX_HTML_CHARS}),
      failureSummary: n.failureSummary || null,
      impact: n.impact || null,
      box: box(n.target),
    })),
  });
  const results = await axe.run(document, {
    runOnly: { type: "tag", values: ${JSON.stringify(tags)} },
    resultTypes: ["violations", "incomplete"],
    iframes: false,
    elementRef: false,
  });
  const links = [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href))].slice(0, ${MAX_LINKS});
  const meta = (selector) => document.querySelector(selector)?.getAttribute("content")?.trim() || null;
  const main = document.querySelector("main") || document.body;
  const seo = {
    description: meta('meta[name="description" i]'),
    canonical: document.querySelector('link[rel="canonical" i]')?.href || null,
    robots: meta('meta[name="robots" i]'),
    h1: [...document.querySelectorAll("h1")].map((h) => limit(h.textContent.trim(), 200)).slice(0, 5),
    ogTitle: meta('meta[property="og:title" i]'),
    ogImage: meta('meta[property="og:image" i]'),
    jsonLd: [...document.querySelectorAll('script[type="application/ld+json" i]')].map((s) => limit(s.textContent, 20000)).slice(0, 10),
    wordCount: (main?.innerText || "").split(/\\s+/).filter(Boolean).length,
  };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return ""; } };
  const srcs = (selector, attr) => [...document.querySelectorAll(selector)].map((el) => abs(el.getAttribute(attr) || "")).filter(Boolean);
  const insecure = (list) => [...new Set(list.filter((u) => u.startsWith("http:")))].slice(0, 20);
  const security = {
    insecureResources: {
      active: insecure([...srcs("script[src]", "src"), ...srcs('link[rel~="stylesheet" i][href]', "href"), ...srcs("iframe[src]", "src"), ...srcs("object[data]", "data"), ...srcs("embed[src]", "src")]),
      passive: insecure([...srcs("img[src]", "src"), ...srcs("audio[src]", "src"), ...srcs("video[src]", "src"), ...srcs("source[src]", "src"), ...srcs("video[poster]", "poster")]),
    },
    forms: [...document.forms].slice(0, 20).map((f) => ({ action: abs(f.getAttribute("action") || location.href), hasPassword: !!f.querySelector('input[type="password" i]') })),
    scripts: [...document.querySelectorAll("script[src]")].slice(0, 50).map((s) => ({ src: abs(s.getAttribute("src") || ""), integrity: !!s.getAttribute("integrity") })).filter((s) => s.src),
    generator: meta('meta[name="generator" i]'),
    directoryListing: /^(Index of \\/|Directory listing for \\/)/.test(document.title || ""),
    libraries: (() => {
      const out = [];
      const add = (name, version, via) => {
        if (typeof version === "string" && /^\\d+\\.\\d+(\\.\\d+)?/.test(version) && !out.some((l) => l.name === name && l.version === version)) out.push({ name, version: version.match(/^\\d+\\.\\d+(\\.\\d+)?/)[0], via });
      };
      const w = window;
      try {
        add("jquery", w.jQuery && w.jQuery.fn && w.jQuery.fn.jquery, "global");
        add("jquery-ui", w.jQuery && w.jQuery.ui && w.jQuery.ui.version, "global");
        add("bootstrap", (w.bootstrap && w.bootstrap.Tooltip && w.bootstrap.Tooltip.VERSION) || (w.jQuery && w.jQuery.fn && w.jQuery.fn.tooltip && w.jQuery.fn.tooltip.Constructor && w.jQuery.fn.tooltip.Constructor.VERSION), "global");
        add("angular", w.angular && w.angular.version && w.angular.version.full, "global");
        add("@angular/core", (document.querySelector("[ng-version]") || { getAttribute: () => null }).getAttribute("ng-version"), "global");
        add("vue", (w.Vue && w.Vue.version) || (w.__VUE__ && w.__VUE__.version), "global");
        add("react", w.React && w.React.version, "global");
        add("lodash", w._ && w._.VERSION, "global");
        add("moment", w.moment && w.moment.version, "global");
        add("handlebars", w.Handlebars && w.Handlebars.VERSION, "global");
        add("dompurify", w.DOMPurify && w.DOMPurify.version, "global");
      } catch {}
      const patterns = [
        ["jquery", /jquery[.-]v?(\\d+\\.\\d+(?:\\.\\d+)?)(?:\\.min|\\.slim)*\\.js/i],
        ["jquery", /\\/jquery\\/(\\d+\\.\\d+(?:\\.\\d+)?)\\//i],
        ["jquery", /jquery@(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["bootstrap", /bootstrap(?:@|\\/)(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["lodash", /lodash(?:@|\\.js\\/|\\/)(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["angular", /angular(?:js)?(?:@|\\.js\\/|\\/)(1\\.\\d+(?:\\.\\d+)?)/i],
        ["vue", /vue@(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["moment", /moment(?:@|\\.js\\/|\\/)(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["handlebars", /handlebars(?:@|\\.js\\/|[.-]v?)(\\d+\\.\\d+(?:\\.\\d+)?)/i],
        ["dompurify", /dompurify(?:@|\\/)(\\d+\\.\\d+(?:\\.\\d+)?)/i],
      ];
      for (const s of [...document.querySelectorAll("script[src]")].slice(0, 80)) {
        const src = s.getAttribute("src") || "";
        for (const [name, re] of patterns) {
          const m = src.match(re);
          if (m) add(name, m[1], "url");
        }
      }
      return out.slice(0, 20);
    })(),
  };
  return JSON.stringify({
    url: location.href,
    title: document.title || "",
    lang: document.documentElement.getAttribute("lang") || "",
    links,
    seo,
    security,
    page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
    text: (main?.innerText || "").slice(0, 30000),
    selectorCounts: ${JSON.stringify(selectors)}.map((sel) => {
      try {
        return document.querySelectorAll(sel).length;
      } catch {
        return -1;
      }
    }),
    images: [...document.images]
      .filter((img) => /^https?:/.test(img.currentSrc || img.src))
      .slice(0, 100)
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.getAttribute("alt"),
        decorative: img.getAttribute("role") === "presentation" || img.getAttribute("role") === "none" || img.getAttribute("aria-hidden") === "true",
        link: img.closest("a[href]")?.href || null,
        nearby: limit((img.closest("figure, a, button, p, li, section") || img.parentElement)?.innerText?.trim().replace(/\\s+/g, " ") || "", 200),
        width: img.naturalWidth || 0,
        height: img.naturalHeight || 0,
      })),
    axeVersion: axe.version,
    violations: results.violations.map(rule),
    incomplete: results.incomplete.map(rule),
    passes: results.passes.map((r) => r.id),
  });
})()`;
}

export function scanRequest(url: string, tags: string[], selectors: string[] = []): ScanRequest {
  return { url, axeSource: axeSource(), runScript: runScript(tags, selectors), timeoutMs: PAGE_TIMEOUT_MS, screenshot: true };
}
