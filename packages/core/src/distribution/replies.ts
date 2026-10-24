import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { contentPieces, conversations, opportunities, publicationReplies, publications, type Channel } from "@startica/db/schema";
import { othersReplies, type ReplyThread } from "../channels/types.ts";
import { storeConversation } from "./jobs.ts";

/**
 * Replies to the owner's own posts (ARCHITECTURE.md 8.1): Inbox replies and Content Studio
 * pieces that were posted with a link. engagement_sync reads them through each channel's
 * public reads (`fetchReplies`) and stores them here; the Inbox's Replies tab lists them.
 * The owner's own replies are skipped by author. "Draft an answer" turns one into a
 * conversation (origin `reply`) and an opportunity, so drafting, Post… and tracking work as
 * for any reply. Nothing is ever posted or sent automatically, and no DMs are read.
 */

export const replyStatuses = ["new", "seen", "answered", "dismissed"] as const;
export type ReplyStatus = (typeof replyStatuses)[number];

type Source = { publicationId: string; pieceId?: never } | { pieceId: string; publicationId?: never };

/**
 * Stores what a post's thread holds: new replies are inserted (one already stored keeps its
 * status), and a reply the owner has answered on the site (an answer by the post's author
 * below it) is marked answered. Returns how many replies were new.
 */
export async function storeReplies(opts: { workspaceId: string; productId: string; channel: Channel; source: Source; thread: ReplyThread }): Promise<number> {
  const db = getDb();
  const others = othersReplies(opts.thread.replies, opts.thread.ownerAuthor);
  let fresh = 0;
  for (const r of others) {
    const inserted = await db
      .insert(publicationReplies)
      .values({
        workspaceId: opts.workspaceId,
        productId: opts.productId,
        publicationId: opts.source.publicationId ?? null,
        pieceId: opts.source.pieceId ?? null,
        channel: opts.channel,
        externalId: r.externalId,
        inReplyTo: r.inReplyTo,
        url: r.url,
        author: r.author,
        body: r.body.slice(0, 20_000),
        postedAt: r.postedAt,
      })
      .onConflictDoNothing()
      .returning({ id: publicationReplies.id });
    if (inserted.length) fresh++;
  }
  // Answered on the site: the owner (the post's author) replied below it. Reddit's feeds carry no parents, so this works elsewhere.
  const owner = opts.thread.ownerAuthor?.trim().toLowerCase();
  const answered = owner ? opts.thread.replies.filter((r) => r.author?.trim().toLowerCase() === owner && r.inReplyTo).map((r) => r.inReplyTo!) : [];
  if (answered.length) {
    await db
      .update(publicationReplies)
      .set({ status: "answered" })
      .where(
        and(
          eq(publicationReplies.productId, opts.productId),
          eq(publicationReplies.channel, opts.channel),
          inArray(publicationReplies.externalId, answered),
          inArray(publicationReplies.status, ["new", "seen"]),
        ),
      );
  }
  return fresh;
}

export async function newReplyCount(productId: string): Promise<{ count: number; newestId: string | null }> {
  const db = getDb();
  const [[n], [newest]] = await Promise.all([
    db.select({ n: count() }).from(publicationReplies).where(and(eq(publicationReplies.productId, productId), eq(publicationReplies.status, "new"))),
    db
      .select({ id: publicationReplies.id })
      .from(publicationReplies)
      .where(and(eq(publicationReplies.productId, productId), eq(publicationReplies.status, "new")))
      .orderBy(desc(publicationReplies.createdAt))
      .limit(1),
  ]);
  return { count: n?.n ?? 0, newestId: newest?.id ?? null };
}

export type ReplyRow = {
  id: string;
  channel: Channel;
  url: string;
  author: string | null;
  body: string;
  postedAt: Date | null;
  status: ReplyStatus;
  opportunityId: string | null;
  /** What it answers: the owner's post, as a short label and its link. */
  post: { kind: "reply" | "piece"; label: string; url: string | null; community: string | null };
};

