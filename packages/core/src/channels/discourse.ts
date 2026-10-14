import { hnHtmlToText as htmlToText } from "./hackernews.ts";
import { forumBase } from "./formats.ts";
import { getJson, HttpError, withTopReplies } from "./http.ts";

export { forumBase };
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation } from "./types.ts";

/**
 * Discourse forums through each forum's public JSON (no account). A watched
 * community is one forum: its address goes in the community's URL (or name).
 * Each scan reads the forum's latest topics plus up to 3 keyword searches.
 * Anonymous requests are limited (about 15 a minute per IP by default), so
 * requests to a forum are spaced out.
 */

// Worst case per forum: 1 latest + 6 topics + 3 searches + 3×4 posts = 22 requests,
// ≈1.7 minutes at the gap below; 5 forums ≈ 8 minutes, well inside listen_scan's lease
// alongside Reddit's ≈1 request a minute.
const MAX_FORUMS = 5;
const MAX_KEYWORDS = 3;
const MAX_NEW_TOPICS = 6; // per forum per scan: each one costs a request for its first post
const MAX_SEARCH_POSTS = 4;
const GAP_MS = 4_500; // ≈13 requests a minute per forum

type TopicPost = { id: number; post_number: number; username: string; cooked: string; created_at: string; reply_count?: number; reply_to_post_number?: number | null; actions_summary?: { id: number; count?: number }[] };
type Topic = { id: number; slug: string; title: string; created_at: string; posts_count: number; post_stream: { posts: TopicPost[] } };
type LatestTopic = { id: number; slug: string; title: string; created_at: string; posts_count: number };
type SearchPost = { id: number; topic_id: number; post_number: number; username: string; created_at: string; blurb: string };
type SinglePost = TopicPost & { topic_id: number; topic_slug: string; raw?: string; deleted_at?: string | null; hidden?: boolean };


/** A topic or post link: …/t/<slug>/<topic id>[/<post number>]. */
export function parseTopicUrl(url: string): { base: string; topicId: number; postNumber: number } | null {
  const m = /^(https?:\/\/[^?#]+?)\/t\/(?:[^/?#]+\/)?(\d+)(?:\/(\d+))?\/?(?:[?#].*)?$/i.exec(url);
  return m ? { base: m[1]!, topicId: Number(m[2]), postNumber: m[3] ? Number(m[3]) : 1 } : null;
}

const postUrl = (base: string, slug: string, topicId: number, postNumber: number) =>
  postNumber > 1 ? `${base}/t/${slug}/${topicId}/${postNumber}` : `${base}/t/${slug}/${topicId}`;

export const likesOf = (post: { actions_summary?: { id: number; count?: number }[] }) => post.actions_summary?.find((a) => a.id === 2)?.count ?? 0;

function conversation(base: string, community: string | null, topic: { id: number; slug: string; title: string }, post: { id: number; post_number: number; username: string; created_at: string; reply_count?: number }, body: string, likes: number | null): RawConversation {
  return {
    channel: "discourse",
    externalId: `${new URL(base).host}${new URL(base).pathname}:p${post.id}`,
    url: postUrl(base, topic.slug, topic.id, post.post_number),
    kind: post.post_number === 1 ? "post" : "comment",
    community,
    author: post.username,
    title: post.post_number === 1 ? topic.title : null,
    threadTitle: post.post_number === 1 ? null : topic.title,
    body,
    postedAt: new Date(post.created_at),
    score: likes,
    numComments: post.reply_count ?? null,
  };
}

/** Spaces requests to each forum so a scan stays under anonymous rate limits. */
const nextAt = new Map<string, number>();
async function paced<T>(base: string, url: string): Promise<T> {
  const host = new URL(base).host;
  const wait = (nextAt.get(host) ?? 0) - Date.now();
  nextAt.set(host, Math.max(Date.now(), nextAt.get(host) ?? 0) + GAP_MS);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return getJson<T>(url);
}

export const discourse: ChannelAdapter = {
  channel: "discourse",

  async discover(query: ListeningQuery) {
    const found = new Map<string, RawConversation>();
    const keep = (c: RawConversation) => {
      if (c.postedAt && c.postedAt < query.since) return;
      if (!found.has(c.externalId)) found.set(c.externalId, c);
    };
    for (const c of query.communities.slice(0, MAX_FORUMS)) {
      const base = forumBase(c.url ?? c.name);
      if (!base) continue;
      try {
        // New topics: the first post's text comes from the topic itself.
        const latest = await paced<{ topic_list: { topics: LatestTopic[] } }>(base, `${base}/latest.json`);
        const fresh = latest.topic_list.topics.filter((t) => new Date(t.created_at) >= query.since).slice(0, MAX_NEW_TOPICS);
        for (const t of fresh) {
          const topic = await paced<Topic>(base, `${base}/t/${t.id}.json`);
          const first = topic.post_stream.posts.find((p) => p.post_number === 1);
          if (first) keep(conversation(base, c.name, topic, first, htmlToText(first.cooked), likesOf(first)));
        }
        // Keyword searches catch replies inside older topics too.
        for (const keyword of query.keywords.slice(0, MAX_KEYWORDS)) {
          const q = `${keyword.includes(" ") ? `"${keyword}"` : keyword} order:latest`;
          const results = await paced<{ posts?: SearchPost[]; topics?: LatestTopic[] }>(base, `${base}/search.json?${new URLSearchParams({ q })}`);
          const topics = new Map((results.topics ?? []).map((t) => [t.id, t]));
          for (const p of (results.posts ?? []).filter((p) => new Date(p.created_at) >= query.since).slice(0, MAX_SEARCH_POSTS)) {
            const topic = topics.get(p.topic_id);
            if (!topic) continue;
            const full = await paced<SinglePost>(base, `${base}/posts/${p.id}.json`).catch(() => null);
            keep(conversation(base, c.name, topic, p, full?.raw ?? htmlToText(full?.cooked ?? p.blurb), full ? likesOf(full) : null));
          }
        }
      } catch {
        // A forum that's down, private or rate-limiting shouldn't stop the scan.
      }
    }
    return [...found.values()];
  },

  async fetchThread(url: string) {
    const ref = parseTopicUrl(url);
    if (!ref) return null;
    const topic = await getJson<Topic>(`${ref.base}/t/${ref.topicId}.json`);
    // A topic's JSON only carries its first ~20 posts; a later reply is fetched on its own.
    const post =
      topic.post_stream.posts.find((p) => p.post_number === ref.postNumber) ??
      (await getJson<SinglePost>(`${ref.base}/posts/by_number/${ref.topicId}/${ref.postNumber}.json`).catch(() => null));
    if (!post) return null;
    const conv = conversation(ref.base, new URL(ref.base).host, topic, post, htmlToText(post.cooked), likesOf(post));
    const replies = topic.post_stream.posts
      .filter((p) => p.post_number !== post.post_number && (post.post_number === 1 || p.reply_to_post_number === post.post_number))
      .map((p) => ({ author: p.username, text: htmlToText(p.cooked) }));
    return { ...conv, body: withTopReplies(conv.body, replies) };
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const ref = parseTopicUrl(url);
    if (!ref) return null;
    try {
      const post = await getJson<SinglePost>(`${ref.base}/posts/by_number/${ref.topicId}/${ref.postNumber}.json`);
      return { score: likesOf(post), replies: post.reply_count ?? null, removed: Boolean(post.deleted_at || post.hidden) };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return { score: null, replies: null, removed: true };
      throw error;
    }
  },
};
