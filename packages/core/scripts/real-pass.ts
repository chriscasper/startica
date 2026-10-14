// A one-off real-site pass (not part of the app or the tests): scans a site the user owns
// into a throwaway database and prints what each module finds. Usage:
//   npx tsx scripts/real-pass.ts https://35px.com 50 <out-dir>
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, agentChecks, products, securityFindings, seoFindings, sitePages, sites } from "@startica/db/schema";
import { playwrightScanner } from "../src/a11y/playwright-backend.ts";
import { runSiteScan } from "../src/a11y/scan.ts";
import { setScanner } from "../src/a11y/scanner.ts";
import { createSite, siteInput, startSiteScan } from "../src/a11y/sites.ts";
import { runAgentCheck } from "../src/agents/run.ts";
import { runContentCheck } from "../src/a11y/documents.ts";
import { siteSecurityProbes } from "../src/security/probes.ts";

const [url = "https://35px.com", max = "50", out = "."] = process.argv.slice(2);
const dir = mkdtempSync(join(tmpdir(), "startica-real-"));
openDatabase(join(dir, "real.db"));
await migrateDatabase(join(import.meta.dirname, "../../db/migrations"));
const workspaceId = (await ensureWorkspace()).id;
const [product] = await getDb().insert(products).values({ workspaceId, name: new URL(url).hostname, url }).returning();
const siteId = await createSite(workspaceId, product!.id, siteInput.parse({ name: new URL(url).hostname, start_url: url, max_pages: max, respect_robots: "on", include_best_practice: "on" }));
const scanner = await playwrightScanner(58300);
if (!scanner) throw new Error("Playwright isn't available: run yarn playwright install chromium");
setScanner(scanner);
const log: string[] = [];
const say = (s: string) => {
  log.push(s);
  console.log(s);
};
const t0 = Date.now();
const [site] = await getDb().select().from(sites).where(eq(sites.id, siteId));
const scanId = await startSiteScan(site!);
await runSiteScan({ workspaceId }, { workspaceId, scanId });
say(`scan: ${Math.round((Date.now() - t0) / 1000)} s`);
const pages = await getDb().select().from(sitePages).where(eq(sitePages.siteId, siteId));
const states = pages.reduce((m, p) => ((m[p.state] = (m[p.state] ?? 0) + 1), m), {} as Record<string, number>);
say(`pages: ${JSON.stringify(states)}; failed: ${pages.filter((p) => p.state === "failed").map((p) => `${p.url} (${p.error ?? p.httpStatus})`).slice(0, 5).join(", ")}`);
say(`word counts (first 5 done): ${pages.filter((p) => p.state === "done").slice(0, 5).map((p) => `${new URL(p.url).pathname}=${p.seo?.wordCount}`).join(", ")}`);
const [s] = await getDb().select().from(sites).where(eq(sites.id, siteId));
say(`scores: a11y ${s!.score}, seo ${s!.seoScore}, security ${s!.securityScore}; ai access ${JSON.stringify(s!.aiAccess?.crawlers.filter((c) => !c.allowed).map((c) => c.token))}, llms.txt ${s!.aiAccess?.llmsTxt}`);
const groups = await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, siteId));
say(`a11y open groups: ${groups.filter((g) => g.status === "open").map((g) => `${g.ruleId}[${g.kind === "violation" ? g.impact : "review"}]×${g.pagesCount}`).join(", ")}`);
const seo = await getDb().select().from(seoFindings).where(eq(seoFindings.siteId, siteId));
const byRule = seo.reduce((m, f) => ((m[f.rule] = (m[f.rule] ?? 0) + 1), m), {} as Record<string, number>);
say(`seo findings: ${JSON.stringify(byRule)}`);
const sec = await getDb().select().from(securityFindings).where(eq(securityFindings.siteId, siteId));
say(`security findings from the scan: ${sec.map((f) => f.rule ?? (f as { kind?: string }).kind).join(", ")}`);
try {
  const probes = await siteSecurityProbes(url);
  say(`security probes: ${probes.drafts.map((d) => d.rule).join(", ") || "none"}; facts ${JSON.stringify(probes.facts).slice(0, 600)}`);
} catch (e) {
  say(`security probes FAILED: ${(e as Error).message}`);
}
try {
  await runContentCheck({ workspaceId }, { workspaceId, siteId });
  say("content check: ran");
} catch (e) {
  say(`content check FAILED: ${(e as Error).message}`);
}
await runAgentCheck({ workspaceId }, { workspaceId, siteId });
const [agent] = await getDb().select().from(agentChecks).where(eq(agentChecks.siteId, siteId));
say(`agent readiness ${agent?.score}: ${agent?.results.map((r) => `${r.id}=${r.status} (${r.summary})`).join("\n  ")}`);
writeFileSync(join(out, "report.txt"), log.join("\n"));
await scanner.close?.();
closeDatabase();
console.log(`db: ${dir}`);
