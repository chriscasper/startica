import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { dataDir } from "@startica/db/paths";
import { enqueue } from "@startica/db/queue";
import { adCreatives, adCreativeSizes, adGroups, ads, adTemplates, type AdCreativeSize, type AdPlatform } from "@startica/db/schema";
import { taskModel, type AiContext } from "../ai/client.ts";
import { estimateCostUsd } from "../ai/pricing.ts";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";
import { type AdCampaign } from "./campaigns.ts";
import { isHexColor } from "./templates.ts";

export type AdCreative = typeof adCreatives.$inferSelect;

/**
 * Ad creatives (ARCHITECTURE.md section 8.6, AD2): one picture, a template's words over it, every
 * size the platform takes. Specs checked 2026-10-10; Reddit's file limit is unconfirmed.
 */
export const CREATIVE_SPECS: Record<AdPlatform, { sizes: { size: AdCreativeSize; width: number; height: number; use: string }[]; maxBytes: number; aiLabel: string }> = {
  google: {
    sizes: [
      { size: "1.91:1", width: 1200, height: 628, use: "Landscape (Display, Demand Gen, Performance Max)" },
      { size: "1:1", width: 1200, height: 1200, use: "Square" },
      { size: "4:5", width: 960, height: 1200, use: "Portrait (Demand Gen)" },
      { size: "9:16", width: 1080, height: 1920, use: "Vertical (YouTube Shorts, Demand Gen)" },
    ],
    maxBytes: 5 * 1024 * 1024,
    aiLabel:
      "Google requires disclosure of AI-made images in election ads, and since July 2026 for AI assets shown in the EU, India and New York: check the AI-content setting when you upload there. Search campaigns don't use images.",
  },
  meta: {
    sizes: [
      { size: "4:5", width: 1440, height: 1800, use: "Feed (recommended)" },
      { size: "1:1", width: 1440, height: 1440, use: "Feed" },
      { size: "9:16", width: 1440, height: 2560, use: "Stories and Reels" },
      { size: "1.91:1", width: 1200, height: 628, use: "Links and right column" },
    ],
    maxBytes: 30 * 1024 * 1024,
    aiLabel: "Meta asks you to disclose AI-made images only in political and social-issue ads; it labels AI media it detects itself (since June 2026).",
  },
  reddit: {
    sizes: [
      { size: "4:5", width: 1080, height: 1350, use: "Feed (tallest Reddit shows)" },
      { size: "1:1", width: 1080, height: 1080, use: "Feed" },
    ],
    maxBytes: 3 * 1024 * 1024,
    aiLabel: "Reddit follows its political-ads rules for disclosure; check its ad policy before using AI-made people or places in sensitive topics.",
  },
};

/** The picture is drawn once, square and large, and each size crops it. */
export const IMAGE_SIZE = { width: 2048, height: 2048 };

// Output tokens per megapixel by quality (OpenAI's per-image figures at 1024×1024, checked 2026-10-13).
const TOKENS_PER_MP: Record<string, number> = { low: 196, medium: 439, high: 1756, xhigh: 3122, max: 7024 };

/** What one picture costs at the workspace's image model and quality, before it's drawn. */
export async function imageEstimate(ctx: AiContext): Promise<{ model: string; quality: string; usd: number }> {
  const config = await taskModel(ctx, "image");
  const quality = config.effort ?? "medium";
  const mp = (IMAGE_SIZE.width * IMAGE_SIZE.height) / (1024 * 1024);
  // Sunburst renders more carefully and uses more output tokens for the same picture: estimate high.
  const factor = config.model.includes("sunburst") ? 1.5 : 1;
  const usd = estimateCostUsd(config.model, { inputTokens: 400, outputTokens: Math.round((TOKENS_PER_MP[quality] ?? TOKENS_PER_MP.medium!) * mp * factor), cacheReadTokens: 0, cacheWriteTokens: 0 });
  return { model: config.model, quality, usd };
}

// --- Files -----------------------------------------------------------------------------

