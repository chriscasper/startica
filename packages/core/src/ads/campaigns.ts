import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { adCampaigns, adGroups, adPlatforms, ads, type AdCopy, type AdPlatform, type AdTargeting } from "@startica/db/schema";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";
import { checkAdCopy, utmSlug, type AdFlag } from "./checks.ts";
import { deleteCampaignCreatives } from "./creatives.ts";
import { recordVersion } from "../chat/versions.ts";
import { adWithCampaign, competitorNames, type AdCopyValue } from "./jobs.ts";

export type AdCampaign = typeof adCampaigns.$inferSelect;

/** Ad campaigns (ARCHITECTURE.md section 8.6). Server actions call these; jobs do the AI work. */

export const campaignInput = z.object({
  platform: z.enum(adPlatforms, { error: "Pick a platform" }),
  name: z.string().trim().min(1, "Give the campaign a name").max(120),
  goal: z.string().trim().min(1, "Say what the campaign is for, e.g. trial signups").max(500),
  landing_url: z
    .string()
    .trim()
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.url("Enter the page ads link to, e.g. https://example.com/signup")),
  monthly_budget: z.coerce.number().min(1, "Enter a monthly budget").max(1_000_000).default(300),
  notes: z.string().trim().max(2000).default(""),
});

export const campaignStatuses = ["draft", "handed_off", "running", "ended"] as const;

export async function ownCampaign(workspaceId: string, campaignId: string): Promise<AdCampaign> {
  const [campaign] = await getDb()
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.workspaceId, workspaceId)));
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

/** Creates a campaign and asks the AI to plan it. */
export async function createCampaign(workspaceId: string, productId: string, input: z.infer<typeof campaignInput>): Promise<string> {
  const [row] = await getDb()
    .insert(adCampaigns)
    .values({
      workspaceId,
      productId,
      platform: input.platform,
      name: input.name,
      goal: input.goal,
      landingUrl: input.landing_url,
      monthlyBudget: input.monthly_budget,
      notes: input.notes || null,
      utmCampaign: utmSlug(input.name),
    })
    .returning({ id: adCampaigns.id });
  await enqueue(workspaceId, "ad_plan", { workspaceId, campaignId: row!.id });
  return row!.id;
}

/** Edits the brief. The platform can't change: the plan and ads are written for it. */
export async function updateCampaign(campaign: AdCampaign, input: Omit<z.infer<typeof campaignInput>, "platform">): Promise<void> {
  await getDb()
    .update(adCampaigns)
    .set({ name: input.name, goal: input.goal, landingUrl: input.landing_url, monthlyBudget: input.monthly_budget, notes: input.notes || null })
    .where(eq(adCampaigns.id, campaign.id));
}

/** Plans the campaign again from its brief: replaces the groups and ads. */
export async function replanCampaign(campaign: AdCampaign): Promise<void> {
  if (await jobByPayload(campaign.workspaceId, ["ad_plan"], "campaignId", campaign.id)) return;
  await getDb().update(adCampaigns).set({ status: "planning", error: null }).where(eq(adCampaigns.id, campaign.id));
  await enqueue(campaign.workspaceId, "ad_plan", { workspaceId: campaign.workspaceId, campaignId: campaign.id });
}

export async function stopPlanning(campaign: AdCampaign): Promise<void> {
  const job = await jobByPayload(campaign.workspaceId, ["ad_plan"], "campaignId", campaign.id);
  if (job) await stopJob(campaign.workspaceId, job);
  await getDb()
    .update(adCampaigns)
    .set({ status: "failed", error: "Stopped by you" })
    .where(and(eq(adCampaigns.id, campaign.id), eq(adCampaigns.status, "planning")));
}

/** Tracks where the campaign is. Startica never launches it: the founder does, then says so here. */
export async function setCampaignStatus(campaign: AdCampaign, status: (typeof campaignStatuses)[number]): Promise<void> {
  if (campaign.status === "planning") throw new Error("Wait for the plan to finish");
  await getDb().update(adCampaigns).set({ status }).where(eq(adCampaigns.id, campaign.id));
}

