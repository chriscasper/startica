import { parseHTML } from "linkedom";
import { USER_AGENT } from "../intel/crawl.ts";
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation } from "./types.ts";

// Algolia's public HN API: https://hn.algolia.com/api
const API = "https://hn.algolia.com/api/v1";
const HITS_PER_KEYWORD = 20;
const MAX_KEYWORDS = 20;

type Hit = {
  objectID: string;
  _tags?: string[];
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  author?: string | null;
  created_at_i?: number;
  points?: number | null;
  num_comments?: number | null;
};

type Item = {
  id: number;
  type: "story" | "comment" | string;
  title: string | null;
  text: string | null;
  author: string | null;
  created_at_i: number;
  points: number | null;
  story_id: number | null;
  children: Item[];
};

/** HN bodies are HTML fragments with entities; turn them into plain text with paragraphs. */
export function hnHtmlToText(html: string | null | undefined): string {
  if (!html) return "";
  const withBreaks = html.replace(/<p>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  const { document } = parseHTML(`<!doctype html><html><body>${withBreaks}</body></html>`);
  return (document.body?.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export function itemUrl(id: string | number) {
  return `https://news.ycombinator.com/item?id=${id}`;
}

export function parseItemId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "news.ycombinator.com") return null;
    const id = u.searchParams.get("id");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HN API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function fromHit(hit: Hit): RawConversation {
  const isComment = hit._tags?.includes("comment") ?? false;
  return {
    channel: "hackernews",
    externalId: hit.objectID,
    url: itemUrl(hit.objectID),
    kind: isComment ? "comment" : "post",
    community: "Hacker News",
    author: hit.author ?? null,
    title: isComment ? null : (hit.title ?? null),
    threadTitle: isComment ? (hit.story_title ?? null) : null,
    body: hnHtmlToText(isComment ? hit.comment_text : hit.story_text),
    postedAt: hit.created_at_i ? new Date(hit.created_at_i * 1000) : null,
    score: hit.points ?? null,
    numComments: hit.num_comments ?? null,
  };
}

async function fetchItem(id: string): Promise<Item> {
  return getJson<Item>(`${API}/items/${id}`);
}

export const hackerNews: ChannelAdapter = {
  channel: "hackernews",

  async discover(query: ListeningQuery) {
    const since = Math.floor(query.since.getTime() / 1000);
    const found = new Map<string, RawConversation>();
    for (const keyword of query.keywords.slice(0, MAX_KEYWORDS)) {
      const params = new URLSearchParams({
        query: keyword,
        tags: "(story,comment)",
        numericFilters: `created_at_i>${since}`,
        hitsPerPage: String(HITS_PER_KEYWORD),
      });
      const data = await getJson<{ hits: Hit[] }>(`${API}/search_by_date?${params}`);
      for (const hit of data.hits) {
        if (!found.has(hit.objectID)) found.set(hit.objectID, fromHit(hit));
      }
    }
    // Skip empty items (e.g. link-only stories with no discussion text and no title match).
    return [...found.values()].filter((c) => c.body.length > 0 || c.title);
  },

  async fetchThread(url: string) {
    const id = parseItemId(url);
    if (!id) return null;
    const item = await fetchItem(id);
    const isComment = item.type === "comment";
    const story = isComment && item.story_id ? await fetchItem(String(item.story_id)) : null;
    return {
      channel: "hackernews",
      externalId: String(item.id),
      url: itemUrl(item.id),
      kind: isComment ? "comment" : "post",
      community: "Hacker News",
      author: item.author,
      title: isComment ? null : item.title,
      threadTitle: story?.title ?? null,
      body: hnHtmlToText(item.text),
      postedAt: new Date(item.created_at_i * 1000),
      score: item.points,
      numComments: item.children.length,
    };
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const id = parseItemId(url);
    if (!id) return null;
    const item = await fetchItem(id);
    // HN hides comment points; replies are the useful signal. Deleted items come back without text.
    return { score: item.points, replies: item.children.length, removed: !item.text && !item.title };
  },
};

/** A Hacker News user's recent stories and comments (for the voice bank). */
export async function fetchHnUserWriting(username: string): Promise<{ text: string; url: string; postedAt: Date | null }[]> {
  const params = new URLSearchParams({ tags: `(story,comment),author_${username.trim()}`, hitsPerPage: "40" });
  const data = await getJson<{ hits: Hit[] }>(`${API}/search_by_date?${params}`);
  return data.hits
    .map((hit) => {
      const c = fromHit(hit);
      return { text: [c.title, c.body].filter(Boolean).join("\n\n").trim(), url: c.url, postedAt: c.postedAt };
    })
    .filter((s) => s.text.length >= 40);
}
