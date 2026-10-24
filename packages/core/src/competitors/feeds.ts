import { parseHTML } from "linkedom";
import { hnHtmlToText } from "../channels/hackernews.ts";
import { publicGet } from "../net/public-fetch.ts";

/**
 * Blog, changelog and newsletter feeds of a competitor or a person (ARCHITECTURE.md section 3,
 * "Competitor watch"): RSS 2.0 or Atom, read from the feed's URL or found from the site's
 * homepage (`<link rel="alternate">`, then the usual paths). Parsing is pure; fetching goes
 * through the shared public fetch (no private addresses, redirects checked hop by hop).
 */

export const FEED_USER_AGENT = "StarticaCompetitorWatch/0.1 (+https://mystartica.com; reads public feeds for the product's owner)";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5";
const MAX_BYTES = 2_000_000;
const MAX_TEXT = 2_000;

export type FeedPost = { externalId: string; url: string; title: string | null; text: string; postedAt: Date | null };

const decode = (s: string) =>
  s
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return m?.[1] != null ? decode(m[1]) : null;
}

const date = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Text of an HTML summary, shortened. */
const plain = (html: string | null) => {
  const text = hnHtmlToText(html ?? "").replace(/\s+\n/g, "\n");
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
};

/** Whether a response body is a feed rather than a web page. */
export function looksLikeFeed(text: string): boolean {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2_000));
}

/** The posts in an RSS 2.0 or Atom feed, newest first as listed; entries without a link are left out. */
export function parseFeed(xml: string, base?: string): FeedPost[] {
  const atom = /<feed[\s>]/i.test(xml.slice(0, 2_000));
  const items = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.flatMap((item) => {
    const href = atom
      ? (/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i.exec(item)?.[1] ?? /<link[^>]*href="([^"]+)"/i.exec(item)?.[1] ?? null)
      : tag(item, "link");
    if (!href) return [];
    let url: string;
    try {
      url = new URL(decode(href), base).toString();
    } catch {
      return [];
    }
    const id = tag(item, atom ? "id" : "guid") || url;
    const title = tag(item, "title");
    const body = atom ? (tag(item, "summary") ?? tag(item, "content")) : (tag(item, "description") ?? tag(item, "content:encoded"));
    const posted = atom ? (tag(item, "published") ?? tag(item, "updated")) : (tag(item, "pubDate") ?? tag(item, "dc:date"));
    return [{ externalId: id.slice(0, 500), url, title: title ? plain(title) : null, text: plain(body), postedAt: date(posted) }];
  });
}

/** The feed a web page points to (`<link rel="alternate" type="application/rss+xml|atom+xml">`), as an absolute URL. */
export function discoverFeed(html: string, base: string): string | null {
  const { document } = parseHTML(html);
  for (const link of document.querySelectorAll('link[rel~="alternate"]')) {
    const type = (link.getAttribute("type") ?? "").toLowerCase();
    const href = link.getAttribute("href");
    if (href && /(rss|atom)\+xml/.test(type)) {
      try {
        return new URL(href, base).toString();
      } catch {
        // a broken href: try the next one
      }
    }
  }
  return null;
}

/** Paths blogs commonly serve their feed on, tried in order when the page names none. */
const COMMON_PATHS = ["/feed", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/blog/rss.xml", "/blog/feed"];

/** Reads a feed from its URL or from a site's address. Throws with a readable message. */
export async function fetchFeedPosts(url: string, signal?: AbortSignal): Promise<{ feedUrl: string; posts: FeedPost[] }> {
  const get = (u: string) => publicGet(u, { userAgent: FEED_USER_AGENT, accept: ACCEPT, maxBytes: MAX_BYTES, signal });
  const first = await get(url);
  if (!first) throw new Error("Startica can't read that address (it isn't public, or it didn't answer)");
  const ok = first.status < 400;
  if (ok && looksLikeFeed(first.text)) return { feedUrl: first.url, posts: parseFeed(first.text, first.url) };

  // The page's own feed link, else the usual paths (also when the address itself answered an error).
  const named = ok ? discoverFeed(first.text, first.url) : null;
  const candidates = named ? [named] : COMMON_PATHS.map((p) => new URL(p, first.url).toString());
  for (const candidate of candidates) {
    const res = await get(candidate);
    if (res && res.status < 400 && looksLikeFeed(res.text)) return { feedUrl: res.url, posts: parseFeed(res.text, res.url) };
  }
  throw new Error(ok ? "No RSS or Atom feed found there: paste the feed's address instead" : `The site answered ${first.status}, and no feed was found at the usual addresses`);
}
