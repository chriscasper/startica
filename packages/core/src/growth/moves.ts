import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, transaction } from "@startica/db/client";
import {
  communities,
  connections,
  contentPieces,
  dailyMoves,
  opportunities,
  products,
  roadmapItems,
  roadmapReplans,
  sites,
  voiceProfiles,
} from "@startica/db/schema";
import { hasAiKey } from "../ai/client.ts";
import { topIssue } from "../a11y/track.ts";
import { topAdSuggestions } from "../ads/results.ts";
import { latestReadySummary } from "../metrics/summary.ts";
import { openFindingCounts } from "../security/findings.ts";
import { openRoadmapItems } from "./roadmap.ts";
import { calendarCandidates } from "../content/calendar-moves.ts";
import { listeningCandidates } from "../distribution/listening-moves.ts";
import { competitorCandidates } from "../competitors/activity.ts";

/**
 * Today's moves: a short ranked list built by rules from what's actually waiting
 * (drafts to review, setup gaps) plus the roadmap's next steps, which the weekly
 * Opus plan writes. Free and instant; regenerated on demand, keeping anything the
 * owner marked done/skipped or added.
 */

export const MAX_MOVES = 7;

/** YYYY-MM-DD in the computer's local time zone. */
export function localDay(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

type Candidate = { kind: (typeof dailyMoves.$inferInsert)["kind"]; title: string; why: string; href: string; refId?: string };

export async function buildCandidates(productId: string): Promise<Candidate[]> {
  const db = getDb();
  const [[product], oppCounts, [watched], [conns], roadmap, [anyRoadmap], [voice], [recentContent], apiKey] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)),
    db
      .select({ status: opportunities.status, n: count() })
      .from(opportunities)
      .where(and(eq(opportunities.productId, productId), inArray(opportunities.status, ["drafted", "failed"])))
      .groupBy(opportunities.status),
    db
      .select({ n: count() })
      .from(communities)
      .where(and(eq(communities.productId, productId), inArray(communities.channel, ["reddit", "mastodon", "discourse"]), eq(communities.status, "watching"))),
    db.select({ n: count() }).from(connections).where(and(eq(connections.productId, productId), eq(connections.status, "ok"))),
    openRoadmapItems(productId, 3),
    db.select({ n: count() }).from(roadmapItems).where(eq(roadmapItems.productId, productId)),
    db
      .select({ id: voiceProfiles.id, name: voiceProfiles.name })
      .from(voiceProfiles)
      .where(and(eq(voiceProfiles.productId, productId), eq(voiceProfiles.status, "ready")))
      .limit(1),
    db
      .select({ n: count() })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), gte(contentPieces.createdAt, new Date(Date.now() - 3 * 86400_000)))),
    hasAiKey(),
  ]);
  if (!product) return [];

  const drafted = oppCounts.find((o) => o.status === "drafted")?.n ?? 0;
  const failed = oppCounts.find((o) => o.status === "failed")?.n ?? 0;
  const out: Candidate[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // 1. Time-sensitive: what the content calendar plans for today, then conversations that go quiet within a day or two.
  out.push(...(await calendarCandidates(productId)));
  // Replies to the owner's posts and listening spikes (ARCHITECTURE.md 8.1).
  out.push(...(await listeningCandidates(productId, localDay())));
  out.push(...(await competitorCandidates(productId)));
  if (drafted > 0) {
    out.push({
      kind: "inbox",
      title: `Review and post ${plural(drafted, "drafted reply", "drafted replies")}`,
      why: "These threads are live now; replies land best in the first day or two.",
      href: "/inbox",
    });
  }
  if (failed > 0) {
    out.push({ kind: "inbox", title: `Retry ${plural(failed, "failed draft")}`, why: "Regenerate them or dismiss them.", href: "/inbox?tab=review" });
  }

  // 2. Blocking setup.
  if (!apiKey) out.push({ kind: "setup", title: "Add your AI API key", why: "Every AI step (intel, scoring, drafts) needs it.", href: "/settings" });
  if (!product.brief) {
    out.push({
      kind: "intel",
      title: `Build intel for ${product.name}`,
      why: "The brief, personas and communities drive listening, drafts and the roadmap.",
      href: "/intel",
    });
  } else if ((watched?.n ?? 0) === 0) {
    out.push({
      kind: "setup",
      title: "Pick 3–5 communities to watch",
      why: "Startica scans the subreddits, Mastodon hashtags and Discourse forums you mark Watch (Hacker News and Bluesky are searched by keyword).",
      href: "/intel",
    });
  }

  // Accessibility (ARCHITECTURE.md section 9.3): the most important open issue, with the traffic it affects.
  const top = await topIssue(productId);
  if (top && top.band !== "low") {
    const where = top.pages.length === 1 ? new URL(top.pages[0]!).pathname : `${top.pages.length} pages`;
    out.push({
      kind: "audit",
      title: `Fix "${top.group.help}" on ${where}`,
      why: `${top.group.impact ?? "moderate"} accessibility issue${top.traffic > 0 ? `, on pages with ${Math.round(top.traffic).toLocaleString("en-US")} visits in 30 days` : ""}. ${top.group.pagesCount > 1 ? "Probably one shared template: fix it once." : ""}`.trim(),
      href: `/accessibility/issues/${top.group.id}`,
      refId: top.group.id,
    });
  }

  // Ads (ARCHITECTURE.md section 8.6, AD4): stop, scale or rewrite an ad that has spent enough to judge.
  for (const s of await topAdSuggestions(productId, 1))
    out.push({ kind: "ads", title: `${s.title} in ${s.campaignName}`, why: s.why, href: `/ads/${s.campaignId}/results`, refId: `${s.adId}:${s.verdict}` });

  // Security (ARCHITECTURE.md section 11.2): serious findings first, then sites not yet verified.
  const serious = await openFindingCounts(productId);
  const urgent = serious.critical + serious.high;
  if (urgent > 0) {
    out.push({
      kind: "audit",
      title: `Fix ${plural(urgent, serious.critical > 0 ? "critical or high security finding" : "high security finding")}`,
      why: serious.critical > 0 ? "Something sensitive is exposed on the site; fix it before anything else." : "Problems like broken HTTPS or insecure forms put visitors' data at risk.",
      href: "/security/findings",
    });
  }
  const unverified = await db
    .select({ id: sites.id, name: sites.name })
    .from(sites)
    .where(and(eq(sites.productId, productId), isNull(sites.securityVerifiedAt), isNotNull(sites.lastScanId)))
    .limit(1);
  if (unverified[0]) {
    out.push({
      kind: "setup",
      title: `Verify ${unverified[0].name} to turn on security checks`,
      why: "Prove the site is yours with a DNS record, a file or Search Console; then every scan checks it for security problems too.",
      href: `/security?site=${unverified[0].id}`,
      refId: unverified[0].id,
    });
  }

  // Analytics (ARCHITECTURE.md section 8.2): the weekly read-out's first suggestion, for the week after it was written.
  const summary = await latestReadySummary(productId);
  const next = summary?.body.tryNext[0];
  if (summary && next && Date.now() - summary.createdAt.getTime() < 7 * 86400_000) {
    out.push({ kind: "analytics", title: next.title, why: `From this week's analytics: ${next.why}`, href: "/analytics", refId: `${summary.id}:0` });
  }

  // 3. The roadmap's next steps.
  for (const item of roadmap) {
    out.push({
      kind: "roadmap",
      title: item.nextStep || item.title,
      why: item.nextStep ? `${item.title}: ${item.why}` : item.why,
      href: `/roadmap#${item.id}`,
      refId: item.id,
    });
  }

  // 4. Content cadence.
  if (voice && (recentContent?.n ?? 0) === 0) {
    out.push({
      kind: "content",
      title: "Write and post one piece in your saved voice",
      why: `Nothing new in 3 days. Your "${voice.name}" voice is ready in Content Studio.`,
      href: "/content",
      refId: voice.id,
    });
  }

  // 5. Lower-priority setup.
  if (product.brief && product.brief.open_questions.length > 0 && !product.ownerNotes) {
    out.push({
      kind: "intel",
      title: `Answer the ${plural(product.brief.open_questions.length, "open question")} in the brief`,
      why: "Your answers go into the notes and make every draft and plan sharper.",
      href: "/intel",
    });
  }
  if (product.brief && (anyRoadmap?.n ?? 0) === 0) {
    out.push({ kind: "roadmap", title: "Generate the growth roadmap", why: "Turns the intel into a short list of weekly bets.", href: "/roadmap" });
  }
  // Skip the generic nudge when a roadmap step already covers connecting analytics.
  const roadmapCoversAnalytics = roadmap.some((i) => /analytics|connect/i.test(`${i.title} ${i.nextStep}`));
  if ((conns?.n ?? 0) === 0 && !roadmapCoversAnalytics) {
    out.push({
      kind: "setup",
      title: "Connect analytics (Google, Stripe or the product database)",
      why: "Without numbers Startica can't tell which moves work.",
      href: "/settings?tab=products",
    });
  }
  return out;
}

