import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { a11yOccurrences, siteScans, sitePages, sites } from "@startica/db/schema";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";
import { verificationReset } from "../security/verify.ts";
import { deleteSiteScreenshots } from "./screenshots.ts";
import { normalizeUrl } from "./urls.ts";

/** Sites and starting scans (ARCHITECTURE.md section 9). Server actions call these; jobs do the scanning. */

const patterns = z
  .string()
  .default("")
  .transform((v) =>
    v
      .split(/[\n,]/)
      .map((p) => p.trim())
      .filter(Boolean),
  );

export const siteInput = z.object({
  name: z.string().trim().min(1, "Give the site a name"),
  start_url: z
    .string()
    .trim()
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.url("Enter the site's address, e.g. https://example.com"))
    .transform((v, ctx) => {
      const url = normalizeUrl(v);
      if (!url) ctx.addIssue({ code: "custom", message: "Enter an http(s) address" });
      return url ?? v;
    }),
  max_pages: z.coerce.number().int().min(1, "At least 1 page").max(5000, "At most 5,000 pages").default(250),
  target_score: z.coerce.number().int().min(1, "Pick a target between 1 and 100").max(100, "Pick a target between 1 and 100").default(90),
  scan_interval_days: z.coerce.number().int().min(0).max(90).optional(),
  include: patterns,
  exclude: patterns,
  respect_robots: z.string().optional(),
  include_aaa: z.string().optional(),
  include_best_practice: z.string().optional(),
});

export const confirmOwnership = z.literal("on", { error: "Confirm you own this site or are allowed to test it" });

function values(input: z.infer<typeof siteInput>) {
  return {
    name: input.name,
    startUrl: input.start_url,
    maxPages: input.max_pages,
    targetScore: input.target_score,
    ...(input.scan_interval_days === undefined ? {} : { scanIntervalDays: input.scan_interval_days }),
    include: input.include,
    exclude: input.exclude,
    respectRobots: input.respect_robots === "on",
    includeAaa: input.include_aaa === "on",
    includeBestPractice: input.include_best_practice === "on",
  };
}

export async function createSite(workspaceId: string, productId: string, input: z.infer<typeof siteInput>): Promise<string> {
  const [row] = await getDb()
    .insert(sites)
    .values({ workspaceId, productId, ...values(input), ownershipConfirmedAt: new Date() })
    .returning({ id: sites.id });
  return row!.id;
}

export async function updateSite(siteId: string, input: z.infer<typeof siteInput>): Promise<void> {
  const [before] = await getDb().select({ startUrl: sites.startUrl }).from(sites).where(eq(sites.id, siteId));
  // A new host needs its ownership proven again before security checks run (ARCHITECTURE.md section 11.2).
  const reset = before && verificationReset(before.startUrl, input.start_url) ? { securityVerifiedAt: null, securityVerifiedBy: null } : {};
  await getDb().update(sites).set({ ...values(input), ...reset }).where(eq(sites.id, siteId));
}

export async function deleteSite(siteId: string): Promise<void> {
  await getDb().delete(sites).where(eq(sites.id, siteId));
  deleteSiteScreenshots(siteId);
}

/** A site, if it belongs to the workspace. */
export async function ownSite(workspaceId: string, siteId: string) {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  return site;
}

/** The scan running or waiting for a site, if any (one at a time per kind). */
export async function activeScan(siteId: string, scope: "full" | "check") {
  const [scan] = await getDb()
    .select()
    .from(siteScans)
    .where(and(eq(siteScans.siteId, siteId), inArray(siteScans.status, ["queued", "running"]), inArray(siteScans.scope, scope === "full" ? ["full"] : ["page", "group"])))
    .limit(1);
  return scan ?? null;
}

/** Queues a full scan; refuses while one is queued or running for the site. */
export async function startSiteScan(site: { id: string; workspaceId: string }, trigger: "manual" | "scheduled" = "manual"): Promise<string> {
  if (await activeScan(site.id, "full")) throw new Error("A scan of this site is already under way");
  const [scan] = await getDb().insert(siteScans).values({ workspaceId: site.workspaceId, siteId: site.id, scope: "full", trigger }).returning({ id: siteScans.id });
  await enqueue(site.workspaceId, "site_scan", { scanId: scan!.id });
  return scan!.id;
}

/** Queues a check of specific pages (Check a page, Recheck page or an issue group's pages). */
export async function startPageCheck(site: { id: string; workspaceId: string }, urls: string[], scope: "page" | "group" = "page"): Promise<string> {
  if (await activeScan(site.id, "check")) throw new Error("A check of this site's pages is already under way; try again when it finishes");
  const [scan] = await getDb().insert(siteScans).values({ workspaceId: site.workspaceId, siteId: site.id, scope }).returning({ id: siteScans.id });
  await enqueue(site.workspaceId, "site_page_check", { scanId: scan!.id, urls });
  return scan!.id;
}

/** URLs of the pages an issue group is currently found on. */
export async function groupPageUrls(groupId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ url: sitePages.url })
    .from(a11yOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(eq(a11yOccurrences.groupId, groupId));
  return rows.map((r) => r.url);
}

/**
 * Stops a site scan or page check: aborts it if it's running (pages already checked keep
 * their results), or removes it from the queue and records it as stopped.
 */
export async function stopSiteScan(workspaceId: string, scanId: string): Promise<void> {
  const jobId = await jobByPayload(workspaceId, ["site_scan", "site_page_check"], "scanId", scanId);
  const result = jobId ? await stopJob(workspaceId, jobId) : "not_found";
  if (result !== "stopping") {
    await getDb()
      .update(siteScans)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(siteScans.id, scanId), eq(siteScans.workspaceId, workspaceId), inArray(siteScans.status, ["queued", "running"])));
  }
}

/** The site's recent scans, newest first (the history). */
export async function recentScans(siteId: string, limit = 10) {
  return getDb().select().from(siteScans).where(eq(siteScans.siteId, siteId)).orderBy(desc(siteScans.createdAt)).limit(limit);
}
