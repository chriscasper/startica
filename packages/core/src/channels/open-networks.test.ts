import { describe, expect, it } from "vitest";
import { bskyAtUri, bskyWebUrl, fromBskyPost } from "./bluesky.ts";
import { forumBase, likesOf, parseTopicUrl } from "./discourse.ts";
import { channelFromUrl } from "./index.ts";
import { fromStatus, parseStatusUrl, parseTagCommunity } from "./mastodon.ts";

describe("bluesky", () => {
  it("converts between at:// URIs and bsky.app links", () => {
    expect(bskyWebUrl("at://did:plc:abc/app.bsky.feed.post/3mxh", "someone.bsky.social")).toBe("https://bsky.app/profile/someone.bsky.social/post/3mxh");
    expect(bskyAtUri("https://bsky.app/profile/someone.bsky.social/post/3mxh?ref=x")).toBe("at://someone.bsky.social/app.bsky.feed.post/3mxh");
    expect(bskyAtUri("https://bsky.app/profile/someone.bsky.social")).toBeNull();
  });

  it("maps a post, telling replies from top-level posts", () => {
    const post = { uri: "at://did:plc:abc/app.bsky.feed.post/3mxh", author: { did: "did:plc:abc", handle: "a.bsky.social" }, record: { text: "Where do you share film scans?", createdAt: "2026-10-09T18:43:22.874Z", reply: {} }, likeCount: 3, replyCount: 1 };
    expect(fromBskyPost(post)).toMatchObject({ channel: "bluesky", externalId: post.uri, kind: "comment", author: "a.bsky.social", score: 3, numComments: 1, url: "https://bsky.app/profile/a.bsky.social/post/3mxh" });
  });
});

describe("mastodon", () => {
  it("reads hashtag communities", () => {
    expect(parseTagCommunity("#photography@mastodon.social")).toEqual({ tag: "photography", server: "mastodon.social" });
    expect(parseTagCommunity("filmphotography")).toEqual({ tag: "filmphotography", server: "mastodon.social" });
    expect(parseTagCommunity("anything", "https://photog.social/tags/analog")).toEqual({ tag: "analog", server: "photog.social" });
    expect(parseTagCommunity("not a tag")).toBeNull();
  });

  it("parses status links, including remote ones seen through another server", () => {
    expect(parseStatusUrl("https://mastodon.social/@iviira9@mastodon.world/117412684696731063")).toEqual({ server: "mastodon.social", id: "117412684696731063" });
    expect(parseStatusUrl("https://fosstodon.org/users/someone/statuses/42")).toEqual({ server: "fosstodon.org", id: "42" });
    expect(parseStatusUrl("https://mastodon.social/@someone")).toBeNull();
  });

  it("links a post on the server it was found on, keeping its global uri as the id", () => {
    const s = { id: "999", uri: "https://mastodon.world/users/a/statuses/117", url: "https://mastodon.world/@a/117", content: "<p>Glass and rain.<br>Paris</p>", created_at: "2026-10-09T19:49:47.000Z", in_reply_to_id: null, replies_count: 2, favourites_count: 5, account: { acct: "a@mastodon.world" } };
    expect(fromStatus(s, "mastodon.social", "#photography@mastodon.social")).toMatchObject({
      externalId: "https://mastodon.world/users/a/statuses/117",
      url: "https://mastodon.social/@a@mastodon.world/999",
      author: "a@mastodon.world",
      body: "Glass and rain.\nParis",
      kind: "post",
      score: 5,
    });
    expect(fromStatus({ ...s, account: { acct: "local" } }, "mastodon.social", null).author).toBe("local@mastodon.social");
  });
});

describe("discourse", () => {
  it("finds the forum's base, keeping a sub-folder", () => {
    expect(forumBase("https://meta.discourse.org/latest")).toBe("https://meta.discourse.org");
    expect(forumBase("forum.example.com")).toBe("https://forum.example.com");
    expect(forumBase("https://example.com/community/t/hello/12")).toBe("https://example.com/community");
  });

  it("parses topic and post links", () => {
    expect(parseTopicUrl("https://meta.discourse.org/t/discourse-cookie-consent-banner/108380/48")).toEqual({ base: "https://meta.discourse.org", topicId: 108380, postNumber: 48 });
    expect(parseTopicUrl("https://example.com/community/t/hello/12?u=me")).toEqual({ base: "https://example.com/community", topicId: 12, postNumber: 1 });
    expect(parseTopicUrl("https://example.com/about")).toBeNull();
  });

  it("counts likes from actions_summary (like_count can be null)", () => {
    expect(likesOf({ actions_summary: [{ id: 2, count: 24 }, { id: 8 }] })).toBe(24);
    expect(likesOf({})).toBe(0);
  });
});

describe("channelFromUrl for open networks", () => {
  it("recognizes Bluesky by host and Mastodon/Discourse by link shape", () => {
    expect(channelFromUrl("https://bsky.app/profile/a.bsky.social/post/3mxh")).toBe("bluesky");
    expect(channelFromUrl("https://hachyderm.io/@someone/1234567")).toBe("mastodon");
    expect(channelFromUrl("https://forum.example.com/t/a-topic/77/3")).toBe("discourse");
    expect(channelFromUrl("https://example.com/blog/post")).toBe("other");
  });
});

describe("community formats", () => {
  it("flags communities listening can't read", async () => {
    const { communityProblem } = await import("./formats.ts");
    expect(communityProblem("discourse", "Fieldnote Forum", null)).toMatch(/address/);
    expect(communityProblem("discourse", "Fieldnote Forum", "https://forum.example.com")).toBeNull();
    expect(communityProblem("mastodon", "Field notes!", null)).toMatch(/hashtag/);
    expect(communityProblem("mastodon", "#fieldnotes", null)).toBeNull();
    expect(communityProblem("reddit", "anything", null)).toBeNull();
  });

  it("tags Content Studio links by channel", async () => {
    const { utmUrl } = await import("../distribution/utm.ts");
    const url = new URL(utmUrl("https://fieldnote.example", { channel: "bluesky", community: null, draftId: "content-1", medium: "content", date: new Date("2026-10-09") }));
    expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "bluesky", utm_medium: "content", utm_campaign: "bluesky-2026-10-09", utm_content: "content-1" });
  });
});
