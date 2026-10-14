import { parseHTML } from "linkedom";
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation } from "./types.ts";

/**
 * Reddit via its public Atom (RSS) feeds: the feeds Reddit offers to feed readers.
 * The Data API needs approval now and Anthropic's web tools can't reach reddit.com
 * (ARCHITECTURE.md section 8.1), so this is the read path. It's read-only; posting is manual.
 *
 * Reddit allows roughly one feed request per minute, so requests are serialized
 * and spaced using Reddit's x-ratelimit headers.
 */

const BASE = "https://www.reddit.com";
// Reddit asks for "<platform>:<app id>:<version> (<contact>)".
const USER_AGENT = `${process.platform}:startica:v0.1 (personal feed reader; https://mystartica.com)`;
const MIN_GAP_MS = 62_000;
const MAX_SUBREDDITS = 10;
const MAX_KEYWORD_SEARCHES = 3;

// --- Rate limiting ---------------------------------------------------------------

let nextAllowedAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Waits, unless the scan is stopped first (Reddit's rate limit can mean a minute's wait). */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });

async function fetchFeedOnce(url: string, signal?: AbortSignal): Promise<Response> {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await sleep(wait, signal);
  const timeout = AbortSignal.timeout(20_000);
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
  const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "0");
  const resetSeconds = Number(res.headers.get("x-ratelimit-reset") ?? "60");
  nextAllowedAt = Date.now() + (remaining >= 1 ? 2_000 : Math.max(MIN_GAP_MS, (resetSeconds + 2) * 1000));
  return res;
}

/** Serialized, rate-limited feed fetch; retries once after a 429. */
function fetchFeed(url: string, signal?: AbortSignal): Promise<string> {
  const task = chain.then(async () => {
    signal?.throwIfAborted();
    let res = await fetchFeedOnce(url, signal);
    if (res.status === 429) res = await fetchFeedOnce(url, signal);
    if (!res.ok) throw new Error(`Reddit feed ${res.status} for ${url}`);
    return res.text();
  });
  chain = task.catch(() => undefined);
  return task;
}

// --- Parsing ----------------------------------------------------------------------

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(entry: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(entry);
  return m?.[1] ?? null;
}

/** The post body is the `div.md` inside Reddit's HTML; link and image posts have none. */
export function redditContentToText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const md = document.querySelector("div.md");
  if (!md) return "";
  for (const p of md.querySelectorAll("p, li, br")) p.append("\n");
  return (md.textContent ?? "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
}

export type FeedEntry = RawConversation;

export function parseRedditFeed(xml: string): FeedEntry[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.flatMap((entry) => {
    const id = tag(entry, "id");
    const link = /<link href="([^"]+)"/.exec(entry)?.[1];
    if (!id || !link) return [];
    const isComment = id.startsWith("t1_");
    const community = /<category term="([^"]+)"/.exec(entry)?.[1] ?? /\/r\/([^/]+)\//.exec(link)?.[1] ?? null;
    const published = tag(entry, "published") ?? tag(entry, "updated");
    const title = decodeXml(tag(entry, "title") ?? "").trim();
    const body = redditContentToText(decodeXml(tag(entry, "content") ?? ""));
    const author = tag(entry, "name")?.replace(/^\/u\//, "") ?? null;
    return [
      {
        channel: "reddit" as const,
        externalId: id,
        url: decodeXml(link),
        kind: isComment ? ("comment" as const) : ("post" as const),
        community,
        author,
        title: isComment ? null : title,
        threadTitle: null,
        body: body || (isComment ? "" : "(link or image post; no text)"),
        postedAt: published ? new Date(published) : null,
        score: null,
        numComments: null,
      },
    ];
  });
}

/** Extracts the post id from a Reddit thread URL (…/comments/<id>/… or redd.it/<id>). */
export function redditPostId(url: string): string | null {
  return /reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i.exec(url)?.[1] ?? /redd\.it\/([a-z0-9]+)/i.exec(url)?.[1] ?? null;
}

