import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import {
  communities,
  contentPieces,
  contentSnapshots,
  conversations,
  drafts,
  engagementSnapshots,
  keywords,
  opportunities,
  products,
  publications,
} from "@startica/db/schema";
import { runStructured, type AiContext } from "../ai/client.ts";
import { reportProgress } from "../jobs/activity.ts";
import { adapters, channelFromUrl } from "../channels/index.ts";
import type { RawConversation } from "../channels/types.ts";
import { loadProductContext, type ProductContext } from "./context.ts";
import { findNearDuplicate, fingerprint } from "./fingerprint.ts";
import { listeningState } from "./listening.ts";
import { storeReplies } from "./replies.ts";
import { loadMatchers, matchConversation, refreshListeningMatches, type Matchers } from "./matching.ts";
import { forumBase } from "../channels/discourse.ts";
import { parseTagCommunity } from "../channels/mastodon.ts";
import { DRAFT_PROMPT_VERSION, draftOutput, draftSystem, SCORE_PROMPT_VERSION, scoreOutput, scoreSystem } from "./prompts.ts";
import { utmUrl } from "./utm.ts";
import { recordVersion } from "../chat/versions.ts";

const LOOKBACK_HOURS = 26; // hourly scans overlap; the unique key dedupes
const MAX_AGE_DAYS = 7; // older threads have usually gone quiet (ARCHITECTURE.md 11.1)
// Per product and source, caps scoring spend on noisy keywords. Per source, so one
// noisy source can't crowd out the others (or waste a paid source's reads, ARCHITECTURE.md 8.1).
const MAX_NEW_PER_SOURCE = 60;
const SCORE_BATCH = 20;
const PROMO_WINDOW_DAYS = 30;
const ENGAGEMENT_DAYS = 14;
const DEDUPE_WINDOW_DAYS = 14; // cross-posts and reposts usually land within days

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

/** Stores a conversation (deduped) and links it to a product as an opportunity. */
export async function storeConversation(opts: {
  workspaceId: string;
  productId: string;
  conversation: RawConversation;
  origin: "listening" | "manual" | "reply";
  matchedOn: string | null;
  /** The product's keywords, name and competitors (loaded when not given; pass them when storing many). */
  matchers?: Matchers;
}): Promise<{ opportunityId: string; isNew: boolean }> {
  const c = opts.conversation;
  const fp = fingerprint(c.title, c.body);
  const matches = matchConversation(c, opts.matchers ?? (await loadMatchers(opts.productId)));
  return transaction(async (db) => {
    const [conv] = await db
      .insert(conversations)
      .values({
        workspaceId: opts.workspaceId,
        channel: c.channel,
        externalId: c.externalId,
        url: c.url,
        kind: c.kind,
        community: c.community,
        author: c.author,
        title: c.title,
        threadTitle: c.threadTitle,
        body: c.body,
        postedAt: c.postedAt,
        score: c.score,
        numComments: c.numComments,
        origin: opts.origin,
        fingerprint: fp,
      })
      .onConflictDoUpdate({
        target: [conversations.workspaceId, conversations.channel, conversations.externalId],
        set: {
          score: c.score,
          numComments: c.numComments,
          ...(opts.origin === "manual" && c.body
            ? { body: c.body, fingerprint: fp }
            : { fingerprint: sql`coalesce(${conversations.fingerprint}, ${fp})` }),
        },
      })
      .returning({ id: conversations.id });

    const [inserted] = await db
      .insert(opportunities)
      .values({ workspaceId: opts.workspaceId, productId: opts.productId, conversationId: conv!.id, matchedOn: opts.matchedOn, ...matches })
      .onConflictDoNothing()
      .returning({ id: opportunities.id });
    if (inserted) return { opportunityId: inserted.id, isNew: true };

    const [existing] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.productId, opts.productId), eq(opportunities.conversationId, conv!.id)));
    // A pasted link may bring the full text: match it again.
    if (opts.origin === "manual" && c.body) await db.update(opportunities).set(matches).where(eq(opportunities.id, existing!.id));
    return { opportunityId: existing!.id, isNew: false };
  });
}

