import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { securityComponents, securityFindings, securityOccurrences, sitePages, siteScans, sites } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import type { ScanResponse } from "../a11y/scanner.ts";
import { pageSecurityFindings, type SecurityFindingDraft } from "./checks.ts";
import { siteSecurityProbes } from "./probes.ts";
import { isSecurityRule, SECURITY_RULES, SEVERITY_WEIGHT, type SecurityRuleId } from "./rules.ts";

/**
 * Security findings on the shared crawl (ARCHITECTURE.md section 11.2). Each page check stores
 * the page's occurrences; when a scan finishes, the site probes run and occurrences are
 * folded into findings (one per fixable problem) with a lifecycle that survives scans:
 * open → fixed when no longer seen; accepted risk and false positive stay as the user set them.
 */

type Site = typeof sites.$inferSelect;
type Tx = Parameters<Parameters<typeof transaction>[0]>[0];
export type FindingStatus = (typeof securityFindings.$inferSelect)["status"];

export const isVerified = (site: Pick<Site, "securityVerifiedAt">) => site.securityVerifiedAt !== null;

const rows = (site: Site, pageId: string | null, drafts: SecurityFindingDraft[]) =>
  drafts.map((d) => ({ workspaceId: site.workspaceId, siteId: site.id, pageId, rule: d.rule, groupKey: d.groupKey, detail: d.detail }));

/** Replaces a checked page's security occurrences (inside the page's own transaction). Verified sites only. */
export async function storePageSecurity(db: Tx, site: Site, page: { id: string; url: string }, response: ScanResponse): Promise<void> {
  if (!isVerified(site)) return;
  await db.delete(securityOccurrences).where(eq(securityOccurrences.pageId, page.id));
  // The libraries the page loads, for the vulnerability monitor (S2).
  await db.delete(securityComponents).where(eq(securityComponents.pageId, page.id));
  const libraries = response.result.security?.libraries ?? [];
  if (libraries.length) await db.insert(securityComponents).values(libraries.slice(0, 20).map((l) => ({ workspaceId: site.workspaceId, siteId: site.id, pageId: page.id, name: l.name, version: l.version, via: l.via })));
  const drafts = pageSecurityFindings({ url: response.finalUrl || page.url, siteUrl: site.startUrl }, response.headers ?? {}, response.result.security);
  if (drafts.length) await db.insert(securityOccurrences).values(rows(site, page.id, drafts));
}

/**
 * Score: 100 less 30/15/7/2 per open critical/high/medium/low finding, at least 0. Only
 * Startica's own checks count (scans and the monitor); imported and reported findings don't.
 */
export function securityScore(open: { rule: string; severity?: string; source?: string }[]): number {
  const penalty = open.reduce((sum, f) => {
    if (f.source === "import" || f.source === "report" || !isSecurityRule(f.rule)) return sum;
    const s = (f.severity ?? SECURITY_RULES[f.rule].severity) as keyof typeof SEVERITY_WEIGHT | "info";
    return sum + (s === "info" ? 0 : SEVERITY_WEIGHT[s]);
  }, 0);
  return Math.max(0, 100 - penalty);
}

/** Recomputes and stores a site's score from its open findings. */
export async function rescore(siteId: string): Promise<number> {
  const open = await getDb()
    .select({ rule: securityFindings.rule, severity: securityFindings.severity, source: securityFindings.source })
    .from(securityFindings)
    .where(and(eq(securityFindings.siteId, siteId), eq(securityFindings.status, "open")));
  const score = securityScore(open);
  await getDb().update(sites).set({ securityScore: score }).where(eq(sites.id, siteId));
  return score;
}

/**
 * Folds occurrences into findings and scores the site. With `probes`, the site-level
 * checks (TLS, redirect, security.txt, exposed files, email) run first and replace the
 * site-level occurrences; page checks skip them.
 */
export async function finishSecurity(site: Site, opts: { scanId: string | null; probes: boolean }): Promise<void> {
  if (!isVerified(site)) return;
  const db = getDb();
  const now = new Date();
  if (opts.probes) {
    const { drafts, facts } = await siteSecurityProbes(site.startUrl, now.getTime());
    await transaction(async (tx) => {
      await tx.delete(securityOccurrences).where(and(eq(securityOccurrences.siteId, site.id), isNull(securityOccurrences.pageId)));
      if (drafts.length) await tx.insert(securityOccurrences).values(rows(site, null, drafts));
      await tx.update(sites).set({ security: facts }).where(eq(sites.id, site.id));
    });
  }

  // Live occurrences: site-level ones and those on pages still on the site.
  const live = await db
    .select({ groupKey: securityOccurrences.groupKey, rule: securityOccurrences.rule, detail: securityOccurrences.detail, pageId: securityOccurrences.pageId })
    .from(securityOccurrences)
    .leftJoin(sitePages, eq(sitePages.id, securityOccurrences.pageId))
    .where(and(eq(securityOccurrences.siteId, site.id), or(isNull(securityOccurrences.pageId), isNull(sitePages.goneAt))));
  const byKey = new Map<string, { rule: string; detail: Record<string, unknown>; pages: number }>();
  for (const o of live) {
    const entry = byKey.get(o.groupKey) ?? { rule: o.rule, detail: o.detail, pages: 0 };
    if (o.pageId) entry.pages++;
    byKey.set(o.groupKey, entry);
  }

  const existing = await db.select().from(securityFindings).where(eq(securityFindings.siteId, site.id));
  const known = new Map(existing.map((f) => [f.groupKey, f]));
  await transaction(async (tx) => {
    for (const [groupKey, o] of byKey) {
      if (!isSecurityRule(o.rule)) continue;
      const severity = SECURITY_RULES[o.rule as SecurityRuleId].severity;
      const f = known.get(groupKey);
      if (!f) {
        await tx.insert(securityFindings).values({
          workspaceId: site.workspaceId,
          siteId: site.id,
          groupKey,
          rule: o.rule,
          severity,
          status: "open",
          pagesCount: o.pages,
          detail: o.detail,
          firstSeenAt: now,
          lastSeenAt: now,
          firstSeenScanId: opts.scanId,
        });
      } else {
        // Seen again: a fixed finding reopens; accepted risk and false positive stay.
        await tx
          .update(securityFindings)
          .set({ severity, pagesCount: o.pages, detail: o.detail, lastSeenAt: now, ...(f.status === "fixed" ? { status: "open" as const, fixedAt: null, fixedScanId: null } : {}) })
          .where(eq(securityFindings.id, f.id));
      }
    }
    // Only the scan's own findings follow the scans; imported and reported ones change only when the owner says so.
    const gone = existing.filter((f) => f.source === "scan" && !byKey.has(f.groupKey) && f.status === "open").map((f) => f.id);
    if (gone.length) await tx.update(securityFindings).set({ status: "fixed", fixedAt: now, fixedScanId: opts.scanId, pagesCount: 0 }).where(inArray(securityFindings.id, gone));
  });

  const score = await rescore(site.id);
  await db.update(sites).set({ securityCheckedAt: now }).where(eq(sites.id, site.id));
  if (opts.scanId) await db.update(siteScans).set({ securityScore: score }).where(eq(siteScans.id, opts.scanId));
}

