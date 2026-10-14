import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { a11yCriteriaReviews, a11yIssueGroups, roadmapItems, sitePages, sites, type A11yStatementInput } from "@startica/db/schema";
import { prioritizedGroups, scoreHistory } from "./track.ts";
import { complianceView, HOW_TO_TEST, PROFILES, profileCriteria, STATUS_LABEL, understandingUrl, type CriterionStatus, type ProfileId } from "./wcag.ts";

/**
 * Manual review and reporting (ARCHITECTURE.md section 9.5, A4): the WCAG checklist the owner
 * works through by hand, the accessibility statement, the ACR/VPAT-style draft and the
 * printable report. All built from the results and the owner's answers by fixed
 * templates: nothing here claims the site is accessible or compliant.
 */

type Site = typeof sites.$inferSelect;
export type ManualStatus = (typeof a11yCriteriaReviews.$inferSelect)["status"];

export const MANUAL_LABEL: Record<ManualStatus, string> = { pass: "Passes", fail: "Fails", not_applicable: "Not applicable", not_tested: "Not tested" };

/** Every criterion the site is checked against (WCAG 2.2 A and AA, plus AAA when it checks AAA), with its automated result and the owner's review. */
export async function checklist(site: Site, profile: ProfileId = "wcag22") {
  const db = getDb();
  const [groups, reviews] = await Promise.all([
    db.select().from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, site.id)),
    db.select().from(a11yCriteriaReviews).where(eq(a11yCriteriaReviews.siteId, site.id)),
  ]);
  const byId = new Map(reviews.map((r) => [r.criterion, r]));
  return complianceView(profile, groups, site.includeAaa).map((c) => {
    const review = byId.get(c.id);
    return { ...c, howToTest: HOW_TO_TEST[c.id] ?? null, understanding: understandingUrl(c), manual: review?.status ?? ("not_tested" as ManualStatus), note: review?.note ?? null, remark: review?.remark ?? null, reviewedAt: review?.reviewedAt ?? null };
  });
}

export const reviewInput = z.object({
  status: z.enum(["pass", "fail", "not_applicable", "not_tested"]),
  note: z.string().trim().max(1000).default(""),
  remark: z.string().trim().max(1000).default(""),
});

export async function saveCriterionReview(workspaceId: string, siteId: string, criterion: string, input: z.infer<typeof reviewInput>): Promise<void> {
  if (!/^\d\.\d\.\d+$/.test(criterion)) throw new Error("Unknown criterion");
  const [site] = await getDb().select({ id: sites.id }).from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  const values = { status: input.status, note: input.note || null, remark: input.remark || null, reviewedAt: input.status === "not_tested" ? null : new Date() };
  await getDb()
    .insert(a11yCriteriaReviews)
    .values({ workspaceId, siteId, criterion, ...values })
    .onConflictDoUpdate({ target: [a11yCriteriaReviews.siteId, a11yCriteriaReviews.criterion], set: values });
}

/** A roadmap item for a criterion that fails by hand (playbook "accessibility-fixes"). */
export async function criterionToRoadmap(workspaceId: string, siteId: string, criterion: string): Promise<void> {
  const [site] = await getDb().select().from(sites).where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
  if (!site) throw new Error("Site not found");
  const c = profileCriteria("wcag22", true).find((x) => x.id === criterion);
  if (!c) throw new Error("Unknown criterion");
  const [review] = await getDb().select().from(a11yCriteriaReviews).where(and(eq(a11yCriteriaReviews.siteId, siteId), eq(a11yCriteriaReviews.criterion, criterion)));
  const title = `Accessibility: meet WCAG ${c.id} ${c.title} on ${site.name}`;
  const [existing] = await getDb().select({ id: roadmapItems.id }).from(roadmapItems).where(and(eq(roadmapItems.productId, site.productId), eq(roadmapItems.title, title)));
  if (existing) throw new Error("Already on the Roadmap");
  await getDb()
    .insert(roadmapItems)
    .values({
      workspaceId,
      productId: site.productId,
      stage: "activation",
      title,
      why: review?.note || `It failed a manual check. ${HOW_TO_TEST[c.id] ?? ""}`.trim(),
      playbook: "accessibility-fixes",
      successMetric: "Passes the manual check in the Accessibility checklist",
      nextStep: `Fix it, then mark ${c.id} as passing in the checklist`,
      priority: c.level === "A" ? 1 : 2,
      source: "owner",
    });
}

// --- Accessibility statement

export const statementInput = z.object({
  organization: z.string().trim().min(1, "Give the name of your organization or product").max(200),
  contact: z.string().trim().min(3, "Give an email address or a page where people can report problems").max(300),
  target: z.enum(["wcag22aa", "wcag21aa", "wcag22a"]).default("wcag22aa"),
  approach: z.string().trim().max(1000).default(""),
  limitations: z.string().trim().max(3000).default(""),
});

const TARGET_LABEL: Record<A11yStatementInput["target"], string> = { wcag22aa: "WCAG 2.2 level AA", wcag21aa: "WCAG 2.1 level AA", wcag22a: "WCAG 2.2 level A" };

