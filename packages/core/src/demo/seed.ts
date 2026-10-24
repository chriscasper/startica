import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { getDb, transaction, type Db } from "@startica/db/client";
import { seedDemoAccessibility } from "./accessibility.ts";
import { seedDemoAds } from "./ads.ts";
import { seedDemoPlanning } from "./planning.ts";
import { seedDemoSearch } from "./search.ts";
import { seedDemoVisibility } from "./visibility.ts";
import { seedDemoAgents } from "./agents.ts";
import { seedDemoOffsite } from "./offsite.ts";
import { seedDemoListening } from "./listening.ts";
import { seedDemoBenchmarks } from "./benchmarks.ts";
import { seedDemoCompetitorWatch } from "./competitor-watch.ts";
import * as s from "@startica/db/schema";
import { estimateCostUsd } from "../ai/pricing.ts";
import { fingerprint } from "../distribution/fingerprint.ts";
import { utmUrl } from "../distribution/utm.ts";
import {
  DEMO_AI_RUNS,
  DEMO_AUDIT,
  DEMO_COMMUNITIES,
  DEMO_COMPETITORS,
  DEMO_CONTENT,
  DEMO_KEYWORDS,
  DEMO_OPPORTUNITIES,
  DEMO_PERSONAS,
  DEMO_PRODUCT,
  DEMO_REPLAN,
  DEMO_RESEARCH_DOCS,
  DEMO_ROADMAP,
  DEMO_ANALYTICS_SUMMARY,
  DEMO_SOURCES,
  DEMO_VOICE_GUIDE,
  DEMO_VOICE_SOURCES,
} from "./fieldnote.ts";

/**
 * Loads the Fieldnote demo product (demo/fieldnote.ts) into the open database
 * through the regular schema: intel, Inbox, voice, content, roadmap, 90 days of
 * metrics with a weekly analytics summary, and a few logged AI runs. No AI calls and no network. The database
 * must be open and migrated. Dates are relative to `now`.
 */

const DAY = 86_400_000;


/** Share of the demo's daily sessions that view each page (GA4 sessions by page path). */
// Landing pages: share of visits, engaged share, key events per visit.
const DEMO_LANDING: [string, number, number, number][] = [
  ["/", 0.48, 0.55, 0.02],
  ["/pricing", 0.16, 0.7, 0.06],
  ["/blog/offline-field-kit", 0.14, 0.62, 0.01],
  ["/features", 0.1, 0.6, 0.03],
  ["/signup", 0.07, 0.8, 0.12],
  ["/help", 0.05, 0.5, 0.005],
];
const DEMO_COUNTRIES: [string, number][] = [["US", 0.36], ["GB", 0.12], ["DE", 0.1], ["CA", 0.08], ["AU", 0.06], ["NL", 0.05], ["FR", 0.05], ["SE", 0.04], ["NZ", 0.03], ["IN", 0.03]];
const DEMO_DEVICES: [string, number][] = [["desktop", 0.62], ["mobile", 0.33], ["tablet", 0.05]];
const DEMO_BROWSERS: [string, number][] = [["Chrome", 0.54], ["Safari", 0.26], ["Firefox", 0.1], ["Edge", 0.08]];

const DEMO_PAGE_SHARES: [string, number][] = [
  ["/", 0.55],
  ["/pricing", 0.22],
  ["/signup", 0.12],
  ["/features", 0.1],
  ["/blog", 0.06],
  ["/blog/offline-field-kit", 0.04],
  ["/help", 0.02],
];
export async function productCount(): Promise<number> {
  const [row] = await getDb().select({ n: count() }).from(s.products);
  return row?.n ?? 0;
}

/** Removes every product (and, through cascades, its data) plus workspace-level conversations and history. Settings, secrets and AI routing stay. */
export async function clearProductData(): Promise<void> {
  await transaction(async (db) => {
    await db.delete(s.products);
    await db.delete(s.conversations);
    await db.delete(s.aiRuns);
    await db.delete(s.jobRuns);
    await db.delete(s.jobs);
  });
}

