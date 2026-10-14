import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, asc, eq, inArray, sum } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { adCampaigns, adCreatives, adGroups, ads, adTemplates, aiRuns, products, type AdRender } from "@startica/db/schema";
import { runImage, runStructured, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { checkConcept, CREATIVE_SPECS, creativeFolder, IMAGE_SIZE, logoPath, picturePath, RENDER_FILE, savePicture, sizeFile } from "./creatives.ts";
import { competitorNames } from "./jobs.ts";
import { AD_PLATFORMS } from "./platforms.ts";
import { adCopyText } from "./prompts.ts";
import { renderTemplate } from "./render.ts";
import { isHexColor, TEMPLATE_LABEL } from "./templates.ts";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
export const creativePayload = z.object({ workspaceId: z.guid(), creativeId: z.guid() });

// --- ad_creative_image: the AI draws the picture -----------------------------------------

export const AD_IMAGE_PROMPT_VERSION = "ad-image@1";

/** The rules every picture is drawn under; the founder's concept follows. */
export function imageSystem(template: string): string {
  return [
    "A picture for a paid social or display ad, made to sit under text that is added afterwards.",
    "Rules:",
    "- No text, letters, numbers, captions, logos, watermarks or screens with readable words: the ad's words are added later.",
    "- No real or identifiable people, celebrities or public figures; people, if any, are generic and not the focus of a face close-up.",
    "- No brand names, trademarks, or other companies' products, packaging or app icons.",
    "- No before-and-after comparisons, no body-image or health claims, nothing shocking.",
    "- Composition: the subject near the center with generous margins, so the picture can be cropped to wide and tall formats.",
    template === "overlay" ? "- Keep the lower third calm and uncluttered (a soft background), because the words sit there." : "- A clean, uncluttered background.",
    "- Natural light, a modern, credible look; not stock-photo clichés.",
  ].join("\n");
}

export function imagePrompt(product: { name: string; oneLiner: string | null }, concept: string): string {
  return [`The product: ${product.name}${product.oneLiner ? `: ${product.oneLiner}` : ""}.`, `The picture: ${concept.trim()}`].join("\n");
}

/** What the AI spent in one job run, from its logged calls. */
async function jobSpend(ctx: AiContext): Promise<number> {
  if (!ctx.jobRunId) return 0;
  const [row] = await getDb()
    .select({ total: sum(aiRuns.costUsd) })
    .from(aiRuns)
    .where(and(eq(aiRuns.jobRunId, ctx.jobRunId), eq(aiRuns.task, "image")));
  return Number(row?.total ?? 0);
}

export async function runCreativeImage(ctx: AiContext, payload: z.infer<typeof creativePayload>) {
  const db = getDb();
  const [row] = await db
    .select({ creative: adCreatives, campaign: adCampaigns })
    .from(adCreatives)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adCreatives.campaignId))
    .where(eq(adCreatives.id, payload.creativeId));
  if (!row) return { skipped: "creative deleted" };
  const { creative, campaign } = row;
  try {
    const problem = checkConcept(creative.concept, await competitorNames(campaign.productId));
    if (problem) throw new Error(problem);
    const [product] = await db.select({ name: products.name, oneLiner: products.oneLiner }).from(products).where(eq(products.id, campaign.productId));
    const system = imageSystem(creative.template);
    const prompt = imagePrompt(product ?? { name: "the product", oneLiner: null }, creative.concept);
    await db.update(adCreatives).set({ prompt: `${system}\n\n${prompt}` }).where(eq(adCreatives.id, creative.id));
    const picture = await runImage(ctx, {
      task: "image",
      promptVersion: AD_IMAGE_PROMPT_VERSION,
      system,
      messages: [{ role: "user", content: prompt }],
      size: `${IMAGE_SIZE.width}x${IMAGE_SIZE.height}`,
    });
    const file = savePicture(creative.id, picture);
    const cost = await jobSpend(ctx);
    await db
      .update(adCreatives)
      .set({ imageFile: file, imageSource: "ai", status: "rendering", costUsd: creative.costUsd + cost, error: null })
      .where(eq(adCreatives.id, creative.id));
    await enqueue(creative.workspaceId, "ad_creative_render", { workspaceId: creative.workspaceId, creativeId: creative.id });
    return { drawn: creative.id, costUsd: cost };
  } catch (err) {
    const cost = await jobSpend(ctx);
    await db
      .update(adCreatives)
      .set({ status: creative.renders.length ? "ready" : "failed", costUsd: creative.costUsd + cost, error: ctx.signal?.aborted ? "Stopped by you" : message(err) })
      .where(eq(adCreatives.id, creative.id));
    throw err;
  }
}

// --- ad_creative_render: every size of the template, offscreen ---------------------------

