import { getSetting, setSetting } from "@startica/db/bootstrap";
import { readSecretByName } from "@startica/db/secrets";
import { HttpError } from "./http.ts";
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation } from "./types.ts";

/**
 * X through the official API v2 with the user's own bearer token (Settings → Channels → X API).
 * X bills every post read (pay-per-use, about $0.005 each in 2026), so this adapter
 * rations itself: it scans at most every few hours, folds the top keywords into one
 * query, continues from the newest post it already has (since_id), skips user
 * lookups (they cost twice as much; links use x.com/i/status/<id>), and stops at a
 * daily read cap. Pasted X links and engagement checks count toward the cap too.
 * Without a token the adapter does nothing and X stays paste-only.
 */

export const X_TOKEN_SECRET = "x_api_bearer_token";
export const X_SETTINGS = "x_api";
export type XSettings = { dailyReads: number; scanHours: number };
export const X_DEFAULTS: XSettings = { dailyReads: 100, scanHours: 6 };
/** About what X charges per post read (USD), for the estimate in Settings. */
export const X_COST_PER_READ = 0.005;

const API = "https://api.x.com/2";
const MAX_KEYWORDS = 3;
// Never more per scan than the scan stores from one source (MAX_NEW_PER_SOURCE in
// distribution/jobs.ts), so no read is paid for and dropped. When more posts match,
// the newest are taken and older ones skipped: fresh conversations are what matter.
const MAX_PER_SCAN = 50;
const ERROR = "x_api_error";
const MAX_QUERY = 512;
const FIELDS = "created_at,public_metrics,referenced_tweets,conversation_id";

type Tweet = {
  id: string;
  text: string;
  created_at?: string;
  referenced_tweets?: { type: "replied_to" | "quoted" | "retweeted"; id: string }[];
  public_metrics?: { reply_count?: number; like_count?: number; retweet_count?: number; repost_count?: number };
};
type Usage = { day: string; reads: number };
type State = { lastScanAt: number; sinceId: string | null };

const today = () => new Date().toISOString().slice(0, 10); // X's billing day is UTC
const USAGE = "x_api_usage";
// Scan state per query, so each product's keywords keep their own schedule and since_id.
const stateKey = (q: string) => `x_api_state:${q}`;

/** The last X API error (a search, a pasted link or an engagement check), shown in Settings → Channels → X API. */
export async function xLastError(): Promise<{ message: string; at: number } | null> {
  return (await getSetting<{ message: string; at: number } | null>(ERROR)) ?? null;
}

/** Whether a token is saved in Settings. */
export async function xEnabled(): Promise<boolean> {
  return Boolean(await readSecretByName(X_TOKEN_SECRET).catch(() => null));
}

export async function xSettings(): Promise<XSettings> {
  return { ...X_DEFAULTS, ...((await getSetting<Partial<XSettings>>(X_SETTINGS)) ?? {}) };
}

/** Reads used today (UTC) and the cap. */
export async function xUsage(): Promise<{ reads: number; cap: number }> {
  const [usage, settings] = await Promise.all([getSetting<Usage>(USAGE), xSettings()]);
  return { reads: usage?.day === today() ? usage.reads : 0, cap: settings.dailyReads };
}

async function addReads(n: number) {
  const { reads } = await xUsage();
  await setSetting(USAGE, { day: today(), reads: reads + n } satisfies Usage);
}

async function token(): Promise<string | null> {
  return readSecretByName(X_TOKEN_SECRET).catch(() => null);
}

async function call<T>(path: string, bearer: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${bearer}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new HttpError(res.status, `${API}${path.split("?")[0]}`);
  return (await res.json()) as T;
}

/** Records an X API error for Settings → Channels → X API (no credits, a revoked token, rate limits) and returns null. */
async function failed(error: unknown): Promise<null> {
  const status = error instanceof HttpError ? error.status : 0;
  const message =
    status === 401 || status === 403
      ? "X refused the token (revoked or without access)"
      : status === 402
        ? "No X API credits left"
        : status === 429
          ? "X rate limit; Startica tries again later"
          : error instanceof Error
            ? error.message
            : String(error);
  await setSetting(ERROR, { message, at: Date.now() });
  return null;
}

