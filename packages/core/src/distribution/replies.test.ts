import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { adapters } from "../channels/index.ts";
import type { RawReply, ReplyThread } from "../channels/types.ts";
import { recordReplyPosted } from "../posting/record.ts";
import { runEngagementSync, storeConversation } from "./jobs.ts";
import { listeningCandidates } from "./listening-moves.ts";
import { draftReplyAnswer, loadReplies, newReplyCount, setReplyStatus } from "./replies.ts";

let workspaceId = "";
let productId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-replies-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  const [p] = await getDb().insert(s.products).values({ workspaceId, name: "Fieldnote" }).returning();
  productId = p!.id;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => closeDatabase());

const reply = (id: string, author: string, body: string, inReplyTo: string): RawReply => ({
  channel: "hackernews",
  externalId: id,
  url: `https://news.ycombinator.com/item?id=${id}`,
  kind: "comment",
  community: "Hacker News",
  author,
  title: null,
  threadTitle: null,
  body,
  postedAt: new Date(),
  score: null,
  numComments: 0,
  inReplyTo,
});

describe("matches stored with a conversation", () => {
  it("records listening keywords and who is named", async () => {
    const db = getDb();
    await db.insert(s.keywords).values({ workspaceId, productId, keyword: "field notes app", useFor: "listening" });
    const [rival] = await db.insert(s.competitors).values({ workspaceId, productId, name: "TerraJot" }).returning();
    const { opportunityId } = await storeConversation({
      workspaceId,
      productId,
      origin: "listening",
      matchedOn: "hackernews",
      conversation: { ...reply("900", "ana", "Any field notes apps besides TerraJot? Fieldnote looked nice.", ""), kind: "post", title: "Ask HN" },
    });
    const [opp] = await db.select().from(s.opportunities).where(eq(s.opportunities.id, opportunityId));
    expect(opp).toMatchObject({ matchedKeywords: ["field notes app"], mentions: { product: true, competitorIds: [rival!.id] } });
  });
});

