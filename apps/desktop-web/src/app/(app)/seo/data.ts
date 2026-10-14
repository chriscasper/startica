import "server-only";
import { SEO_RULES, type SeoRuleId, type SeoSeverity } from "@startica/core/seo/rules";
import { siteSeoFindings } from "@startica/core/seo/site";

/** Site health findings grouped for the screens: rule → its groups (one fix each) → pages. */
export type RuleGroup = {
  rule: SeoRuleId;
  severity: SeoSeverity;
  category: string;
  /** One entry per problem to fix (e.g. one duplicate title shared by 3 pages). */
  groups: { key: string; detail: Record<string, unknown>; pages: { url: string | null; title: string | null; detail: Record<string, unknown> }[] }[];
  pageCount: number;
};

const ORDER: Record<SeoSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export async function seoRuleGroups(siteId: string): Promise<RuleGroup[]> {
  const rows = await siteSeoFindings(siteId);
  const byRule = new Map<string, RuleGroup>();
  for (const { finding, url, title } of rows) {
    const rule = finding.rule as SeoRuleId;
    const meta = SEO_RULES[rule];
    if (!meta) continue;
    const entry = byRule.get(rule) ?? { rule, severity: meta.severity, category: meta.category, groups: [], pageCount: 0 };
    let group = entry.groups.find((g) => g.key === finding.groupKey);
    if (!group) entry.groups.push((group = { key: finding.groupKey, detail: finding.detail, pages: [] }));
    group.pages.push({ url, title, detail: finding.detail });
    if (url) entry.pageCount++;
    byRule.set(rule, entry);
  }
  return [...byRule.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.pageCount - a.pageCount);
}
