import { describe, expect, it } from "vitest";
import { utmUrl } from "../distribution/utm.ts";
import { hnHtmlToText, parseItemId } from "./hackernews.ts";
import { channelFromUrl, redditCommunity } from "./index.ts";

describe("channelFromUrl", () => {
  it("recognizes each channel's hosts", () => {
    expect(channelFromUrl("https://www.reddit.com/r/ecology/comments/abc/x/")).toBe("reddit");
    expect(channelFromUrl("https://old.reddit.com/r/GradSchool/comments/abc/")).toBe("reddit");
    expect(channelFromUrl("https://news.ycombinator.com/item?id=1")).toBe("hackernews");
    expect(channelFromUrl("https://x.com/someone/status/1")).toBe("x");
    expect(channelFromUrl("https://www.linkedin.com/posts/abc")).toBe("linkedin");
    expect(channelFromUrl("https://example.com/forum")).toBe("other");
    expect(channelFromUrl("not a url")).toBe("other");
  });

  it("extracts the subreddit from Reddit links", () => {
    expect(redditCommunity("https://www.reddit.com/r/AnalogCommunity/comments/abc/")).toBe("AnalogCommunity");
    expect(redditCommunity("https://x.com/a")).toBeNull();
  });
});

describe("hacker news helpers", () => {
  it("parses item ids only from HN item links", () => {
    expect(parseItemId("https://news.ycombinator.com/item?id=50013648")).toBe("50013648");
    expect(parseItemId("https://example.com/item?id=1")).toBeNull();
    expect(parseItemId("https://news.ycombinator.com/item?id=abc")).toBeNull();
  });

  it("turns HN html into plain text with paragraphs and decoded entities", () => {
    expect(hnHtmlToText("Field ecologist here.<p>I&#x27;ve counted <i>ten</i> of these.")).toBe(
      "Field ecologist here.\n\nI've counted ten of these.",
    );
  });
});

describe("utmUrl", () => {
  it("tags links with channel, community, date and draft id", () => {
    const url = new URL(
      utmUrl("https://fieldnote.example/?ref=x", {
        channel: "reddit",
        community: "AnalogCommunity",
        draftId: "d1",
        date: new Date("2026-10-09T12:00:00Z"),
      }),
    );
    expect(url.searchParams.get("ref")).toBe("x");
    expect(url.searchParams.get("utm_source")).toBe("reddit");
    expect(url.searchParams.get("utm_medium")).toBe("community");
    expect(url.searchParams.get("utm_campaign")).toBe("r-analogcommunity-2026-10-09");
    expect(url.searchParams.get("utm_content")).toBe("d1");
  });
});

describe("reddit feeds", () => {
  it("parses posts from a subreddit feed", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseRedditFeed } = await import("./reddit.ts");
    const xml = readFileSync(new URL("./__fixtures__/reddit-new.atom", import.meta.url), "utf8");
    const entries = parseRedditFeed(xml);
    expect(entries).toHaveLength(2);
    const [first] = entries;
    expect(first).toMatchObject({
      channel: "reddit",
      externalId: "t3_1x1bxlz",
      kind: "post",
      community: "AnalogCommunity",
      author: "example_user",
      title: "Just got my Contax S2 in the mail!",
    });
    expect(first!.url).toBe("https://www.reddit.com/r/AnalogCommunity/comments/1x1bxlz/just_got_my_contax_s2_in_the_mail/");
    expect(first!.body).toContain("night shots with 500t");
    expect(first!.body).toContain("I'm very excited");
    expect(first!.body).not.toContain("submitted by");
    expect(first!.postedAt?.toISOString()).toBe("2026-10-09T04:24:18.000Z");
  });

  it("finds post ids in thread links", async () => {
    const { redditPostId } = await import("./reddit.ts");
    expect(redditPostId("https://www.reddit.com/r/ecology/comments/1x1bxlz/some_title/")).toBe("1x1bxlz");
    expect(redditPostId("https://redd.it/abc123")).toBe("abc123");
    expect(redditPostId("https://www.reddit.com/r/ecology/")).toBeNull();
  });

  it("tells post links from comment permalinks", async () => {
    const { redditThingIds } = await import("./reddit.ts");
    expect(redditThingIds("https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/pellhxs/")).toEqual({ postId: "1x0kat2", commentId: "pellhxs" });
    expect(redditThingIds("https://old.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/")).toEqual({ postId: "1x0kat2", commentId: null });
    expect(redditThingIds("https://redd.it/1x0kat2")).toEqual({ postId: "1x0kat2", commentId: null });
    expect(redditThingIds("https://www.reddit.com/r/AskPhotography/")).toBeNull();
  });

  it("counts replies below a comment from its permalink feed, and spots removed ones", async () => {
    const { readFileSync } = await import("node:fs");
    const { parseRedditFeed, redditEngagement } = await import("./reddit.ts");
    const xml = readFileSync(new URL("./__fixtures__/reddit-comment.atom", import.meta.url), "utf8");
    const entries = parseRedditFeed(xml);
    // The feed holds the post, the comment and the 3 replies below it.
    expect(redditEngagement(entries, "t1_pellhxs")).toEqual({ score: null, replies: 3, removed: false });
    expect(redditEngagement(entries, "t3_1x0kat2")).toEqual({ score: null, replies: 4, removed: false });
    expect(redditEngagement(entries, "t1_missing").removed).toBe(true);
    const removed = entries.map((e) => (e.externalId === "t1_pellhxs" ? { ...e, body: "[removed]" } : e));
    expect(redditEngagement(removed, "t1_pellhxs").removed).toBe(true);
  });
});
