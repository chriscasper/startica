import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import {
  audits,
  communities,
  contentPieces,
  contentSnapshots,
  engagementSnapshots,
  funnelStages,
  metricsSnapshots,
  opportunities,
  products,
  publications,
  roadmapItems,
  roadmapReplans,
  type ReplanChange,
} from "@startica/db/schema";
import { runStructured, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { PLAYBOOKS, playbookText } from "./playbooks.ts";

export const ROADMAP_PROMPT_VERSION = "roadmap-plan@2";

const SYSTEM = `You are the growth strategist inside Startica, an AI marketing co-founder for a small founder. You maintain the product's growth roadmap: a short, prioritized list of initiatives across the funnel (acquisition, activation, retention, revenue, referral), each one an experiment with a hypothesis and a success metric.

You are given the product, its current numbers, what Startica has done (replies drafted, posted, dismissed and why), recent audit findings, the playbooks you can draw from, and the current roadmap.

Rules:
- Focus. At most 8 open items (todo or doing). Fewer, sharper bets beat a long list. Priority 1 = do this week.
- Fit the stage of the product and the evidence. A product with few active users needs activation before more acquisition. Don't propose paid ads.
- Every item: a concrete title, why (the hypothesis, citing evidence when you have it), a success metric with a number when possible, and next_step: the single concrete action the founder can take today (one sentence, imperative, specific).
- Respect the founder: items marked source "owner" are theirs. Never update or drop them; you may only reference them. Never touch items with status done.
- Prefer updating an existing AI item over adding a near-duplicate. Drop AI items that the evidence says aren't working or no longer matter, with a reason.
- Don't invent numbers. If data is missing (e.g. analytics not connected), say so in the item's why, and consider making "connect analytics" or "measure X" the next step.
- summary: 3–5 plain sentences for the founder: what changed since the last plan and why.`;

const itemOutput = z.object({
  id: z.string().describe("Existing item id for keep/update/drop; empty string for add."),
  action: z.enum(["keep", "update", "add", "drop"]),
  stage: z.enum(funnelStages),
  title: z.string(),
  why: z.string(),
  playbook: z.string().describe("A playbook key from the list, or an empty string."),
  success_metric: z.string(),
  next_step: z.string(),
  priority: z.number().describe("1 (do now) to 5 (someday)"),
  reason: z.string().describe("One sentence: why this action."),
});

export const roadmapOutput = z.object({ summary: z.string(), items: z.array(itemOutput) });
export type RoadmapOutput = z.infer<typeof roadmapOutput>;

export const roadmapPlanPayload = z.object({ workspaceId: z.guid(), productId: z.guid().optional() });

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

async function evidence(productId: string): Promise<string> {
  const db = getDb();
  const since30 = daysAgo(30);
  const sinceDay = since30.toISOString().slice(0, 10);
  const [metrics, oppStats, dismissals, posted, watched, latestAudits] = await Promise.all([
    db
      .select({ source: metricsSnapshots.source, metric: metricsSnapshots.metric, total: sql<number>`sum(${metricsSnapshots.value})`, last: sql<number>`max(${metricsSnapshots.day})` })
      .from(metricsSnapshots)
      .where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.dimension, ""), gte(metricsSnapshots.day, sinceDay)))
      .groupBy(metricsSnapshots.source, metricsSnapshots.metric),
    db
      .select({ status: opportunities.status, n: sql<number>`count(*)` })
      .from(opportunities)
      .where(and(eq(opportunities.productId, productId), gte(opportunities.createdAt, since30)))
      .groupBy(opportunities.status),
    db
      .select({ reason: opportunities.dismissReason, n: sql<number>`count(*)` })
      .from(opportunities)
      .where(and(eq(opportunities.productId, productId), eq(opportunities.status, "dismissed")))
      .groupBy(opportunities.dismissReason),
    db
      .select({ channel: publications.channel, community: publications.community, mentions: publications.mentionsProduct })
      .from(publications)
      .where(and(eq(publications.productId, productId), gte(publications.postedAt, since30))),
    db
      .select({ channel: communities.channel, name: communities.name })
      .from(communities)
      .where(and(eq(communities.productId, productId), eq(communities.status, "watching"))),
    db
      .select({ kind: audits.kind, summary: audits.summary, findings: audits.findings, createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.productId, productId), eq(audits.status, "done")))
      .orderBy(desc(audits.createdAt))
      .limit(4),
  ]);

  // Content posted in 30 days, and the latest engagement check of everything posted.
  const [pieces, replySnaps, pieceSnaps] = await Promise.all([
    db
      .select({ id: contentPieces.id, channel: contentPieces.channel })
      .from(contentPieces)
      .where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"), gte(contentPieces.postedAt, since30))),
    db
      .select({ id: engagementSnapshots.publicationId, replies: engagementSnapshots.replies, removed: engagementSnapshots.removed })
      .from(engagementSnapshots)
      .innerJoin(publications, eq(publications.id, engagementSnapshots.publicationId))
      .where(and(eq(publications.productId, productId), gte(publications.postedAt, since30)))
      .orderBy(desc(engagementSnapshots.capturedAt)),
    db
      .select({ id: contentSnapshots.pieceId, replies: contentSnapshots.replies, removed: contentSnapshots.removed })
      .from(contentSnapshots)
      .innerJoin(contentPieces, eq(contentPieces.id, contentSnapshots.pieceId))
      .where(and(eq(contentPieces.productId, productId), gte(contentPieces.postedAt, since30)))
      .orderBy(desc(contentSnapshots.capturedAt)),
  ]);
  type Snap = { id: string; replies: number | null; removed: boolean };
  const engagementLine = (label: string, snaps: Snap[]) => {
    const newest = new Map<string, Snap>();
    for (const x of snaps) if (!newest.has(x.id)) newest.set(x.id, x); // snapshots come newest first
    const latest = [...newest.values()];
    if (!latest.length) return `${label}: not checked yet`;
    const replies = latest.reduce((n, x) => n + (x.replies ?? 0), 0);
    return `${label}: ${latest.length} checked, ${replies} replies received in total, ${latest.filter((x) => x.removed).length} removed by moderators or deleted`;
  };
  const piecesByChannel = new Map<string, number>();
  for (const p of pieces) piecesByChannel.set(p.channel, (piecesByChannel.get(p.channel) ?? 0) + 1);

  const lines = [
    `Metrics, last 30 days: ${
      metrics.length
        ? metrics.map((m) => `${m.source}.${m.metric} = ${Math.round(Number(m.total) * 100) / 100}`).join("; ")
        : "none (no analytics, payments or product database connected yet)"
    }`,
    `Conversations found in 30 days by status: ${oppStats.map((o) => `${o.status} ${o.n}`).join(", ") || "none"}`,
    `Dismiss reasons (all time): ${dismissals.map((d) => `${d.reason} ${d.n}`).join(", ") || "none"}`,
    `Replies posted in 30 days: ${posted.length}${posted.length ? ` (${posted.filter((p) => p.mentions).length} mentioned the product)` : ""}`,
    engagementLine("Engagement on those replies (latest check)", replySnaps),
    `Content Studio pieces posted in 30 days: ${pieces.length}${pieces.length ? ` (${[...piecesByChannel].map(([c, n]) => `${c} ${n}`).join(", ")})` : ""}`,
    engagementLine("Engagement on those pieces (latest check)", pieceSnaps),
    `Communities being watched: ${watched.map((w) => `${w.channel}:${w.name}`).join(", ") || "none"}`,
    latestAudits.length
      ? `Recent audits:\n${latestAudits
          .map(
            (a) =>
              `- ${a.kind}: ${a.summary ?? ""} High-severity findings: ${
                a.findings
                  .filter((f) => f.severity === "high")
                  .map((f) => f.title)
                  .join("; ") || "none"
              }`,
          )
          .join("\n")}`
      : "Audits: none run yet",
  ];
  return lines.join("\n");
}

