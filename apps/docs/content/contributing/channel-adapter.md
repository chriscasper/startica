---
title: Add a channel adapter
description: Add a new place where Startica finds conversations, using the ChannelAdapter interface, with tests against saved fixtures.
layout: doc
---

A channel adapter teaches Startica to find conversations on a new platform, read a pasted link from it, and check engagement on replies posted there. Startica ships six:

| Adapter | File | Reads through |
|---|---|---|
| Reddit | `reddit.ts` | Public RSS feeds, serialized and rate-limited |
| Hacker News | `hackernews.ts` | The Algolia HN Search API |
| Bluesky | `bluesky.ts` | Bluesky's public AppView API (keyword search) |
| Mastodon | `mastodon.ts` | Each server's public API (hashtag timelines per watched `#tag@server`) |
| Discourse | `discourse.ts` | Each forum's public JSON, paced under anonymous rate limits |
| X | `x.ts` | The official X API v2 with the user's own paid token, rationed (does nothing without a token) |

This page walks through adding another.

> [!WARNING]
> Adapters only read through an official API or a public feed the platform offers for that purpose. No scraping, no unofficial endpoints, no headless browsers, and no posting: adapters only read. Posting is the user's job, by copy-and-open or in the [posting window](/guides/assisted-posting), and isn't part of an adapter. Open a Discussion before you start, and say which API you'll use and what its terms, costs and rate limits are.

## How adapters are used

Adapters live in `packages/core/src/channels/`. Three places call them:

- **Listening** (`listen_scan` job, hourly): for each product, `runListenScan()` in `packages/core/src/distribution/jobs.ts` calls `discover()` on every registered adapter, one after another in registration order, with the product's listening keywords and the communities the user marked as watched on that channel. Each adapter runs in its own `try`/`catch`, so one that throws (a forum down, X out of credits) is skipped and the error lands in the job run's result. New conversations are stored (deduplicated on channel and external id) and queued for scoring as soon as that adapter is done. At most 60 new conversations per product and per source are kept per scan (`MAX_NEW_PER_SOURCE`).
- **Paste a link** (Inbox): `importLink()` in `apps/desktop-web/src/app/(app)/inbox/actions.ts` picks the channel with `channelFromUrl()` and calls `fetchThread()`. If there's no adapter or it returns `null`, the user must paste the text too.
- **Engagement** (`engagement_sync` job, every 6 hours): for each posted reply or content piece with a link, `fetchEngagement()` is called on the adapter for that link's channel (again via `channelFromUrl()`).

## The interface

From `packages/core/src/channels/types.ts`:

```ts
export type { Channel } from "@startica/db/schema";

export type RawConversation = {
  channel: Channel;
  externalId: string;
  url: string;
  kind: "post" | "comment";
  community: string | null;
  author: string | null;
  title: string | null;
  threadTitle: string | null;
  body: string;
  postedAt: Date | null;
  score: number | null;
  numComments: number | null;
};

export type ListeningQuery = {
  keywords: string[];
  /** Watched communities on this adapter's channel: a subreddit name, a "#tag@server" for Mastodon, a forum for Discourse (its URL). */
  communities: { name: string; url: string | null }[];
  since: Date;
};

export type Engagement = { score: number | null; replies: number | null; removed: boolean };

export interface ChannelAdapter {
  channel: Channel;
  discover(query: ListeningQuery): Promise<RawConversation[]>;
  fetchThread(url: string): Promise<RawConversation | null>;
  fetchEngagement?(url: string): Promise<Engagement | null>;
}
```

What each field should hold:

| Field | Meaning |
|---|---|
| `externalId` | The platform's stable id. Together with `channel` it's the unique key, so the same post found twice is stored once. Mastodon uses the post's global URI, so the same post seen through two servers is one conversation. |
| `url` | Canonical link to the post or comment. Users open it to reply, and engagement checks read it later. |
| `kind` | `"post"` for a thread starter, `"comment"` for a reply inside a thread |
| `community` | Where it was posted, in the same form the user writes the community on the **Intel** page (a subreddit name without `r/`, `#tag@server`, a forum's name), or `null`. Drafting looks up the community's self-promotion rules with `matchCommunity()` in `distribution/jobs.ts`: by the forum's address for Discourse (from the conversation's `url`), by the normalized hashtag (with or without `@server`) for Mastodon, and by name for everything else. If your channel needs different matching, add a case there. |
| `title` / `threadTitle` | `title` for posts. For comments, `title` is `null` and `threadTitle` is the parent thread's title, if you can get it. |
| `author` | The author's handle, or `null` if getting it would cost extra (the X adapter skips user lookups) |
| `body` | Plain text, not HTML. Scoring reads the first 6,000 characters. |
| `postedAt` | When it was posted. Conversations older than 7 days aren't scored. |
| `score`, `numComments` | Platform numbers if the source has them, otherwise `null` |

## Step 1: Add the channel id

