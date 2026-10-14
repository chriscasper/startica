import { createHash } from "node:crypto";
import { a11yImpacts, type A11yImpact, type ImpactCounts } from "@startica/db/schema";
import type { Box, PageResult, RawRuleResult } from "./scanner.ts";

/**
 * Turning axe-core's raw results into Startica's issues (ARCHITECTURE.md section 9.2):
 * occurrences, issue-group fingerprints, WCAG criteria and levels, and the score.
 */

export const IMPACT_WEIGHT: Record<A11yImpact, number> = { critical: 10, serious: 5, moderate: 2, minor: 1 };

export const emptyImpacts = (): ImpactCounts => ({ critical: 0, serious: 0, moderate: 0, minor: 0 });

export const asImpact = (value: string | null | undefined): A11yImpact | null =>
  (a11yImpacts as readonly string[]).includes(value ?? "") ? (value as A11yImpact) : null;

/** WCAG success criteria from axe tags: "wcag111" → "1.1.1", "wcag1410" → "1.4.10". */
export function criteriaFromTags(tags: string[]): string[] {
  return tags.flatMap((t) => {
    const m = /^wcag(\d)(\d)(\d+)$/.exec(t);
    return m ? [`${m[1]}.${m[2]}.${m[3]}`] : [];
  });
}

/** The conformance level a rule tests: A, AA or AAA from the WCAG tags, else "best practice". */
export function levelFromTags(tags: string[]): string {
  if (tags.some((t) => /^wcag2\d?a$/.test(t))) return "A";
  if (tags.some((t) => /^wcag2\d?aa$/.test(t))) return "AA";
  if (tags.some((t) => /^wcag2\d?aaa$/.test(t))) return "AAA";
  return "best practice";
}

/**
 * Element markup with the parts that differ between otherwise identical copies
 * removed (ids, data and style attributes, cache-busting queries, whitespace), so a
 * template element fingerprints the same on every page.
 */
export function normalizeHtml(html: string): string {
  return html
    .replace(/\s(id|style|nonce|data-[\w-]+|aria-(describedby|labelledby|controls|owns|activedescendant))="[^"]*"/gi, "")
    .replace(/\s(src|href|srcset)="([^"?]*)\?[^"]*"/gi, ' $1="$2"')
    .replace(/…$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(kind: "violation" | "needs_review", ruleId: string, html: string): string {
  return createHash("sha1").update(`${kind}\n${ruleId}\n${normalizeHtml(html)}`).digest("hex").slice(0, 20);
}

/** One element's finding, ready to store. */
export type Finding = {
  kind: "violation" | "needs_review";
  fingerprint: string;
  rule: RawRuleResult;
  impact: A11yImpact | null;
  selector: string;
  html: string;
  failureSummary: string | null;
  box: Box | null;
};

export function findings(result: PageResult): Finding[] {
  const of = (kind: Finding["kind"], rules: RawRuleResult[]) =>
    rules.flatMap((rule) =>
      rule.nodes.map((node) => ({
        kind,
        fingerprint: fingerprint(kind, rule.id, node.html),
        rule,
        impact: asImpact(node.impact) ?? asImpact(rule.impact),
        selector: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
        box: node.box ?? null,
      })),
    );
  return [...of("violation", result.violations), ...of("needs_review", result.incomplete)];
}

/**
 * Page score, 0–100: passed checks count 1 each, failed checks count their impact
 * weight (critical 10 … minor 1); each rule counts once per page. A page with 40
 * passed checks and one critical failure scores 80; with one minor failure, 98.
 */
export function pageScore(result: Pick<PageResult, "violations" | "passes">): number {
  const failed = result.violations.reduce((sum, r) => sum + IMPACT_WEIGHT[asImpact(r.impact) ?? "moderate"], 0);
  const passed = result.passes.length;
  return passed + failed === 0 ? 100 : Math.round((1000 * passed) / (passed + failed)) / 10;
}

/** Occurrence counts by impact (violations only). */
export function impactCounts(items: { kind: string; impact: A11yImpact | null }[]): ImpactCounts {
  const counts = emptyImpacts();
  for (const item of items) if (item.kind === "violation" && item.impact) counts[item.impact]++;
  return counts;
}

/** Site score: the average of its pages' scores (weighted by traffic from A2). */
export function siteScore(pageScores: number[]): number | null {
  if (pageScores.length === 0) return null;
  return Math.round((10 * pageScores.reduce((a, b) => a + b, 0)) / pageScores.length) / 10;
}
