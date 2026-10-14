"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { recordPiecePosted } from "@startica/core/posting/record";
import { pieceRequest } from "@startica/core/posting/requests";
import { enqueue } from "@startica/db/queue";
import { contentChannels, contentFormats, contentPieces, voiceProfiles, voiceSamples, voiceSources } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";
import { openPostingWindow, postingContext } from "@/lib/posting";

const optional = z
  .string()
  .trim()
  .transform((v) => v || null);

async function own<T extends typeof voiceSources | typeof voiceProfiles | typeof contentPieces>(table: T, rowId: string) {
  const workspace = await getWorkspace();
  const [row] = await (await db())
    .select()
    .from(table as typeof voiceSources)
    .where(and(eq(table.id, id.parse(rowId)), eq(table.workspaceId, workspace.id)));
  if (!row) throw new Error("Not found");
  return row as unknown as T["$inferSelect"];
}

// --- Voices ------------------------------------------------------------------------

const sourceSchema = z.object({
  name: z.string().trim().min(1, "Name the creator"),
  platform: z.enum(contentChannels),
  handle: optional.transform((h) => h?.replace(/^@|^\/?u\//i, "") ?? null),
  url: optional.pipe(z.url().nullable()),
  notes: z.string().trim().default(""),
});

export async function saveVoiceSource(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const values = sourceSchema.parse(formFields(formData));
    const [source] = await (await db()).insert(voiceSources).values({ ...values, ...scope }).returning({ id: voiceSources.id });
    // Reddit and HN writing can be imported automatically.
    if (values.handle && (values.platform === "reddit" || values.platform === "hackernews")) {
      await enqueue(scope.workspaceId, "voice_import", { sourceId: source!.id });
    }
  });
}

export async function importVoiceSamples(sourceId: string): Promise<ActionResult> {
  return mutate(async () => {
    const source = await own(voiceSources, sourceId);
    if (!source.handle || !["reddit", "hackernews"].includes(source.platform)) {
      throw new Error("Automatic import works for Reddit and Hacker News usernames; paste samples for other platforms");
    }
    await enqueue(source.workspaceId, "voice_import", { sourceId: source.id });
  });
}

/** Paste samples, separated by a line with three dashes (---). */
export async function addVoiceSamples(sourceId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const source = await own(voiceSources, sourceId);
    const samples = z
      .string()
      .parse(formData.get("samples") ?? "")
      .split(/^\s*---\s*$/m)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);
    if (samples.length === 0) throw new Error("Paste at least one sample (20+ characters)");
    await (await db()).insert(voiceSamples).values(samples.map((text) => ({ text, workspaceId: source.workspaceId, sourceId: source.id })));
  });
}

export async function deleteVoiceSource(sourceId: string): Promise<ActionResult> {
  return mutate(async () => {
    const source = await own(voiceSources, sourceId);
    await (await db()).delete(voiceSources).where(eq(voiceSources.id, source.id));
  });
}

/** Builds (or rebuilds) a voice from one source, or from all sources when sourceId is null. */
export async function buildVoice(productId: string, sourceId: string | null, name: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const d = await db();
    const sourceIds = sourceId
      ? [(await own(voiceSources, sourceId)).id]
      : (await d.select({ id: voiceSources.id }).from(voiceSources).where(eq(voiceSources.productId, scope.productId))).map((s) => s.id);
    if (sourceIds.length === 0) throw new Error("Add a voice source first");
    const [profile] = await d
      .insert(voiceProfiles)
      .values({ ...scope, name: z.string().trim().min(1).parse(name), sourceIds, status: "building" })
      .returning({ id: voiceProfiles.id });
    await enqueue(scope.workspaceId, "voice_profile_build", { profileId: profile!.id });
  });
}

export async function deleteVoiceProfile(profileId: string): Promise<ActionResult> {
  return mutate(async () => {
    const profile = await own(voiceProfiles, profileId);
    await (await db()).delete(voiceProfiles).where(eq(voiceProfiles.id, profile.id));
  });
}

// --- Content -----------------------------------------------------------------------

const pieceSchema = z.object({
  topic: z.string().trim().min(3, "What should it be about?"),
  channel: z.enum(contentChannels),
  format: z.enum(contentFormats),
  voice: z.string().default(""),
});

export async function createPiece(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const input = pieceSchema.parse(formFields(formData));
    if ((input.format === "campaign") !== (input.channel === "email")) throw new Error("Email campaigns go with the Email channel");
    const voiceProfileId = input.voice ? (await own(voiceProfiles, input.voice)).id : null;
    const [piece] = await (await db())
      .insert(contentPieces)
      .values({ ...scope, topic: input.topic, channel: input.channel, format: input.format, voiceProfileId, status: "drafting" })
      .returning({ id: contentPieces.id });
    await enqueue(scope.workspaceId, "content_generate", { pieceId: piece!.id });
  });
}

export async function regeneratePiece(pieceId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    const guidance = z.string().trim().max(1000).parse(formData.get("guidance") ?? "");
    await (await db()).update(contentPieces).set({ status: "drafting", error: null }).where(eq(contentPieces.id, piece.id));
    await enqueue(piece.workspaceId, "content_generate", { pieceId: piece.id, ...(guidance ? { guidance } : {}) });
  });
}

export async function savePieceEdit(pieceId: string, title: string, body: string): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    await (await db())
      .update(contentPieces)
      .set({ title: title.trim() || null, body: z.string().trim().min(1, "It's empty").parse(body) })
      .where(eq(contentPieces.id, piece.id));
  });
}

export async function markPiecePosted(pieceId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    const url = optional.pipe(z.url("That doesn't look like a link").nullable()).parse(formData.get("url") ?? "");
    await recordPiecePosted({ pieceId: piece.id, url });
  });
}

/** Opens the desktop app's posting window with the piece filled in (ARCHITECTURE.md 8.4); saves unsaved edits first. */
export async function postPieceWithStartica(pieceId: string, title: string, body: string): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    const text = z.string().trim().min(1, "It's empty").parse(body);
    const values = { title: title.trim() || null, body: text };
    if (values.title !== piece.title || values.body !== piece.body) {
      await (await db()).update(contentPieces).set(values).where(eq(contentPieces.id, piece.id));
    }
    if (["hackernews", "reddit", "discourse"].includes(piece.channel) && !values.title) throw new Error("Add a title first: this channel's posts need one");
    const request = pieceRequest({ id: piece.id, channel: piece.channel, format: piece.format, ...values }, await postingContext(piece.productId));
    if (!request) throw new Error("Startica can't post this one for you (threads, text over the site's limit, or a missing Mastodon server or Discourse forum); copy the text instead");
    openPostingWindow(request);
  });
}

export async function savePieceNotes(pieceId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    const notes = z.string().trim().max(2000).parse(formData.get("notes") ?? "");
    await (await db()).update(contentPieces).set({ notes: notes || null }).where(eq(contentPieces.id, piece.id));
  });
}

export async function deletePiece(pieceId: string): Promise<ActionResult> {
  return mutate(async () => {
    const piece = await own(contentPieces, pieceId);
    await (await db()).delete(contentPieces).where(eq(contentPieces.id, piece.id));
  });
}

export async function suggestTopics(productId: string): Promise<ActionResult> {
  try {
    const scope = await productScope(productId);
    await enqueue(scope.workspaceId, "content_topics", { productId: scope.productId });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}