// --- listen_scan ----------------------------------------------------------------

export const listenScanPayload = z.object({ workspaceId: z.guid(), productId: z.guid().optional() });

export async function runListenScan(ctx: AiContext, payload: z.infer<typeof listenScanPayload>) {
  const db = getDb();
  const scope = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(
        eq(products.workspaceId, payload.workspaceId),
        payload.productId ? eq(products.id, payload.productId) : undefined,
        isNotNull(products.brief),
      ),
    );
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000);
  const summary: Record<string, { found: number; new: number; errors: Record<string, string>; paused?: boolean; skipped?: string[] }> = {};

  // The hourly run (no product) skips products whose search is paused; Scan now searches anyway.
  const scheduled = !payload.productId;
  for (const product of scope) {
    const listening = await listeningState(product.id);
    if (scheduled && listening.paused) {
      summary[product.id] = { found: 0, new: 0, errors: {}, paused: true };
      continue;
    }
    const words = await db
      .select({ keyword: keywords.keyword })
      .from(keywords)
      .where(and(eq(keywords.productId, product.id), inArray(keywords.useFor, ["listening", "both"])))
      .orderBy(desc(keywords.source), asc(keywords.createdAt)); // owner's keywords first
    // Fill or refresh keyword and mention matches (listening trends), then reuse the matchers for this scan.
    await refreshListeningMatches(product.id);
    const matchers = await loadMatchers(product.id);
    const watched = await db
      .select({ channel: communities.channel, name: communities.name, url: communities.url })
      .from(communities)
      .where(and(eq(communities.productId, product.id), eq(communities.status, "watching")));

    let found = 0;
    let fresh = 0;
    const errors: Record<string, string> = {};
    for (const adapter of Object.values(adapters)) {
      // Sources the owner paused are skipped in every scan.
      if (listening.channels.includes(adapter.channel)) continue;
      // Stopped by the user: what earlier sources found is already stored and queued.
      ctx.signal?.throwIfAborted();
      // One source failing (a forum down, X out of credits) doesn't stop the others,
      // and each source's finds are queued for scoring right away.
      try {
        await reportProgress(ctx.jobRunId, { channel: adapter.channel });
        const discovered = await adapter.discover({
          keywords: words.map((k) => k.keyword),
          communities: watched.filter((c) => c.channel === adapter.channel).map((c) => ({ name: c.name, url: c.url })),
          since,
          signal: ctx.signal,
        });
        found += discovered.length;
        const newIds: string[] = [];
        for (const conversation of discovered) {
          if (newIds.length >= MAX_NEW_PER_SOURCE) break;
          const { opportunityId, isNew } = await storeConversation({
            workspaceId: payload.workspaceId,
            productId: product.id,
            conversation,
            origin: "listening",
            matchedOn: adapter.channel,
            matchers,
          });
          if (isNew) newIds.push(opportunityId);
        }
        for (let i = 0; i < newIds.length; i += SCORE_BATCH) {
          await enqueue(payload.workspaceId, "opportunity_score", { opportunityIds: newIds.slice(i, i + SCORE_BATCH) });
        }
        fresh += newIds.length;
      } catch (error) {
        errors[adapter.channel] = error instanceof Error ? error.message : String(error);
      }
    }
    summary[product.id] = { found, new: fresh, errors, ...(listening.channels.length ? { skipped: listening.channels } : {}) };
  }
  return summary;
}

// --- opportunity_score ------------------------------------------------------------

export const scorePayload = z.object({
  workspaceId: z.guid(),
  opportunityIds: z.array(z.guid()).min(1),
  // Pasted links skip the thresholds and always get a draft.
  force: z.boolean().default(false),
});

