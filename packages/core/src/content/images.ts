import { rmSync } from "node:fs";
import { join } from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { dataDir } from "@startica/db/paths";
import { enqueue } from "@startica/db/queue";
import { adTemplates, contentImages, contentPieces, type ContentImageSize } from "@startica/db/schema";
import { checkConcept, logoPath } from "../ads/creatives.ts";
import { competitorNames } from "../ads/jobs.ts";
import { checkUpload, isSafeId, pictureIn, readImageIn, savePictureIn } from "../ads/pipeline.ts";
import { isHexColor } from "../ads/templates.ts";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";

/**
 * Social post images for Content Studio pieces (ARCHITECTURE.md, Content Studio): the ads AD2
 * pipeline (ads/pipeline.ts) at the sizes each channel shows. The AI draws the picture (OpenAI's
 * `image` task), a template adds the words; without an OpenAI key, an upload or words only.
 * Assisted posting fills in text only: the owner downloads or copies the image and attaches it.
 *
 * Sizes and file limits checked 2026-10-21: X 16:9 1200×675 (and square), 5 MB per image;
 * Bluesky square 1080×1080, landscape 1200×630 and portrait 1080×1350, 1 MB per image (some
 * sources now say 2 MB; 1 MB keeps both safe); Mastodon 16:9 and square, 16 MB on recent
 * servers but smaller on some (8 MB kept); LinkedIn 1.91:1 1200×627, square and 4:5 1080×1350,
 * 5 MB; Reddit 4:5 1080×1350 and square, 20 MB. Instagram takes the square 1080×1080 and the
 * tall 4:5 1080×1350, so every channel's set includes the square (and most the tall one).
 */

type Spec = { sizes: { size: ContentImageSize; width: number; height: number; use: string }[]; maxBytes: number };

const SQUARE = { size: "1:1" as const, width: 1080, height: 1080, use: "Square (also Instagram)" };
const TALL = { size: "4:5" as const, width: 1080, height: 1350, use: "Tall (also Instagram)" };
const WIDE = { size: "16:9" as const, width: 1200, height: 675, use: "Wide, in the timeline" };
const LINK = { size: "1.91:1" as const, width: 1200, height: 627, use: "Landscape" };
const MB = 1024 * 1024;

export const SOCIAL_IMAGE_SPECS: Record<string, Spec> = {
  x: { sizes: [WIDE, SQUARE], maxBytes: 5 * MB },
  bluesky: { sizes: [WIDE, SQUARE, TALL], maxBytes: 1_000_000 },
  mastodon: { sizes: [WIDE, SQUARE], maxBytes: 8 * MB },
  linkedin: { sizes: [LINK, SQUARE, TALL], maxBytes: 5 * MB },
  reddit: { sizes: [TALL, SQUARE], maxBytes: 20 * MB },
  // Blogs, newsletters, forums and anything else: a link preview size plus Instagram's two.
  other: { sizes: [{ ...LINK, height: 630, use: "Link preview and blog header" }, SQUARE, TALL], maxBytes: 5 * MB },
};
export const imageSpec = (channel: string): Spec => SOCIAL_IMAGE_SPECS[channel] ?? SOCIAL_IMAGE_SPECS.other!;

export type ContentImage = typeof contentImages.$inferSelect;

export const imageFolder = (id: string) => join(dataDir(), "content", "images", id);
export const CONTENT_RENDER_FILE = /^(1x1|4x5|16x9|1\.91x1)\.(png|jpg)$/;

export function readContentImageFile(imageId: string, file: string): Buffer | null {
  if (!isSafeId(imageId)) return null;
  return readImageIn(imageFolder(imageId), file, CONTENT_RENDER_FILE);
}
export const contentPicturePath = (image: Pick<ContentImage, "id" | "imageFile">) => pictureIn(imageFolder(image.id), image.imageFile);

const color = (fallback: string) =>
  z
    .string()
    .default("")
    .transform((v) => v.trim())
    .transform((v) => (v && !v.startsWith("#") ? `#${v}` : v || fallback))
    .refine(isHexColor, "Colors look like #1f2937");

export const contentImageInput = z.object({
  concept: z.string().trim().max(1000).default(""),
  headline: z.string().trim().min(1, "Add a headline").max(80, "Keep the headline under 80 characters"),
  subline: z.string().trim().max(140).default(""),
  template: z.enum(adTemplates).default("overlay"),
  background: color("#111827"),
  text_color: color("#ffffff"),
  accent: color("#f59e0b"),
  image_source: z.enum(["ai", "upload", "none", "keep"]).default("ai"),
  use_logo: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
});
export type ContentImageInput = z.infer<typeof contentImageInput>;

const values = (input: ContentImageInput) => ({
  concept: input.concept,
  template: input.template,
  text: { headline: input.headline, subline: input.subline || undefined },
  colors: { background: input.background, text: input.text_color, accent: input.accent },
  useLogo: input.use_logo,
});

const busy = (i: ContentImage) => i.status === "generating" || i.status === "rendering";
const QUEUES = ["content_image_image", "content_image_render"];

