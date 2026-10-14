import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { communities, connections, contentPieces, jobRuns, products, publications } from "@startica/db/schema";
import { hasAiKey } from "../ai/client.ts";
import { communityProblem } from "../channels/formats.ts";

/**
 * First-run setup (ARCHITECTURE.md section 3): a short welcome wizard for the essentials,
 * then a "Getting started" checklist on Today for the rest. This is the state both read.
 */

export const SETUP_SETTING = "setup";
export type SetupFlags = { welcomeDone?: boolean; checklistDismissed?: boolean };

export async function setupFlags(): Promise<SetupFlags> {
  return (await getSetting<SetupFlags>(SETUP_SETTING)) ?? {};
}

export async function setSetupFlags(flags: SetupFlags): Promise<void> {
  await setSetting(SETUP_SETTING, { ...(await setupFlags()), ...flags });
}

export type SetupStatus = {
  hasKey: boolean;
  hasProduct: boolean;
  intel: "none" | "building" | "ready" | "failed";
  watching: number;
  /** Suggested communities listening can read, for the "pick communities" step. */
  suggestions: number;
  scanned: boolean;
  analytics: boolean;
  posted: boolean;
};

export async function setupStatus(workspaceId: string, productId: string | null): Promise<SetupStatus> {
  const db = getDb();
  const [key, product, [watching], [suggested], [scan], [conn], [pub], [piece]] = await Promise.all([
    hasAiKey().catch(() => false),
    productId ? db.select({ intelStatus: products.intelStatus, createdAt: products.createdAt }).from(products).where(eq(products.id, productId)).then((r) => r[0]) : undefined,
    productId ? db.select({ n: count() }).from(communities).where(and(eq(communities.productId, productId), eq(communities.status, "watching"))) : [{ n: 0 }],
    productId ? db.select({ n: count() }).from(communities).where(and(eq(communities.productId, productId), eq(communities.status, "suggested"))) : [{ n: 0 }],
    // A scan of this product: one for it, or an all-products scan, since it was added.
    productId
      ? db
          .select({ n: count() })
          .from(jobRuns)
          .innerJoin(products, eq(products.id, productId))
          .where(
            and(
              eq(jobRuns.workspaceId, workspaceId),
              eq(jobRuns.queue, "listen_scan"),
              eq(jobRuns.status, "succeeded"),
              gte(jobRuns.startedAt, products.createdAt),
              sql`coalesce(json_extract(${jobRuns.payload}, '$.productId'), ${productId}) = ${productId}`,
            ),
          )
      : [{ n: 0 }],
    productId ? db.select({ n: count() }).from(connections).where(and(eq(connections.productId, productId), eq(connections.status, "ok"))) : [{ n: 0 }],
    productId ? db.select({ n: count() }).from(publications).where(eq(publications.productId, productId)) : [{ n: 0 }],
    productId ? db.select({ n: count() }).from(contentPieces).where(and(eq(contentPieces.productId, productId), eq(contentPieces.status, "posted"))) : [{ n: 0 }],
  ]);
  const status = product?.intelStatus ?? "none";
  return {
    hasKey: Boolean(key),
    hasProduct: Boolean(product),
    intel: status === "ready" ? "ready" : status === "failed" ? "failed" : status === "none" ? "none" : "building",
    watching: watching?.n ?? 0,
    suggestions: suggested?.n ?? 0,
    scanned: (scan?.n ?? 0) > 0,
    analytics: (conn?.n ?? 0) > 0,
    posted: (pub?.n ?? 0) + (piece?.n ?? 0) > 0,
  };
}

/** Channels listening reads communities on (Bluesky and X work from keywords). */
const READABLE = ["reddit", "mastodon", "discourse"] as const;
const PRESELECT = 5;

export type CommunitySuggestion = { id: string; channel: string; name: string; url: string | null; why: string; preselected: boolean };

/**
 * Intel's suggested communities, strongest first (intel lists them in priority
 * order), with the first few listening can actually read pre-selected.
 */
export async function communitySuggestions(productId: string): Promise<CommunitySuggestion[]> {
  const rows = await getDb()
    .select({ id: communities.id, channel: communities.channel, name: communities.name, url: communities.url, why: communities.why })
    .from(communities)
    .where(and(eq(communities.productId, productId), eq(communities.status, "suggested")))
    // Intel saves its suggestions in one batch (same timestamp): insertion order keeps its ranking.
    .orderBy(asc(communities.createdAt), sql`rowid`);
  let picked = 0;
  return rows.map((c) => {
    const readable = (READABLE as readonly string[]).includes(c.channel) && !communityProblem(c.channel, c.name, c.url);
    const preselected = readable && picked < PRESELECT;
    if (preselected) picked++;
    return { ...c, preselected };
  });
}

/** Marks the chosen suggestions as watched (the rest stay suggestions). */
export async function watchCommunities(productId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await getDb()
    .update(communities)
    .set({ status: "watching" })
    .where(and(eq(communities.productId, productId), inArray(communities.id, ids)))
    .returning({ id: communities.id });
  return updated.length;
}
