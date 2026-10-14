import "server-only";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { products } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { db, getWorkspace } from "./dal";

export const id = z.guid();

export function fail(error: unknown): ActionResult {
  if (error instanceof z.ZodError) return { error: error.issues.map((i) => i.message).join("; ") };
  return { error: error instanceof Error ? error.message : String(error) };
}

/** Runs a mutation, refreshes the page on success, and turns errors into an ActionResult. */
export async function mutate(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

/** Confirms the product belongs to this workspace; returns ids for inserts. */
export async function productScope(productId: string) {
  const workspace = await getWorkspace();
  const [product] = await (await db())
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, id.parse(productId)), eq(products.workspaceId, workspace.id)));
  if (!product) throw new Error("Product not found");
  return { workspaceId: workspace.id, productId: product.id };
}

/** Comma/newline lists from form fields. */
export const lines = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );

export const optionalUrl = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.url().nullable());

export const formFields = (formData: FormData) => Object.fromEntries(formData.entries());
