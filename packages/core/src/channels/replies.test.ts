import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bskyReplies, type ThreadNode } from "./bluesky.ts";
import { discourseReplies, type Topic } from "./discourse.ts";
import { hnReplies, type Item } from "./hackernews.ts";
import { mastodonReplies, type Status } from "./mastodon.ts";
import { parseRedditFeed, redditReplies } from "./reddit.ts";
import { othersReplies, type RawReply } from "./types.ts";

// Stand-in API answers in each channel's public shape (no network in tests).

describe("reading replies to the owner's posts", () => {
  it("reddit: everything below the comment in its permalink feed, without the owner's own", () => {
    const entries = parseRedditFeed(readFileSync(new URL("./__fixtures__/reddit-comment.atom", import.meta.url), "utf8"));
    const thread = redditReplies(entries, "t1_pellhxs");
    expect(thread.ownerAuthor).toBe("user2");
    expect(thread.engagement).toEqual({ score: null, replies: 3, removed: false });
    expect(thread.replies.map((r) => r.externalId)).toEqual(["t1_pemawmk", "t1_pemhssk", "t1_peo0kaq"]);
    expect(thread.replies.every((r) => r.inReplyTo === "t1_pellhxs" && r.kind === "comment")).toBe(true);
    // The post above the comment isn't a reply; the owner's own (user2) is skipped.
    expect(othersReplies(thread.replies, thread.ownerAuthor).map((r) => r.author).sort()).toEqual(["user3", "user4"]);
    // Removed comments are left out.
    const removed = entries.map((e) => (e.externalId === "t1_peo0kaq" ? { ...e, body: "[removed]" } : e));
    expect(redditReplies(removed, "t1_pellhxs").replies.map((r) => r.externalId)).not.toContain("t1_peo0kaq");
  });

  it("hacker news: nested children, each under its parent; deleted ones dropped", () => {
    const item = (id: number, author: string | null, text: string | null, children: Item[] = []): Item => ({ id, type: "comment", title: null, text, author, created_at_i: 1_790_000_000 + id, points: null, story_id: 1, children });
    const root: Item = { ...item(100, "fieldnote_dev", "We built an offline notebook.<p>Happy to answer questions.", [item(101, "ana", "Does it sync over <i>Wi-Fi</i> only?", [item(102, "fieldnote_dev", "Any connection."), item(103, "bo", "Same question here.")]), item(104, null, null)]), title: "Show HN: Fieldnote", type: "story", points: 12 };
    const thread = hnReplies(root);
    expect(thread.ownerAuthor).toBe("fieldnote_dev");
    expect(thread.engagement).toEqual({ score: 12, replies: 2, removed: false });
    expect(thread.replies.map((r) => [r.externalId, r.inReplyTo])).toEqual([["101", "100"], ["102", "101"], ["103", "101"]]);
    expect(thread.replies[0]).toMatchObject({ url: "https://news.ycombinator.com/item?id=101", body: "Does it sync over Wi-Fi only?", threadTitle: "Show HN: Fieldnote", community: "Hacker News" });
    expect(othersReplies(thread.replies, thread.ownerAuthor).map((r) => r.author)).toEqual(["bo", "ana"]);
  });

  it("bluesky: the getPostThread tree, each reply under the post it answers", () => {
    const post = (rkey: string, handle: string, text: string, extra: object = {}) => ({ uri: `at://did:plc:${handle}/app.bsky.feed.post/${rkey}`, author: { did: `did:plc:${handle}`, handle: `${handle}.bsky.social` }, record: { text, createdAt: "2026-10-20T10:00:00.000Z", reply: {} }, ...extra });
    const thread: ThreadNode = {
      post: { ...post("root", "owner", "Field season starts Monday."), likeCount: 9, replyCount: 1 },
      replies: [{ post: post("r1", "cy", "Which template do you use?"), replies: [{ post: post("r2", "owner", "Transects, mostly.") }] }, { notFound: true }],
    };
    const result = bskyReplies(thread);
    expect(result.ownerAuthor).toBe("owner.bsky.social");
    expect(result.engagement).toEqual({ score: 9, replies: 1, removed: false });
    expect(result.replies.map((r) => [r.url, r.inReplyTo])).toEqual([
      ["https://bsky.app/profile/cy.bsky.social/post/r1", "at://did:plc:owner/app.bsky.feed.post/root"],
      ["https://bsky.app/profile/owner.bsky.social/post/r2", "at://did:plc:cy/app.bsky.feed.post/r1"],
    ]);
    expect(bskyReplies({ notFound: true }).engagement?.removed).toBe(true);
  });

  it("mastodon: the context's descendants, filed under global uris", () => {
    const status = (id: string, acct: string, content: string, inReplyTo: string | null): Status => ({ id, uri: `https://home.example/users/${acct.split("@")[0]}/statuses/${id}`, url: null, content, created_at: "2026-10-20T10:00:00.000Z", in_reply_to_id: inReplyTo, replies_count: 1, favourites_count: 4, account: { acct } });
    const mine = status("1", "fieldnote", "<p>New: audio notes.</p>", null);
    const thread = mastodonReplies(mine, [status("2", "dee@other.example", "<p>Do they transcribe?</p>", "1"), status("3", "fieldnote", "<p>Not yet.</p>", "2")], "mastodon.example");
    expect(thread.ownerAuthor).toBe("fieldnote@mastodon.example");
    expect(thread.replies.map((r) => [r.author, r.inReplyTo, r.body])).toEqual([
      ["dee@other.example", mine.uri, "Do they transcribe?"],
      ["fieldnote@mastodon.example", "https://home.example/users/dee/statuses/2", "Not yet."],
    ]);
    expect(othersReplies(thread.replies, thread.ownerAuthor)).toHaveLength(1);
  });

  it("discourse: replies to a later post, and to their replies, but not the rest of the topic", () => {
    const p = (n: number, username: string, cooked: string, replyTo: number | null = null) => ({ id: 1000 + n, post_number: n, username, cooked, created_at: "2026-10-20T10:00:00.000Z", reply_to_post_number: replyTo, actions_summary: [{ id: 2, count: n }] });
    const topic: Topic = { id: 12, slug: "field-apps", title: "Field apps?", created_at: "2026-10-19T10:00:00.000Z", posts_count: 5, post_stream: { posts: [p(1, "ana", "<p>Which app?</p>"), p(2, "fieldnote", "<p>I built one.</p>", 1), p(3, "bo", "<p>Does it export CSV?</p>", 2), p(4, "cy", "<p>Unrelated aside.</p>", 1), p(5, "dee", "<p>Following up on CSV.</p>", 3)] } };
    const thread = discourseReplies("https://forum.example.com", topic, 2)!;
    expect(thread.ownerAuthor).toBe("fieldnote");
    expect(thread.engagement).toMatchObject({ score: 2, removed: false });
    expect(thread.replies.map((r) => [r.url, r.inReplyTo])).toEqual([
      ["https://forum.example.com/t/field-apps/12/3", "forum.example.com/:p1002"],
      ["https://forum.example.com/t/field-apps/12/5", "forum.example.com/:p1003"],
    ]);
    // Below the first post, the whole topic answers it.
    expect(discourseReplies("https://forum.example.com", topic, 1)!.replies).toHaveLength(4);
    expect(discourseReplies("https://forum.example.com", topic, 9)).toBeNull();
  });

  it("keeps the newest 50, skipping empty ones and the owner's own (ignoring case)", () => {
    const r = (i: number, author: string, body = "text"): RawReply => ({ channel: "hackernews", externalId: String(i), url: "u", kind: "comment", community: null, author, title: null, threadTitle: null, body, postedAt: new Date(i * 1000), score: null, numComments: null, inReplyTo: null });
    const many = [...Array.from({ length: 60 }, (_, i) => r(i, "someone")), r(100, "Owner"), r(101, "x", "  ")];
    const kept = othersReplies(many, "owner");
    expect(kept).toHaveLength(50);
    expect(kept[0]!.externalId).toBe("59");
  });
});