There is one list of channels: the `channels` array in `packages/db/src/schema.ts`. The `Channel` type, the Intel community form, the intel prompt's output schema and the UI's select options all derive from it.

```ts
export const channels = ["reddit", "hackernews", "x", "linkedin", "facebook", "mastodon", "bluesky", "discourse", "other"] as const;
```

If Content Studio should also write for the channel, add it to `contentChannels` in the same file.

SQLite doesn't enforce these enums (they're TypeScript-only), so adding a value needs no migration. Run `yarn db:generate` anyway; it should report no changes.

## Step 2: Write the adapter

Create `packages/core/src/channels/<channel>.ts`. Keep parsing in exported pure functions so you can test them without the network, and keep the network calls thin. `http.ts` has the shared helpers:

| Helper | What it does |
|---|---|
| `getJson(url, { headers?, timeoutMs? })` | GET with Startica's user agent (`StarticaBot/0.1 …`), `accept: application/json` and a 20-second timeout. Throws `HttpError` on a non-2xx status. |
| `HttpError` | Carries `status`, so `fetchEngagement()` can turn a 404 or 410 into `removed: true`. |
| `withTopReplies(body, replies)` | Appends up to 5 replies to the body ("Top replies so far:"), so the drafter knows what's been said. |

A sketch for a board with a public JSON search API (the channel id `board` and its URLs are placeholders):

```ts
import { getJson, HttpError, withTopReplies } from "./http.ts";
import type { ChannelAdapter, Engagement, ListeningQuery, RawConversation } from "./types.ts";

const API = "https://board.example/api";
const MAX_KEYWORDS = 10;

type Post = { id: number; title: string | null; text: string; author: string; category: string; created_at: string; replies: number };

/** Pure: turns one API result into a conversation. Tested against a saved fixture. */
export function fromPost(post: Post): RawConversation {
  return {
    channel: "board",
    externalId: String(post.id),
    url: `https://board.example/p/${post.id}`,
    kind: post.title ? "post" : "comment",
    community: post.category,
    author: post.author,
    title: post.title,
    threadTitle: null,
    body: post.text.trim(),
    postedAt: new Date(post.created_at),
    score: null,
    numComments: post.replies,
  };
}

