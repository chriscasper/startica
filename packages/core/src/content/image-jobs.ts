import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { contentImages, contentPieces, type ContentImageRender } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { checkConcept, logoPath } from "../ads/creatives.ts";
import { competitorNames } from "../ads/jobs.ts";
import { drawPicture, imageSpend, pictureRequest, renderSizes, savePictureIn } from "../ads/pipeline.ts";
import { CONTENT_RENDER_FILE, contentPicturePath, imageFolder, imageSpec } from "./images.ts";

/** content_image_image / content_image_render: the same steps as the ads creative jobs, for a piece's image. */

export const POST_IMAGE_PROMPT_VERSION = "post-image@1";
export const contentImagePayload = z.object({ workspaceId: z.guid(), imageId: z.guid() });
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function load(imageId: string) {
  const [row] = await getDb()
    .select({ image: contentImages, channel: contentPieces.channel })
    .from(contentImages)
    .innerJoin(contentPieces, eq(contentPieces.id, contentImages.pieceId))
    .where(eq(contentImages.id, imageId));
  return row ?? null;
}

export async function runContentImageDraw(ctx: AiContext, payload: z.infer<typeof contentImagePayload>) {
  const db = getDb();
  const row = await load(payload.imageId);
  if (!row) return { skipped: "image deleted" };
  const { image } = row;
  try {
    const problem = checkConcept(image.concept, await competitorNames(image.productId));
    if (problem) throw new Error(problem);
    const request = await pictureRequest(image.productId, image.concept, image.template, "post");
    await db.update(contentImages).set({ prompt: request.stored }).where(eq(contentImages.id, image.id));
    const picture = await drawPicture(ctx, request, POST_IMAGE_PROMPT_VERSION);
    const file = savePictureIn(imageFolder(image.id), picture);
    const cost = await imageSpend(ctx);
    await db.update(contentImages).set({ imageFile: file, imageSource: "ai", status: "rendering", costUsd: image.costUsd + cost, error: null }).where(eq(contentImages.id, image.id));
    await enqueue(image.workspaceId, "content_image_render", { imageId: image.id });
    return { drawn: image.id, costUsd: cost };
  } catch (err) {
    const cost = await imageSpend(ctx);
    await db
      .update(contentImages)
      .set({ status: image.renders.length ? "ready" : "failed", costUsd: image.costUsd + cost, error: ctx.signal?.aborted ? "Stopped by you" : message(err) })
      .where(eq(contentImages.id, image.id));
    throw err;
  }
}

export async function runContentImageRender(ctx: AiContext, payload: z.infer<typeof contentImagePayload>) {
  const db = getDb();
  const row = await load(payload.imageId);
  if (!row) return { skipped: "image deleted" };
  const { image, channel } = row;
  try {
    const spec = imageSpec(channel);
    const imagePath = image.imageSource === "none" ? null : contentPicturePath(image);
    if (image.imageSource !== "none" && !imagePath) throw new Error("The picture is missing: draw or upload it again");
    const renders: ContentImageRender[] = await renderSizes({
      ctx,
      dir: imageFolder(image.id),
      sizes: spec.sizes,
      template: image.template,
      text: image.text,
      colors: image.colors,
      imagePath,
      logoPath: image.useLogo ? logoPath(image.productId) : null,
      maxBytes: spec.maxBytes,
      renderFile: CONTENT_RENDER_FILE,
    });
    await db.update(contentImages).set({ renders, status: "ready", error: null }).where(eq(contentImages.id, image.id));
    return { rendered: renders.length };
  } catch (err) {
    await db.update(contentImages).set({ status: "failed", error: ctx.signal?.aborted ? "Stopped by you" : message(err) }).where(eq(contentImages.id, image.id));
    throw err;
  }
}
