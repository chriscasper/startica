import type { BenchmarkChannel } from "@startica/db/schema";
import { getJson } from "../channels/http.ts";
import { hnHtmlToText, itemUrl } from "../channels/hackernews.ts";
import { fetchFeed, parseRedditFeed, type FeedEntry } from "../channels/reddit.ts";
import { fetchFeedPosts, type FeedPost } from "../competitors/feeds.ts";

/**
 * Public numbers and recent posts for one followed account (ARCHITECTURE.md section 3, "Competitor
 * benchmarks" and "Competitor watch"), read without an account: Bluesky's public AppView, the
 * account's Mastodon server, Hacker News through Algolia, Reddit through the user's public feed,
 * and a blog or newsletter's RSS or Atom feed (posts only). The posts come from the same responses
 * the numbers are computed from: no extra requests. X is left out on purpose: the owner decided
 * against user lookups on X. Parsing is pure (tested with fixtures); fetching is thin.
 */

export type AccountNumbers = {
  followers: number | null;
  totalPosts: number | null;
  karma: number | null;
  /** Posts seen in the last 7 days (capped at what one page of the feed returns). */
  postsLast7: number | null;
  /** Average likes + reposts + replies (or points + comments) over the most recent posts. */
  avgEngagement: number | null;
  /** The profile on the web, when the source says. */
  url: string | null;
};

/** Channels with numbers (Benchmarks charts them). */
export const BENCHMARK_CHANNELS = ["bluesky", "mastodon", "reddit", "hackernews"] as const satisfies readonly BenchmarkChannel[];
/** Channels Startica can read: the benchmarked ones and feeds (posts only). */
export const FOLLOW_CHANNELS = [...BENCHMARK_CHANNELS, "rss"] as const satisfies readonly BenchmarkChannel[];
export type SupportedChannel = (typeof FOLLOW_CHANNELS)[number];

/** A recent public post of a followed account. */
export type AccountPost = { externalId: string; url: string; title: string | null; text: string; kind: "post" | "reply" | "comment" | "story" | "article"; postedAt: Date | null; engagement: number | null };
export type AccountRead = { numbers: AccountNumbers | null; posts: AccountPost[] };

export const BENCHMARK_LABEL: Record<BenchmarkChannel, string> = {
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  reddit: "Reddit",
  hackernews: "Hacker News",
  x: "X",
  rss: "Blog or newsletter feed",
};

/** What each source can tell, for the UI. */
export const BENCHMARK_HINT: Record<SupportedChannel, { placeholder: string; reads: string }> = {
  bluesky: { placeholder: "name.bsky.social", reads: "followers, posts, engagement" },
  mastodon: { placeholder: "@name@server.example", reads: "followers, posts, engagement" },
  reddit: { placeholder: "u/name", reads: "posting frequency only (Reddit's public feed has no followers or karma)" },
  hackernews: { placeholder: "name", reads: "karma, posts, engagement on stories" },
  rss: { placeholder: "https://blog.example.com", reads: "new posts (from the feed, or the one the site points to)" },
};

const WEEK = 7 * 86_400_000;
const RECENT_POSTS = 20;

const average = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const inLastWeek = (dates: (Date | null)[], now: Date) => dates.filter((d) => d && now.getTime() - d.getTime() <= WEEK && d <= now).length;

// --- Handles ---------------------------------------------------------------------------------------

/**
 * A handle the way it's stored (lowercase, no prefixes) and its profile link, from what the user
 * typed or pasted: a handle or a profile URL. Throws with a readable message when it can't be read.
 */
