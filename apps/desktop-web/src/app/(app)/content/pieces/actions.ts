"use server";

import {
  contentImageInput,
  createContentImage,
  deleteContentImage,
  ownContentImage,
  rerenderContentImage,
  stopContentImage,
  updateContentImage,
} from "@startica/core/content/images";
import type { ActionResult } from "@/components/app/form-dialog";
import { id, mutate } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

/** The uploaded picture in a form, if any (an empty file input sends a 0-byte file). */
async function uploaded(formData: FormData): Promise<Buffer | null> {
  const file = formData.get("image");
  return file instanceof File && file.size > 0 ? Buffer.from(await file.arrayBuffer()) : null;
}
const textFields = (formData: FormData) => Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string"));
const image = async (imageId: string) => ownContentImage((await getWorkspace()).id, id.parse(imageId));

export async function newContentImage(pieceId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    await createContentImage((await getWorkspace()).id, id.parse(pieceId), contentImageInput.parse(textFields(formData)), await uploaded(formData));
  });
}

export async function saveContentImage(imageId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => updateContentImage(await image(imageId), contentImageInput.parse(textFields(formData)), await uploaded(formData)));
}

export async function renderContentImageAgain(imageId: string): Promise<ActionResult> {
  return mutate(async () => rerenderContentImage(await image(imageId)));
}

export async function stopContentImageWork(imageId: string): Promise<ActionResult> {
  return mutate(async () => stopContentImage(await image(imageId)));
}

export async function removeContentImage(imageId: string): Promise<ActionResult> {
  return mutate(async () => deleteContentImage(await image(imageId)));
}