const conversationFields = {
  id: opportunities.id,
  productId: opportunities.productId,
  angle: opportunities.angle,
  createdAt: opportunities.createdAt,
  fingerprint: conversations.fingerprint,
  channel: conversations.channel,
  kind: conversations.kind,
  community: conversations.community,
  title: conversations.title,
  threadTitle: conversations.threadTitle,
  body: conversations.body,
  author: conversations.author,
  postedAt: conversations.postedAt,
  url: conversations.url,
};

export type ConversationRow = {
  channel: string;
  kind: string;
  community: string | null;
  title: string | null;
  threadTitle: string | null;
  body: string;
  author: string | null;
};

/** How a conversation is shown to the scoring and drafting prompts (also used by the score eval). */
export function conversationText(r: ConversationRow) {
  return [
    `Channel: ${r.channel}${r.community ? ` (${r.community})` : ""}, ${r.kind}`,
    r.threadTitle && `In thread: ${r.threadTitle}`,
    r.title && `Title: ${r.title}`,
    r.author && `Author: ${r.author}`,
    `Text:\n${r.body.slice(0, 6000) || "(no text)"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 100) / 100));

type DedupeCandidate = { id: string; fingerprint: string; createdAt: Date; url: string; duplicateOfId: string | null };

/** The product's recent opportunities with fingerprints, oldest first (the original of a set of copies comes first). */
async function dedupeCandidates(productId: string): Promise<DedupeCandidate[]> {
  const rows = await getDb()
    .select({
      id: opportunities.id,
      fingerprint: conversations.fingerprint,
      createdAt: opportunities.createdAt,
      url: conversations.url,
      duplicateOfId: opportunities.duplicateOfId,
    })
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(
      and(
        eq(opportunities.productId, productId),
        isNotNull(conversations.fingerprint),
        gt(opportunities.createdAt, daysAgo(DEDUPE_WINDOW_DAYS)),
      ),
    )
    .orderBy(asc(opportunities.createdAt), asc(opportunities.id));
  return rows as DedupeCandidate[];
}

/** An earlier, non-duplicate opportunity with (nearly) the same text, if any. */
function earlierCopy(row: { id: string; fingerprint: string | null; createdAt: Date }, candidates: DedupeCandidate[]) {
  if (!row.fingerprint) return null;
  const earlier = candidates.filter(
    (c) =>
      c.id !== row.id &&
      !c.duplicateOfId &&
      (c.createdAt < row.createdAt || (c.createdAt.getTime() === row.createdAt.getTime() && c.id < row.id)),
  );
  return findNearDuplicate(row.fingerprint, earlier);
}

export async function runOpportunityScore(ctx: AiContext, payload: z.infer<typeof scorePayload>) {
  const db = getDb();
  const rows = await db
    .select(conversationFields)
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(and(inArray(opportunities.id, payload.opportunityIds), eq(opportunities.workspaceId, payload.workspaceId)));
  const contexts = new Map<string, ProductContext>();
  const candidatesByProduct = new Map<string, DedupeCandidate[]>();
  const tally = { drafting: 0, archived: 0, duplicates: 0 };
  const tooOld = daysAgo(MAX_AGE_DAYS);

  for (const row of rows) {
    if (!payload.force && row.postedAt && row.postedAt < tooOld) {
      await db
        .update(opportunities)
        .set({ status: "archived", reasoning: "Older than 7 days.", scoredAt: new Date() })
        .where(eq(opportunities.id, row.id));
      tally.archived++;
      continue;
    }
    // Skip scoring a copy of something already triaged (a cross-post, a resubmission).
    if (!payload.force && row.fingerprint) {
      let candidates = candidatesByProduct.get(row.productId);
      if (!candidates) {
        candidates = await dedupeCandidates(row.productId);
        candidatesByProduct.set(row.productId, candidates);
      }
      const original = earlierCopy(row, candidates);
      if (original) {
        await db
          .update(opportunities)
          .set({
            status: "archived",
            duplicateOfId: original.id,
            reasoning: `Near-duplicate of a conversation Startica already triaged: ${original.url}`,
            scoredAt: new Date(),
          })
          .where(eq(opportunities.id, row.id));
        const self = candidates.find((c) => c.id === row.id);
        if (self) self.duplicateOfId = original.id;
        tally.duplicates++;
        continue;
      }
    }
    let product = contexts.get(row.productId);
    if (!product) {
      product = await loadProductContext(row.productId);
      contexts.set(row.productId, product);
    }

    const score = await runStructured(ctx, {
      task: "score",
      promptVersion: SCORE_PROMPT_VERSION,
      system: scoreSystem(product.text),
      messages: [{ role: "user", content: conversationText(row) }],
      schema: scoreOutput,
    });
    const relevance = clamp(score.relevance);
    const intent = clamp(score.intent);
    const qualifies = payload.force || (relevance >= product.relevanceThreshold && intent >= product.intentThreshold);

    await db
      .update(opportunities)
      .set({
        relevance,
        intent,
        reasoning: score.reasoning,
        angle: score.angle,
        sentiment: score.sentiment,
        status: qualifies ? "drafting" : "archived",
        scoredAt: new Date(),
      })
      .where(eq(opportunities.id, row.id));
    if (qualifies) {
      await enqueue(payload.workspaceId, "draft_generate", { opportunityId: row.id });
      tally.drafting++;
    } else {
      tally.archived++;
    }
  }
  return tally;
}

/**
 * The watched community a conversation belongs to, for its self-promotion rules. A
 * Discourse forum is matched by its address (a pasted link's community is just the
 * host), a Mastodon hashtag with or without its server, anything else by name.
 */
export function matchCommunity<C extends { name: string; url: string | null }>(
  channel: string,
  conv: { community: string | null; url: string },
  candidates: C[],
): C | null {
  const lower = (v: string | null | undefined) => v?.trim().toLowerCase() ?? "";
  if (channel === "discourse") {
    const host = (value: string | null) => {
      const base = value ? forumBase(value) : null;
      return base ? new URL(base).host + new URL(base).pathname : null;
    };
    const target = host(conv.url);
    return candidates.find((c) => (target && host(c.url ?? c.name) && target.startsWith(host(c.url ?? c.name)!)) || lower(c.name) === lower(conv.community)) ?? null;
  }
  if (channel === "mastodon") {
    const tag = (name: string | null, url: string | null = null) => {
      const t = name || url ? parseTagCommunity(name ?? "", url) : null;
      return t ? `${t.tag}@${t.server}`.toLowerCase() : null;
    };
    const target = tag(conv.community);
    return candidates.find((c) => target && tag(c.name, c.url) === target) ?? null;
  }
  return conv.community ? (candidates.find((c) => lower(c.name) === lower(conv.community)) ?? null) : null;
}

// --- draft_generate ---------------------------------------------------------------

export const draftPayload = z.object({
  workspaceId: z.guid(),
  opportunityId: z.guid(),
  // Extra direction from the owner when regenerating ("shorter", "don't mention the product").
  guidance: z.string().max(1000).optional(),
});

/**
 * A reply draft as Refine and Versions keep it (ARCHITECTURE.md 5.1). `link` is the product link a
 * mention uses; `createdAt` dates a draft written before versions were kept.
 */
export type ReplyDraftValue = { body: string; mentionsProduct: boolean; rationale: string | null; link: string | null; source: "ai" | "owner"; createdAt?: string };

export const replyDraftValue = (d: typeof drafts.$inferSelect): ReplyDraftValue => ({
  body: d.body,
  mentionsProduct: d.mentionsProduct,
  rationale: d.rationale,
  link: d.utmUrl,
  source: d.source,
  createdAt: d.createdAt.toISOString(),
});

/** The owner's own edit of a reply draft: a new version that keeps the link and the mention (kept under Versions too). */
export async function saveOwnerDraft(workspaceId: string, opportunityId: string, body: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("The draft is empty");
  const latest = await transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(drafts)
      .where(and(eq(drafts.opportunityId, opportunityId), eq(drafts.workspaceId, workspaceId)))
      .orderBy(desc(drafts.version))
      .limit(1);
    await tx.insert(drafts).values({
      workspaceId,
      opportunityId,
      version: (row?.version ?? 0) + 1,
      body: text,
      mentionsProduct: row?.mentionsProduct ?? false,
      utmUrl: row?.utmUrl ?? null,
      rationale: "Edited by you.",
      source: "owner",
    });
    return row ?? null;
  });
  const value: ReplyDraftValue = { body: text, mentionsProduct: latest?.mentionsProduct ?? false, rationale: "Edited by you.", link: latest?.utmUrl ?? null, source: "owner" };
  await recordVersion({ workspaceId, kind: "reply_draft", subjectId: opportunityId }, value, "edited", { previous: latest ? replyDraftValue(latest) : null });
}

/**
 * What a reply is drafted from: the conversation, the community's rules and recent replies there,
 * the suggested angle and the product link (tagged with `draftId`). Also the Refine chat's context.
 */
export async function draftContext(workspaceId: string, opportunityId: string, draftId: string) {
  const db = getDb();
  const [row] = await db
    .select(conversationFields)
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.workspaceId, workspaceId)));
  if (!row) throw new Error(`Opportunity ${opportunityId} not found`);
  const product = await loadProductContext(row.productId);

  const communityName = row.channel === "reddit" ? (row.community?.replace(/^r\//i, "") ?? null) : row.community;
  const candidates = await db
    .select({ name: communities.name, url: communities.url, promoRules: communities.promoRules })
    .from(communities)
    .where(and(eq(communities.productId, row.productId), eq(communities.channel, row.channel)));
  const community = matchCommunity(row.channel, { community: communityName, url: row.url }, candidates);
  const [promo] = await db
    .select({
      total: sql<number>`count(*)`,
      mentions: sql<number>`coalesce(sum(${publications.mentionsProduct}), 0)`,
    })
    .from(publications)
    .where(
      and(
        eq(publications.productId, row.productId),
        eq(publications.channel, row.channel),
        row.community === null ? isNull(publications.community) : eq(publications.community, row.community),
        gt(publications.postedAt, daysAgo(PROMO_WINDOW_DAYS)),
      ),
    );

  const link = product.url ? utmUrl(product.url, { channel: row.channel as RawConversation["channel"], community: communityName, draftId }) : null;
  const content = [
    `<conversation url="${row.url}">\n${conversationText(row)}\n</conversation>`,
    `<community>\n${row.community ?? row.channel}\nSelf-promotion rules: ${community?.promoRules || "unknown"}\nRecent replies there: ${promo?.total ?? 0}, of which ${promo?.mentions ?? 0} mentioned the product (last ${PROMO_WINDOW_DAYS} days).\n</community>`,
    row.angle && `<suggested_angle>${row.angle}</suggested_angle>`,
    link ? `<link>${link}</link>` : "<link>(no product link available; don't link)</link>",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { row, product, link, content };
}

export async function runDraftGenerate(ctx: AiContext, payload: z.infer<typeof draftPayload>) {
  const db = getDb();
  const draftId = randomUUID();
  const where = and(eq(opportunities.id, payload.opportunityId), eq(opportunities.workspaceId, payload.workspaceId));
  try {
    await db.update(opportunities).set({ status: "drafting", error: null }).where(where);
    const { row, product, link, content } = await draftContext(payload.workspaceId, payload.opportunityId, draftId);
    const [previous] = await db.select().from(drafts).where(eq(drafts.opportunityId, row.id)).orderBy(desc(drafts.version)).limit(1);

    const draft = await runStructured(ctx, {
      task: "draft",
      promptVersion: DRAFT_PROMPT_VERSION,
      system: draftSystem(product.text),
      messages: [{ role: "user", content: [content, payload.guidance && `<owner_guidance>${payload.guidance}</owner_guidance>`].filter(Boolean).join("\n\n") }],
      schema: draftOutput,
    });

    await transaction(async (tx) => {
      const [latest] = await tx.select({ version: max(drafts.version) }).from(drafts).where(eq(drafts.opportunityId, row.id));
      await tx.insert(drafts).values({
        id: draftId,
        workspaceId: payload.workspaceId,
        opportunityId: row.id,
        version: (latest?.version ?? 0) + 1,
        body: draft.reply,
        mentionsProduct: draft.mentions_product,
        rationale: draft.rationale,
        utmUrl: draft.mentions_product ? link : null,
        source: "ai",
      });
      await tx.update(opportunities).set({ status: "drafted" }).where(eq(opportunities.id, row.id));
    });
    await recordVersion(
      { workspaceId: payload.workspaceId, kind: "reply_draft", subjectId: row.id },
      { body: draft.reply, mentionsProduct: draft.mentions_product, rationale: draft.rationale, link, source: "ai" } satisfies ReplyDraftValue,
      "suggested",
      { previous: previous ? replyDraftValue(previous) : null },
    );
    return { draftId, mentionsProduct: draft.mentions_product };
  } catch (error) {
    await db
      .update(opportunities)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(where);
    throw error;
  }
}

// --- engagement_sync --------------------------------------------------------------

export const engagementPayload = z.object({ workspaceId: z.guid() });

export async function runEngagementSync(ctx: AiContext, payload: z.infer<typeof engagementPayload>) {
  const db = getDb();
  const since = daysAgo(ENGAGEMENT_DAYS);
  const [pubs, pieces] = await Promise.all([
    db
      .select({ id: publications.id, productId: publications.productId, url: publications.url })
      .from(publications)
      .where(and(eq(publications.workspaceId, payload.workspaceId), isNotNull(publications.url), gt(publications.postedAt, since))),
    // Content Studio pieces posted with a link (ARCHITECTURE.md section 3, Content Studio: tracked like Inbox replies).
    db
      .select({ id: contentPieces.id, productId: contentPieces.productId, url: contentPieces.postedUrl })
      .from(contentPieces)
      .where(
        and(
          eq(contentPieces.workspaceId, payload.workspaceId),
          eq(contentPieces.status, "posted"),
          isNotNull(contentPieces.postedUrl),
          gt(contentPieces.postedAt, since),
        ),
      ),
  ]);

  // The link decides the channel: a "blog" piece may well have been posted on Reddit. Where the
  // channel reads replies, one read gives both the engagement and the replies (Reddit allows
  // about one feed a minute).
  let replies = 0;
  const read = async (url: string, productId: string, source: { publicationId: string } | { pieceId: string }) => {
    ctx.signal?.throwIfAborted();
    const channel = channelFromUrl(url);
    const adapter = adapters[channel];
    if (adapter?.fetchReplies) {
      const thread = await adapter.fetchReplies(url).catch(() => null);
      if (!thread) return null;
      replies += await storeReplies({ workspaceId: payload.workspaceId, productId, channel, source, thread });
      return thread.engagement;
    }
    return adapter?.fetchEngagement?.(url).catch(() => null) ?? null;
  };
  let captured = 0;
  for (const pub of pubs) {
    const engagement = await read(pub.url!, pub.productId, { publicationId: pub.id });
    if (!engagement) continue;
    await db.insert(engagementSnapshots).values({ workspaceId: payload.workspaceId, publicationId: pub.id, ...engagement });
    captured++;
  }
  for (const piece of pieces) {
    const engagement = await read(piece.url!, piece.productId, { pieceId: piece.id });
    if (!engagement) continue;
    await db.insert(contentSnapshots).values({ workspaceId: payload.workspaceId, pieceId: piece.id, ...engagement });
    captured++;
  }
  return { publications: pubs.length, pieces: pieces.length, captured, replies };
}