/** The post id and, for a comment permalink (…/comments/<post>/<slug>/<comment>/), the comment id. */
export function redditThingIds(url: string): { postId: string; commentId: string | null } | null {
  const m = /reddit\.com\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/[^/?#]*\/([a-z0-9]+))?/i.exec(url);
  if (m) return { postId: m[1]!, commentId: m[2] ?? null };
  const short = /redd\.it\/([a-z0-9]+)/i.exec(url);
  return short ? { postId: short[1]!, commentId: null } : null;
}

const GONE = new Set(["[removed]", "[deleted]"]);

/**
 * Engagement from a thread or comment-permalink feed. The feed lists the target
 * and everything below it (flattened), so replies = comments other than the
 * target. RSS carries no vote counts, so score is unknown. A target that is
 * missing or shows [removed]/[deleted] counts as removed.
 */
export function redditEngagement(entries: FeedEntry[], targetId: string): Engagement {
  const target = entries.find((e) => e.externalId === targetId);
  const replies = entries.filter((e) => e.kind === "comment" && e.externalId !== targetId).length;
  const removed = !target || GONE.has(target.body.trim()) || target.author === "[deleted]";
  return { score: null, replies, removed };
}

// --- Adapter ----------------------------------------------------------------------

export const reddit: ChannelAdapter = {
  channel: "reddit",

  async discover(query: ListeningQuery) {
    const found = new Map<string, RawConversation>();
    const keep = (items: RawConversation[]) => {
      for (const item of items) {
        if (item.kind !== "post") continue;
        if (item.postedAt && item.postedAt < query.since) continue;
        if (!found.has(item.externalId)) found.set(item.externalId, item);
      }
    };

    const names = query.communities.map((c) => c.name);
    for (const sub of names.slice(0, MAX_SUBREDDITS)) {
      query.signal?.throwIfAborted();
      try {
        keep(parseRedditFeed(await fetchFeed(`${BASE}/r/${encodeURIComponent(sub)}/new/.rss?limit=50`, query.signal)));
      } catch {
        // A private, banned or misspelled subreddit shouldn't stop the scan.
      }
    }
    // Keyword searches stay inside the watched subreddits: Reddit-wide search mostly
    // matches unrelated communities and would waste scoring calls.
    const subs = names.slice(0, MAX_SUBREDDITS);
    if (subs.length > 0) {
      const scope = subs.map(encodeURIComponent).join("+");
      for (const keyword of query.keywords.slice(0, MAX_KEYWORD_SEARCHES)) {
        const params = new URLSearchParams({ q: `"${keyword}"`, restrict_sr: "on", sort: "new", t: "week", limit: "25" });
        query.signal?.throwIfAborted();
        try {
          keep(parseRedditFeed(await fetchFeed(`${BASE}/r/${scope}/search.rss?${params}`, query.signal)));
        } catch {
          // Search feeds are best-effort.
        }
      }
    }
    return [...found.values()];
  },

  async fetchThread(url: string) {
    const id = redditPostId(url);
    if (!id) return null;
    const entries = parseRedditFeed(await fetchFeed(`${BASE}/comments/${id}/.rss?limit=10`));
    const post = entries.find((e) => e.externalId === `t3_${id}`) ?? entries[0];
    if (!post) return null;
    const comments = entries.filter((e) => e.kind === "comment" && e.body);
    // Include the top replies so the drafter knows what's already been said.
    const replies = comments
      .slice(0, 5)
      .map((c) => `- ${c.author ?? "someone"}: ${c.body.slice(0, 500)}`)
      .join("\n");
    return {
      ...post,
      body: replies ? `${post.body}\n\nTop replies so far:\n${replies}` : post.body,
      numComments: comments.length,
    };
  },

  async fetchEngagement(url: string) {
    const ids = redditThingIds(url);
    if (!ids) return null;
    // Comment permalinks need their own path (with the slug); short links only name the post.
    const path = /reddit\.com\//i.test(url) ? new URL(url).pathname.replace(/\/?$/, "/") : `/comments/${ids.postId}/`;
    const entries = parseRedditFeed(await fetchFeed(`${BASE}${path}.rss?limit=100`));
    return redditEngagement(entries, ids.commentId ? `t1_${ids.commentId}` : `t3_${ids.postId}`);
  },
};

/** A Reddit user's recent posts and comments (for the voice bank). ~2 minutes: one feed per minute. */
export async function fetchRedditUserWriting(username: string): Promise<{ text: string; url: string; postedAt: Date | null }[]> {
  const user = encodeURIComponent(username.replace(/^\/?u\//i, "").trim());
  const out: { text: string; url: string; postedAt: Date | null }[] = [];
  for (const kind of ["submitted", "comments"]) {
    try {
      for (const entry of parseRedditFeed(await fetchFeed(`${BASE}/user/${user}/${kind}/.rss?limit=25`))) {
        const text = [entry.title, entry.body.startsWith("(link or image") ? "" : entry.body].filter(Boolean).join("\n\n").trim();
        if (text.length >= 40) out.push({ text, url: entry.url, postedAt: entry.postedAt });
      }
    } catch {
      // Private or missing profiles return errors; use whatever came back.
    }
  }
  return out;
}