export async function runCreativeRender(ctx: AiContext, payload: z.infer<typeof creativePayload>) {
  const db = getDb();
  const [row] = await db
    .select({ creative: adCreatives, campaign: adCampaigns })
    .from(adCreatives)
    .innerJoin(adCampaigns, eq(adCampaigns.id, adCreatives.campaignId))
    .where(eq(adCreatives.id, payload.creativeId));
  if (!row) return { skipped: "creative deleted" };
  const { creative, campaign } = row;
  try {
    const spec = CREATIVE_SPECS[campaign.platform];
    const imagePath = creative.imageSource === "none" ? null : picturePath(creative);
    if (creative.imageSource !== "none" && !imagePath) throw new Error("The picture is missing: draw or upload it again");
    const logo = creative.useLogo ? logoPath(campaign.productId) : null;
    const renders: AdRender[] = [];
    const dir = creativeFolder(creative.id);
    mkdirSync(dir, { recursive: true });
    for (const s of spec.sizes) {
      ctx.signal?.throwIfAborted();
      const out = await renderTemplate(
        { template: creative.template, width: s.width, height: s.height, text: creative.text, colors: creative.colors, image: null, logo: null, imagePath, logoPath: logo },
        spec.maxBytes,
      );
      const file = sizeFile(s.size, out.format);
      writeFileSync(join(dir, file), out.data);
      renders.push({ size: s.size, width: s.width, height: s.height, file, bytes: out.data.length, ...(out.fit === "ok" ? {} : { fit: out.fit }) });
    }
    // A size that was a PNG last time and a JPEG now leaves its old file behind.
    for (const f of readdirSync(dir)) if (RENDER_FILE.test(f) && !renders.some((r) => r.file === f)) rmSync(join(dir, f), { force: true });
    await db.update(adCreatives).set({ renders, status: "ready", error: null }).where(eq(adCreatives.id, creative.id));
    return { rendered: renders.length };
  } catch (err) {
    await db
      .update(adCreatives)
      .set({ status: "failed", error: ctx.signal?.aborted ? "Stopped by you" : message(err) })
      .where(eq(adCreatives.id, creative.id));
    throw err;
  }
}

// --- ad_creative_ideas: concepts and words from the campaign's ads -----------------------

export const AD_CREATIVE_IDEAS_PROMPT_VERSION = "ad-creative-ideas@1";
export const creativeIdeasPayload = z.object({ workspaceId: z.guid(), campaignId: z.guid() });

const hex = z.string().describe("A color as #rrggbb");
export const creativeIdeasSchema = z.object({
  ideas: z
    .array(
      z.object({
        ad_index: z.number().int().describe("Which ad (from 1) the creative is for, or 0 for the whole campaign"),
        concept: z.string().describe("What the picture shows, for an image model: subject, setting, light, mood. No words, logos, brands or real people."),
        headline: z.string().describe("At most 40 characters, the ad's promise"),
        subline: z.string().describe("At most 90 characters, or empty"),
        cta: z.string().describe("The button, at most 18 characters"),
        template: z.enum(adTemplates),
        background: hex,
        text_color: hex,
        accent: hex,
      }),
    )
    .min(1)
    .max(4),
});

export function creativeIdeasSystem(platform: keyof typeof AD_PLATFORMS): string {
  return [
    `You are a performance creative director planning image ads for ${AD_PLATFORMS[platform].name}.`,
    "Suggest distinct creative concepts, each testing a different angle (the problem, the outcome, the product in use, a scene from the customer's day).",
    "The picture is drawn by an image model and the words are added by a template, so the concept describes only the picture, never text in it.",
    "Rules: no real or identifiable people, no other brands or products, no before-and-after, no claims the product can't back up. Headlines are short and concrete.",
    `Templates: ${Object.entries(TEMPLATE_LABEL)
      .map(([k, v]) => `${k} (${v.description})`)
      .join("; ")}.`,
    "Colors: a background, a text color with strong contrast on it (WCAG AA at least), and an accent for the button that stands out from both.",
  ].join("\n");
}

export async function runCreativeIdeas(ctx: AiContext, payload: z.infer<typeof creativeIdeasPayload>) {
  const db = getDb();
  const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, payload.campaignId));
  if (!campaign) return { skipped: "campaign deleted" };
  const product = await loadProductContext(campaign.productId);
  const groups = await db.select().from(adGroups).where(eq(adGroups.campaignId, campaign.id)).orderBy(asc(adGroups.position));
  const adRows = groups.length
    ? await db
        .select()
        .from(ads)
        .where(inArray(ads.groupId, groups.map((g) => g.id)))
        .orderBy(asc(ads.createdAt))
    : [];
  const out = await runStructured(ctx, {
    task: "draft",
    promptVersion: AD_CREATIVE_IDEAS_PROMPT_VERSION,
    system: creativeIdeasSystem(campaign.platform),
    messages: [
      {
        role: "user",
        content: [
          `<product>\n${product.text}\n</product>`,
          `<campaign>\nGoal: ${campaign.goal}\n${campaign.summary ? `Plan: ${campaign.summary}\n` : ""}</campaign>`,
          adRows.length
            ? `<ads>\n${adRows.map((a, i) => `Ad ${i + 1} (group: ${groups.find((g) => g.id === a.groupId)?.name ?? ""}):\n${adCopyText(a.copy)}`).join("\n---\n")}\n</ads>`
            : "",
          "Suggest 3 creatives.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    schema: creativeIdeasSchema,
  });
  const names = await competitorNames(campaign.productId);
  const rows = out.ideas
    .filter((i) => i.concept.trim() && i.headline.trim() && !checkConcept(i.concept, names))
    .map((i) => ({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      adId: adRows[i.ad_index - 1]?.id ?? null,
      concept: i.concept.trim(),
      template: i.template,
      text: { headline: i.headline.trim().slice(0, 80), subline: i.subline.trim().slice(0, 140) || undefined, cta: i.cta.trim().slice(0, 24) || undefined },
      colors: {
        background: isHexColor(i.background) ? i.background : "#111827",
        text: isHexColor(i.text_color) ? i.text_color : "#ffffff",
        accent: isHexColor(i.accent) ? i.accent : "#f59e0b",
      },
      imageSource: "ai" as const,
      status: "idea" as const,
    }));
  if (rows.length) await db.insert(adCreatives).values(rows);
  return { ideas: rows.length };
}
