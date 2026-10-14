import { isAllowedByRobots } from "../intel/crawl.ts";
import { normalizeUrl } from "./urls.ts";

/** How Startica identifies itself when it reads robots.txt and sitemaps for a site scan. */
export const SCAN_USER_AGENT = "StarticaAccessibilityScan/0.1 (+https://mystartica.com; scans sites their owners add)";

const TIMEOUT_MS = 15_000;
const MAX_SITEMAPS = 10;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": SCAN_USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export type Robots = { allows(url: string): boolean; sitemaps: string[] };

/** The site's robots.txt rules (or allow-all when it has none) and the sitemaps it lists. */
export async function readRobots(startUrl: string): Promise<Robots> {
  const text = (await fetchText(new URL("/robots.txt", startUrl).toString())) ?? "";
  const sitemaps = [...text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
  return { allows: (url) => !text || isAllowedByRobots(text, new URL(url).pathname), sitemaps };
}

/** Page URLs from `<loc>` entries; sitemap indexes are followed (up to 10 sitemaps). */
export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = (block: string) => [...block.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]!));
  if (/<sitemapindex[\s>]/i.test(xml)) return { pages: [], sitemaps: locs(xml) };
  return { pages: locs(xml), sitemaps: [] };
}

const decodeXml = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Page URLs listed in the site's sitemaps (robots.txt's, else /sitemap.xml), normalized, at most `limit`. */
export async function sitemapUrls(startUrl: string, robots: Robots, limit: number): Promise<string[]> {
  const queue = robots.sitemaps.length ? [...robots.sitemaps] : [new URL("/sitemap.xml", startUrl).toString()];
  const pages = new Set<string>();
  let read = 0;
  while (queue.length && read < MAX_SITEMAPS && pages.size < limit) {
    const xml = await fetchText(queue.shift()!);
    read++;
    if (!xml) continue;
    const parsed = parseSitemap(xml);
    queue.push(...parsed.sitemaps);
    for (const page of parsed.pages) {
      const url = normalizeUrl(page);
      if (url) pages.add(url);
      if (pages.size >= limit) break;
    }
  }
  return [...pages];
}
