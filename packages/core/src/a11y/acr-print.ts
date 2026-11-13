import type { sites } from "@startica/db/schema";
import { buildAcr } from "./manual.ts";
import { PROFILES, type ProfileId } from "./wcag.ts";

/**
 * The ACR / VPAT-style draft as a standalone page (ARCHITECTURE.md section 9.5), to print or
 * save as PDF like the report. Same rows as the Markdown download (`acrMarkdown`).
 */

const html = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const day = (d: Date) => d.toISOString().slice(0, 10);

const LEVEL_CLASS: Record<string, string> = { Supports: "yes", "Partially Supports": "part", "Does Not Support": "no" };

export async function acrHtml(site: typeof sites.$inferSelect, profile: ProfileId = "wcag22", now = new Date()): Promise<string> {
  const rows = await buildAcr(site, profile);
  const tally = (level: string) => rows.filter((r) => r.conformance === level).length;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Accessibility conformance report (draft): ${html(site.name)}</title>
<style>
  body { font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1d21; margin: 32px; max-width: 960px; }
  h1 { font-size: 22px; margin: 0 0 4px; } .muted { color: #5b6370; }
  .note { background: #f4f5f7; padding: 10px 12px; border-radius: 6px; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; } th, td { text-align: left; padding: 5px 8px 5px 0; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { font-weight: 600; } td.level { white-space: nowrap; }
  .yes { color: #0f6b3a; } .part { color: #8a5a00; } .no { color: #b42318; }
  @media print { body { margin: 12mm; } tr { break-inside: avoid; } thead { display: table-header-group; } }
</style></head><body>
<h1>Accessibility conformance report (draft): ${html(site.name)}</h1>
<p class="muted">${html(site.startUrl)} · ${day(now)} · ${html(PROFILES[profile].label)}</p>
<p class="note"><strong>Draft.</strong> Built by Startica from automated checks (axe-core) and the owner's manual review. Criteria not reviewed by hand are "Not Evaluated", however clean the automated checks are. Review every row before sharing it. It is not a certification.</p>
<p>${tally("Supports")} supports · ${tally("Partially Supports")} partially supports · ${tally("Does Not Support")} does not support · ${tally("Not Applicable")} not applicable · ${tally("Not Evaluated")} not evaluated</p>
<table><thead><tr><th>Criterion</th><th>Level</th><th>Conformance</th><th>Remarks</th></tr></thead><tbody>
${rows.map((r) => `<tr><td>${html(`${r.id} ${r.title}`)}</td><td>${r.level}</td><td class="level ${LEVEL_CLASS[r.conformance] ?? ""}">${r.conformance}</td><td>${html(r.remarks)}</td></tr>`).join("\n")}
</tbody></table>
<p class="muted">Made with Startica.</p>
</body></html>`;
}
