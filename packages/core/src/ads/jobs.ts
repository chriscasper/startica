import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { adCampaigns, adGroups, ads, communities, competitors, keywords, type AdCopy, type AdPlatform } from "@startica/db/schema";
import { runStructured, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { recordVersion } from "../chat/versions.ts";
import { checkAdCopy } from "./checks.ts";
import { AD_PLATFORMS } from "./platforms.ts";
import {
  AD_COPY_PROMPT_VERSION,
  AD_PLAN_PROMPT_VERSION,
  adCopySystem,
  adCopyText,
  adPlanSchema,
  adPlanSystem,
  adSchema,
  toAdCopy,
  toTargeting,
} from "./prompts.ts";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function competitorNames(productId: string): Promise<string[]> {
  const rows = await getDb().select({ name: competitors.name }).from(competitors).where(eq(competitors.productId, productId));
  return rows.map((r) => r.name);
}

const INTENT_LABEL = { problem: "problem", solution: "looking for a solution", competitor: "competitor", brand: "brand" } as const;

/**
 * What Intel and listening already know, for the plan: the product's keywords (by intent)
 * and the communities the founder watches. Reddit gets subreddits as its audience; the
 * others get every watched community as a hint for interests. Empty when there's nothing.
 */
export async function adResearch(productId: string, platform: AdPlatform): Promise<string> {
  const db = getDb();
  const [kw, watched] = await Promise.all([
    db.select({ keyword: keywords.keyword, intent: keywords.intent }).from(keywords).where(eq(keywords.productId, productId)).orderBy(asc(keywords.createdAt)).limit(60),
    db
      .select({ channel: communities.channel, name: communities.name, why: communities.why })
      .from(communities)
      .where(and(eq(communities.productId, productId), eq(communities.status, "watching")))
      .orderBy(asc(communities.createdAt))
      .limit(30),
  ]);
  const places = platform === "reddit" ? watched.filter((c) => c.channel === "reddit") : watched;
  const lines: string[] = [];
  if (kw.length) lines.push(`Keywords from Intel:\n${kw.map((k) => `- ${k.keyword} (${INTENT_LABEL[k.intent]})`).join("\n")}`);
  if (places.length)
    lines.push(
      `${platform === "reddit" ? "Subreddits the founder watches" : "Communities the founder watches"}:\n${places
        .map((c) => `- ${platform === "reddit" ? c.name.replace(/^\/?r\//i, "") : `${c.name} (${c.channel})`}${c.why ? `: ${c.why}` : ""}`)
        .join("\n")}`,
    );
  return lines.length ? `<research>\n${lines.join("\n\n")}\n</research>` : "";
}

// --- ad_plan: the strategy, groups, targeting and first ads for a campaign ---------------

export const adPlanPayload = z.object({ workspaceId: z.guid(), campaignId: z.guid() });

export async function runAdPlan(ctx: AiContext, payload: z.infer<typeof adPlanPayload>) {
  const db = getDb();
  const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, payload.campaignId));
  if (!campaign) return { skipped: "campaign deleted" };
  try {
    const [product, research] = await Promise.all([loadProductContext(campaign.productId), adResearch(campaign.productId, campaign.platform)]);
    const plan = await runStructured(ctx, {
      task: "strategy",
      promptVersion: AD_PLAN_PROMPT_VERSION,
      system: adPlanSystem(campaign.platform),
      messages: [
        {
          role: "user",
          content: [
            `<product>\n${product.text}\n</product>`,
            `<campaign>\nPlatform: ${AD_PLATFORMS[campaign.platform].name}\nName: ${campaign.name}\nGoal: ${campaign.goal}\nLanding page: ${campaign.landingUrl}\nMonthly budget the founder can spend: ${campaign.monthlyBudget}${
              campaign.notes ? `\nFounder's notes: ${campaign.notes}` : ""
            }\n</campaign>`,
            research,
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      schema: adPlanSchema(campaign.platform),
    });
    await transaction(async (tx) => {
      // A re-plan replaces every group and ad, the founder's edits included (the UI warns first).
      await tx.delete(adGroups).where(eq(adGroups.campaignId, campaign.id));
      for (const [position, g] of plan.groups.entries()) {
        const [group] = await tx
          .insert(adGroups)
          .values({
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            name: g.name.trim(),
            angle: g.angle.trim(),
            targeting: toTargeting(campaign.platform, g.targeting),
            position,
          })
          .returning({ id: adGroups.id });
        if (g.ads.length)
          await tx.insert(ads).values(g.ads.map((a) => ({ workspaceId: campaign.workspaceId, groupId: group!.id, copy: toAdCopy(campaign.platform, a) })));
      }
      await tx
        .update(adCampaigns)
        .set({
          status: "draft",
          error: null,
          summary: plan.summary.trim(),
          bidStrategy: plan.bid_strategy.trim(),
          testBudget: Math.max(0, Math.round(plan.test_budget)),
          testDays: Math.max(1, Math.round(plan.test_days)),
          successMetric: plan.success_metric.trim(),
        })
        .where(eq(adCampaigns.id, campaign.id));
    });
    return { groups: plan.groups.length, ads: plan.groups.reduce((n, g) => n + g.ads.length, 0) };
  } catch (err) {
    await db
      .update(adCampaigns)
      .set({ status: "failed", error: ctx.signal?.aborted ? "Stopped by you" : message(err) })
      .where(eq(adCampaigns.id, campaign.id));
    throw err;
  }
}

// --- ad_copy: rewrite one ad with the founder's guidance ---------------------------------

export const adCopyPayload = z.object({ workspaceId: z.guid(), adId: z.guid(), guidance: z.string().max(2000).default("") });

/** An ad's copy as Refine and Versions keep it (ARCHITECTURE.md 5.1). */
export type AdCopyValue = { platform: AdPlatform; copy: AdCopy; source: "ai" | "owner"; createdAt?: string };

/** An ad with its group and campaign, checked against the workspace. */
export async function adWithCampaign(workspaceId: string, adId: string) {
  const [row] = await getDb()
    .select({ ad: ads, group: adGroups, campaign: adCampaigns })
    .from(ads)
    .innerJoin(adGroups, eq(adGroups.id, ads.groupId))
    .innerJoin(adCampaigns, eq(adCampaigns.id, adGroups.campaignId))
    .where(and(eq(ads.id, adId), eq(ads.workspaceId, workspaceId)));
  return row ?? null;
}

/** The copy's problems as prompt lines ("headlines 3: …"). */
export function flagLines(platform: AdPlatform, copy: AdCopy, competitors: string[]): string[] {
  return checkAdCopy(platform, copy, competitors).map((f) => `${f.field}${f.index != null ? ` ${f.index + 1}` : ""}: ${f.message}`);
}

/** What an ad is rewritten from: the product, the campaign and group, the group's other ads. Also the Refine chat's context. */
export async function adCopyContext(row: NonNullable<Awaited<ReturnType<typeof adWithCampaign>>>): Promise<string> {
  const { ad, group, campaign } = row;
  const product = await loadProductContext(campaign.productId);
  const siblings = await getDb().select({ id: ads.id, copy: ads.copy }).from(ads).where(eq(ads.groupId, group.id)).orderBy(asc(ads.createdAt));
  return [
    `<product>\n${product.text}\n</product>`,
    `<campaign>\nGoal: ${campaign.goal}\nLanding page: ${campaign.landingUrl}\nAd group: ${group.name}. Angle: ${group.angle ?? ""}\n</campaign>`,
    siblings.length > 1
      ? `<other_ads_in_group>\n${siblings
          .filter((s) => s.id !== ad.id)
          .map((s) => adCopyText(s.copy))
          .join("\n---\n")}\n</other_ads_in_group>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runAdCopy(ctx: AiContext, payload: z.infer<typeof adCopyPayload>) {
  const db = getDb();
  const row = await adWithCampaign(payload.workspaceId, payload.adId);
  if (!row) return { skipped: "ad deleted" };
  const { ad, campaign } = row;
  try {
    const problems = flagLines(campaign.platform, ad.copy, await competitorNames(campaign.productId));
    const out = await runStructured(ctx, {
      task: "draft",
      promptVersion: AD_COPY_PROMPT_VERSION,
      system: adCopySystem(campaign.platform),
      messages: [
        {
          role: "user",
          content: [
            await adCopyContext(row),
            `<ad>\n${adCopyText(ad.copy)}\n</ad>`,
            problems.length ? `<problems>\n${problems.map((p) => `- ${p}`).join("\n")}\n</problems>` : "",
            `<guidance>\n${payload.guidance.trim() || "Make it sharper and more specific, and fix any problems."}\n</guidance>`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      schema: adSchema(campaign.platform),
    });
    const copy = toAdCopy(campaign.platform, out);
    await db.update(ads).set({ copy, source: "ai", status: "ready", error: null }).where(eq(ads.id, ad.id));
    await recordVersion(
      { workspaceId: payload.workspaceId, kind: "ad_copy", subjectId: ad.id },
      { platform: campaign.platform, copy, source: "ai" } satisfies AdCopyValue,
      "suggested",
      { previous: { platform: campaign.platform, copy: ad.copy, source: ad.source, createdAt: ad.updatedAt.toISOString() } satisfies AdCopyValue },
    );
    return { rewritten: ad.id };
  } catch (err) {
    await db.update(ads).set({ status: "failed", error: ctx.signal?.aborted ? "Stopped by you" : message(err) }).where(eq(ads.id, ad.id));
    throw err;
  }
}