async function ownPiece(workspaceId: string, pieceId: string) {
  const [piece] = await getDb().select().from(contentPieces).where(and(eq(contentPieces.id, pieceId), eq(contentPieces.workspaceId, workspaceId)));
  if (!piece) throw new Error("Not found");
  return piece;
}

export async function ownContentImage(workspaceId: string, imageId: string): Promise<ContentImage> {
  const [row] = await getDb().select().from(contentImages).where(and(eq(contentImages.id, imageId), eq(contentImages.workspaceId, workspaceId)));
  if (!row) throw new Error("Image not found");
  return row;
}

async function checkAiConcept(productId: string, concept: string) {
  if (!concept) throw new Error("Say what the picture should show");
  const problem = checkConcept(concept, await competitorNames(productId));
  if (problem) throw new Error(problem.replace("ads can't", "posts shouldn't"));
}

/** A new image for a piece: drawn by the AI (a job), or an upload / words only straight to rendering. */
export async function createContentImage(workspaceId: string, pieceId: string, input: ContentImageInput, upload: Buffer | null): Promise<string> {
  const piece = await ownPiece(workspaceId, pieceId);
  if (input.image_source === "ai") await checkAiConcept(piece.productId, input.concept);
  if (input.image_source === "upload" && !upload) throw new Error("Choose an image to upload");
  if (upload) checkUpload(upload);
  const source = input.image_source === "keep" ? "none" : input.image_source;
  const [row] = await getDb()
    .insert(contentImages)
    .values({ workspaceId, productId: piece.productId, pieceId: piece.id, ...values(input), imageSource: source, status: source === "ai" ? "generating" : "rendering" })
    .returning({ id: contentImages.id });
  const id = row!.id;
  if (upload) await getDb().update(contentImages).set({ imageFile: savePictureIn(imageFolder(id), upload) }).where(eq(contentImages.id, id));
  await enqueue(workspaceId, source === "ai" ? "content_image_image" : "content_image_render", { imageId: id });
  return id;
}

/** Saves edits and renders again; draws a new picture only when asked ("ai"). */
export async function updateContentImage(image: ContentImage, input: ContentImageInput, upload: Buffer | null): Promise<void> {
  if (busy(image)) throw new Error("Wait for this image to finish");
  const set: Partial<typeof contentImages.$inferInsert> = { ...values(input), error: null };
  let draw = false;
  if (input.image_source === "upload") {
    if (!upload) throw new Error("Choose an image to upload");
    set.imageFile = savePictureIn(imageFolder(image.id), upload);
    set.imageSource = "upload";
    set.prompt = null;
  } else if (input.image_source === "none") {
    set.imageSource = "none";
  } else if (input.image_source === "ai") {
    await checkAiConcept(image.productId, input.concept);
    set.imageSource = "ai";
    draw = true;
  }
  set.status = draw ? "generating" : "rendering";
  await getDb().update(contentImages).set(set).where(eq(contentImages.id, image.id));
  await enqueue(image.workspaceId, draw ? "content_image_image" : "content_image_render", { imageId: image.id });
}

export async function rerenderContentImage(image: ContentImage): Promise<void> {
  if (busy(image)) return;
  if (image.imageSource !== "none" && !contentPicturePath(image)) throw new Error("This image has no picture yet: draw or upload one");
  await getDb().update(contentImages).set({ status: "rendering", error: null }).where(eq(contentImages.id, image.id));
  await enqueue(image.workspaceId, "content_image_render", { imageId: image.id });
}

export async function stopContentImage(image: ContentImage): Promise<void> {
  const job = await jobByPayload(image.workspaceId, QUEUES, "imageId", image.id);
  if (job) await stopJob(image.workspaceId, job);
  await getDb().update(contentImages).set({ status: image.renders.length ? "ready" : "failed", error: "Stopped by you" }).where(eq(contentImages.id, image.id));
}

export async function deleteContentImage(image: ContentImage): Promise<void> {
  const job = await jobByPayload(image.workspaceId, QUEUES, "imageId", image.id);
  if (job) await stopJob(image.workspaceId, job);
  await getDb().delete(contentImages).where(eq(contentImages.id, image.id));
  if (isSafeId(image.id)) rmSync(imageFolder(image.id), { recursive: true, force: true });
}

/** Deletes the files of a piece's images (the rows go with the piece). */
export async function deletePieceImages(pieceIds: string[]): Promise<void> {
  if (pieceIds.length === 0) return;
  const rows = await getDb().select({ id: contentImages.id }).from(contentImages).where(inArray(contentImages.pieceId, pieceIds));
  for (const r of rows) if (isSafeId(r.id)) rmSync(imageFolder(r.id), { recursive: true, force: true });
}

export async function listContentImages(pieceId: string): Promise<ContentImage[]> {
  return getDb().select().from(contentImages).where(eq(contentImages.pieceId, pieceId)).orderBy(desc(contentImages.createdAt), asc(contentImages.id));
}

export { logoPath };
