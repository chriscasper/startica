import { getJson, HttpError, withTopReplies } from "./http.ts";
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation, RawReply, ReplyThread } from "./types.ts";

/**
 * Bluesky through its public AppView API, no account needed. Search works on
 * api.bsky.app (the cached public.api.bsky.app host refuses searchPosts); threads
 * and engagement use public.api.bsky.app. Keyword search only: Bluesky has no
 * communities in the Reddit sense.
 */

const SEARCH_API = "https://api.bsky.app/xrpc";
const PUBLIC_API = "https://public.api.bsky.app/xrpc";
const MAX_KEYWORDS = 10;
const PER_KEYWORD = 25;

export type BskyPost = {
  uri: string;
  author: { did: string; handle: string };
  record: { text?: string; createdAt?: string; reply?: unknown };
  likeCount?: number;
  replyCount?: number;
};
export type ThreadNode = { post?: BskyPost; replies?: ThreadNode[]; notFound?: boolean };

/** at://<did>/app.bsky.feed.post/<rkey> → https://bsky.app/profile/<handle or did>/post/<rkey> */
export function bskyWebUrl(uri: string, handle?: string): string | null {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? `https://bsky.app/profile/${handle ?? m[1]}/post/${m[2]}` : null;
}

/** https://bsky.app/profile/<handle>/post/<rkey> → at://<handle>/app.bsky.feed.post/<rkey> (the API accepts handles). */
export function bskyAtUri(url: string): string | null {
  const m = /bsky\.app\/profile\/([^/?#]+)\/post\/([^/?#]+)/i.exec(url);
  return m ? `at://${m[1]}/app.bsky.feed.post/${m[2]}` : null;
}

export function fromBskyPost(p: BskyPost): RawConversation {
  return {
    channel: "bluesky",
    externalId: p.uri,
    url: bskyWebUrl(p.uri, p.author.handle) ?? p.uri,
    kind: p.record.reply ? "comment" : "post",
    community: null,
    author: p.author.handle,
    title: null,
    threadTitle: null,
    body: p.record.text ?? "",
    postedAt: p.record.createdAt ? new Date(p.record.createdAt) : null,
    score: p.likeCount ?? null,
    numComments: p.replyCount ?? null,
  };
}

const REPLY_DEPTH = 6;

/** Every reply in a getPostThread answer, each filed under the post it answers. */
export function bskyReplies(thread: ThreadNode): ReplyThread {
  const root = thread.post;
  if (!root || thread.notFound) return { engagement: { score: null, replies: null, removed: true }, ownerAuthor: null, replies: [] };
  const replies: RawReply[] = [];
  const walk = (node: ThreadNode) => {
    for (const child of node.replies ?? []) {
      if (!child.post) continue;
      replies.push({ ...fromBskyPost(child.post), kind: "comment", inReplyTo: node.post!.uri });
      walk(child);
    }
  };
  walk(thread);
  return { engagement: { score: root.likeCount ?? null, replies: root.replyCount ?? null, removed: false }, ownerAuthor: root.author.handle, replies };
}

export const bluesky: ChannelAdapter = {
  channel: "bluesky",

  async discover(query: ListeningQuery) {
    const found = new Map<string, RawConversation>();
    for (const keyword of query.keywords.slice(0, MAX_KEYWORDS)) {
      const q = keyword.includes(" ") ? `"${keyword}"` : keyword;
      const params = new URLSearchParams({ q, sort: "latest", since: query.since.toISOString(), limit: String(PER_KEYWORD) });
      try {
        const data = await getJson<{ posts: BskyPost[] }>(`${SEARCH_API}/app.bsky.feed.searchPosts?${params}`);
        for (const post of data.posts) {
          const c = fromBskyPost(post);
          if (c.postedAt && c.postedAt < query.since) continue;
          if (!found.has(c.externalId)) found.set(c.externalId, c);
        }
      } catch {
        // One failed keyword shouldn't stop the scan.
      }
    }
    return [...found.values()];
  },

  async fetchThread(url: string) {
    const uri = bskyAtUri(url);
    if (!uri) return null;
    const data = await getJson<{ thread: ThreadNode }>(`${PUBLIC_API}/app.bsky.feed.getPostThread?${new URLSearchParams({ uri, depth: "1" })}`);
    if (!data.thread.post) return null;
    const post = fromBskyPost(data.thread.post);
    const replies = (data.thread.replies ?? []).flatMap((r) => (r.post ? [{ author: r.post.author.handle, text: r.post.record.text ?? "" }] : []));
    return { ...post, body: withTopReplies(post.body, replies) };
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const uri = bskyAtUri(url);
    if (!uri) return null;
    // getPostThread accepts handle-form at:// URIs (getPosts doesn't) and says when a post is gone.
    try {
      const data = await getJson<{ thread: ThreadNode }>(`${PUBLIC_API}/app.bsky.feed.getPostThread?${new URLSearchParams({ uri, depth: "0", parentHeight: "0" })}`);
      const post = data.thread.post;
      return post && !data.thread.notFound ? { score: post.likeCount ?? null, replies: post.replyCount ?? null, removed: false } : { score: null, replies: null, removed: true };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 400 || error.status === 404)) return { score: null, replies: null, removed: true };
      throw error;
    }
  },

  async fetchReplies(url: string): Promise<ReplyThread | null> {
    const uri = bskyAtUri(url);
    if (!uri) return null;
    try {
      const data = await getJson<{ thread: ThreadNode }>(`${PUBLIC_API}/app.bsky.feed.getPostThread?${new URLSearchParams({ uri, depth: String(REPLY_DEPTH), parentHeight: "0" })}`);
      return bskyReplies(data.thread);
    } catch (error) {
      if (error instanceof HttpError && (error.status === 400 || error.status === 404)) return { engagement: { score: null, replies: null, removed: true }, ownerAuthor: null, replies: [] };
      throw error;
    }
  },
};
