import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { contentPieces, conversations, opportunities, voiceProfiles, voiceSamples, voiceSources } from "@startica/db/schema";
import { runStructured, type AiContext } from "../ai/client.ts";
import { fetchHnUserWriting } from "../channels/hackernews.ts";
import { fetchRedditUserWriting } from "../channels/reddit.ts";
import { loadProductContext } from "../distribution/context.ts";
import { utmUrl } from "../distribution/utm.ts";
import { CAMPAIGN_NORMS, CAMPAIGN_PROMPT_VERSION, campaignOutput, formatCampaign } from "./campaign.ts";
import {
  CHANNEL_NORMS,
  CONTENT_PROMPT_VERSION,
  contentOutput,
  contentSystem,
  TOPICS_PROMPT_VERSION,
  TOPICS_SYSTEM,
  topicsOutput,
  VOICE_PROMPT_VERSION,
  VOICE_SYSTEM,
  voiceGuideOutput,
} from "./prompts.ts";

const MAX_SAMPLE_CHARS = 40_000;
export const topicsSettingKey = (productId: string) => `content_topics:${productId}`;

// --- voice_import: pull a Reddit or HN user's writing into a source -------------

export const voiceImportPayload = z.object({ workspaceId: z.guid(), sourceId: z.guid() });

export async function runVoiceImport(_ctx: AiContext, payload: z.infer<typeof voiceImportPayload>) {
  const db = getDb();
  const [source] = await db.select().from(voiceSources).where(eq(voiceSources.id, payload.sourceId));
  if (!source?.handle) throw new Error("This source has no username to import from");
  const samples =
    source.platform === "reddit"
      ? await fetchRedditUserWriting(source.handle)
      : source.platform === "hackernews"
        ? await fetchHnUserWriting(source.handle)
        : [];
  if (samples.length === 0) throw new Error(`Found no public writing for ${source.handle} on ${source.platform}`);

  const existing = new Set(
    (await db.select({ url: voiceSamples.url }).from(voiceSamples).where(eq(voiceSamples.sourceId, source.id))).map((s) => s.url),
  );
  const fresh = samples.filter((s) => !existing.has(s.url));
  if (fresh.length) {
    await db.insert(voiceSamples).values(fresh.map((s) => ({ ...s, workspaceId: source.workspaceId, sourceId: source.id })));
  }
  return { imported: fresh.length };
}

// --- voice_profile_build: distill a style guide from the samples ---------------

export const voiceProfilePayload = z.object({ workspaceId: z.guid(), profileId: z.guid() });

export async function runVoiceProfileBuild(ctx: AiContext, payload: z.infer<typeof voiceProfilePayload>) {
  const db = getDb();
  const [profile] = await db.select().from(voiceProfiles).where(eq(voiceProfiles.id, payload.profileId));
  if (!profile) throw new Error("Voice profile not found");
  try {
    const samples = profile.sourceIds.length
      ? await db
          .select({ text: voiceSamples.text, source: voiceSources.name, platform: voiceSources.platform })
          .from(voiceSamples)
          .innerJoin(voiceSources, eq(voiceSources.id, voiceSamples.sourceId))
          .where(inArray(voiceSamples.sourceId, profile.sourceIds))
          .orderBy(desc(voiceSamples.createdAt))
      : [];
    if (samples.length < 3) throw new Error("Add at least 3 writing samples first");

    let material = "";
    for (const s of samples) {
      const block = `<sample source="${s.source}" platform="${s.platform}">\n${s.text}\n</sample>\n`;
      if (material.length + block.length > MAX_SAMPLE_CHARS) break;
      material += block;
    }
    const guide = await runStructured(ctx, {
      task: "strategy",
      promptVersion: VOICE_PROMPT_VERSION,
      system: VOICE_SYSTEM,
      messages: [{ role: "user", content: material }],
      schema: voiceGuideOutput,
    });
    await db.update(voiceProfiles).set({ guide, status: "ready", error: null }).where(eq(voiceProfiles.id, profile.id));
    return { samples: samples.length };
  } catch (error) {
    await db
      .update(voiceProfiles)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(eq(voiceProfiles.id, profile.id));
    throw error;
  }
}

// --- content_generate: write one piece ------------------------------------------

export const contentGeneratePayload = z.object({
  workspaceId: z.guid(),
  pieceId: z.guid(),
  guidance: z.string().max(1000).optional(),
});