/** Rechecks the site-level findings now (the probes only; pages are rechecked through a page check). */
export const securityRecheckPayload = z.object({ workspaceId: z.guid(), siteId: z.guid() });

export async function runSecurityRecheck(_ctx: AiContext, payload: z.infer<typeof securityRecheckPayload>) {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, payload.siteId), eq(sites.workspaceId, payload.workspaceId)));
  if (!site) return { skipped: "site removed" };
  if (!isVerified(site)) return { skipped: "site not verified" };
  await finishSecurity(site, { scanId: null, probes: true });
  return { score: (await getDb().select({ s: sites.securityScore }).from(sites).where(eq(sites.id, site.id)))[0]?.s ?? null };
}

// --- Reading and changing findings

export async function siteFindings(siteId: string) {
  return getDb().select().from(securityFindings).where(eq(securityFindings.siteId, siteId));
}

export async function ownFinding(workspaceId: string, findingId: string) {
  const [row] = await getDb()
    .select({ finding: securityFindings, site: sites })
    .from(securityFindings)
    .innerJoin(sites, eq(sites.id, securityFindings.siteId))
    .where(and(eq(securityFindings.id, findingId), eq(securityFindings.workspaceId, workspaceId)));
  if (!row) throw new Error("Finding not found");
  return row;
}

/** Pages a finding is on now (page-level findings), with what each page showed. */
export async function findingPages(siteId: string, groupKey: string) {
  return getDb()
    .select({ pageId: sitePages.id, url: sitePages.url, title: sitePages.title, detail: securityOccurrences.detail })
    .from(securityOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, securityOccurrences.pageId))
    .where(and(eq(securityOccurrences.siteId, siteId), eq(securityOccurrences.groupKey, groupKey), isNull(sitePages.goneAt)))
    .orderBy(sitePages.url);
}

export const decisionInput = z.object({
  status: z.enum(["accepted", "false_positive", "open", "fixed"]),
  reason: z.string().trim().max(500).default(""),
});

/** Accept the risk, mark a false positive (both with a reason), or reopen. Remembered across scans. */
export async function decideFinding(workspaceId: string, findingId: string, input: z.infer<typeof decisionInput>): Promise<void> {
  const { finding, site } = await ownFinding(workspaceId, findingId);
  if (input.status === "fixed") {
    // Only findings the scans don't track can be marked fixed by hand (the scans decide for their own).
    if (finding.source === "scan") throw new Error("Recheck it instead: Startica marks it fixed when the check no longer finds it");
    await getDb().update(securityFindings).set({ status: "fixed", fixedAt: new Date(), reason: null, decidedAt: new Date() }).where(eq(securityFindings.id, findingId));
    await rescore(site.id);
    return;
  }
  if (input.status !== "open" && !input.reason) throw new Error(input.status === "accepted" ? "Say why the risk is acceptable" : "Say why this isn't a real problem");
  // Reopening something the scans no longer see marks it fixed; otherwise it's open again.
  const stillSeen = finding.source !== "scan" || finding.lastSeenAt.getTime() >= (site.securityCheckedAt?.getTime() ?? 0);
  await getDb()
    .update(securityFindings)
    .set(input.status === "open" ? { status: stillSeen ? "open" : "fixed", reason: null, decidedAt: null } : { status: input.status, reason: input.reason, decidedAt: new Date() })
    .where(eq(securityFindings.id, findingId));
  await rescore(site.id);
}

/** Open findings across a product's verified sites, for Today and the roadmap. */
export async function openFindingCounts(productId: string) {
  const [row] = await getDb()
    .select({
      critical: sql<number>`coalesce(sum(${securityFindings.severity} = 'critical'), 0)`,
      high: sql<number>`coalesce(sum(${securityFindings.severity} = 'high'), 0)`,
      medium: sql<number>`coalesce(sum(${securityFindings.severity} = 'medium'), 0)`,
    })
    .from(securityFindings)
    .innerJoin(sites, eq(sites.id, securityFindings.siteId))
    .where(and(eq(sites.productId, productId), eq(securityFindings.status, "open")));
  return { critical: Number(row?.critical ?? 0), high: Number(row?.high ?? 0), medium: Number(row?.medium ?? 0) };
}
