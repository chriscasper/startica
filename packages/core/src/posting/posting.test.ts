import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { contentPieces, conversations, drafts, opportunities, products, publications } from "@startica/db/schema";
import { recordPiecePosted, recordPostingResult, recordReplyPosted } from "./record.ts";
import { pieceRequest, replyRequest } from "./requests.ts";

const draft = { id: "d1", body: "Try a darker ND filter & a slower shutter." };

describe("reply requests", () => {
  it("opens X's intent composer with the reply pre-filled", () => {
    const r = replyRequest({ channel: "x", url: "https://x.com/someone/status/1844000000000000001", externalId: "x1" }, draft, "o1")!;
    const url = new URL(r.openUrl);
    expect(url.origin + url.pathname).toBe("https://x.com/intent/tweet");
    expect(url.searchParams.get("in_reply_to")).toBe("1844000000000000001");
    expect(url.searchParams.get("text")).toBe(draft.body);
    expect(r.target).toEqual({ kind: "draft", opportunityId: "o1", draftId: "d1" });
  });

  it("opens the Hacker News item page, whose form replies to that item", () => {
    const r = replyRequest({ channel: "hackernews", url: "https://news.ycombinator.com/item?id=4242", externalId: "4242" }, draft, "o1")!;
    expect(r).toMatchObject({ site: "hackernews", mode: "reply", openUrl: "https://news.ycombinator.com/item?id=4242", text: draft.body });
  });

  it("opens Reddit threads and comment permalinks on old.reddit.com", () => {
    const post = replyRequest({ channel: "reddit", url: "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/", externalId: "t3_1x0kat2" }, draft, "o1")!;
    expect(post).toMatchObject({
      openUrl: "https://old.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/",
      replyToComment: null,
      threadUrl: "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/",
    });
    const comment = replyRequest(
      { channel: "reddit", url: "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/pellhxs/?context=3", externalId: "t1_pellhxs" },
      draft,
      "o1",
    )!;
    expect(comment).toMatchObject({
      openUrl: "https://old.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/pellhxs/",
      replyToComment: "pellhxs",
      threadUrl: "https://www.reddit.com/r/AskPhotography/comments/1x0kat2/how_does/",
    });
  });

  it("doesn't offer X replies too long for an intent link (rather than cutting them)", () => {
    expect(replyRequest({ channel: "x", url: "https://x.com/a/status/1", externalId: "1" }, { id: "d", body: "x".repeat(4001) }, "o1")).toBeNull();
  });

  it("returns null for channels and links it can't post to", () => {
    expect(replyRequest({ channel: "facebook", url: "https://www.facebook.com/groups/x/posts/1", externalId: "f1" }, draft, "o1")).toBeNull();
    expect(replyRequest({ channel: "x", url: "https://x.com/someone", externalId: "x1" }, draft, "o1")).toBeNull();
  });
});

describe("reply requests on open networks and LinkedIn", () => {
  it("opens LinkedIn and Bluesky posts in place", () => {
    expect(replyRequest({ channel: "linkedin", url: "https://www.linkedin.com/feed/update/urn:li:activity:7000/", externalId: "l" }, draft, "o1")).toMatchObject({ site: "linkedin", openUrl: "https://www.linkedin.com/feed/update/urn:li:activity:7000/" });
    expect(replyRequest({ channel: "bluesky", url: "https://bsky.app/profile/a.bsky.social/post/3mxh", externalId: "at://x" }, draft, "o1")).toMatchObject({ site: "bluesky" });
    expect(replyRequest({ channel: "bluesky", url: "https://bsky.app/profile/a.bsky.social/post/3mxh", externalId: "at://x" }, { id: "d", body: "x".repeat(301) }, "o1")).toBeNull();
  });

  it("replies on Mastodon from the user's own server, only when it's set", () => {
    const conv = { channel: "mastodon", url: "https://mastodon.social/@a@mastodon.world/999", externalId: "https://mastodon.world/users/a/statuses/117" };
    expect(replyRequest(conv, draft, "o1")).toBeNull();
    expect(replyRequest(conv, draft, "o1", { mastodonServer: "fosstodon.org" })!.openUrl).toBe(`https://fosstodon.org/authorize_interaction?uri=${encodeURIComponent(conv.externalId)}`);
  });

  it("replies to a Discourse topic or to one post in it", () => {
    expect(replyRequest({ channel: "discourse", url: "https://forum.example.com/t/a/12", externalId: "e" }, draft, "o1")).toMatchObject({ site: "discourse", replyToComment: null });
    expect(replyRequest({ channel: "discourse", url: "https://forum.example.com/t/a/12/5", externalId: "e" }, draft, "o1")).toMatchObject({ replyToComment: "5" });
  });
});

