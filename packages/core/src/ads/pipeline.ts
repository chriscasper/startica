import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sum } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { aiRuns, products, type AdCreativeColors, type AdCreativeText, type AdTemplate } from "@startica/db/schema";
import { runImage, type AiContext } from "../ai/client.ts";
import { renderTemplate } from "./render.ts";

/**
 * The image pipeline shared by ad creatives (ads/creatives.ts, AD2) and Content Studio's social
 * post images (content/images.ts): **the AI draws the picture, a template adds the words**.
 * Pictures are drawn once, large and square, by the `image` task; every size is a crop of it
 * with the template's words, rendered offscreen (render.ts). Files live in one folder per image.
 */

/** The picture is drawn once, square and large, and each size crops it. */
export const IMAGE_SIZE = { width: 2048, height: 2048 };
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const PICTURE_FILE = /^picture\.(png|jpg|webp)$/;
export const isSafeId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
/** "4:5" → "4x5.png" (or .jpg). */
export const sizeFile = (size: string, format: "png" | "jpeg") => `${size.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;

/** PNG, JPEG or WebP, from the file's first bytes; null for anything else. */
export function imageType(data: Buffer): "png" | "jpg" | "webp" | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpg";
  if (data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export function checkUpload(data: Buffer): "png" | "jpg" | "webp" {
  if (data.length > MAX_UPLOAD_BYTES) throw new Error("That image is over 20 MB");
  const type = imageType(data);
  if (!type) throw new Error("Use a PNG, JPEG or WebP image");
  return type;
}

/** Saves a picture (drawn or uploaded) into an image's folder, replacing the old one; returns its file name. */
export function savePictureIn(dir: string, data: Buffer): string {
  const type = checkUpload(data);
  mkdirSync(dir, { recursive: true });
  for (const f of existsSync(dir) ? readdirSync(dir) : []) if (PICTURE_FILE.test(f)) rmSync(join(dir, f), { force: true });
  const file = `picture.${type}`;
  writeFileSync(join(dir, file), data);
  return file;
}

/** The picture's path, if the file is there. */
export function pictureIn(dir: string, imageFile: string | null): string | null {
  if (!imageFile || !PICTURE_FILE.test(imageFile)) return null;
  const path = join(dir, imageFile);
  return existsSync(path) ? path : null;
}

/** A picture or rendered size from an image's folder; null for any other name. */
export function readImageIn(dir: string, file: string, renders: RegExp): Buffer | null {
  if (!(renders.test(file) || PICTURE_FILE.test(file))) return null;
  try {
    return readFileSync(join(dir, file));
  } catch {
    return null;
  }
}

/** What the `image` task spent in one job run, from its logged calls. */
export async function imageSpend(ctx: AiContext): Promise<number> {
  if (!ctx.jobRunId) return 0;
  const [row] = await getDb()
    .select({ total: sum(aiRuns.costUsd) })
    .from(aiRuns)
    .where(and(eq(aiRuns.jobRunId, ctx.jobRunId), eq(aiRuns.task, "image")));
  return Number(row?.total ?? 0);
}

// --- Drawing ------------------------------------------------------------------------------

/** The rules every picture is drawn under; the concept follows. `purpose` only changes the first line. */
export function imageSystem(template: string, purpose: "ad" | "post" = "ad"): string {
  return [
    purpose === "ad"
      ? "A picture for a paid social or display ad, made to sit under text that is added afterwards."
      : "A picture for a social media post, made to sit under text that is added afterwards.",
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

/** The system prompt and prompt for a product's picture (kept with the image before it's drawn). */
export async function pictureRequest(productId: string, concept: string, template: string, purpose: "ad" | "post") {
  const [product] = await getDb().select({ name: products.name, oneLiner: products.oneLiner }).from(products).where(eq(products.id, productId));
  const system = imageSystem(template, purpose);
  const prompt = imagePrompt(product ?? { name: "the product", oneLiner: null }, concept);
  return { system, prompt, stored: `${system}\n\n${prompt}` };
}

/** Draws the picture with the `image` task (budget guard and ai_runs logging in ai/client.ts). */
export async function drawPicture(ctx: AiContext, request: { system: string; prompt: string }, promptVersion: string): Promise<Buffer> {
  return runImage(ctx, {
    task: "image",
    promptVersion,
    system: request.system,
    messages: [{ role: "user", content: request.prompt }],
    size: `${IMAGE_SIZE.width}x${IMAGE_SIZE.height}`,
  });
}

// --- Rendering ----------------------------------------------------------------------------

export type SizeRender<S extends string> = { size: S; width: number; height: number; file: string; bytes: number; fit?: "small" | "overflow" };

/** Renders every size of a template into `dir` and removes sizes left over from an earlier render. */
export async function renderSizes<S extends string>(opts: {
  ctx: AiContext;
  dir: string;
  sizes: readonly { size: S; width: number; height: number }[];
  template: AdTemplate;
  text: AdCreativeText;
  colors: AdCreativeColors;
  imagePath: string | null;
  logoPath: string | null;
  maxBytes: number;
  /** The rendered files' names, so stale ones can be cleaned up. */
  renderFile: RegExp;
}): Promise<SizeRender<S>[]> {
  const renders: SizeRender<S>[] = [];
  mkdirSync(opts.dir, { recursive: true });
  for (const s of opts.sizes) {
    opts.ctx.signal?.throwIfAborted();
    const out = await renderTemplate(
      { template: opts.template, width: s.width, height: s.height, text: opts.text, colors: opts.colors, image: null, logo: null, imagePath: opts.imagePath, logoPath: opts.logoPath },
      opts.maxBytes,
    );
    const file = sizeFile(s.size, out.format);
    writeFileSync(join(opts.dir, file), out.data);
    renders.push({ size: s.size, width: s.width, height: s.height, file, bytes: out.data.length, ...(out.fit === "ok" ? {} : { fit: out.fit }) });
  }
  // A size that was a PNG last time and a JPEG now leaves its old file behind.
  for (const f of readdirSync(opts.dir)) if (opts.renderFile.test(f) && !renders.some((r) => r.file === f)) rmSync(join(opts.dir, f), { force: true });
  return renders;
}