/** A product's replies with one status (or the open ones: new and seen), newest first. */
export async function loadReplies(productId: string, statuses: readonly ReplyStatus[], limit = 100): Promise<ReplyRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      r: publicationReplies,
      pubBody: publications.body,
      pubUrl: publications.url,
      pubCommunity: publications.community,
      pieceTitle: contentPieces.title,
      pieceTopic: contentPieces.topic,
      pieceUrl: contentPieces.postedUrl,
    })
    .from(publicationReplies)
    .leftJoin(publications, eq(publications.id, publicationReplies.publicationId))
    .leftJoin(contentPieces, eq(contentPieces.id, publicationReplies.pieceId))
    .where(and(eq(publicationReplies.productId, productId), inArray(publicationReplies.status, [...statuses])))
    .orderBy(desc(publicationReplies.postedAt), desc(publicationReplies.createdAt))
    .limit(limit);
  const short = (s: string) => (s.length > 90 ? `${s.slice(0, 87).trimEnd()}…` : s);
  return rows.map(({ r, ...p }) => ({
    id: r.id,
    channel: r.channel,
    url: r.url,
    author: r.author,
    body: r.body,
    postedAt: r.postedAt,
    status: r.status,
    opportunityId: r.opportunityId,
    post: r.publicationId
      ? { kind: "reply", label: short(p.pubBody ?? ""), url: p.pubUrl, community: p.pubCommunity }
      : { kind: "piece", label: short(p.pieceTitle || p.pieceTopic || ""), url: p.pieceUrl, community: null },
  }));
}

export async function replyStatusCounts(productId: string): Promise<Record<ReplyStatus, number>> {
  const rows = await getDb()
    .select({ status: publicationReplies.status, n: count() })
    .from(publicationReplies)
    .where(eq(publicationReplies.productId, productId))
    .groupBy(publicationReplies.status);
  return Object.fromEntries(replyStatuses.map((s) => [s, rows.find((r) => r.status === s)?.n ?? 0])) as Record<ReplyStatus, number>;
}

/** Marks replies seen, answered or dismissed (or new again). Only the workspace's own rows. */
export async function setReplyStatus(workspaceId: string, replyIds: string[], status: ReplyStatus): Promise<void> {
  if (!replyIds.length) return;
  await getDb()
    .update(publicationReplies)
    .set({ status })
    .where(and(eq(publicationReplies.workspaceId, workspaceId), inArray(publicationReplies.id, replyIds)));
}

export const answerGuidance = (posted: string) =>
  `This is a reply to the owner's own post. What the owner posted: "${posted.replace(/\s+/g, " ").slice(0, 600)}". Write the owner's answer to this reply, as the author of that post: answer their point or question directly, don't repeat the post, and don't mention or link the product again unless they ask about it.`.slice(0, 1000);

/**
 * "Draft an answer": a conversation (origin `reply`) and an opportunity from the reply, then
 * the regular draft_generate job with guidance that it answers the owner's own post. Returns
 * the opportunity id. Running it again for the same reply redrafts the same opportunity.
 */
export async function draftReplyAnswer(workspaceId: string, replyId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({
      r: publicationReplies,
      pubBody: publications.body,
      pubCommunity: publications.community,
      convTitle: conversations.title,
      convThreadTitle: conversations.threadTitle,
      pieceTitle: contentPieces.title,
      pieceTopic: contentPieces.topic,
      pieceBody: contentPieces.body,
    })
    .from(publicationReplies)
    .leftJoin(publications, eq(publications.id, publicationReplies.publicationId))
    .leftJoin(opportunities, eq(opportunities.id, publications.opportunityId))
    .leftJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .leftJoin(contentPieces, eq(contentPieces.id, publicationReplies.pieceId))
    .where(and(eq(publicationReplies.id, z.guid().parse(replyId)), eq(publicationReplies.workspaceId, workspaceId)));
  if (!row) throw new Error("Reply not found");
  const r = row.r;
  const posted = (r.publicationId ? row.pubBody : row.pieceBody) ?? "";
  const threadTitle = r.publicationId ? (row.convTitle ?? row.convThreadTitle) : (row.pieceTitle ?? row.pieceTopic);
  const { opportunityId } = await storeConversation({
    workspaceId,
    productId: r.productId,
    origin: "reply",
    matchedOn: "reply",
    conversation: {
      channel: r.channel,
      externalId: r.externalId,
      url: r.url,
      kind: "comment",
      community: r.publicationId ? (row.pubCommunity ?? null) : null,
      author: r.author,
      title: null,
      threadTitle: threadTitle ?? null,
      body: r.body,
      postedAt: r.postedAt,
      score: null,
      numComments: null,
    },
  });
  await db.update(opportunities).set({ status: "drafting", error: null, reasoning: "A reply to your own post." }).where(eq(opportunities.id, opportunityId));
  await db.update(publicationReplies).set({ opportunityId, status: r.status === "new" ? "seen" : r.status }).where(eq(publicationReplies.id, r.id));
  await enqueue(workspaceId, "draft_generate", { opportunityId, guidance: answerGuidance(posted) });
  return opportunityId;
}