describe("piece requests", () => {
  it("builds a new post per channel", () => {
    expect(new URL(pieceRequest({ id: "p1", channel: "x", title: null, body: "Hello" })!.openUrl).searchParams.get("text")).toBe("Hello");
    expect(pieceRequest({ id: "p1", channel: "reddit", title: "T", body: "B" })).toMatchObject({ site: "reddit", mode: "post", title: "T", text: "B" });
    expect(pieceRequest({ id: "p1", channel: "hackernews", title: "Show HN: Fieldnote", body: "https://fieldnote.example" })).toMatchObject({
      link: "https://fieldnote.example",
      text: "",
    });
    expect(pieceRequest({ id: "p1", channel: "blog", title: "T", body: "B" })).toBeNull();
    expect(pieceRequest({ id: "p1", channel: "x", format: "thread", title: null, body: "1/ a\n2/ b" })).toBeNull();
    expect(new URL(pieceRequest({ id: "p1", channel: "linkedin", title: null, body: "Hi" })!.openUrl).searchParams.get("shareActive")).toBe("true");
    expect(pieceRequest({ id: "p1", channel: "bluesky", title: null, body: "Hi" })!.openUrl).toBe("https://bsky.app/intent/compose?text=Hi");
    expect(pieceRequest({ id: "p1", channel: "mastodon", title: null, body: "Hi" })).toBeNull();
    expect(pieceRequest({ id: "p1", channel: "mastodon", title: null, body: "Hi" }, { mastodonServer: "mastodon.social" })!.openUrl).toBe("https://mastodon.social/share?text=Hi");
    expect(pieceRequest({ id: "p1", channel: "discourse", title: "T", body: "B" })).toBeNull();
    expect(pieceRequest({ id: "p1", channel: "discourse", title: "T", body: "B" }, { discourseForum: "https://forum.example.com/" })!.openUrl).toBe("https://forum.example.com/new-topic?title=T&body=B");
  });
});

describe("recording posts", () => {
  let workspaceId = "";
  let productId = "";

  beforeAll(async () => {
    openDatabase(join(mkdtempSync(join(tmpdir(), "startica-posting-")), "test.db"));
    await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
    workspaceId = (await ensureWorkspace()).id;
    [{ id: productId }] = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning({ id: products.id })) as [{ id: string }];
  });
  afterAll(() => closeDatabase());

  async function draftedOpportunity() {
    const [conv] = await getDb()
      .insert(conversations)
      .values({ workspaceId, channel: "hackernews", externalId: crypto.randomUUID(), url: "https://news.ycombinator.com/item?id=1", community: null, body: "q" })
      .returning();
    const [opp] = await getDb().insert(opportunities).values({ workspaceId, productId, conversationId: conv!.id, status: "drafted" }).returning();
    const [d] = await getDb().insert(drafts).values({ workspaceId, opportunityId: opp!.id, version: 1, body: "my reply", mentionsProduct: true }).returning();
    return { opp: opp!, draft: d! };
  }

  it("records an assisted reply once, with its link", async () => {
    const { opp, draft: d } = await draftedOpportunity();
    await recordPostingResult({ kind: "draft", opportunityId: opp.id, draftId: d.id }, "https://news.ycombinator.com/item?id=99");
    expect(await recordReplyPosted({ opportunityId: opp.id, draftId: d.id, url: "https://news.ycombinator.com/item?id=99" })).toBe(false);
    const pubs = await getDb().select().from(publications).where(eq(publications.opportunityId, opp.id));
    expect(pubs).toHaveLength(1);
    expect(pubs[0]).toMatchObject({ url: "https://news.ycombinator.com/item?id=99", body: "my reply", mentionsProduct: true, channel: "hackernews" });
    const [after] = await getDb().select().from(opportunities).where(eq(opportunities.id, opp.id));
    expect(after?.status).toBe("posted");
  });

  it("keeps the text that was actually posted when the site reports it", async () => {
    const { opp, draft: d } = await draftedOpportunity();
    await recordPostingResult({ kind: "draft", opportunityId: opp.id, draftId: d.id }, "https://news.ycombinator.com/item?id=101", "my reply, edited");
    const [pub] = await getDb().select().from(publications).where(eq(publications.opportunityId, opp.id));
    expect(pub?.body).toBe("my reply, edited");
  });

  it("adds the link when the reply was already marked posted without one", async () => {
    const { opp } = await draftedOpportunity();
    await recordReplyPosted({ opportunityId: opp.id, url: null });
    await recordReplyPosted({ opportunityId: opp.id, url: "https://news.ycombinator.com/item?id=100" });
    const [pub] = await getDb().select().from(publications).where(eq(publications.opportunityId, opp.id));
    expect(pub?.url).toBe("https://news.ycombinator.com/item?id=100");
  });

  it("marks a piece posted and keeps its first posting date", async () => {
    const [piece] = await getDb().insert(contentPieces).values({ workspaceId, productId, channel: "x", topic: "t", body: "b", status: "draft" }).returning();
    await recordPiecePosted({ pieceId: piece!.id, url: null });
    const [first] = await getDb().select().from(contentPieces).where(eq(contentPieces.id, piece!.id));
    await new Promise((r) => setTimeout(r, 5));
    await recordPiecePosted({ pieceId: piece!.id, url: "https://x.com/i/status/5" });
    const [second] = await getDb().select().from(contentPieces).where(eq(contentPieces.id, piece!.id));
    expect(second).toMatchObject({ status: "posted", postedUrl: "https://x.com/i/status/5" });
    expect(second!.postedAt!.getTime()).toBe(first!.postedAt!.getTime());
  });
});