export const tweetUrl = (id: string) => `https://x.com/i/status/${id}`;
const tweetId = (url: string) => /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i.exec(url)?.[1] ?? null;

export function fromTweet(t: Tweet): RawConversation {
  return {
    channel: "x",
    externalId: t.id,
    url: tweetUrl(t.id),
    kind: t.referenced_tweets?.some((r) => r.type === "replied_to") ? "comment" : "post",
    community: null,
    author: null, // a user lookup per post would double the cost
    title: null,
    threadTitle: null,
    body: t.text,
    postedAt: t.created_at ? new Date(t.created_at) : null,
    score: t.public_metrics?.like_count ?? null,
    numComments: t.public_metrics?.reply_count ?? null,
  };
}

/** The top keywords as one recent-search query (≤ 512 characters), without reposts. */
export function xQuery(keywords: string[]): string | null {
  const terms: string[] = [];
  for (const k of keywords.slice(0, MAX_KEYWORDS)) {
    const term = /\s/.test(k.trim()) ? `"${k.trim().replace(/"/g, "")}"` : k.trim();
    const next = [...terms, term];
    if (`(${next.join(" OR ")}) -is:retweet`.length > MAX_QUERY) break;
    terms.push(term);
  }
  return terms.length ? `(${terms.join(" OR ")}) -is:retweet` : null;
}

export const x: ChannelAdapter = {
  channel: "x",

  async discover(query: ListeningQuery) {
    const bearer = await token();
    const q = xQuery(query.keywords);
    if (!bearer || !q) return [];
    const [settings, state, usage] = await Promise.all([xSettings(), getSetting<State>(stateKey(q)), xUsage()]);
    if (state && Date.now() - state.lastScanAt < settings.scanHours * 3600_000) return [];
    const remaining = usage.cap - usage.reads;
    if (remaining < 10) return []; // the API returns at least 10 per request
    const params = new URLSearchParams({ query: q, max_results: String(Math.min(MAX_PER_SCAN, remaining)), "tweet.fields": FIELDS, sort_order: "recency" });
    if (state?.sinceId) params.set("since_id", state.sinceId);
    else params.set("start_time", query.since.toISOString());
    let data: { data?: Tweet[]; meta?: { result_count?: number; newest_id?: string } };
    try {
      data = await call(`/tweets/search/recent?${params}`, bearer);
      await setSetting(ERROR, null);
    } catch (error) {
      await failed(error);
      return [];
    }
    await addReads(data.meta?.result_count ?? data.data?.length ?? 0);
    await setSetting(stateKey(q), { lastScanAt: Date.now(), sinceId: data.meta?.newest_id ?? state?.sinceId ?? null } satisfies State);
    return (data.data ?? []).map(fromTweet);
  },

  async fetchThread(url: string) {
    const id = tweetId(url);
    const bearer = await token();
    if (!id || !bearer) return null;
    const { reads, cap } = await xUsage();
    if (reads >= cap) return null;
    const data = await call<{ data?: Tweet }>(`/tweets/${id}?tweet.fields=${FIELDS}`, bearer).catch(failed);
    if (!data) return null;
    await addReads(1);
    return data.data ? fromTweet(data.data) : null;
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const id = tweetId(url);
    const bearer = await token();
    if (!id || !bearer) return null;
    const { reads, cap } = await xUsage();
    if (reads >= cap) return null;
    const data = await call<{ data?: Tweet; errors?: { type?: string }[] }>(`/tweets/${id}?tweet.fields=public_metrics`, bearer).catch(failed);
    if (!data) return null;
    await addReads(1);
    if (!data.data) return { score: null, replies: null, removed: true };
    return { score: data.data.public_metrics?.like_count ?? null, replies: data.data.public_metrics?.reply_count ?? null, removed: false };
  },
};