export async function deleteCampaign(campaign: AdCampaign): Promise<void> {
  for (const queue of ["ad_plan", "ad_creative_ideas"]) {
    const job = await jobByPayload(campaign.workspaceId, [queue], "campaignId", campaign.id);
    if (job) await stopJob(campaign.workspaceId, job);
  }
  await deleteCampaignCreatives(campaign.id);
  await getDb().delete(adCampaigns).where(eq(adCampaigns.id, campaign.id));
}

/** Asks the AI for three creative ideas from the campaign's ads (pictures are drawn only when asked). */
export async function suggestCreatives(campaign: AdCampaign): Promise<void> {
  if (await jobByPayload(campaign.workspaceId, ["ad_creative_ideas"], "campaignId", campaign.id)) return;
  await enqueue(campaign.workspaceId, "ad_creative_ideas", { workspaceId: campaign.workspaceId, campaignId: campaign.id });
}

// --- Groups and ads ----------------------------------------------------------------------

const lines = (v: string | undefined) =>
  (v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const commaList = (v: string | undefined) =>
  (v ?? "")
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean);

/** A keyword in Google Ads Editor notation: [exact], "phrase", or plain for broad. */
export function parseKeyword(line: string): { text: string; match: "broad" | "phrase" | "exact" } {
  const t = line.trim();
  if (/^\[.*\]$/.test(t)) return { text: t.slice(1, -1).trim(), match: "exact" };
  if (/^".*"$/.test(t)) return { text: t.slice(1, -1).trim(), match: "phrase" };
  return { text: t, match: "broad" };
}

export function keywordNotation(k: { text: string; match: "broad" | "phrase" | "exact" }): string {
  return k.match === "exact" ? `[${k.text}]` : k.match === "phrase" ? `"${k.text}"` : k.text;
}

/** Targeting from the group form. Fields not shown for the platform are left out. */
export function targetingFromForm(platform: AdPlatform, form: Record<string, string | undefined>): AdTargeting {
  const t: AdTargeting = { locations: commaList(form.locations) };
  if (platform === "google") {
    t.keywords = lines(form.keywords).map(parseKeyword).filter((k) => k.text);
    t.negativeKeywords = lines(form.negative_keywords);
  } else if (platform === "meta") {
    t.audience = form.audience?.trim() || undefined;
    t.interests = commaList(form.interests);
    t.placements = commaList(form.placements);
  } else {
    t.communities = commaList(form.communities).map((c) => c.replace(/^\/?r\//i, ""));
    t.interests = commaList(form.interests);
  }
  return t;
}

/** Ad copy from the ad form: one headline or description per line for Google. */
export function copyFromForm(platform: AdPlatform, form: Record<string, string | undefined>): AdCopy {
  const s = (k: string) => form[k]?.trim() || undefined;
  const copy: AdCopy =
    platform === "google"
      ? { headlines: lines(form.headlines), descriptions: lines(form.descriptions), path1: s("path1"), path2: s("path2") }
      : platform === "meta"
        ? { primaryText: s("primary_text"), headline: s("headline"), description: s("description"), callToAction: s("call_to_action") }
        : { title: s("title"), body: s("body"), callToAction: s("call_to_action") };
  for (const [k, v] of Object.entries(copy)) if (v === undefined) delete copy[k as keyof AdCopy];
  return copy;
}

/** A group or ad, if it belongs to the workspace, with its campaign. */
export async function ownGroup(workspaceId: string, groupId: string) {
  const [row] = await getDb()
    .select({ group: adGroups, campaign: adCampaigns })
    .from(adGroups)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adGroups.campaignId))
    .where(and(eq(adGroups.id, groupId), eq(adGroups.workspaceId, workspaceId)));
  if (!row) throw new Error("Ad group not found");
  return row;
}

export async function ownAd(workspaceId: string, adId: string) {
  const row = await adWithCampaign(workspaceId, adId);
  if (!row) throw new Error("Ad not found");
  return row;
}

export async function updateGroup(groupId: string, values: { name: string; angle: string; targeting: AdTargeting }): Promise<void> {
  await getDb().update(adGroups).set({ name: values.name, angle: values.angle || null, targeting: values.targeting }).where(eq(adGroups.id, groupId));
}

