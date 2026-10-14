import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export const USER_AGENT = "StarticaBot/0.1 (+https://mystartica.com; local research tool)";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_CHARS = 12_000;

// Paths that usually explain what a product is. Higher score = crawled first.
const PATH_HINTS: [RegExp, number][] = [
  [/about|story|mission|why/i, 5],
  [/pricing|plans|subscribe|premium|pro\b/i, 5],
  [/features|product|how-it-works|tour/i, 4],
  [/faq|help|docs|guide|rules|community/i, 3],
  [/explore|discover|showcase|examples|use-cases|customers/i, 2],
  [/blog|news|changelog|roadmap/i, 1],
];
const SKIP_PATHS = /login|log-in|signin|sign-in|signup|sign-up|register|logout|account|settings|cart|checkout|privacy|terms|cookie|legal|\.(png|jpe?g|gif|webp|svg|pdf|zip|mp4|css|js|xml|json)$/i;

export type CrawledPage = { url: string; title: string; content: string };

async function fetchText(url: string): Promise<{ status: number; text: string; contentType: string }> {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,text/plain;q=0.8" },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "" };
}

/** Minimal robots.txt check: honors Disallow rules in the `*` group. */
export function isAllowedByRobots(robotsTxt: string, path: string): boolean {
  const disallowed: string[] = [];
  let inStarGroup = false;
  for (const raw of robotsTxt.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!key) continue;
    const k = key.toLowerCase();
    if (k === "user-agent") inStarGroup = value === "*";
    else if (k === "disallow" && inStarGroup && value) disallowed.push(value);
  }
  return !disallowed.some((rule) => path.startsWith(rule.replace(/\*$/, "")));
}

function collapse(text: string): string {
  return text
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

export function extractPage(url: string, html: string): CrawledPage & { links: string[] } {
  const { document } = parseHTML(html);
  const title = (document.querySelector("title")?.textContent ?? "").trim();
  const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";

  const links = [...document.querySelectorAll("a[href]")]
    .map((a) => a.getAttribute("href") ?? "")
    .flatMap((href) => {
      try {
        return [new URL(href, url).toString()];
      } catch {
        return [];
      }
    });

  // Readability needs its own copy because it mutates the DOM.
  const article = new Readability(parseHTML(html).document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  let body = article?.textContent ?? "";
  if (body.trim().length < 200) {
    // Sparse or app-shell pages: fall back to all visible text.
    for (const el of document.querySelectorAll("script, style, noscript, svg")) el.remove();
    body = document.body?.textContent ?? "";
  }

  const content = collapse([description && `Description: ${description}`, body].filter(Boolean).join("\n\n"));
  return { url, title, content: content.slice(0, MAX_PAGE_CHARS), links };
}

function rankLinks(baseUrl: URL, links: string[], seen: Set<string>): string[] {
  const scored = new Map<string, number>();
  for (const link of links) {
    const u = new URL(link);
    if (u.origin !== baseUrl.origin) continue;
    u.hash = "";
    u.search = "";
    const key = u.toString().replace(/\/$/, "");
    if (seen.has(key) || SKIP_PATHS.test(u.pathname) || u.pathname.split("/").length > 4) continue;
    const score = PATH_HINTS.reduce((s, [re, w]) => (re.test(u.pathname) ? s + w : s), 0);
    scored.set(key, Math.max(scored.get(key) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

/**
 * Crawls a product's homepage plus its most informative same-origin pages.
 * Returns readable text per page; never throws for individual page failures.
 */
export async function crawlSite(startUrl: string, maxPages = 8): Promise<CrawledPage[]> {
  const base = new URL(startUrl);
  let robots = "";
  try {
    const r = await fetchText(new URL("/robots.txt", base).toString());
    if (r.status === 200) robots = r.text;
  } catch {
    // No robots.txt reachable: proceed.
  }

  const pages: CrawledPage[] = [];
  const seen = new Set<string>();
  const queue = [base.toString().replace(/\/$/, "")];

  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (robots && !isAllowedByRobots(robots, new URL(url).pathname)) continue;

    try {
      const res = await fetchText(url);
      if (res.status >= 400 || !res.contentType.includes("html")) continue;
      const page = extractPage(url, res.text);
      if (page.content.length > 0) pages.push({ url: page.url, title: page.title, content: page.content });
      // Only expand links from the homepage; keeps the crawl focused and fast.
      if (pages.length === 1) queue.push(...rankLinks(base, page.links, seen));
    } catch {
      // Timeouts and network errors skip the page.
    }
  }
  return pages;
}