export type SeedResult = { workspaceId: string; productId: string; counts: Record<string, number> };

export async function seedDemo(now = new Date()): Promise<SeedResult> {
  const workspaceId = (await ensureWorkspace()).id;
  const ago = (days: number, hours = 0) => new Date(now.getTime() - days * DAY - hours * 3_600_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  const add = (name: string, n: number) => (counts[name] = (counts[name] ?? 0) + n);

  const productId = await transaction(async (db: Db) => {
    // --- Product and intel ---------------------------------------------------------
    const [product] = await db
      .insert(s.products)
      .values({
        workspaceId,
        ...DEMO_PRODUCT,
        briefSource: "ai",
        briefUpdatedAt: ago(28),
        intelStatus: "ready",
        intelUpdatedAt: ago(28),
        createdAt: ago(30),
      })
      .returning({ id: s.products.id });
    const productId = product!.id;
    const base = { workspaceId, productId };

    await db.insert(s.researchDocs).values(DEMO_RESEARCH_DOCS.map((d) => ({ ...base, ...d, fetchedAt: ago(28) })));
    // Staggered createdAt keeps the order stable (lists sort by it).
    await db.insert(s.personas).values(DEMO_PERSONAS.map((p, i) => ({ ...base, ...p, source: "ai" as const, createdAt: ago(28, -i) })));
    await db.insert(s.competitors).values(DEMO_COMPETITORS.map((c, i) => ({ ...base, ...c, source: "ai" as const, createdAt: ago(28, -i) })));
    await db.insert(s.keywords).values(DEMO_KEYWORDS.map((k) => ({ ...base, ...k, source: k.intent === "brand" ? ("owner" as const) : ("ai" as const) })));
    await db.insert(s.communities).values(
      DEMO_COMMUNITIES.map((c) => ({
        ...base,
        ...c,
        url: c.channel === "reddit" ? `https://example.com/demo/r/${c.name}` : null,
        source: "ai" as const,
      })),
    );
    add("research docs", DEMO_RESEARCH_DOCS.length);
    add("personas", DEMO_PERSONAS.length);
    add("competitors", DEMO_COMPETITORS.length);
    add("keywords", DEMO_KEYWORDS.length);
    add("communities", DEMO_COMMUNITIES.length);

    // --- Inbox -------------------------------------------------------------------------
    const oppIds = new Map<string, string>();
    const replyUtm = new Map<string, string>(); // draft id per posted reply, for GA4 utm_content rows
    for (const o of DEMO_OPPORTUNITIES) {
      const postedAt = ago(o.daysAgo, 3);
      const [conversation] = await db
        .insert(s.conversations)
        .values({
          workspaceId,
          channel: o.channel,
          externalId: `demo-${o.key}`,
          url: `https://example.com/demo/${o.channel}/${o.key}`,
          kind: "post",
          community: o.community,
          author: o.author,
          title: o.title,
          body: o.body,
          postedAt,
          score: o.channel === "hackernews" ? 40 : null,
          numComments: 6,
          origin: o.origin ?? "listening",
          fingerprint: fingerprint(o.title, o.body),
          createdAt: ago(o.daysAgo, 2),
        })
        .returning({ id: s.conversations.id });

      const [opp] = await db
        .insert(s.opportunities)
        .values({
          ...base,
          conversationId: conversation!.id,
          matchedOn: o.matchedOn,
          relevance: o.relevance,
          intent: o.intent,
          reasoning: o.duplicateOf ? `${o.reasoning} Near-duplicate of https://example.com/demo/${o.channel}/${o.duplicateOf}` : o.reasoning,
          angle: o.angle ?? null,
          status: o.status,
          dismissReason: o.dismissReason ?? null,
          duplicateOfId: o.duplicateOf ? (oppIds.get(o.duplicateOf) ?? null) : null,
          scoredAt: ago(o.daysAgo, 1),
          createdAt: ago(o.daysAgo, 2),
        })
        .returning({ id: s.opportunities.id });
      oppIds.set(o.key, opp!.id);
      add("opportunities", 1);

      let lastDraftId: string | null = null;
      for (const [i, d] of (o.drafts ?? []).entries()) {
        const id = randomUUID();
        const community = o.community ?? (o.channel === "hackernews" ? "Hacker News" : o.channel);
        await db.insert(s.drafts).values({
          id,
          workspaceId,
          opportunityId: opp!.id,
          version: i + 1,
          body: d.body,
          mentionsProduct: d.mentionsProduct,
          rationale: d.rationale,
          utmUrl: d.mentionsProduct ? utmUrl(DEMO_PRODUCT.url, { channel: o.channel, community, draftId: id, date: ago(o.daysAgo) }) : null,
          createdAt: ago(o.daysAgo, -i),
        });
        lastDraftId = id;
        add("drafts", 1);
      }

      if (o.status === "posted" && lastDraftId) {
        const last = o.drafts!.at(-1)!;
        const [pub] = await db
          .insert(s.publications)
          .values({
            ...base,
            opportunityId: opp!.id,
            draftId: lastDraftId,
            channel: o.channel,
            community: o.community,
            url: `https://example.com/demo/${o.channel}/${o.key}#reply`,
            body: last.body,
            mentionsProduct: last.mentionsProduct,
            postedAt: ago(o.daysAgo - 1),
          })
          .returning({ id: s.publications.id });
        if (last.mentionsProduct) replyUtm.set(o.key, lastDraftId);
        if (o.engagement) {
          await db.insert(s.engagementSnapshots).values(
            [3, 1].map((daysAfter, i) => ({
              workspaceId,
              publicationId: pub!.id,
              score: o.engagement!.score === null ? null : Math.round(o.engagement!.score * (i ? 1 : 0.6)),
              replies: Math.round(o.engagement!.replies * (i ? 1 : 0.6)),
              capturedAt: ago(o.daysAgo - 1 - daysAfter),
            })),
          );
          add("engagement snapshots", 2);
        }
        add("publications", 1);
      }
    }

    // --- Voice bank and Content Studio ---------------------------------------------
    const sourceIds: string[] = [];
    for (const v of DEMO_VOICE_SOURCES) {
      const { samples, ...source } = v;
      const [row] = await db.insert(s.voiceSources).values({ ...base, ...source, createdAt: ago(21) }).returning({ id: s.voiceSources.id });
      sourceIds.push(row!.id);
      await db.insert(s.voiceSamples).values(samples.map((text, i) => ({ workspaceId, sourceId: row!.id, text, postedAt: ago(60 - i * 7) })));
      add("voice samples", samples.length);
    }
    const [voice] = await db
      .insert(s.voiceProfiles)
      .values({ ...base, name: "Field researcher, practical", sourceIds, guide: DEMO_VOICE_GUIDE, status: "ready", createdAt: ago(20) })
      .returning({ id: s.voiceProfiles.id });
    add("voice profiles", 1);

    const pieceUtm: string[] = [];
    for (const [i, c] of DEMO_CONTENT.entries()) {
      const utmId = `content-${randomUUID().slice(0, 8)}`;
      const posted = c.postedDaysAgo !== null;
      const [piece] = await db
        .insert(s.contentPieces)
        .values({
          ...base,
          voiceProfileId: voice!.id,
          channel: c.channel,
          format: c.format,
          topic: c.topic,
          title: c.title,
          body: c.body,
          rationale: c.rationale,
          utmUrl: c.tracked ? utmUrl(DEMO_PRODUCT.url, { channel: c.channel === "reddit" ? "reddit" : "other", community: c.channel, draftId: utmId, date: ago(c.postedDaysAgo ?? 2) }) : null,
          status: c.status,
          postedUrl: posted ? `https://example.com/demo/${c.channel}/content-${i + 1}` : null,
          postedAt: posted ? ago(c.postedDaysAgo!) : null,
          notes: c.notes,
          createdAt: ago((c.postedDaysAgo ?? 2) + 1),
        })
        .returning({ id: s.contentPieces.id });
      if (posted && c.tracked) pieceUtm.push(utmId);
      if (c.engagement) {
        await db.insert(s.contentSnapshots).values({
          workspaceId,
          pieceId: piece!.id,
          score: c.engagement.score,
          replies: c.engagement.replies,
          capturedAt: ago(c.postedDaysAgo! - 2),
        });
        add("content snapshots", 1);
      }
      add("content pieces", 1);
    }

    // --- Roadmap and audits ----------------------------------------------------------
    await db.insert(s.roadmapItems).values(DEMO_ROADMAP.map((r, i) => ({ ...base, ...r, result: r.result ?? null, createdAt: ago(14, -i) })));
    await db.insert(s.roadmapReplans).values([
      { ...base, summary: "First plan from the intel brief.", changes: [], createdAt: ago(14) },
      { ...base, ...DEMO_REPLAN, createdAt: ago(7) },
    ]);
    await db.insert(s.audits).values({ ...base, ...DEMO_AUDIT, status: "done", createdAt: ago(9) });
    add("roadmap items", DEMO_ROADMAP.length);
    add("audits", 1);

    // --- Connections and 30 days of metrics -----------------------------------------
    // Shown as connected so Analytics renders fully. They have no credentials:
    // "Sync now" (or the daily sync) marks them as errored, which is expected.
    await db.insert(s.connections).values([
      { ...base, kind: "ga4", config: { propertyId: "000000000" }, status: "ok", lastSyncedAt: ago(0, 2) },
      { ...base, kind: "stripe", config: {}, status: "ok", lastSyncedAt: ago(0, 2) },
      { ...base, kind: "product_db", config: { view: "startica.daily_metrics" }, status: "ok", lastSyncedAt: ago(0, 2) },
      { ...base, kind: "search_console", config: { siteUrl: "sc-domain:fieldnote.example", useGa4Key: true }, status: "ok", lastSyncedAt: ago(0, 2) },
    ]);

    let rand = 42;
    const noise = () => ((rand = (rand * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648) * 0.3 + 0.85; // 0.85–1.15
    const metrics: (typeof s.metricsSnapshots.$inferInsert)[] = [];
    const metric = (d: string, source: "ga4" | "stripe" | "product_db", name: string, value: number, dimension = "") =>
      metrics.push({ ...base, day: d, source, metric: name, dimension, value });
    // 90 days, Analytics' default history. Local days, as the sync writes them.
    const localDay = (d: Date) => d.toLocaleDateString("en-CA");
    const DEMO_DAYS = 90;
    let subs = 7;
    for (let i = DEMO_DAYS - 1; i >= 0; i--) {
      const date = ago(i);
      const d = localDay(date);
      const growth = 0.6 + (DEMO_DAYS - 1 - i) * 0.0125; // traffic about doubles over the 90 days
      const weekend = [0, 6].includes(date.getDay()) ? 0.7 : 1;
      const sessions = Math.round(120 * growth * weekend * noise());
      // A Hacker News thread 8–10 days ago: a spike of visits that mostly bounced.
      const spike = i >= 8 && i <= 10 ? Math.round((11 - i) * 45 * noise()) : 0;
      const all = sessions + spike;
      metric(d, "ga4", "sessions", all);
      metric(d, "ga4", "users", Math.round(all * 0.82));
      metric(d, "ga4", "new_users", Math.round(all * 0.55));
      metric(d, "ga4", "pageviews", Math.round(sessions * 2.4 * noise() + spike * 1.2));
      metric(d, "ga4", "engaged_sessions", Math.round(sessions * 0.58 * noise() + spike * 0.2));
      metric(d, "ga4", "engagement_seconds", Math.round(sessions * 72 * noise() + spike * 15));
      const keyEvents = Math.round(sessions * 0.028 * noise());
      const trials = Math.round(keyEvents * 0.4);
      metric(d, "ga4", "key_events", keyEvents + trials);
      metric(d, "ga4", "key_events", keyEvents, "event:sign_up");
      if (trials) metric(d, "ga4", "key_events", trials, "event:start_trial");
      for (const [src, share, conv] of DEMO_SOURCES) {
        const n = Math.round(sessions * share * noise()) + (src.startsWith("news.ycombinator.com") ? spike : 0);
        metric(d, "ga4", "sessions", n, `source:${src}`);
        metric(d, "ga4", "engaged_sessions", Math.round(n * (src.startsWith("news.ycombinator.com") && spike ? 0.25 : 0.58)), `source:${src}`);
        const k = Math.round(n * conv * noise());
        if (k) metric(d, "ga4", "key_events", k, `source:${src}`);
      }
      // Sessions per page (accessibility priority, ARCHITECTURE.md section 9.3): the home and pricing pages get most.
      for (const [path, share] of DEMO_PAGE_SHARES) metric(d, "ga4", "sessions", Math.round(sessions * share * noise()), `page:${path}`);
      for (const [path, share, engaged, conv] of DEMO_LANDING) {
        const n = Math.round(sessions * share * noise()) + (path === "/blog/offline-field-kit" ? spike : 0);
        metric(d, "ga4", "sessions", n, `landing:${path}`);
        metric(d, "ga4", "engaged_sessions", Math.round((n - (path === "/blog/offline-field-kit" ? spike * 0.8 : 0)) * engaged), `landing:${path}`);
        const k = Math.round(n * conv * noise());
        if (k) metric(d, "ga4", "key_events", k, `landing:${path}`);
      }
      for (const [code, share] of DEMO_COUNTRIES) metric(d, "ga4", "sessions", Math.round(all * share * noise()), `country:${code}`);
      for (const [device, share] of DEMO_DEVICES) metric(d, "ga4", "sessions", Math.round(all * share * noise()), `device:${device}`);
      for (const [browser, share] of DEMO_BROWSERS) metric(d, "ga4", "sessions", Math.round(all * share * noise()), `browser:${browser}`);
      metric(d, "product_db", "signups", Math.max(1, Math.round(sessions * 0.03 * noise())));
      metric(d, "product_db", "active_users", Math.round((25 + (DEMO_DAYS - 1 - i) * 0.9) * noise()));
      metric(d, "product_db", "field_notes_created", Math.round((60 + (DEMO_DAYS - 1 - i) * 3) * noise()));
      const newSubs = i % 4 === 0 ? 2 : i % 3 === 0 ? 1 : 0;
      const cancellations = i % 11 === 0 ? 1 : 0;
      subs += newSubs - cancellations;
      const seat = 3 * 8; // ~3 seats per team at $8
      metric(d, "stripe", "new_subscriptions", newSubs);
      metric(d, "stripe", "cancellations", cancellations);
      metric(d, "stripe", "active_subscriptions", subs);
      metric(d, "stripe", "trials", Math.max(1, Math.round(subs * 0.15)));
      metric(d, "stripe", "mrr", subs * seat);
      metric(d, "stripe", "mrr_new", newSubs * seat);
      metric(d, "stripe", "mrr_churned", cancellations * seat);
      metric(d, "stripe", "revenue", date.getDate() === 1 ? Math.round(subs * seat * 0.9) : Math.round(newSubs * seat));
    }
    // Visits and signups attributed to posted replies and pieces (utm_content).
    const attributed = [...replyUtm.values(), ...pieceUtm];
    for (const [n, utm] of attributed.entries()) {
      for (let i = 0; i < 4; i++) {
        const d = localDay(ago(14 + n * 2 - i));
        metric(d, "ga4", "sessions", Math.round((30 - i * 6) * noise()), `utm_content:${utm}`);
        metric(d, "ga4", "key_events", i < 2 ? 2 - i : 0, `utm_content:${utm}`);
      }
    }
    for (let i = 0; i < metrics.length; i += 200) await db.insert(s.metricsSnapshots).values(metrics.slice(i, i + 200));
    add("metrics snapshots", metrics.length);
    // Last Monday's weekly analytics read-out (written by hand here: the demo makes no AI calls).
    await db.insert(s.analyticsSummaries).values({
      ...base,
      periodStart: localDay(ago(7)),
      periodEnd: localDay(ago(1)),
      body: DEMO_ANALYTICS_SUMMARY,
      model: "demo",
      createdAt: ago(0, 3),
    });
    add("search rows", await seedDemoSearch(db, workspaceId, productId, ago));
    add("AI visibility questions", await seedDemoVisibility(db, workspaceId, productId, ago));
    add("off-site pages read", await seedDemoOffsite(db, workspaceId, productId, ago));
    const listening = await seedDemoListening(db, workspaceId, productId, ago);
    add("listening history", listening.conversations);
    add("replies to your posts", listening.replies);
    add("benchmarked accounts", await seedDemoBenchmarks(db, workspaceId, productId, ago));
    add("competitor posts", await seedDemoCompetitorWatch(db, workspaceId, productId, ago));

    // --- System: job history and AI spend -------------------------------------------
    for (const r of DEMO_AI_RUNS) {
      const startedAt = ago(r.daysAgo, 5);
      const payload = { workspaceId, productId };
      const [run] = await db
        .insert(s.jobRuns)
        .values({
          workspaceId,
          queue: r.queue,
          status: "succeeded",
          payload,
          result: { demo: true },
          startedAt,
          finishedAt: new Date(startedAt.getTime() + r.latencyMs + 400),
          createdAt: startedAt,
        })
        .returning({ id: s.jobRuns.id });
      const usage = { inputTokens: r.input, outputTokens: r.output, cacheReadTokens: r.cacheRead, cacheWriteTokens: 0 };
      await db.insert(s.aiRuns).values({
        workspaceId,
        jobRunId: run!.id,
        task: r.task,
        model: r.model,
        promptVersion: r.promptVersion,
        status: "ok",
        ...usage,
        costUsd: estimateCostUsd(r.model, usage),
        latencyMs: r.latencyMs,
        createdAt: new Date(startedAt.getTime() + r.latencyMs),
      });
    }
    // Plain job runs without a Claude call.
    for (const [queue, daysAgo] of [["listen_scan", 0], ["listen_scan", 1], ["metrics_sync", 0], ["engagement_sync", 1]] as const) {
      const startedAt = ago(daysAgo, 2);
      await db.insert(s.jobRuns).values({
        workspaceId,
        queue,
        status: "succeeded",
        payload: { workspaceId },
        result: { demo: true },
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 45_000),
        createdAt: startedAt,
      });
    }
    add("ai runs", DEMO_AI_RUNS.length);
    add("job runs", DEMO_AI_RUNS.length + 4);

    return productId;
  });

  // Accessibility results go through the scan's own storage, which runs its own transactions.
  add("accessibility pages", await seedDemoAccessibility(workspaceId, productId, ago));
  add("agent readiness checks", await seedDemoAgents(getDb(), workspaceId, productId, ago));
  add("ad campaigns", await seedDemoAds(getDb(), workspaceId, productId, ago));
  // The content calendar: earlier posts for best-time hints, a content plan, a planned reply and a post image.
  const planning = await seedDemoPlanning(getDb(), workspaceId, productId, now);
  add("calendar pieces", planning.pieces);
  add("post images", planning.images);

  return { workspaceId, productId, counts };
}