/** Applies Claude's plan: adds/updates/drops AI items; never touches owner items or done items. */
export async function applyRoadmap(workspaceId: string, productId: string, plan: RoadmapOutput): Promise<ReplanChange[]> {
  const db = getDb();
  const current = await db.select().from(roadmapItems).where(eq(roadmapItems.productId, productId));
  const byId = new Map(current.map((i) => [i.id, i]));
  const playbookKeys = new Set(PLAYBOOKS.map((p) => p.key));
  const changes: ReplanChange[] = [];

  await transaction(async (tx) => {
    for (const item of plan.items) {
      const fields = {
        stage: item.stage,
        title: item.title.trim(),
        why: item.why.trim(),
        playbook: playbookKeys.has(item.playbook) ? item.playbook : null,
        successMetric: item.success_metric.trim(),
        nextStep: item.next_step.trim(),
        priority: Math.min(5, Math.max(1, Math.round(item.priority))),
      };
      const existing = item.id ? byId.get(item.id) : undefined;
      const editable = existing && existing.source === "ai" && existing.status !== "done";

      if (item.action === "add" || (!existing && item.action !== "drop")) {
        await tx.insert(roadmapItems).values({ ...fields, workspaceId, productId, source: "ai" });
        changes.push({ title: fields.title, change: "added", reason: item.reason });
      } else if (item.action === "update" && editable) {
        await tx.update(roadmapItems).set(fields).where(eq(roadmapItems.id, existing.id));
        changes.push({ title: fields.title, change: "updated", reason: item.reason });
      } else if (item.action === "drop" && editable) {
        await tx.update(roadmapItems).set({ status: "dropped", result: item.reason }).where(eq(roadmapItems.id, existing.id));
        changes.push({ title: existing.title, change: "dropped", reason: item.reason });
      } else if (existing) {
        changes.push({ title: existing.title, change: "kept", reason: item.reason });
      }
    }
    await tx.insert(roadmapReplans).values({ workspaceId, productId, summary: plan.summary.trim(), changes });
  });
  return changes;
}

