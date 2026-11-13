import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, a11yPageIgnores, sitePages } from "@startica/db/schema";
import { ownGroup } from "./ai.ts";
import type { ignoreInput } from "./track.ts";

/**
 * Ignoring an issue on one page only (ARCHITECTURE.md section 9.3): remembered by the issue's
 * fingerprint and the page's address across scans, like a site-wide ignore. The page's
 * occurrences stay (marked `ignored`) but leave the issue's counts, priority, compliance views
 * and reports; an issue ignored on every page it's on shows as ignored ("on its pages") and
 * opens again when it turns up on another page.
 */

/** The ignore reason an issue gets when every page it's on is ignored, not the whole site. */
export const PAGES_REASON = "pages";

/** A site's page ignores, as `fingerprint url` keys (scans mark matching occurrences). */
export async function pageIgnoreKeys(siteId: string): Promise<Set<string>> {
  const rows = await getDb().select({ fingerprint: a11yPageIgnores.fingerprint, url: a11yPageIgnores.url }).from(a11yPageIgnores).where(eq(a11yPageIgnores.siteId, siteId));
  return new Set(rows.map((r) => `${r.fingerprint} ${r.url}`));
}

async function ownPage(siteId: string, pageId: string) {
  const [page] = await getDb()
    .select({ id: sitePages.id, url: sitePages.url })
    .from(sitePages)
    .where(and(eq(sitePages.id, pageId), eq(sitePages.siteId, siteId)));
  if (!page) throw new Error("Page not found on this site");
  return page;
}

/** Ignores an issue on one page, with a reason; the issue's counts leave the page out from now on. */
export async function ignoreOnPage(workspaceId: string, groupId: string, pageId: string, input: z.infer<typeof ignoreInput>): Promise<void> {
  const group = await ownGroup(workspaceId, groupId);
  const page = await ownPage(group.siteId, pageId);
  const db = getDb();
  await db
    .insert(a11yPageIgnores)
    .values({ workspaceId, siteId: group.siteId, fingerprint: group.fingerprint, url: page.url, reason: input.reason, note: input.note || null })
    .onConflictDoUpdate({ target: [a11yPageIgnores.siteId, a11yPageIgnores.fingerprint, a11yPageIgnores.url], set: { reason: input.reason, note: input.note || null, ignoredAt: new Date() } });
  await db.update(a11yOccurrences).set({ ignored: true }).where(and(eq(a11yOccurrences.groupId, group.id), eq(a11yOccurrences.pageId, page.id)));
  await recountGroups(group.siteId, null);
}

/** Counts the page for the issue again. */
export async function unignoreOnPage(workspaceId: string, groupId: string, pageId: string): Promise<void> {
  const group = await ownGroup(workspaceId, groupId);
  const page = await ownPage(group.siteId, pageId);
  const db = getDb();
  await db.delete(a11yPageIgnores).where(and(eq(a11yPageIgnores.siteId, group.siteId), eq(a11yPageIgnores.fingerprint, group.fingerprint), eq(a11yPageIgnores.url, page.url)));
  await db.update(a11yOccurrences).set({ ignored: false }).where(and(eq(a11yOccurrences.groupId, group.id), eq(a11yOccurrences.pageId, page.id)));
  await recountGroups(group.siteId, null);
}

/**
 * Recounts every issue of a site from its pages' latest occurrences, leaving out pages where
 * it's ignored. An open issue found nowhere is fixed (in `scanId`, when a scan finished); one
 * found only on ignored pages is ignored "on its pages", and opens again when it's found on
 * another page. A site-wide ignore is the owner's and stays.
 */
export async function recountGroups(siteId: string, scanId: string | null, now = new Date()): Promise<void> {
  const db = getDb();
  const live = await db
    .select({
      groupId: a11yOccurrences.groupId,
      pages: sql<number>`count(distinct case when ${a11yOccurrences.ignored} = 0 then ${a11yOccurrences.pageId} end)`,
      occurrences: sql<number>`coalesce(sum(${a11yOccurrences.ignored} = 0), 0)`,
      all: count(),
    })
    .from(a11yOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, a11yOccurrences.pageId))
    .where(and(eq(sitePages.siteId, siteId), isNull(sitePages.goneAt)))
    .groupBy(a11yOccurrences.groupId);
  const byGroup = new Map(live.map((g) => [g.groupId, g]));
  const groups = await db.select({ id: a11yIssueGroups.id, status: a11yIssueGroups.status, ignoreReason: a11yIssueGroups.ignoreReason }).from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, siteId));
  await transaction(async (tx) => {
    for (const group of groups) {
      const c = byGroup.get(group.id);
      const counted = Number(c?.occurrences ?? 0);
      const onIgnoredPagesOnly = counted === 0 && Number(c?.all ?? 0) > 0;
      const byPages = group.status === "ignored" && group.ignoreReason === PAGES_REASON;
      let status: Partial<typeof a11yIssueGroups.$inferInsert> = {};
      if (counted > 0 && byPages) status = { status: "open", ignoreReason: null, ignoreNote: null, ignoredAt: null };
      else if (onIgnoredPagesOnly && group.status === "open") status = { status: "ignored", ignoreReason: PAGES_REASON, ignoreNote: null, ignoredAt: now };
      else if (!c && (group.status === "open" || byPages)) status = { status: "fixed", ignoreReason: null, ignoredAt: null, fixedAt: now, fixedScanId: scanId };
      await tx
        .update(a11yIssueGroups)
        .set({ pagesCount: Number(c?.pages ?? 0), occurrencesCount: counted, ...status })
        .where(eq(a11yIssueGroups.id, group.id));
    }
  });
}