const safeId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
export const creativeFolder = (id: string) => join(dataDir(), "ads", "creatives", id);
const logoFolder = () => join(dataDir(), "ads", "logos");
export const RENDER_FILE = /^(1x1|4x5|9x16|1\.91x1)\.(png|jpg)$/;
const PICTURE_FILE = /^picture\.(png|jpg|webp)$/;
export const sizeFile = (size: AdCreativeSize, format: "png" | "jpeg") => `${size.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;

/** PNG, JPEG or WebP, from the file's first bytes; null for anything else. */
export function imageType(data: Buffer): "png" | "jpg" | "webp" | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function checkUpload(data: Buffer): "png" | "jpg" | "webp" {
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("That image is over 20 MB");
  const type = imageType(data);
  if (!type) throw new Error("Use a PNG, JPEG or WebP image");
  return type;
}

export function savePicture(creativeId: string, data: Buffer): string {
  const type = checkUpload(data);
  const dir = creativeFolder(creativeId);
  mkdirSync(dir, { recursive: true });
  for (const f of existsSync(dir) ? readdirSync(dir) : []) if (PICTURE_FILE.test(f)) rmSync(join(dir, f), { force: true });
  const file = `picture.${type}`;
  writeFileSync(join(dir, file), data);
  return file;
}

/** A creative's picture or one of its rendered sizes. */
export function readCreativeFile(creativeId: string, file: string): Buffer | null {
  if (!safeId(creativeId) || !(RENDER_FILE.test(file) || PICTURE_FILE.test(file))) return null;
  try {
    return readFileSync(join(creativeFolder(creativeId), file));
  } catch {
    return null;
  }
}

export function picturePath(creative: Pick<AdCreative, "id" | "imageFile">): string | null {
  if (!creative.imageFile || !PICTURE_FILE.test(creative.imageFile)) return null;
  const path = join(creativeFolder(creative.id), creative.imageFile);
  return existsSync(path) ? path : null;
}

/** The product's logo for templates, one per product. */
export function logoPath(productId: string): string | null {
  if (!safeId(productId)) return null;
  for (const ext of ["png", "jpg", "webp"]) {
    const path = join(logoFolder(), `${productId}.${ext}`);
    if (existsSync(path)) return path;
  }
  return null;
}

export function saveLogo(productId: string, data: Buffer): void {
  if (!safeId(productId)) throw new Error("Unknown product");
  const type = checkUpload(data);
  removeLogo(productId);
  mkdirSync(logoFolder(), { recursive: true });
  writeFileSync(join(logoFolder(), `${productId}.${type}`), data);
}

export function removeLogo(productId: string): void {
  if (!safeId(productId)) return;
  for (const ext of ["png", "jpg", "webp"]) rmSync(join(logoFolder(), `${productId}.${ext}`), { force: true });
}

export function readLogo(productId: string): { data: Buffer; type: string } | null {
  const path = logoPath(productId);
  return path ? { data: readFileSync(path), type: path.split(".").pop()! } : null;
}

// --- Creatives -------------------------------------------------------------------------

const color = (fallback: string) =>
  z
    .string()
    .default("")
    .transform((v) => v.trim())
    .transform((v) => (v && !v.startsWith("#") ? `#${v}` : v || fallback))
    .refine(isHexColor, "Colors look like #1f2937");

export const creativeInput = z.object({
  concept: z.string().trim().max(1000).default(""),
  headline: z.string().trim().min(1, "Add a headline").max(80, "Keep the headline under 80 characters"),
  subline: z.string().trim().max(140).default(""),
  cta: z.string().trim().max(24, "Keep the button under 24 characters").default(""),
  price: z.string().trim().max(24).default(""),
  template: z.enum(adTemplates).default("overlay"),
  background: color("#111827"),
  text_color: color("#ffffff"),
  accent: color("#f59e0b"),
  image_source: z.enum(["ai", "upload", "none", "keep"]).default("ai"),
  ad_id: z.string().trim().default(""),
  use_logo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
});
export type CreativeInput = z.infer<typeof creativeInput>;

const values = (input: CreativeInput) => ({
  concept: input.concept,
  template: input.template,
  text: { headline: input.headline, subline: input.subline || undefined, cta: input.cta || undefined, price: input.price || undefined },
  colors: { background: input.background, text: input.text_color, accent: input.accent },
  useLogo: input.use_logo,
});

/** The ad must be in this campaign. */
async function checkAd(campaign: AdCampaign, adId: string): Promise<string | null> {
  if (!adId) return null;
  const [row] = await getDb()
    .select({ id: ads.id })
    .from(ads)
    .innerJoin(adGroups, eq(adGroups.id, ads.groupId))
    .where(and(eq(ads.id, adId), eq(adGroups.campaignId, campaign.id)));
  if (!row) throw new Error("That ad isn't in this campaign");
  return row.id;
}

export function checkConcept(concept: string, competitorNames: string[]): string | null {
  const lower = concept.toLowerCase();
  const named = competitorNames.find((n) => n.trim().length > 2 && lower.includes(n.toLowerCase()));
  if (named) return `Leave ${named} out of the picture: ads can't show other brands`;
  return null;
}

export async function ownCreative(workspaceId: string, creativeId: string): Promise<AdCreative> {
  const [row] = await getDb()
    .select()
    .from(adCreatives)
    .where(and(eq(adCreatives.id, creativeId), eq(adCreatives.workspaceId, workspaceId)));
  if (!row) throw new Error("Creative not found");
  return row;
}