export async function saveStatementInput(workspaceId: string, siteId: string, input: z.infer<typeof statementInput>): Promise<void> {
  await getDb()
    .update(sites)
    .set({ a11yStatement: { ...input, updatedAt: new Date().toISOString() } })
    .where(and(eq(sites.id, siteId), eq(sites.workspaceId, workspaceId)));
}

const day = (d: Date | string | number | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "not yet");

/**
 * The statement, in Markdown, after W3C's model: commitment, the standard aimed for,
 * how the site is checked, known limitations, feedback and the date. It describes the
 * effort and the known problems; it never states conformance.
 */
export async function buildStatement(site: Site, now = new Date()): Promise<string | null> {
  const input = site.a11yStatement;
  if (!input) return null;
  const items = await checklist(site);
  const reviewed = items.filter((c) => c.manual !== "not_tested").length;
  const manualFails = items.filter((c) => c.manual === "fail");
  const open = (await prioritizedGroups(site, { status: "open", kind: "issues" })).slice(0, 10);
  const lines = [
    `# Accessibility statement for ${site.name}`,
    "",
    `${input.organization} wants ${site.name} to be usable by everyone, including people who use screen readers, keyboards, magnification or other assistive technology.`,
    "",
    "## The standard we aim for",
    "",
    `We aim to meet the Web Content Accessibility Guidelines (${TARGET_LABEL[input.target]}). We haven't reached it everywhere yet: the known problems are listed below.`,
    "",
    "## How we check",
    "",
    `- Automated checks of up to ${site.maxPages} pages${site.scanIntervalDays > 0 ? ` every ${site.scanIntervalDays === 1 ? "day" : `${site.scanIntervalDays} days`}` : ""}, with axe-core, last run on ${day(site.lastScanId ? (await scoreHistory(site.id)).at(-1)?.at ?? null : null)}. Automated checks find only some problems.`,
    `- Manual review of ${reviewed} of the ${items.length} success criteria${reviewed ? `, last on ${day(items.map((c) => c.reviewedAt?.getTime() ?? 0).reduce((a, b) => Math.max(a, b), 0) || null)}` : ""}.`,
    ...(input.approach ? [`- ${input.approach}`] : []),
    "",
    "## Known limitations",
    "",
  ];
  if (open.length === 0 && manualFails.length === 0 && !input.limitations) lines.push("We don't know of any open problems right now. If you find one, please tell us.");
  for (const g of open) lines.push(`- ${g.group.help} (WCAG ${g.group.criteria.join(", ") || "best practice"}), on ${g.group.pagesCount === 1 ? "1 page" : `${g.group.pagesCount} pages`}.`);
  for (const c of manualFails) lines.push(`- WCAG ${c.id} ${c.title}${c.note ? `: ${c.note}` : ""}.`);
  if (input.limitations) lines.push("", input.limitations);
  lines.push(
    "",
    "We're working on these. If one of them stops you from doing something, contact us and we'll help another way.",
    "",
    "## Feedback",
    "",
    `If you run into a problem using ${site.name}, or need content in another format, contact us: ${input.contact}. We aim to reply within five working days.`,
    "",
    "## Date",
    "",
    `This statement was last updated on ${day(now)}.`,
    "",
  );
  return lines.join("\n");
}

// --- ACR / VPAT-style draft

export type AcrLevel = "Supports" | "Partially Supports" | "Does Not Support" | "Not Applicable" | "Not Evaluated";

/**
 * Each criterion's conformance level for the draft, from the automated result and the
 * manual review: a manual pass with no automated failures supports; automated failures on
 * some pages partially support; a manual fail, or failures on most pages, don't; anything
 * not checked by hand is not evaluated, however clean the automated checks are.
 */
export function acrLevel(c: { status: CriterionStatus; manual: ManualStatus; issues: number }, pagesFailing: number, pagesChecked: number): AcrLevel {
  if (c.manual === "not_applicable") return "Not Applicable";
  if (c.manual === "fail") return "Does Not Support";
  if (c.status === "failing") return pagesChecked > 0 && pagesFailing >= pagesChecked / 2 ? "Does Not Support" : "Partially Supports";
  if (c.manual === "pass") return "Supports";
  return "Not Evaluated";
}

export async function buildAcr(site: Site, profile: ProfileId = "wcag22") {
  const db = getDb();
  const items = await checklist(site, profile);
  const pagesChecked = (await db.select({ id: sitePages.id }).from(sitePages).where(and(eq(sitePages.siteId, site.id), eq(sitePages.state, "done"), isNull(sitePages.goneAt)))).length;
  const groups = await db.select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.status, "open")));
  return items.map((c) => {
    const failing = groups.filter((g) => (g.kind === "violation" || g.reviewStatus === "fail") && g.criteria.includes(c.id));
    const pagesFailing = Math.max(0, ...failing.map((g) => g.pagesCount));
    const level = acrLevel(c, pagesFailing, pagesChecked);
    const generated = [
      failing.length ? `Automated checks found ${failing.length === 1 ? "1 problem" : `${failing.length} problems`} (${failing.slice(0, 3).map((g) => g.help).join("; ")}) on up to ${pagesFailing} of ${pagesChecked} pages checked.` : "",
      c.manual === "pass" ? "Passed a manual review." : c.manual === "fail" ? `Failed a manual review${c.note ? `: ${c.note}` : ""}.` : c.manual === "not_tested" ? "Not reviewed by hand yet." : "",
    ]
      .filter(Boolean)
      .join(" ");
    return { id: c.id, title: c.title, level: c.level, conformance: level, remarks: c.remark || generated };
  });
}

