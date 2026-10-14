import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getScanner } from "@startica/core/a11y/scanner";
import { IMPACT_WEIGHT } from "@startica/core/a11y/results";
import { a11yIssueGroups, sitePages, sites, siteScans, type A11yImpact } from "@startica/db/schema";
import { db, getActiveProduct } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** Shared loaders for the Accessibility screens (ARCHITECTURE.md sections 9 and 12). */

export type SiteRow = typeof sites.$inferSelect;

/** The active product, its sites and the one being viewed (`?site=`, else the first). */
export async function loadSites(siteParam: string | string[] | undefined) {
  const product = await getActiveProduct();
  if (!product) return null;
  const list = await (await db()).select().from(sites).where(eq(sites.productId, product.id)).orderBy(asc(sites.createdAt));
  const site = list.find((s) => s.id === siteParam) ?? list[0] ?? null;
  const app = desktopApp();
  return {
    product,
    sites: list,
    site,
    /** Scans can run: the desktop app (or Playwright in browser dev mode), and not the demo. */
    canScan: !app.demo && getScanner() !== null,
    demo: app.demo,
  };
}

export const withSite = (href: string, siteId: string) => `${href}${href.includes("?") ? "&" : "?"}site=${siteId}`;

export type GroupRow = typeof a11yIssueGroups.$inferSelect;

/** Open issues, most important first: impact weight × pages affected (traffic joins in A2). */
export function byPriority(a: GroupRow, b: GroupRow): number {
  const weight = (g: GroupRow) => IMPACT_WEIGHT[(g.impact ?? "moderate") as A11yImpact] * Math.max(1, g.pagesCount);
  return weight(b) - weight(a) || b.occurrencesCount - a.occurrencesCount;
}

export async function siteGroups(siteId: string, opts: { status?: GroupRow["status"]; kind?: GroupRow["kind"] } = {}) {
  const rows = await (await db())
    .select()
    .from(a11yIssueGroups)
    .where(
      and(
        eq(a11yIssueGroups.siteId, siteId),
        eq(a11yIssueGroups.kind, opts.kind ?? "violation"),
        opts.status ? eq(a11yIssueGroups.status, opts.status) : undefined,
      ),
    );
  return rows.sort(byPriority);
}

export async function sitePageRows(siteId: string) {
  return (await db())
    .select()
    .from(sitePages)
    .where(and(eq(sitePages.siteId, siteId), isNull(sitePages.goneAt)))
    .orderBy(asc(sitePages.url));
}

export async function scanById(scanId: string | null) {
  if (!scanId) return null;
  const [scan] = await (await db()).select().from(siteScans).where(eq(siteScans.id, scanId));
  return scan ?? null;
}

/** "3 min ago" style times. A plain function (not a component), so it may read the clock. */
export function ago(date: Date | null): string {
  if (!date) return "never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** The path and query of a page URL, for compact lists. */
export const pathOf = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};
