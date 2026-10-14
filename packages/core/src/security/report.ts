import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { securityFindings, securityOccurrences, sitePages, sites } from "@startica/db/schema";
import { CATEGORY_LABEL, CONTROLS, isSecurityRule, OWASP, SECURITY_RULES, SEVERITY_ORDER } from "./rules.ts";

/**
 * The security report (ARCHITECTURE.md section 11.2): what the automated checks found on one
 * verified site, with OWASP Top 10 categories and related controls for an auditor's
 * reference. Markdown, shown on screen and downloadable. Never claims the site is secure.
 */

type Site = typeof sites.$inferSelect;

const MAX_PAGES_LISTED = 10;

export const NOT_COVERED = [
  "Anything behind a sign-in (until checks behind a sign-in arrive)",
  "How the application handles input: injection, access control between users, business logic",
  "Servers, ports and cloud settings other than the website itself",
  "Source code, dependencies on the server and secrets inside the code",
  "People and processes: phishing, password practices, incident response",
];

const date = (d: Date | number | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "never");

type FindingRow = typeof securityFindings.$inferSelect;

/** A finding's words: from its rule for scan findings, from the finding itself for imported or reported ones. */
export function findingInfo(f: Pick<FindingRow, "rule" | "title" | "description" | "fix" | "source" | "sourceLabel">) {
  const rule = isSecurityRule(f.rule) ? SECURITY_RULES[f.rule] : null;
  return {
    title: rule?.title ?? f.title ?? f.rule,
    why: rule?.why ?? f.description ?? "",
    fix: rule?.fix ?? f.fix ?? "",
    area: rule ? CATEGORY_LABEL[rule.category] : f.source === "report" ? "Reported to you" : "From another report",
    owasp: rule?.owasp ? OWASP[rule.owasp] : null,
    controls: rule ? rule.controls.map((c) => CONTROLS[c]) : [],
    scope: rule?.scope ?? "site",
    sourceLabel: f.source === "scan" ? null : f.sourceLabel,
  };
}

/** One finding's detail as short text (the cookie, header value, URLs it's about). */
export function describeDetail(detail: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof detail.library === "string") {
    const vulns = Array.isArray(detail.vulns) ? (detail.vulns as { kev?: boolean }[]) : [];
    const kev = vulns.filter((v) => v.kev).length;
    parts.push(`${detail.library} ${String(detail.version ?? "")} · ${vulns.length} ${vulns.length === 1 ? "advisory" : "advisories"}${kev ? `, ${kev} known exploited` : ""}`);
  }
  if (typeof detail.cname === "string" && typeof detail.host === "string") parts.push(`${detail.host} → ${detail.cname}`);
  if (typeof detail.previous === "string") parts.push("Content changed since the last check");
  if (typeof detail.cookie === "string") parts.push(`Cookie: ${detail.cookie}`);
  if (typeof detail.header === "string") parts.push(`${detail.header}: ${String(detail.value ?? "")}`);
  if (typeof detail.host === "string" && typeof detail.cname !== "string") parts.push(`Host: ${detail.host}`);
  if (typeof detail.generator === "string") parts.push(`Generator: ${detail.generator}`);
  if (typeof detail.url === "string") parts.push(detail.url);
  if (typeof detail.maxAge === "number") parts.push(`max-age=${detail.maxAge}`);
  if (typeof detail.protocol === "string") parts.push(detail.protocol);
  if (typeof detail.validTo === "string") parts.push(`Expires ${detail.validTo.slice(0, 10)}`);
  if (typeof detail.error === "string") parts.push(detail.error);
  if (typeof detail.domain === "string") parts.push(`Domain: ${detail.domain}`);
  if (Array.isArray(detail.problems)) parts.push(detail.problems.join("; "));
  if (typeof detail.policy === "string") parts.push(`Policy: ${detail.policy}`);
  if (Array.isArray(detail.urls) && detail.urls.length) parts.push(detail.urls.slice(0, 3).join(", "));
  return parts.length ? parts.join(" · ") : null;
}

