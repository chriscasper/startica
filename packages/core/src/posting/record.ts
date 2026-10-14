import { and, desc, eq, isNull } from "drizzle-orm";
import { transaction } from "@startica/db/client";
import { contentPieces, conversations, drafts, opportunities, publications } from "@startica/db/schema";
import type { PostingTarget } from "./requests.ts";

/**
 * Records that the user posted a reply: one `publications` row (which
 * engagement_sync then follows) and the opportunity moves to "posted". Used by
 * "Mark as posted" and by assisted posting. Uses the given draft, or the latest one;
 * `text` is what was actually posted when known (the user may have edited it on the
 * site). Returns false when it was already recorded (assisted posting can report twice).
 */
export async function recordReplyPosted(opts: { opportunityId: string; draftId?: string | null; url: string | null; text?: string | null }): Promise<boolean> {
  return transaction(async (tx) => {
    const [opp] = await tx.select().from(opportunities).where(eq(opportunities.id, opts.opportunityId));
    if (!opp) throw new Error("Opportunity not found");
    if (opp.status === "posted") {
      // Already posted (e.g. marked by hand while the window was open): just add a missing link.
      if (opts.url) {
        await tx
          .update(publications)
          .set({ url: opts.url })
          .where(and(eq(publications.opportunityId, opp.id), isNull(publications.url)));
      }
      return false;
    }
    const [conv] = await tx
      .select({ channel: conversations.channel, community: conversations.community })
      .from(conversations)
      .where(eq(conversations.id, opp.conversationId));
    const [draft] = opts.draftId
      ? await tx.select().from(drafts).where(and(eq(drafts.id, opts.draftId), eq(drafts.opportunityId, opp.id)))
      : await tx.select().from(drafts).where(eq(drafts.opportunityId, opp.id)).orderBy(desc(drafts.version)).limit(1);
    if (!conv || !draft) throw new Error("No draft to post");
    await tx.insert(publications).values({
      workspaceId: opp.workspaceId,
      productId: opp.productId,
      opportunityId: opp.id,
      draftId: draft.id,
      channel: conv.channel,
      community: conv.community,
      url: opts.url,
      body: opts.text?.trim() ? opts.text : draft.body,
      mentionsProduct: draft.mentionsProduct,
    });
    await tx.update(opportunities).set({ status: "posted" }).where(eq(opportunities.id, opp.id));
    return true;
  });
}

/** Marks a Content Studio piece posted; adding a link later keeps the original posting date. `text`: what was actually posted. */
export async function recordPiecePosted(opts: { pieceId: string; url: string | null; text?: string | null }): Promise<void> {
  await transaction(async (tx) => {
    const [piece] = await tx.select().from(contentPieces).where(eq(contentPieces.id, opts.pieceId));
    if (!piece) throw new Error("Piece not found");
    await tx
      .update(contentPieces)
      .set({
        status: "posted",
        postedUrl: opts.url ?? piece.postedUrl,
        postedAt: piece.postedAt ?? new Date(),
        ...(opts.text?.trim() ? { body: opts.text } : {}),
      })
      .where(eq(contentPieces.id, piece.id));
  });
}

/** What the posting window reports back once the user has posted. */
export async function recordPostingResult(target: PostingTarget, url: string | null, text: string | null = null): Promise<void> {
  if (target.kind === "draft") await recordReplyPosted({ opportunityId: target.opportunityId, draftId: target.draftId, url, text });
  else await recordPiecePosted({ pieceId: target.pieceId, url, text });
}