export function parsePostId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "board.example") return null;
    return /^\/p\/(\d+)/.exec(u.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

export const board: ChannelAdapter = {
  channel: "board",

  async discover(query: ListeningQuery) {
    const found = new Map<string, RawConversation>();
    for (const keyword of query.keywords.slice(0, MAX_KEYWORDS)) {
      try {
        const data = await getJson<{ posts: Post[] }>(`${API}/search?q=${encodeURIComponent(keyword)}`);
        for (const post of data.posts) {
          const c = fromPost(post);
          if (c.postedAt && c.postedAt < query.since) continue;
          if (!found.has(c.externalId)) found.set(c.externalId, c);
        }
      } catch {
        // One failed search shouldn't stop the scan.
      }
    }
    return [...found.values()];
  },

  async fetchThread(url: string) {
    const id = parsePostId(url);
    if (!id) return null;
    const post = fromPost(await getJson<Post>(`${API}/posts/${id}`));
    const replies = await getJson<{ author: string; text: string }[]>(`${API}/posts/${id}/replies`).catch(() => []);
    return { ...post, body: withTopReplies(post.body, replies) };
  },

  async fetchEngagement(url: string): Promise<Engagement | null> {
    const id = parsePostId(url);
    if (!id) return null;
    try {
      const post = await getJson<Post>(`${API}/posts/${id}`);
      return { score: null, replies: post.replies, removed: false };
    } catch (error) {
      if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return { score: null, replies: null, removed: true };
      throw error;
    }
  },
};
```

Guidelines:

- **Filter by `query.since` yourself.** `since` is 26 hours ago, so hourly scans overlap; the unique key takes care of duplicates.
- **Use `query.communities` if the platform has them.** It holds only the communities the user is watching on your channel, each with its `name` and `url`. Decide what a community means on your platform and document the format: Mastodon reads `#tag@server` from the name (or a `/tags/` link in the URL), Discourse reads the forum's address from the URL (falling back to the name). Hacker News and Bluesky have none and search by keyword only.
- **Catch errors per request inside `discover()`.** `listen_scan` catches an error thrown from `discover()`, but then your adapter's finds for that scan are lost. Catch per request so one failed search or community doesn't drop the rest.
- **Cap the work.** Limit keywords and communities (Reddit reads at most 10 subreddits and 3 keyword searches; Discourse at most 5 forums, each with up to 6 new topics and 3 searches of up to 4 posts, about 22 requests or 1.7 minutes per forum) so a scan stays well within the job's 40-minute lease. Don't return more than the scan keeps from one source (60): anything past that is fetched for nothing. Adapters run one after another, so your time adds to everyone else's.
- **Respect rate limits.** Honor the platform's rate-limit headers and serialize or space requests if needed. `reddit.ts` has a serialized, spaced fetch queue; `discourse.ts` spaces requests to each host 4.5 seconds apart.
- **Ration paid APIs.** If the platform bills per request or per item, follow `x.ts`: do nothing without the user's own credential, scan less often than hourly, continue from the newest item already seen, skip optional lookups, and stop at a daily cap the user can see and change in Settings. Keep each scan's paid reads under the per-source limit (X reads at most 50) so none is paid for and dropped, and record API errors where Settings can show them instead of throwing (`xLastError()`).
- **Return plain text.** Convert HTML with `linkedom`, as `hnHtmlToText()` and `redditContentToText()` do.
- **`fetchThread()` returns `null` for URLs that aren't yours.** It may add context to `body` with `withTopReplies()`.
- **Report removals.** If the posted item is gone, return `removed: true`.

## Step 3: Register it

In `packages/core/src/channels/index.ts`, add the adapter to `adapters` and teach `channelFromUrl()` to recognize its links:

```ts
import { board } from "./board.ts";

export const adapters: Partial<Record<Channel, ChannelAdapter>> = {
  hackernews: hackerNews,
  reddit,
  bluesky,
  mastodon,
  discourse,
  x,
  board,
};

export function channelFromUrl(url: string): Channel {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^old\.|^m\./, "");
    // …existing hosts…
    if (host === "board.example") return "board";
  } catch {
    // fall through
  }
  return "other";
}
```

For software that runs on many domains, recognize links by their shape instead of the host, as Mastodon (`parseStatusUrl()`) and Discourse (`parseTopicUrl()`) do. Put the shape checks after the fixed hosts, and keep them strict: any link they match on any site is treated as your channel.

The order in `adapters` is the order `listen_scan` runs them in. Each adapter's finds are queued for scoring as soon as it's done, so slow adapters belong near the end. The cap of 60 new conversations applies to each adapter separately, so the order doesn't decide who gets scored.

From now on `listen_scan` calls your `discover()` every hour.

## Step 4: Update the UI and prompts

- **Labels:** add the display name to `channelLabels` in `apps/desktop-web/src/lib/channels.ts`. Intel's community form, Inbox cards, Content Studio and the paste-a-link errors all read it.
- **Community form hints:** if your communities have a special format, update the **Name** placeholder or **URL** label in `communityFields` (`apps/desktop-web/src/app/(app)/intel/intel-sections.tsx`).
- **Intel suggestions:** tell the AI how to write communities for your channel in `SYNTHESIS_SYSTEM` (`packages/core/src/intel/prompts.ts`) and bump `SYNTHESIS_PROMPT_VERSION`. See [Prompts and evals](/contributing/prompts-evals).
- **Paste-a-link errors:** `importLink()` uses a generic "Couldn't read that _channel_ link right now" message for channels with an adapter. Add a specific one only if your platform needs it (Reddit and X have their own).

Assisted posting is separate from adapters: it lives in `packages/core/src/posting/requests.ts` and `apps/desktop/posting/sites.mjs`, with stand-ins in `apps/desktop/scripts/posting-standins.mjs`. See [Testing](/contributing/testing#posting-against-stand-ins).

## Step 5: Test with fixtures

Tests must never hit the network. Save a real (anonymized) API response under `packages/core/src/channels/__fixtures__/` and test your pure functions against it, following `channels.test.ts`, or use small hand-built objects as `open-networks.test.ts` does:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { channelFromUrl } from "./index.ts";
import { fromPost, parsePostId } from "./board.ts";

describe("board channel", () => {
  it("recognizes board links", () => {
    expect(channelFromUrl("https://board.example/p/42")).toBe("board");
    expect(parsePostId("https://board.example/p/42")).toBe("42");
    expect(parsePostId("https://example.com/p/42")).toBeNull();
  });

  it("parses a search result", () => {
    const data = JSON.parse(readFileSync(new URL("./__fixtures__/board-search.json", import.meta.url), "utf8"));
    expect(fromPost(data.posts[0])).toMatchObject({ channel: "board", kind: "post", externalId: "42" });
  });
});
```

If your adapter keeps state (a schedule, a cursor, a usage counter), test it with a stubbed `fetch` and a temporary database, as `x.test.ts` does.

Replace usernames and anything personal in fixtures with placeholders like `example_user`. If you add a shape-based link check, also test that ordinary links (for example `https://example.com/blog/post`) still come out as `other`.

Then run the full checks:

```bash
yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
```

To try it for real, run an isolated dev copy (see [Development setup](/contributing/dev-setup)), add a product with listening keywords, watch a community on the new channel, and click "Scan now" in the Inbox. The run shows up on the System page.

## Step 6: Document it

Update [Finding conversations](/guides/finding-conversations) with how the channel finds threads, how its communities are written and its limits, [Privacy and security](/concepts/privacy-security) with the new network destination, and [Costs](/concepts/costs) if the API costs money.