/** Creates a creative: the AI draws its picture (a job), or an upload or no picture goes straight to rendering. */
export async function createCreative(campaign: AdCampaign, input: CreativeInput, upload: Buffer | null, competitorNames: string[]): Promise<string> {
  if (input.image_source === "ai") {
    if (!input.concept) throw new Error("Say what the picture should show");
    const problem = checkConcept(input.concept, competitorNames);
    if (problem) throw new Error(problem);
  }
  if (input.image_source === "upload" && !upload) throw new Error("Choose an image to upload");
  if (upload) checkUpload(upload);
  const adId = await checkAd(campaign, input.ad_id);
  const source = input.image_source === "keep" ? "none" : input.image_source;
  const [row] = await getDb()
    .insert(adCreatives)
    .values({ workspaceId: campaign.workspaceId, campaignId: campaign.id, adId, ...values(input), imageSource: source, status: source === "ai" ? "generating" : "rendering" })
    .returning({ id: adCreatives.id });
  const id = row!.id;
  if (upload) await getDb().update(adCreatives).set({ imageFile: savePicture(id, upload) }).where(eq(adCreatives.id, id));
  await enqueue(campaign.workspaceId, source === "ai" ? "ad_creative_image" : "ad_creative_render", { workspaceId: campaign.workspaceId, creativeId: id });
  return id;
}

/** Saves edits and renders again; a new picture only when asked for ("ai" draws one, "upload" replaces it, "keep" keeps it). */
export async function updateCreative(creative: AdCreative, campaign: AdCampaign, input: CreativeInput, upload: Buffer | null, competitorNames: string[]): Promise<void> {
  if (busy(creative)) throw new Error("Wait for this creative to finish");
  const adId = await checkAd(campaign, input.ad_id);
  const set: Partial<typeof adCreatives.$inferInsert> = { ...values(input), adId, error: null };
  let draw = false;
  if (input.image_source === "upload") {
    if (!upload) throw new Error("Choose an image to upload");
    set.imageFile = savePicture(creative.id, upload);
    set.imageSource = "upload";
    set.prompt = null;
  } else if (input.image_source === "none") {
    set.imageSource = "none";
  } else if (input.image_source === "ai") {
    if (!input.concept) throw new Error("Say what the picture should show");
    const problem = checkConcept(input.concept, competitorNames);
    if (problem) throw new Error(problem);
    set.imageSource = "ai";
    draw = true;
  }
  set.status = draw ? "generating" : "rendering";
  await getDb().update(adCreatives).set(set).where(eq(adCreatives.id, creative.id));
  await enqueue(creative.workspaceId, draw ? "ad_creative_image" : "ad_creative_render", { workspaceId: creative.workspaceId, creativeId: creative.id });
}

const busy = (c: AdCreative) => c.status === "generating" || c.status === "rendering";

/** Draws the picture (again) from the concept: costs one picture. */
export async function drawCreative(creative: AdCreative, competitorNames: string[]): Promise<void> {
  if (busy(creative)) return;
  if (!creative.concept.trim()) throw new Error("Say what the picture should show first (Edit)");
  const problem = checkConcept(creative.concept, competitorNames);
  if (problem) throw new Error(problem);
  await getDb().update(adCreatives).set({ status: "generating", imageSource: "ai", error: null }).where(eq(adCreatives.id, creative.id));
  await enqueue(creative.workspaceId, "ad_creative_image", { workspaceId: creative.workspaceId, creativeId: creative.id });
}

/** Renders the sizes again (after a logo change, or a failed render). */
export async function rerenderCreative(creative: AdCreative): Promise<void> {
  if (busy(creative)) return;
  if (creative.imageSource !== "none" && !picturePath(creative)) throw new Error("This creative has no picture yet: draw or upload one");
  await getDb().update(adCreatives).set({ status: "rendering", error: null }).where(eq(adCreatives.id, creative.id));
  await enqueue(creative.workspaceId, "ad_creative_render", { workspaceId: creative.workspaceId, creativeId: creative.id });
}

export async function stopCreative(creative: AdCreative): Promise<void> {
  const job = await jobByPayload(creative.workspaceId, ["ad_creative_image", "ad_creative_render"], "creativeId", creative.id);
  if (job) await stopJob(creative.workspaceId, job);
  await getDb()
    .update(adCreatives)
    .set({ status: creative.renders.length ? "ready" : "failed", error: "Stopped by you" })
    .where(eq(adCreatives.id, creative.id));
}

export async function deleteCreative(creative: AdCreative): Promise<void> {
  const job = await jobByPayload(creative.workspaceId, ["ad_creative_image", "ad_creative_render"], "creativeId", creative.id);
  if (job) await stopJob(creative.workspaceId, job);
  await getDb().delete(adCreatives).where(eq(adCreatives.id, creative.id));
  if (safeId(creative.id)) rmSync(creativeFolder(creative.id), { recursive: true, force: true });
}

/** Deletes the files of a campaign's creatives (the rows go with the campaign). */
export async function deleteCampaignCreatives(campaignId: string): Promise<void> {
  const rows = await getDb().select({ id: adCreatives.id }).from(adCreatives).where(eq(adCreatives.campaignId, campaignId));
  for (const r of rows) if (safeId(r.id)) rmSync(creativeFolder(r.id), { recursive: true, force: true });
}

export async function listCreatives(campaignId: string): Promise<AdCreative[]> {
  return getDb().select().from(adCreatives).where(eq(adCreatives.campaignId, campaignId)).orderBy(desc(adCreatives.createdAt), asc(adCreatives.id));
}

export const SIZE_ORDER = adCreativeSizes;
