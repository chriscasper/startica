import { hnHtmlToText as htmlToText } from "./hackernews.ts";
import { parseTagCommunity } from "./formats.ts";
import { getJson, HttpError, withTopReplies } from "./http.ts";

export { parseTagCommunity };
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation, RawReply, ReplyThread } from "./types.ts";

/**
 * Mastodon (and other fediverse servers with the Mastodon API) without an account.
 * Unauthenticated status search returns nothing, so listening follows hashtag
 * timelines: each watched community is a hashtag on a server, written
 * "#photography@mastodon.social" (the server defaults to mastodon.social).
 * Posts are linked and read through the server they were found on (its own id for
 * the post), not the author's home server: that one may be slow or unreachable,
 * and the finding server just answered. The post's global uri stays its id, for
 * dedupe and for replying from the user's own server (assisted posting).
 */

const MAX_TAGS = 10;
const PER_TAG = 40;

export type Status = {
  id: string;
  uri: string;
  url: string | null;
  content: string;
  created_at: string;
  in_reply_to_id: string | null;
  replies_count: number;
  favourites_count: number;
  account: { acct: string };
};


/** A status link on its server: https://server/@user/123 or https://server/users/user/statuses/123. */
export function parseStatusUrl(url: string): { server: string; id: string } | null {
  const m = /^https?:\/\/([^/]+)\/(?:@[\w.-]+(?:@[\w.-]+)?|users\/[\w.-]+\/statuses)\/(\d+)\/?(?:[?#].*)?$/i.exec(url);
  return m ? { server: m[1]!.toLowerCase(), id: m[2]! } : null;
}

export function fromStatus(s: Status, server: string, community: string | null): RawConversation {
  const acct = s.account.acct.includes("@") ? s.account.acct : `${s.account.acct}@${server}`;
  return {
    channel: "mastodon",
    externalId: s.uri, // the same post seen through different servers has one uri
    // On the server that returned it (works for remote posts too: /@user@host/<local id>).
    url: `https://${server}/@${s.account.acct}/${s.id}`,
    kind: s.in_reply_to_id ? "comment" : "post",
    community,
    author: acct,
    title: null,
    threadTitle: null,
    body: htmlToText(s.content),
    postedAt: new Date(s.created_at),
    score: s.favourites_count,
    numComments: s.replies_count,
  };
}

/** The replies below a status (its context's descendants), each filed under the global uri of the status it answers. */
export function mastodonReplies(status: Status, descendants: Status[], server: string): ReplyThread {
  const uriOf = new Map([status, ...descendants].map((s) => [s.id, s.uri]));
  const replies: RawReply[] = descendants.map((d) => ({ ...fromStatus(d, server, null), inReplyTo: (d.in_reply_to_id && uriOf.get(d.in_reply_to_id)) || status.uri }));
  return {
    engagement: { score: status.favourites_count, replies: status.replies_count, removed: false },
    ownerAuthor: fromStatus(status, server, null).author,
    replies,
  };
}

export const mastodon: ChannelAdapter = {
  channel: "mastodon",

  async discover(query: ListeningQuery) {
    const found = new Map<string, RawConversation>();
    for (const c of query.communities.slice(0, MAX_TAGS)) {
      const parsed = parseTagCommunity(c.name, c.url);
      if (!parsed) continue;
      try {
        const statuses = await getJson<Status[]>(`https://${parsed.server}/api/v1/timelines/tag/${encodeURIComponent(parsed.tag)}?limit=${PER_TAG}`);
        for (const s of statuses) {
          const conv = fromStatus(s, parsed.server, `#${parsed.tag}@${parsed.server}`);
          if (conv.postedAt && conv.postedAt < query.since) continue;
          if (!found.has(conv.externalId)) found.set(conv.externalId, conv);
        }
      } catch {
        // A server that's down or blocks the request shouldn't stop the scan.
      }
    }
    return [...found.values()];
  },

  async fetchThread(url: string) {
    const ref = parseStatusUrl(url);
    if (!ref) return null;
    const base = `https://${ref.server}/api/v1/statuses/${ref.id}`;
    const [status, context] = await Promise.all([getJson<Status>(base), getJson<{ descendants: Status[] }>(`${base}/context`).catch(() => ({ descendants: [] }))]);
    const conv = fromStatus(status, ref.server, null);
    const replies = context.descendants.filter((d) => d.in_reply_to_id === status.id).map((d) => ({ author: d.account.acct, text: htmlToText(d.content) }));
    return { ...conv, body: withTopReplies(conv.body, replies) };
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const ref = parseStatusUrl(url);
    if (!ref) return null;
    try {
      const s = await getJson<Status>(`https://${ref.server}/api/v1/statuses/${ref.id}`);
      return { score: s.favourites_count, replies: s.replies_count, removed: false };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return { score: null, replies: null, removed: true };
      throw error;
    }
  },

  async fetchReplies(url: string): Promise<ReplyThread | null> {
    const ref = parseStatusUrl(url);
    if (!ref) return null;
    const base = `https://${ref.server}/api/v1/statuses/${ref.id}`;
    try {
      const status = await getJson<Status>(base);
      const context = await getJson<{ descendants: Status[] }>(`${base}/context`);
      return mastodonReplies(status, context.descendants, ref.server);
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return { engagement: { score: null, replies: null, removed: true }, ownerAuthor: null, replies: [] };
      throw error;
    }
  },
};