export function normalizeHandle(channel: BenchmarkChannel, input: string): { handle: string; url: string } {
  const raw = input.trim();
  if (!raw) throw new Error("Enter a handle");
  switch (channel) {
    case "bluesky": {
      const handle = (/bsky\.app\/profile\/([^/?#]+)/i.exec(raw)?.[1] ?? raw).replace(/^@/, "").toLowerCase();
      if (!/^(did:plc:[a-z0-9]+|[a-z0-9-]+(\.[a-z0-9-]+)+)$/.test(handle)) throw new Error("A Bluesky handle looks like name.bsky.social");
      return { handle, url: `https://bsky.app/profile/${handle}` };
    }
    case "mastodon": {
      const fromUrl = /^https?:\/\/([^/]+)\/@([\w.-]+)\/?$/i.exec(raw);
      const m = fromUrl ? [fromUrl[2], fromUrl[1]] : /^@?([\w.-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(raw)?.slice(1);
      if (!m?.[0] || !m[1]) throw new Error("A Mastodon handle looks like @name@server.example");
      const handle = `${m[0]}@${m[1]}`.toLowerCase();
      return { handle, url: `https://${m[1].toLowerCase()}/@${m[0]}` };
    }
    case "reddit": {
      const name = (/reddit\.com\/(?:user|u)\/([\w-]+)/i.exec(raw)?.[1] ?? raw.replace(/^\/?u\//i, "")).trim();
      if (!/^[\w-]{3,20}$/.test(name)) throw new Error("A Reddit username has 3 to 20 letters, digits, - or _");
      return { handle: name.toLowerCase(), url: `https://www.reddit.com/user/${name}` };
    }
    case "hackernews": {
      const name = (/news\.ycombinator\.com\/user\?id=([\w-]+)/i.exec(raw)?.[1] ?? raw).trim();
      if (!/^[\w-]{2,15}$/.test(name)) throw new Error("A Hacker News username has 2 to 15 letters, digits, - or _");
      // HN usernames are case-sensitive; keep them as typed.
      return { handle: name, url: `https://news.ycombinator.com/user?id=${name}` };
    }
    case "rss": {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) throw new Error("Enter an http(s) address");
      let u: URL;
      try {
        u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      } catch {
        throw new Error("Enter the blog's or the feed's address, like https://blog.example.com");
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Enter an http(s) address");
      u.hash = "";
      return { handle: u.toString(), url: u.toString() };
    }
    case "x":
      throw new Error("X isn't benchmarked: Startica doesn't look up accounts on X");
  }
}

const shorten = (text: string, max = 2_000) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// --- Bluesky -------------------------------------------------------------------------------------

const BSKY = "https://public.api.bsky.app/xrpc";

export type BskyProfile = { did: string; handle: string; followersCount?: number; postsCount?: number };
export type BskyFeedItem = {
  post: { uri?: string; author: { did: string; handle?: string }; record: { text?: string; createdAt?: string; reply?: unknown }; likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number };
  reason?: { $type?: string };
};

/** The account's own posts (no reposts of others), with a web link built from the post's AT URI. */
export function bskyPosts(profile: BskyProfile, feed: BskyFeedItem[]): AccountPost[] {
  return feed.flatMap((f) => {
    const uri = f.post.uri;
    if (f.reason || f.post.author.did !== profile.did || !uri) return [];
    const rkey = uri.split("/").pop();
    return [
      {
        externalId: uri,
        url: `https://bsky.app/profile/${profile.handle}/post/${rkey}`,
        title: null,
        text: shorten(f.post.record.text ?? ""),
        kind: f.post.record.reply ? ("reply" as const) : ("post" as const),
        postedAt: f.post.record.createdAt ? new Date(f.post.record.createdAt) : null,
        engagement: (f.post.likeCount ?? 0) + (f.post.repostCount ?? 0) + (f.post.replyCount ?? 0) + (f.post.quoteCount ?? 0),
      },
    ];
  });
}

export function bskyNumbers(profile: BskyProfile, feed: BskyFeedItem[], now = new Date()): AccountNumbers {
  // The account's own posts: no reposts of others.
  const own = feed.filter((f) => !f.reason && f.post.author.did === profile.did);
  const dated = own.map((f) => (f.post.record.createdAt ? new Date(f.post.record.createdAt) : null));
  const top = own.filter((f) => !f.post.record.reply).slice(0, RECENT_POSTS);
  return {
    followers: profile.followersCount ?? null,
    totalPosts: profile.postsCount ?? null,
    karma: null,
    postsLast7: inLastWeek(dated, now),
    avgEngagement: average(top.map((f) => (f.post.likeCount ?? 0) + (f.post.repostCount ?? 0) + (f.post.replyCount ?? 0) + (f.post.quoteCount ?? 0))),
    url: `https://bsky.app/profile/${profile.handle}`,
  };
}

async function fetchBluesky(handle: string, now: Date): Promise<AccountRead> {
  const profile = await getJson<BskyProfile>(`${BSKY}/app.bsky.actor.getProfile?${new URLSearchParams({ actor: handle })}`);
  const { feed } = await getJson<{ feed: BskyFeedItem[] }>(`${BSKY}/app.bsky.feed.getAuthorFeed?${new URLSearchParams({ actor: profile.did, limit: "50", filter: "posts_no_replies" })}`);
  return { numbers: bskyNumbers(profile, feed, now), posts: bskyPosts(profile, feed) };
}

// --- Mastodon ------------------------------------------------------------------------------------

export type MastodonAccount = { id: string; url?: string; followers_count?: number; statuses_count?: number };
export type MastodonStatus = {
  id?: string;
  url?: string | null;
  content?: string;
  created_at: string;
  reblog?: unknown;
  in_reply_to_id?: string | null;
  favourites_count?: number;
  reblogs_count?: number;
  replies_count?: number;
};

export function mastodonPosts(statuses: MastodonStatus[]): AccountPost[] {
  return statuses.flatMap((s) =>
    s.reblog || !s.id || !s.url
      ? []
      : [
          {
            externalId: s.id,
            url: s.url,
            title: null,
            text: shorten(hnHtmlToText(s.content)),
            kind: s.in_reply_to_id ? ("reply" as const) : ("post" as const),
            postedAt: new Date(s.created_at),
            engagement: (s.favourites_count ?? 0) + (s.reblogs_count ?? 0) + (s.replies_count ?? 0),
          },
        ],
  );
}

export function mastodonNumbers(account: MastodonAccount, statuses: MastodonStatus[], now = new Date()): AccountNumbers {
  const own = statuses.filter((s) => !s.reblog);
  const top = own.filter((s) => !s.in_reply_to_id).slice(0, RECENT_POSTS);
  return {
    followers: account.followers_count ?? null,
    totalPosts: account.statuses_count ?? null,
    karma: null,
    postsLast7: inLastWeek(own.map((s) => new Date(s.created_at)), now),
    avgEngagement: average(top.map((s) => (s.favourites_count ?? 0) + (s.reblogs_count ?? 0) + (s.replies_count ?? 0))),
    url: account.url ?? null,
  };
}

async function fetchMastodon(handle: string, now: Date): Promise<AccountRead> {
  const [name, server] = handle.split("@") as [string, string];
  // Read on the account's own server: it has every post; other servers only know what reached them.
  const account = await getJson<MastodonAccount>(`https://${server}/api/v1/accounts/lookup?${new URLSearchParams({ acct: name })}`);
  const statuses = await getJson<MastodonStatus[]>(`https://${server}/api/v1/accounts/${encodeURIComponent(account.id)}/statuses?limit=40&exclude_reblogs=true`);
  return { numbers: mastodonNumbers(account, statuses, now), posts: mastodonPosts(statuses) };
}

// --- Hacker News ---------------------------------------------------------------------------------

const ALGOLIA = "https://hn.algolia.com/api/v1";

export type HnUser = { username?: string; karma?: number };
export type HnSearch = {
  nbHits?: number;
  hits: {
    objectID?: string;
    _tags?: string[];
    created_at_i?: number;
    points?: number | null;
    num_comments?: number | null;
    title?: string | null;
    story_title?: string | null;
    story_text?: string | null;
    comment_text?: string | null;
  }[];
};

/** Stories link to their discussion; comments to themselves, titled with their story. */
export function hnPosts(search: HnSearch): AccountPost[] {
  return search.hits.flatMap((h) => {
    if (!h.objectID) return [];
    const story = h._tags?.includes("story") ?? false;
    return [
      {
        externalId: h.objectID,
        url: itemUrl(h.objectID),
        title: story ? (h.title ?? null) : h.story_title ? `On: ${h.story_title}` : null,
        text: shorten(hnHtmlToText(story ? h.story_text : h.comment_text)),
        kind: story ? ("story" as const) : ("comment" as const),
        postedAt: h.created_at_i ? new Date(h.created_at_i * 1000) : null,
        engagement: story ? (h.points ?? 0) + (h.num_comments ?? 0) : null,
      },
    ];
  });
}

export function hnNumbers(user: HnUser, search: HnSearch, now = new Date(), username = user.username ?? ""): AccountNumbers {
  const stories = search.hits.filter((h) => h._tags?.includes("story")).slice(0, RECENT_POSTS);
  return {
    followers: null, // HN has no followers
    totalPosts: search.nbHits ?? null, // stories and comments
    karma: user.karma ?? null,
    postsLast7: inLastWeek(search.hits.map((h) => (h.created_at_i ? new Date(h.created_at_i * 1000) : null)), now),
    // Algolia doesn't give comment points; engagement is points + comments on stories.
    avgEngagement: average(stories.map((h) => (h.points ?? 0) + (h.num_comments ?? 0))),
    url: username ? `https://news.ycombinator.com/user?id=${username}` : null,
  };
}

async function fetchHackerNews(handle: string, now: Date): Promise<AccountRead> {
  const user = await getJson<HnUser>(`${ALGOLIA}/users/${encodeURIComponent(handle)}`);
  if (user.karma == null) throw new Error(`No Hacker News user named ${handle}`);
  const search = await getJson<HnSearch>(`${ALGOLIA}/search_by_date?${new URLSearchParams({ tags: `(story,comment),author_${handle}`, hitsPerPage: "50" })}`);
  return { numbers: hnNumbers(user, search, now, handle), posts: hnPosts(search) };
}

// --- Reddit --------------------------------------------------------------------------------------

/**
 * Reddit through the user's public overview feed (posts and comments). The feed carries no vote
 * counts and `about.json` answers 403 without the API, so only posting frequency is known.
 */
export function redditNumbers(entries: FeedEntry[], now = new Date()): AccountNumbers {
  return { followers: null, totalPosts: null, karma: null, postsLast7: inLastWeek(entries.map((e) => e.postedAt), now), avgEngagement: null, url: null };
}

export function redditPosts(entries: FeedEntry[]): AccountPost[] {
  return entries.map((e) => ({
    externalId: e.externalId,
    url: e.url,
    title: e.title ? `${e.title}${e.community ? ` (r/${e.community})` : ""}` : e.community ? `In r/${e.community}` : null,
    text: shorten(e.body),
    kind: e.kind === "comment" ? ("comment" as const) : ("post" as const),
    postedAt: e.postedAt,
    engagement: null,
  }));
}

async function fetchReddit(handle: string, now: Date, signal?: AbortSignal): Promise<AccountRead> {
  // One feed request, through the shared ~1 request/minute limiter.
  const xml = await fetchFeed(`https://www.reddit.com/user/${encodeURIComponent(handle)}/.rss?limit=100`, signal);
  const entries = parseRedditFeed(xml);
  return { numbers: redditNumbers(entries, now), posts: redditPosts(entries) };
}

// --- Feeds ---------------------------------------------------------------------------------------

export const feedPosts = (posts: FeedPost[]): AccountPost[] => posts.map((p) => ({ ...p, kind: "article" as const, engagement: null }));

/** Reads one account's public numbers and recent posts now (a feed has posts only). */
export async function fetchAccount(channel: BenchmarkChannel, handle: string, opts: { now?: Date; signal?: AbortSignal } = {}): Promise<AccountRead> {
  const now = opts.now ?? new Date();
  switch (channel) {
    case "bluesky":
      return fetchBluesky(handle, now);
    case "mastodon":
      return fetchMastodon(handle, now);
    case "hackernews":
      return fetchHackerNews(handle, now);
    case "reddit":
      return fetchReddit(handle, now, opts.signal);
    case "rss":
      return { numbers: null, posts: feedPosts((await fetchFeedPosts(handle, opts.signal)).posts) };
    case "x":
      throw new Error("X isn't benchmarked: Startica doesn't look up accounts on X");
  }
}
