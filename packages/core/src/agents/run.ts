import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { a11yIssueGroups, agentChecks, sitePages, sites } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { DOCS_PATH, findPage, PRICING_PATH, readinessScore, runChecks, type AgentInputs, type Probe } from "./checks.ts";

/**
 * Runs the agent readiness checks for a site (ARCHITECTURE.md section 10.3): after each scan, and
 * on demand. Only the site's own public pages are requested, as a plain visitor would:
 * no JavaScript, no cookies, no forms.
 */

export const AGENT_USER_AGENT = "StarticaAgentCheck/0.1 (+https://mystartica.com; checks sites their owners add)";

// Reserved names that never resolve (the demo's fieldnote.example): no request is made for them.
const RESERVED = /\.(example|test|invalid)$/i;
const MAX_BYTES = 1_000_000;

/** Machine-readable files agents look for (checked 2026-10-12): RFC 9727 API catalog, OpenAPI conventions, MCP Server Cards. */
export const ENDPOINT_PATHS = [
  "/.well-known/api-catalog",
  "/openapi.json",
  "/openapi.yaml",
  "/swagger.json",
  "/api/openapi.json",
  "/.well-known/ai-catalog.json",
  "/.well-known/mcp/server-card.json",
  "/.well-known/mcp.json",
];

/** A plain GET of a page on the site itself. Null for other hosts, reserved names and network errors. */
export async function probe(url: string, siteUrl: string, opts: { accept?: string; signal?: AbortSignal } = {}): Promise<Probe | null> {
  let target: URL;
  try {
    target = new URL(url);
    if (target.origin !== new URL(siteUrl).origin || RESERVED.test(target.hostname)) return null;
  } catch {
    return null;
  }
  try {
    const res = await fetch(target, {
      headers: { "user-agent": AGENT_USER_AGENT, accept: opts.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "follow",
      signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const buf = await res.arrayBuffer();
    return { url: target.toString(), finalUrl: res.url || target.toString(), status: res.status, headers, text: new TextDecoder().decode(buf.slice(0, MAX_BYTES)) };
  } catch {
    return null;
  }
}

/** Everything the checks look at, for one site. */
export async function gatherInputs(site: typeof sites.$inferSelect, signal?: AbortSignal): Promise<AgentInputs> {
  const db = getDb();
  const rows = await db
    .select({ url: sitePages.url, title: sitePages.title, state: sitePages.state, httpStatus: sitePages.httpStatus, seo: sitePages.seo })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt)));
  const pages = rows.map((r) => ({ url: r.url, title: r.title, state: r.state, httpStatus: r.httpStatus, wordCount: r.seo?.wordCount ?? null, structuredTypes: r.seo?.structuredTypes ?? [] }));
  const a11y = site.lastScanId
    ? await db
        .select({ ruleId: a11yIssueGroups.ruleId, pagesCount: a11yIssueGroups.pagesCount })
        .from(a11yIssueGroups)
        // Violations only: "needs review" items are undecided until a person looks.
        .where(and(eq(a11yIssueGroups.siteId, site.id), eq(a11yIssueGroups.status, "open"), eq(a11yIssueGroups.kind, "violation")))
    : null;
  const pricingUrl = findPage(pages, PRICING_PATH);
  const docsUrl = findPage(pages, DOCS_PATH);
  const [home, pricing, docs, markdown] = await Promise.all([
    probe(site.startUrl, site.startUrl, { signal }),
    pricingUrl ? probe(pricingUrl, site.startUrl, { signal }) : null,
    docsUrl ? probe(docsUrl, site.startUrl, { signal }) : null,
    probe(site.startUrl, site.startUrl, { accept: "text/markdown", signal }),
  ]);
  const endpoints: AgentInputs["endpoints"] = [];
  for (const path of ENDPOINT_PATHS) {
    const p = await probe(new URL(path, site.startUrl).toString(), site.startUrl, { accept: "application/json, application/linkset+json, */*;q=0.5", signal });
    const type = p?.headers["content-type"] ?? "";
    // Many single-page apps answer every path with their HTML shell: only a non-HTML answer counts.
    if (p && p.status === 200 && !/text\/html/i.test(type)) endpoints.push({ path, status: p.status, contentType: type });
  }
  return { startUrl: site.startUrl, pages, a11y, bestPractice: site.includeBestPractice, aiAccess: site.aiAccess, probes: { home, pricing, docs }, endpoints, markdownType: markdown?.headers["content-type"] ?? null };
}

export const agentCheckPayload = z.object({ workspaceId: z.guid(), siteId: z.guid() });

export async function runAgentCheck(ctx: AiContext, payload: z.infer<typeof agentCheckPayload>) {
  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, payload.siteId));
  if (!site) return { skipped: "site deleted" };
  try {
    const results = runChecks(await gatherInputs(site, ctx.signal));
    const score = readinessScore(results);
    await db.insert(agentChecks).values({ workspaceId: site.workspaceId, siteId: site.id, score, results });
    return { score };
  } catch (err) {
    await db.insert(agentChecks).values({ workspaceId: site.workspaceId, siteId: site.id, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Queues a check for a site unless one is waiting. Called when a scan finishes and by Check now. */
export async function queueAgentCheck(site: { id: string; workspaceId: string }): Promise<void> {
  if (await jobByPayload(site.workspaceId, ["agent_check"], "siteId", site.id)) return;
  await enqueue(site.workspaceId, "agent_check", { siteId: site.id });
}

/** A site's checks, newest first. */
export async function agentCheckHistory(siteId: string, limit = 20) {
  return getDb().select().from(agentChecks).where(eq(agentChecks.siteId, siteId)).orderBy(desc(agentChecks.checkedAt)).limit(limit);
}
