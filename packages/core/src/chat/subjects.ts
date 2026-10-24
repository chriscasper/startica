import { randomUUID } from "node:crypto";
import { and, desc, eq, max } from "drizzle-orm";
import type { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { a11yIssueGroups, ads, contentPieces, drafts, opportunities, securityFindings, type A11yAiFix, type ChatSubjectKind, type SecurityAiHelp } from "@startica/db/schema";
import { FIX_SYSTEM, fixContext, fixFrom, fixOutput, ownGroup } from "../a11y/ai.ts";
import { adCopyContext, adWithCampaign, competitorNames, flagLines, type AdCopyValue } from "../ads/jobs.ts";
import { adCopySystem, adSchema, fromAdCopy, toAdCopy } from "../ads/prompts.ts";
import { campaignOutput, formatCampaign, parseCampaign } from "../content/campaign.ts";
import { contentPieceValue, pieceContext, pieceLink, type ContentPieceValue } from "../content/jobs.ts";
import { contentOutput, contentSystem } from "../content/prompts.ts";
import { loadProductContext } from "../distribution/context.ts";
import { draftContext, replyDraftValue, type ReplyDraftValue } from "../distribution/jobs.ts";
import { draftOutput, draftSystem } from "../distribution/prompts.ts";
import { EXPLAIN_SYSTEM, explainContext, explainOutput, helpFrom } from "../security/ai.ts";
import { ownFinding } from "../security/findings.ts";
import { isSecurityRule, SECURITY_RULES } from "../security/rules.ts";

/**
 * What a Refine chat can work on (ARCHITECTURE.md section 5.1). Each kind says how to load the
 * suggestion and what the AI should know about it, the shape of a revision (the same schema the
 * suggestion was first written with), and how to store one. Adding a kind: an entry here, its
 * kind in `chatSubjectKinds` (schema.ts), and its revision view in the desktop's refine panel.
 */
export type ChatSubject<P extends z.ZodType = z.ZodType, V extends object = object> = {
  /** What the suggestion is called in the panel and the prompt ("the fix steps"). */
  noun: string;
  /** The feature's own instructions (who the owner is, the rules), followed by the chat rules. */
  system?: string;
  /** The revision's shape: the tool input the model writes. */
  revision?: P;
  /**
   * The title, the context the AI sees, and the suggestion shown now, plus `system` and
   * `revision` when they depend on the subject (the product, the ad platform) instead of above.
   * Throws when the subject isn't the workspace's.
   */
  load(workspaceId: string, subjectId: string): Promise<LoadedSubject<V>>;
  /** The stored value from an accepted revision; `current` is the value it revises. */
  toStored(revision: z.infer<P>, model: string, current: V | null): V;
  /** The stored value in the revision's shape (what the AI sees as the current version). */
  toRevision(value: V): z.infer<P>;
  /** Writes a stored value to the subject (apply a revision, restore a version). */
  write(workspaceId: string, subjectId: string, value: V): Promise<void>;
  /** Startica's own checks on a revision, shown under the reply that proposed it (ad copy limits). */
  problems?(workspaceId: string, subjectId: string, revision: z.infer<P>): Promise<string[]>;
};

export type LoadedSubject<V extends object = object> = { title: string; context: string; current: V | null; system?: string; revision?: z.ZodType };

/** The system instructions and revision schema for a loaded subject. */
export function subjectShape(subject: ChatSubject, loaded: LoadedSubject): { system: string; revision: z.ZodType } {
  const system = loaded.system ?? subject.system;
  const revision = loaded.revision ?? subject.revision;
  if (system === undefined || !revision) throw new Error(`The ${subject.noun} can't be refined: its instructions are missing`);
  return { system, revision };
}

const securityHelp: ChatSubject<typeof explainOutput, SecurityAiHelp> = {
  noun: "fix steps",
  system: EXPLAIN_SYSTEM,
  revision: explainOutput,
  async load(workspaceId, subjectId) {
    const { finding, site } = await ownFinding(workspaceId, subjectId);
    const title = isSecurityRule(finding.rule) ? SECURITY_RULES[finding.rule].title : (finding.title ?? finding.rule);
    return { title, context: await explainContext(finding, site), current: finding.aiHelp };
  },
  toStored: (revision, model) => helpFrom(revision, model),
  toRevision: (v) => ({ summary: v.summary, steps: v.steps, snippets: v.snippets, verify: v.verify }),
  async write(workspaceId, subjectId, value) {
    await ownFinding(workspaceId, subjectId);
    await getDb().update(securityFindings).set({ aiHelp: value, aiStatus: "ready", aiError: null }).where(eq(securityFindings.id, subjectId));
  },
};

const a11yFix: ChatSubject<typeof fixOutput, A11yAiFix> = {
  noun: "fix",
  system: FIX_SYSTEM,
  revision: fixOutput,
  async load(workspaceId, subjectId) {
    const { group, content } = await fixContext(workspaceId, subjectId);
    return { title: group.help, context: content, current: group.aiFix };
  },
  toStored: (revision, model) => fixFrom(revision, model, null),
  toRevision: (v) => ({ explanation: v.explanation, fixed_html: v.html, steps: v.steps, confidence: v.confidence }),
  async write(workspaceId, subjectId, value) {
    await ownGroup(workspaceId, subjectId);
    await getDb().update(a11yIssueGroups).set({ aiFix: value, aiFixStatus: "ready", aiFixError: null }).where(eq(a11yIssueGroups.id, subjectId));
  },
};

// --- Writing: Inbox reply drafts, Content Studio pieces, ad copy ----------------------------

async function latestDraft(opportunityId: string) {
  const [row] = await getDb().select().from(drafts).where(eq(drafts.opportunityId, opportunityId)).orderBy(desc(drafts.version)).limit(1);
  return row ?? null;
}

/** An Inbox reply draft, by opportunity. A revision is a new `drafts` version, like the owner's edits. */
const replyDraft: ChatSubject<typeof draftOutput, ReplyDraftValue> = {
  noun: "reply draft",
  revision: draftOutput,
  async load(workspaceId, subjectId) {
    const { row, product, link, content } = await draftContext(workspaceId, subjectId, randomUUID());
    const latest = await latestDraft(row.id);
    // A mention needs a link even when the current draft has none: the draft generator's, tagged anew.
    const current = latest ? { ...replyDraftValue(latest), link: latest.utmUrl ?? link } : null;
    const title = row.title ?? row.threadTitle ?? `A ${row.kind} on ${row.channel}`;
    return { title, context: content, current, system: draftSystem(product.text) };
  },
  toStored: (revision, _model, current) => ({ body: revision.reply.trim(), mentionsProduct: revision.mentions_product, rationale: revision.rationale, link: current?.link ?? null, source: "ai" }),
  toRevision: (v) => ({ reply: v.body, mentions_product: v.mentionsProduct, rationale: v.rationale ?? "" }),
  async write(workspaceId, subjectId, value) {
    const [opp] = await getDb()
      .select({ id: opportunities.id, status: opportunities.status })
      .from(opportunities)
      .where(and(eq(opportunities.id, subjectId), eq(opportunities.workspaceId, workspaceId)));
    if (!opp) throw new Error("Conversation not found");
    if (opp.status === "drafting") throw new Error("A new draft is being written; wait for it first");
    if (opp.status !== "drafted" && opp.status !== "failed") throw new Error("Only a reply that hasn't been posted or dismissed can change");
    await transaction(async (tx) => {
      const [latest] = await tx.select({ version: max(drafts.version) }).from(drafts).where(eq(drafts.opportunityId, opp.id));
      await tx.insert(drafts).values({
        workspaceId,
        opportunityId: opp.id,
        version: (latest?.version ?? 0) + 1,
        body: value.body,
        mentionsProduct: value.mentionsProduct,
        rationale: value.rationale,
        utmUrl: value.mentionsProduct ? value.link : null,
        source: value.source,
      });
      await tx.update(opportunities).set({ status: "drafted", error: null }).where(eq(opportunities.id, opp.id));
    });
  },
};

async function ownPiece(workspaceId: string, pieceId: string) {
  const [piece] = await getDb()
    .select()
    .from(contentPieces)
    .where(and(eq(contentPieces.id, pieceId), eq(contentPieces.workspaceId, workspaceId)));
  if (!piece) throw new Error("Content piece not found");
  return piece;
}

type PieceRevision = z.infer<typeof contentOutput> | z.infer<typeof campaignOutput>;

/** A Content Studio piece; an email campaign is revised as its separate emails (campaign.ts). */
const contentPiece: ChatSubject<z.ZodType<PieceRevision>, ContentPieceValue> = {
  noun: "piece",
  async load(workspaceId, subjectId) {
    const piece = await ownPiece(workspaceId, subjectId);
    const product = await loadProductContext(piece.productId);
    const link = piece.utmUrl ?? pieceLink(product.url, piece);
    return {
      title: piece.title || piece.topic,
      context: await pieceContext(piece, link),
      current: piece.body ? contentPieceValue(piece, link) : null,
      system: contentSystem(product.text),
      revision: piece.format === "campaign" ? campaignOutput : contentOutput,
    };
  },
  toStored(revision, _model, current) {
    const body = "emails" in revision ? formatCampaign(revision.emails) : revision.body.trim();
    return { format: current?.format ?? "post", title: revision.title.trim() || null, body, rationale: revision.rationale, mentionsProduct: revision.mentions_product, link: current?.link ?? null };
  },
  toRevision(v) {
    const base = { title: v.title ?? "", mentions_product: v.mentionsProduct, rationale: v.rationale ?? "" };
    if (v.format !== "campaign") return { ...base, body: v.body };
    // Edited out of shape, the whole text is one email.
    const emails = parseCampaign(v.body) ?? [{ subject: v.title ?? "", preview: "", sendDay: 0, body: v.body }];
    return { ...base, emails: emails.map((e) => ({ subject: e.subject, preview: e.preview, send_day: e.sendDay, body: e.body })) };
  },
  async write(workspaceId, subjectId, value) {
    const piece = await ownPiece(workspaceId, subjectId);
    if (piece.status === "drafting") throw new Error("A new version is being written; wait for it first");
    if (piece.status === "posted") throw new Error("This piece is posted; changing it here wouldn't change the post");
    await getDb()
      .update(contentPieces)
      .set({ title: value.title, body: value.body, rationale: value.rationale, utmUrl: value.mentionsProduct ? value.link : null, status: "draft", error: null })
      .where(eq(contentPieces.id, piece.id));
  },
};

async function ownAdRow(workspaceId: string, adId: string) {
  const row = await adWithCampaign(workspaceId, adId);
  if (!row) throw new Error("Ad not found");
  return row;
}

/** One ad's copy, in its platform's shape; revisions get the same checks as the ad editor. */
const adCopy: ChatSubject<z.ZodType<Record<string, unknown>>, AdCopyValue> = {
  noun: "ad",
  async load(workspaceId, subjectId) {
    const row = await ownAdRow(workspaceId, subjectId);
    const { ad, group, campaign } = row;
    const problems = flagLines(campaign.platform, ad.copy, await competitorNames(campaign.productId));
    const context = [await adCopyContext(row), problems.length ? `<problems>\n${problems.map((p) => `- ${p}`).join("\n")}\n</problems>` : ""].filter(Boolean).join("\n\n");
    return {
      title: `An ad in ${group.name}`,
      context,
      current: { platform: campaign.platform, copy: ad.copy, source: ad.source, createdAt: ad.updatedAt.toISOString() },
      system: adCopySystem(campaign.platform),
      revision: adSchema(campaign.platform),
    };
  },
  toStored(revision, _model, current) {
    if (!current) throw new Error("There's no ad to revise");
    return { platform: current.platform, copy: toAdCopy(current.platform, revision), source: "ai" };
  },
  toRevision: (v) => fromAdCopy(v.platform, v.copy),
  async write(workspaceId, subjectId, value) {
    const { ad, campaign } = await ownAdRow(workspaceId, subjectId);
    if (ad.status === "rewriting") throw new Error("The ad is being rewritten; wait for it first");
    if (campaign.platform !== value.platform) throw new Error("That version is for another platform");
    await getDb().update(ads).set({ copy: value.copy, source: value.source, status: "ready", error: null }).where(eq(ads.id, ad.id));
  },
  async problems(workspaceId, subjectId, revision) {
    const { campaign } = await ownAdRow(workspaceId, subjectId);
    return flagLines(campaign.platform, toAdCopy(campaign.platform, revision), await competitorNames(campaign.productId));
  },
};

export const CHAT_SUBJECTS: Record<ChatSubjectKind, ChatSubject> = {
  security_help: securityHelp as unknown as ChatSubject,
  a11y_fix: a11yFix as unknown as ChatSubject,
  reply_draft: replyDraft as unknown as ChatSubject,
  content_piece: contentPiece as unknown as ChatSubject,
  ad_copy: adCopy as unknown as ChatSubject,
};