/**
 * Returns today's moves, creating them on first view of the day. `refresh`
 * rebuilds the system-generated open moves, keeping done/skipped and owner moves.
 */
export async function ensureTodayMoves(workspaceId: string, productId: string, opts: { refresh?: boolean } = {}) {
  const day = localDay();
  const db = getDb();
  const existing = await db
    .select()
    .from(dailyMoves)
    .where(and(eq(dailyMoves.productId, productId), eq(dailyMoves.day, day)))
    .orderBy(asc(dailyMoves.rank));
  if (existing.length && !opts.refresh) return existing;

  const candidates = await buildCandidates(productId);
  return transaction(async (tx) => {
    const kept = await tx
      .select()
      .from(dailyMoves)
      .where(and(eq(dailyMoves.productId, productId), eq(dailyMoves.day, day)))
      .orderBy(asc(dailyMoves.rank));
    // Another request may have built them meanwhile.
    if (kept.length && !opts.refresh) return kept;

    const keep = kept.filter((m) => m.status !== "open" || m.source === "owner");
    const drop = kept.filter((m) => !keep.includes(m));
    if (drop.length) await tx.delete(dailyMoves).where(inArray(dailyMoves.id, drop.map((m) => m.id)));

    const seen = new Set(keep.map((m) => `${m.kind}:${m.refId ?? m.title}`));
    const fresh = candidates.filter((c) => !seen.has(`${c.kind}:${c.refId ?? c.title}`)).slice(0, Math.max(0, MAX_MOVES - keep.length));
    if (fresh.length) {
      await tx.insert(dailyMoves).values(
        fresh.map((c, i) => ({ ...c, refId: c.refId ?? null, workspaceId, productId, day, rank: keep.length + i + 1, source: "system" as const })),
      );
    }
    return tx
      .select()
      .from(dailyMoves)
      .where(and(eq(dailyMoves.productId, productId), eq(dailyMoves.day, day)))
      .orderBy(asc(dailyMoves.rank));
  });
}

/** The latest roadmap (re)plan, shown on Today. */
export async function recentReplanSummary(productId: string) {
  const [row] = await getDb()
    .select({ summary: roadmapReplans.summary, createdAt: roadmapReplans.createdAt })
    .from(roadmapReplans)
    .where(eq(roadmapReplans.productId, productId))
    .orderBy(desc(roadmapReplans.createdAt))
    .limit(1);
  return row ?? null;
}