/** Plans or re-plans the roadmap for one product (or every product with a brief). */
export async function runRoadmapPlan(ctx: AiContext, payload: z.infer<typeof roadmapPlanPayload>) {
  const db = getDb();
  const scope = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.workspaceId, payload.workspaceId), payload.productId ? eq(products.id, payload.productId) : undefined));
  const results: Record<string, number> = {};

  for (const { id: productId } of scope) {
    const product = await loadProductContext(productId);
    if (!product.text.includes("Summary:")) continue; // no brief yet: build intel first
    const items = await db
      .select()
      .from(roadmapItems)
      .where(and(eq(roadmapItems.productId, productId), ne(roadmapItems.status, "dropped")));
    const [lastPlan] = await db
      .select({ summary: roadmapReplans.summary, createdAt: roadmapReplans.createdAt })
      .from(roadmapReplans)
      .where(eq(roadmapReplans.productId, productId))
      .orderBy(desc(roadmapReplans.createdAt))
      .limit(1);

    const plan = await runStructured(ctx, {
      task: "strategy",
      promptVersion: ROADMAP_PROMPT_VERSION,
      system: `${SYSTEM}\n\n<playbooks>\n${playbookText()}\n</playbooks>`,
      messages: [
        {
          role: "user",
          content: [
            `<product>\n${product.text}\n</product>`,
            `<evidence>\n${await evidence(productId)}\n</evidence>`,
            `<current_roadmap>\n${
              items.length
                ? items
                    .map(
                      (i) =>
                        `- id=${i.id} source=${i.source} status=${i.status} stage=${i.stage} priority=${i.priority}: ${i.title}. Why: ${i.why} Metric: ${i.successMetric}${i.result ? ` Result: ${i.result}` : ""}`,
                    )
                    .join("\n")
                : "(empty: this is the first plan)"
            }\n</current_roadmap>`,
            lastPlan ? `<last_plan date="${lastPlan.createdAt.toISOString().slice(0, 10)}">${lastPlan.summary}</last_plan>` : "",
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      schema: roadmapOutput,
    });
    const changes = await applyRoadmap(payload.workspaceId, productId, plan);
    results[productId] = changes.filter((c) => c.change !== "kept").length;
  }
  return results;
}

/** Ids of open roadmap items, highest priority first (doing before todo). */
export async function openRoadmapItems(productId: string, limit = 3) {
  return getDb()
    .select()
    .from(roadmapItems)
    .where(and(eq(roadmapItems.productId, productId), inArray(roadmapItems.status, ["doing", "todo"])))
    .orderBy(sql`case ${roadmapItems.status} when 'doing' then 0 else 1 end`, roadmapItems.priority, roadmapItems.createdAt)
    .limit(limit);
}