describe("replies to the owner's posts", () => {
  it("engagement_sync stores others' replies once, marks ones the owner answered, and Draft an answer drafts", async () => {
    const db = getDb();
    const [conv] = await db.insert(s.conversations).values({ workspaceId, channel: "hackernews", externalId: "500", url: "https://news.ycombinator.com/item?id=500", title: "Ask HN: field apps?", body: "?" }).returning();
    const [opp] = await db.insert(s.opportunities).values({ workspaceId, productId, conversationId: conv!.id, status: "posted" }).returning();
    const [pub] = await db
      .insert(s.publications)
      .values({ workspaceId, productId, opportunityId: opp!.id, channel: "hackernews", url: "https://news.ycombinator.com/item?id=501", body: "I built Fieldnote for this." })
      .returning();

    const thread: ReplyThread = {
      engagement: { score: 3, replies: 2, removed: false },
      ownerAuthor: "fieldnote_dev",
      replies: [reply("502", "ana", "Does it export CSV?", "501"), reply("503", "bo", "Nice.", "501"), reply("504", "fieldnote_dev", "Thanks!", "503")],
    };
    const fetchReplies = vi.spyOn(adapters.hackernews!, "fetchReplies").mockResolvedValue(thread);
    const fetchEngagement = vi.spyOn(adapters.hackernews!, "fetchEngagement");

    expect(await runEngagementSync({ workspaceId }, { workspaceId })).toMatchObject({ publications: 1, captured: 1, replies: 2 });
    expect(fetchReplies).toHaveBeenCalledWith(pub!.url);
    expect(fetchEngagement).not.toHaveBeenCalled(); // one read gives both
    const stored = await loadReplies(productId, ["new", "seen", "answered"]);
    expect(stored.map((r) => [r.author, r.status]).sort()).toEqual([["ana", "new"], ["bo", "answered"]]);
    expect(stored[0]!.post).toMatchObject({ kind: "reply", url: pub!.url });
    // A second sync keeps statuses and adds nothing.
    await setReplyStatus(workspaceId, [stored.find((r) => r.author === "ana")!.id], "seen");
    expect((await runEngagementSync({ workspaceId }, { workspaceId })).replies).toBe(0);
    await setReplyStatus(workspaceId, [stored.find((r) => r.author === "ana")!.id], "new");

    // Today offers answering them.
    expect(await newReplyCount(productId)).toMatchObject({ count: 1 });
    const moves = await listeningCandidates(productId, "2026-10-21");
    expect(moves.find((m) => m.kind === "replies")).toMatchObject({ title: "Answer a new reply to your post", href: "/inbox?tab=replies" });

    // Draft an answer: a conversation (origin reply) and an opportunity, queued for drafting with guidance.
    const ana = stored.find((r) => r.author === "ana")!;
    const answerId = await draftReplyAnswer(workspaceId, ana.id);
    const [answer] = await db.select().from(s.opportunities).innerJoin(s.conversations, eq(s.conversations.id, s.opportunities.conversationId)).where(eq(s.opportunities.id, answerId));
    expect(answer!.conversations).toMatchObject({ origin: "reply", kind: "comment", externalId: "502", threadTitle: "Ask HN: field apps?", body: "Does it export CSV?" });
    expect(answer!.opportunities.status).toBe("drafting");
    const [job] = await db.select().from(s.jobs).where(eq(s.jobs.queue, "draft_generate"));
    expect((job!.payload as { guidance: string }).guidance).toContain("I built Fieldnote for this.");
    expect((await loadReplies(productId, ["seen"]))[0]).toMatchObject({ id: ana.id, opportunityId: answerId });

    // Posting the answer marks the reply answered.
    await db.insert(s.drafts).values({ workspaceId, opportunityId: answerId, version: 1, body: "Yes: CSV, GeoJSON and Markdown." });
    await recordReplyPosted({ opportunityId: answerId, url: "https://news.ycombinator.com/item?id=505" });
    expect((await loadReplies(productId, ["answered"])).map((r) => r.author).sort()).toEqual(["ana", "bo"]);
  });
});

describe("listening spike moves", () => {
  it("offers the strongest spike once, not again for a week", async () => {
    const db = getDb();
    const [p] = await db.insert(s.products).values({ workspaceId, name: "Spiky" }).returning();
    await db.insert(s.keywords).values({ workspaceId, productId: p!.id, keyword: "offline maps", useFor: "listening" });
    const now = new Date();
    const add = async (i: number, daysAgo: number) => {
      const at = new Date(now.getTime() - daysAgo * 86400_000);
      const [c] = await db.insert(s.conversations).values({ workspaceId, channel: "bluesky", externalId: `spike-${i}`, url: `https://bsky.app/profile/a/post/${i}`, body: "Need offline maps for fieldwork", postedAt: at, createdAt: at }).returning();
      await db.insert(s.opportunities).values({ workspaceId, productId: p!.id, conversationId: c!.id, createdAt: at });
    };
    await add(0, 20);
    for (let i = 1; i <= 6; i++) await add(i, 0);
    const today = now.toLocaleDateString("en-CA");
    const [move] = await listeningCandidates(p!.id, today, now);
    expect(move).toMatchObject({ kind: "listening", title: "Conversations about “offline maps” jumped today", refId: "kw:offline maps", href: "/inbox?tab=trends" });

    // Offered yesterday: the keyword spike isn't offered again; the community's (Bluesky) is.
    const yesterday = new Date(now.getTime() - 86400_000).toLocaleDateString("en-CA");
    await db.insert(s.dailyMoves).values({ workspaceId, productId: p!.id, day: yesterday, rank: 1, kind: "listening", title: move!.title, refId: move!.refId });
    const [next] = await listeningCandidates(p!.id, today, now);
    expect(next).toMatchObject({ kind: "listening", refId: "community:bluesky:" });
  });
});
