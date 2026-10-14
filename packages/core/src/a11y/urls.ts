import { isPrivateHost } from "../net/address.ts";

/**
 * URL rules for site crawling (ARCHITECTURE.md section 9.2): one canonical form per page,
 * same-site checks, include/exclude patterns, and what isn't a web page.
 */

/** Exclusions every site gets, so a crawl never follows sign-out or destructive links. */
export const DEFAULT_EXCLUDES = ["*logout*", "*log-out*", "*signout*", "*sign-out*", "*/delete*", "/api/*"];

// Files a crawl records as links but doesn't open as pages (PDFs become documents in A5).
const NOT_PAGES = /\.(pdf|zip|gz|tar|dmg|exe|msi|pkg|deb|rpm|apk|jpe?g|png|gif|webp|avif|svg|ico|mp3|mp4|m4a|mov|webm|avi|woff2?|ttf|otf|css|js|mjs|json|xml|rss|atom|txt|csv|xlsx?|docx?|pptx?)$/i;

/**
 * Canonical form of a page URL: http(s) only, no fragment, no query string (a query
 * usually shows the same page: tracking tags, filters, sort order), lowercase host,
 * no default port. Null for anything that isn't a page URL.
 */
export function normalizeUrl(raw: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  url.search = "";
  return url.toString();
}

/** Same site: the same host, ignoring a leading "www.". */
export function sameSite(a: string, b: string): boolean {
  const host = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  try {
    return host(a) === host(b);
  } catch {
    return false;
  }
}

export function isPageUrl(url: string): boolean {
  return !NOT_PAGES.test(new URL(url).pathname);
}

/** Glob match on the URL's path and query: `*` matches anything, everything else is literal. */
export function matchesPattern(url: string, pattern: string): boolean {
  const u = new URL(url);
  const target = `${u.pathname}${u.search}`.toLowerCase();
  const regex = new RegExp(`^${pattern.toLowerCase().split("*").map(escapeRegex).join(".*")}$`);
  // A pattern without a leading slash or star matches anywhere in the path.
  return regex.test(target) || (!pattern.startsWith("/") && !pattern.startsWith("*") && target.includes(pattern.toLowerCase()));
}

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Whether the crawl may open this URL for a site: same site, a page, not excluded, and included when includes are set. */
export function allowedForSite(url: string, site: { startUrl: string; include: string[]; exclude: string[] }): boolean {
  if (!sameSite(url, site.startUrl) || !isPageUrl(url)) return false;
  if ([...DEFAULT_EXCLUDES, ...site.exclude].some((p) => matchesPattern(url, p))) return false;
  return site.include.length === 0 || site.include.some((p) => matchesPattern(url, p)) || normalizeUrl(site.startUrl) === url;
}

/** Loopback and private-network hosts (a local development site is fine to scan; see section 9.9). Lives in net/address.ts. */
export { isPrivateHost } from "../net/address.ts";

/**
 * Whether a page being scanned may load `target` (section 9.9): never Startica's own
 * server, and private-network addresses only when the scanned site is itself local.
 */
export function scanRequestAllowed(target: string, siteUrl: string, appPort: number): boolean {
  let t: URL;
  let s: URL;
  try {
    t = new URL(target);
    s = new URL(siteUrl);
  } catch {
    return true; // data:, blob: and the like stay inside the page
  }
  if (t.protocol !== "http:" && t.protocol !== "https:" && t.protocol !== "ws:" && t.protocol !== "wss:") return true;
  const port = Number(t.port || (t.protocol === "https:" || t.protocol === "wss:" ? 443 : 80));
  if (isPrivateHost(t.hostname) && port === appPort) return false;
  return !isPrivateHost(t.hostname) || isPrivateHost(s.hostname);
}