export async function buildSecurityReport(site: Site, now = new Date()): Promise<string> {
  const db = getDb();
  const all = await db.select().from(securityFindings).where(eq(securityFindings.siteId, site.id));
  const order = (a: (typeof all)[number], b: (typeof all)[number]) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.pagesCount - a.pagesCount;
  const open = all.filter((f) => f.status === "open").sort(order);
  const decided = all.filter((f) => f.status === "accepted" || f.status === "false_positive").sort(order);
  const fixed = all.filter((f) => f.status === "fixed").sort(order);
  const pages = await db
    .select({ groupKey: securityOccurrences.groupKey, url: sitePages.url })
    .from(securityOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, securityOccurrences.pageId))
    .where(and(eq(securityOccurrences.siteId, site.id), isNull(sitePages.goneAt)));
  const pagesOf = (key: string) => pages.filter((p) => p.groupKey === key).map((p) => p.url).sort();
  const count = (s: string) => open.filter((f) => f.severity === s).length;

  const lines: string[] = [];
  lines.push(`# Security report: ${site.name}`, "");
  lines.push(`${site.startUrl} · checked ${date(site.securityCheckedAt)} · report written ${date(now)}`, "");
  lines.push(
    `This report lists what Startica's automated checks found from outside the site. Automated checks see only part of a site's security, so a short list doesn't mean the site is safe. See "What these checks can't see" at the end.`,
    "",
  );
  lines.push("## Summary", "");
  lines.push(`- Score: **${site.securityScore ?? "not checked yet"}** / 100 (Startica's own measure of its own checks: 30, 15, 7 and 2 points off per open critical, high, medium and low finding; imported and reported findings are listed but not scored)`);
  lines.push(`- Open: ${count("critical")} critical, ${count("high")} high, ${count("medium")} medium, ${count("low")} low, ${count("info")} for information`);
  lines.push(`- Accepted or marked not a problem: ${decided.length} · Fixed: ${fixed.length}`);
  if (site.securityVerifiedAt) lines.push(`- Ownership verified ${date(site.securityVerifiedAt)} (${site.securityVerifiedBy ?? "unknown"})`);
  const facts = site.security;
  if (facts) {
    if (facts.tls) lines.push(`- HTTPS: ${facts.tls.protocol ?? "unknown"}, certificate ${facts.tls.authorized ? "trusted" : "not trusted"}${facts.tls.validTo ? `, valid until ${date(facts.tls.validTo)}` : ""}`);
    if (facts.email) lines.push(`- Email (${facts.email.domain}): SPF ${facts.email.spf ? "found" : "missing"}, DMARC ${facts.email.dmarc ? `p=${facts.email.dmarcPolicy ?? "?"}` : "missing"}`);
    if (facts.securityTxt) lines.push(`- security.txt: ${facts.securityTxt.status}`);
  }
  lines.push("");

  const section = (title: string, list: typeof all) => {
    if (list.length === 0) return;
    lines.push(`## ${title}`, "");
    for (const f of list) {
      const info = findingInfo(f);
      lines.push(`### ${info.title} (${f.severity === "info" ? "for information" : f.severity})`, "");
      lines.push(`${info.area}${info.owasp ? ` · ${info.owasp}` : ""}${info.sourceLabel ? ` · ${info.sourceLabel}` : ""}`, "");
      const detail = describeDetail(f.detail);
      if (detail) lines.push(`**Seen:** ${detail}`, "");
      if (f.status === "accepted" || f.status === "false_positive") lines.push(`**${f.status === "accepted" ? "Risk accepted" : "Not a problem"}** (${date(f.decidedAt)}): ${f.reason ?? ""}`, "");
      if (info.why) lines.push(`**${f.source === "scan" ? "Why it matters" : "What it is"}:** ${info.why}`, "");
      if (info.fix) lines.push(`**How to fix:** ${info.fix}`, "");
      const urls = pagesOf(f.groupKey);
      if (urls.length) {
        lines.push(`**Pages (${urls.length}):**`, ...urls.slice(0, MAX_PAGES_LISTED).map((u) => `- ${u}`));
        if (urls.length > MAX_PAGES_LISTED) lines.push(`- and ${urls.length - MAX_PAGES_LISTED} more`);
        lines.push("");
      }
      if (info.controls.length) lines.push(`**Related controls:** ${info.controls.join("; ")}`, "");
    }
  };
  section("Open findings", open);
  section("Accepted risks and findings marked not a problem", decided);
  if (fixed.length) {
    lines.push("## Fixed", "", ...fixed.map((f) => `- ${findingInfo(f).title} (fixed ${date(f.fixedAt)})`), "");
  }

  lines.push("## About the references", "");
  lines.push(
    "OWASP Top 10 categories and the SOC 2 and ISO/IEC 27001 controls are listed to help you and your auditor find where each finding belongs. They are references, not an assessment: this report doesn't say whether any control is met.",
    "",
  );
  lines.push("## What these checks can't see", "", ...NOT_COVERED.map((n) => `- ${n}`), "");
  return lines.join("\n");
}