export async function acrMarkdown(site: Site, profile: ProfileId = "wcag22", now = new Date()): Promise<string> {
  const rows = await buildAcr(site, profile);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `# Accessibility conformance report (draft): ${site.name}`,
    "",
    `**Draft, ${day(now)}.** Based on ${PROFILES[profile].label}. Built by Startica from automated checks (axe-core) and the owner's manual review; review every row before sharing it. It is not a certification.`,
    "",
    "| Criterion | Level | Conformance | Remarks |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.id} ${esc(r.title)} | ${r.level} | ${r.conformance} | ${esc(r.remarks)} |`),
    "",
  ].join("\n");
}

// --- Printable report

const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A standalone HTML report for printing or saving as PDF: score and history, by criterion, top issues, lowest pages. */
export async function reportHtml(site: Site, now = new Date()): Promise<string> {
  const db = getDb();
  const [history, items, ranked, pages] = await Promise.all([
    scoreHistory(site.id),
    checklist(site),
    prioritizedGroups(site, { status: "open", kind: "issues" }),
    db
      .select({ url: sitePages.url, title: sitePages.title, score: sitePages.score })
      .from(sitePages)
      .where(and(eq(sitePages.siteId, site.id), eq(sitePages.state, "done"), isNull(sitePages.goneAt)))
      .orderBy(asc(sitePages.score))
      .limit(15),
  ]);
  const count = (s: CriterionStatus) => items.filter((c) => c.status === s).length;
  const manual = (m: ManualStatus) => items.filter((c) => c.manual === m).length;
  const rows = (cells: string[][]) => cells.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Accessibility report: ${html(site.name)}</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1d21; margin: 32px; max-width: 900px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 8px; border-bottom: 1px solid #d8dbe0; padding-bottom: 4px; }
  .muted { color: #5b6370; } table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { font-weight: 600; } .num { text-align: right; font-variant-numeric: tabular-nums; } .note { background: #f4f5f7; padding: 10px 12px; border-radius: 6px; }
  @media print { body { margin: 12mm; } h2 { break-after: avoid; } tr { break-inside: avoid; } }
</style></head><body>
<h1>Accessibility report: ${html(site.name)}</h1>
<p class="muted">${html(site.startUrl)} · ${day(now)}</p>
<p class="note">These are results of automated checks (axe-core, on the pages Startica could reach) and the owner's manual review. Automated checks find only part of what WCAG covers; this report shows progress and isn't a statement of conformance.</p>
<h2>Score</h2>
<p><strong>${site.score == null ? "Not scanned" : Math.round(site.score)}</strong> / 100 (target ${site.targetScore}). Startica's own measure: each page's passed checks against its failed ones, weighted by impact.</p>
${history.length ? `<table><tr><th>Full scan</th><th class="num">Score</th></tr>${rows(history.map((h) => [day(h.at), `<span class="num">${h.score == null ? "–" : Math.round(h.score)}</span>`]))}</table>` : ""}
<h2>By criterion (${html(PROFILES.wcag22.label)}, ${items.length} criteria)</h2>
<p>Automated: ${count("failing")} failing, ${count("needs_review")} needing review, ${count("no_failures")} with no automated failures, ${count("manual")} not testable automatically. Manual review: ${manual("pass")} pass, ${manual("fail")} fail, ${manual("not_applicable")} not applicable, ${manual("not_tested")} not tested.</p>
<table><tr><th>Criterion</th><th>Level</th><th>Automated</th><th>By hand</th></tr>${rows(items.map((c) => [`${c.id} ${html(c.title)}`, c.level, STATUS_LABEL[c.status], MANUAL_LABEL[c.manual]]))}</table>
<h2>Top issues</h2>
${ranked.length ? `<table><tr><th>Issue</th><th>Impact</th><th>WCAG</th><th class="num">Pages</th><th>Priority</th></tr>${rows(ranked.slice(0, 20).map((r) => [html(r.group.help), r.group.impact ?? "", r.group.criteria.join(", "), `<span class="num">${r.group.pagesCount}</span>`, r.band]))}</table>` : "<p>No open issues found by the automated checks.</p>"}
<h2>Pages with the lowest scores</h2>
<table><tr><th>Page</th><th class="num">Score</th></tr>${rows(pages.map((p) => [`${html(p.title || new URL(p.url).pathname)}<br><span class="muted">${html(p.url)}</span>`, `<span class="num">${p.score == null ? "–" : Math.round(p.score)}</span>`]))}</table>
<p class="muted">Made with Startica.</p>
</body></html>`;
}