/** The owner's own edit of an ad (kept as a version, so Refine and Versions can go back to it). */
export async function saveAd(workspaceId: string, adId: string, copy: AdCopy): Promise<void> {
  const { ad, campaign } = await ownAd(workspaceId, adId);
  await getDb().update(ads).set({ copy, source: "owner", status: "ready", error: null }).where(eq(ads.id, ad.id));
  await recordVersion({ workspaceId, kind: "ad_copy", subjectId: ad.id }, { platform: campaign.platform, copy, source: "owner" } satisfies AdCopyValue, "edited", {
    previous: { platform: campaign.platform, copy: ad.copy, source: ad.source, createdAt: ad.updatedAt.toISOString() } satisfies AdCopyValue,
  });
}

/** A new ad in a group, copied from the group's first ad so there's something to edit. */
export async function addAd(workspaceId: string, groupId: string): Promise<string> {
  const db = getDb();
  const [first] = await db.select({ copy: ads.copy }).from(ads).where(eq(ads.groupId, groupId)).orderBy(asc(ads.createdAt)).limit(1);
  const [row] = await db
    .insert(ads)
    .values({ workspaceId, groupId, copy: first?.copy ?? {}, source: "owner" })
    .returning({ id: ads.id });
  return row!.id;
}

export async function deleteAd(adId: string): Promise<void> {
  await getDb().delete(ads).where(eq(ads.id, adId));
}

export async function rewriteAd(workspaceId: string, adId: string, guidance: string): Promise<void> {
  if (await jobByPayload(workspaceId, ["ad_copy"], "adId", adId)) return;
  await getDb().update(ads).set({ status: "rewriting", error: null }).where(eq(ads.id, adId));
  await enqueue(workspaceId, "ad_copy", { workspaceId, adId, guidance });
}

// --- Reading -----------------------------------------------------------------------------

export type CampaignAd = typeof ads.$inferSelect & { flags: AdFlag[] };
export type CampaignGroup = typeof adGroups.$inferSelect & { ads: CampaignAd[] };
export type CampaignDetail = { campaign: AdCampaign; groups: CampaignGroup[]; errors: number; warnings: number };

/** A campaign with its groups and ads, each ad checked against the platform's rules. */
export async function loadCampaign(workspaceId: string, campaignId: string): Promise<CampaignDetail | null> {
  const db = getDb();
  const [campaign] = await db
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.workspaceId, workspaceId)));
  if (!campaign) return null;
  const groups = await db.select().from(adGroups).where(eq(adGroups.campaignId, campaign.id)).orderBy(asc(adGroups.position), asc(adGroups.createdAt));
  const adRows = groups.length
    ? await db
        .select()
        .from(ads)
        .where(inArray(ads.groupId, groups.map((g) => g.id)))
        .orderBy(asc(ads.createdAt))
    : [];
  const names = await competitorNames(campaign.productId);
  let errors = 0;
  let warnings = 0;
  const withAds = groups.map((g) => ({
    ...g,
    ads: adRows
      .filter((a) => a.groupId === g.id)
      .map((a) => {
        const flags = checkAdCopy(campaign.platform, a.copy, names);
        errors += flags.filter((f) => f.level === "error").length;
        warnings += flags.filter((f) => f.level === "warning").length;
        return { ...a, flags };
      }),
  }));
  return { campaign, groups: withAds, errors, warnings };
}

export async function listCampaigns(productId: string) {
  const db = getDb();
  const campaigns = await db.select().from(adCampaigns).where(eq(adCampaigns.productId, productId)).orderBy(desc(adCampaigns.createdAt));
  const counts = campaigns.length
    ? await db
        .select({ campaignId: adGroups.campaignId, adId: ads.id })
        .from(ads)
        .innerJoin(adGroups, eq(adGroups.id, ads.groupId))
        .where(inArray(adGroups.campaignId, campaigns.map((c) => c.id)))
    : [];
  return campaigns.map((c) => ({ ...c, adCount: counts.filter((x) => x.campaignId === c.id).length }));
}
