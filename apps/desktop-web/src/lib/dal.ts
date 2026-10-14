import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { products } from "@startica/db/schema";
import { start } from "./startup";

export const PRODUCT_COOKIE = "startica_product";

// Data access layer: pages get the workspace and products from here.
// Results are memoized per request.

/**
 * The database, guaranteed open (startup runs once per process). Marks the
 * caller as request-time work: pages read live data and the clock, which Cache
 * Components only allows after connection().
 */
export async function db() {
  await connection();
  await start();
  return getDb();
}

export const getWorkspace = cache(async () => {
  await db();
  return ensureWorkspace();
});

export const getProducts = cache(async () => {
  const workspace = await getWorkspace();
  return (await db())
    .select({ id: products.id, name: products.name, url: products.url, oneLiner: products.oneLiner, stage: products.stage })
    .from(products)
    .where(eq(products.workspaceId, workspace.id))
    .orderBy(asc(products.createdAt));
});

export const getActiveProduct = cache(async () => {
  const list = await getProducts();
  const selected = (await cookies()).get(PRODUCT_COOKIE)?.value;
  return list.find((p) => p.id === selected) ?? list[0] ?? null;
});