export async function runContentGenerate(ctx: AiContext, payload: z.infer<typeof contentGeneratePayload>) {
  const db = getDb();
  const [piece] = await db.select().from(contentPieces).where(eq(contentPieces.id, payload.pieceId));
  if (!piece) throw new Error("Content piece not found");
  try {
    await db.update(contentPieces).set({ status: "drafting", error: null }).where(eq(contentPieces.id, piece.id));
    const product = await loadProductContext(piece.productId);
    const [voice] = piece.voiceProfileId
      ? await db.select().from(voiceProfiles).where(and(eq(voiceProfiles.id, piece.voiceProfileId), eq(voiceProfiles.status, "ready")))
      : [];
    // A fresh id per version keeps per-piece attribution unambiguous in GA4.
    const isCampaign = piece.format === "campaign";
    const link = product.url
      ? // utm_source = the channel (bluesky, email, linkedin…), utm_campaign = <channel>-<date>.
        utmUrl(product.url, {
          channel: piece.channel,
          community: null,
          draftId: `content-${randomUUID().slice(0, 8)}`,
          medium: piece.channel === "email" || piece.channel === "newsletter" ? "email" : "content",
        })
      : null;

    const request = {
      task: "draft" as const,
      system: contentSystem(product.text),
      messages: [
        {
          role: "user" as const,
          content: [
            `<channel name="${piece.channel}" format="${piece.format}">\n${isCampaign ? CAMPAIGN_NORMS : (CHANNEL_NORMS[piece.channel] ?? CHANNEL_NORMS.other)}\n</channel>`,
            voice?.guide
              ? `<voice_guide name="${voice.name}">\n${JSON.stringify(voice.guide, null, 2)}\n</voice_guide>`
              : "<voice_guide>(none: write in a warm, plain, knowledgeable voice)</voice_guide>",
            `<topic>${piece.topic}</topic>`,
            link ? `<link>${link}</link>` : "<link>(no product link; don't link)</link>",
            piece.body && payload.guidance ? `<previous_version>\n${piece.body}\n</previous_version>` : "",
            payload.guidance ? `<owner_guidance>${payload.guidance}</owner_guidance>` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    };
    // A campaign comes back as separate emails and is stored as text sections (campaign.ts).
    const written = isCampaign
      ? await runStructured(ctx, { ...request, promptVersion: CAMPAIGN_PROMPT_VERSION, schema: campaignOutput }).then((c) => ({
          title: c.title,
          body: formatCampaign(c.emails),
          mentions_product: c.mentions_product,
          rationale: c.rationale,
        }))
      : await runStructured(ctx, { ...request, promptVersion: CONTENT_PROMPT_VERSION, schema: contentOutput });
    await db
      .update(contentPieces)
      .set({
        title: written.title || null,
        body: written.body,
        rationale: written.rationale,
        utmUrl: written.mentions_product ? link : null,
        status: "draft",
      })
      .where(eq(contentPieces.id, piece.id));
    return { mentionsProduct: written.mentions_product };
  } catch (error) {
    await db
      .update(contentPieces)
      .set({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      .where(eq(contentPieces.id, piece.id));
    throw error;
  }
}

// --- content_topics: suggest ideas from intel and live conversations -----------

export const contentTopicsPayload = z.object({ workspaceId: z.guid(), productId: z.guid() });

export async function runContentTopics(ctx: AiContext, payload: z.infer<typeof contentTopicsPayload>) {
  const db = getDb();
  const product = await loadProductContext(payload.productId);
  const recent = await db
    .select({ title: conversations.title, threadTitle: conversations.threadTitle, community: conversations.community, relevance: opportunities.relevance })
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(eq(opportunities.productId, payload.productId))
    .orderBy(desc(opportunities.relevance), desc(opportunities.createdAt))
    .limit(25);

  const result = await runStructured(ctx, {
    task: "draft",
    promptVersion: TOPICS_PROMPT_VERSION,
    system: TOPICS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `<product>\n${product.text}\n</product>\n\n<recent_conversations>\n${
          recent.map((r) => `- ${r.title ?? r.threadTitle ?? "(untitled)"} (${r.community ?? "?"})`).join("\n") || "(none yet)"
        }\n</recent_conversations>\n\nSuggest 8 ideas across channels.`,
      },
    ],
    schema: topicsOutput,
  });
  await setSetting(topicsSettingKey(payload.productId), { topics: result.topics, generatedAt: new Date().toISOString() });
  return { topics: result.topics.length };
}
