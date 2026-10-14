import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { readinessScore, type CheckResult } from "../agents/checks.ts";

/**
 * The demo's agent readiness (ARCHITECTURE.md section 10.3): two checks of fieldnote.example a week
 * apart, the second after the pricing page moved into plain HTML. Written as checks would
 * store them (the demo makes no requests).
 */

const before: CheckResult[] = [
  { id: "public-pages", status: "pass", summary: "/, /pricing, /docs/getting-started open without an account." },
  { id: "no-bot-wall", status: "pass", summary: "Public pages answered a plain request without a challenge." },
  { id: "agent-access", status: "pass", summary: "robots.txt lets ChatGPT-User, Claude-User, Perplexity-User fetch pages." },
  { id: "content-without-js", status: "pass", summary: "The home page's HTML has 412 words of text without running scripts." },
  { id: "structure", status: "pass", summary: "No problems found by the accessibility checks." },
  { id: "structured-data", status: "warn", summary: "The home page has Organization, but nothing that describes the product itself.", detail: ["Add Product or SoftwareApplication with name, description and offers."] },
  { id: "pricing-in-text", status: "warn", summary: "/pricing has no prices in its HTML: they may be drawn by scripts, shown in images, or missing." },
  { id: "docs-public", status: "pass", summary: "/docs/getting-started is public." },
  { id: "llms-txt", status: "warn", summary: "No /llms.txt." },
  {
    id: "controls-named",
    status: "fail",
    summary: "2 accessibility issues on up to 6 pages: fixing them for screen readers fixes them for agents.",
    detail: ["image-alt (6 pages)", "link-name (6 pages)"],
  },
  { id: "forms-labeled", status: "warn", summary: "1 accessibility issue on up to 1 page: fixing them for screen readers fixes them for agents.", detail: ["label (1 page)"] },
  { id: "api-description", status: "info", summary: "No OpenAPI description or /.well-known/api-catalog found. Only matters if the product has an API." },
  { id: "agent-tools", status: "info", summary: "No MCP Server Card, AI catalog or WebMCP tools found. Not expected yet for most products." },
  { id: "markdown", status: "info", summary: "Pages answer in HTML only. Optional: some hosts (Cloudflare's Markdown for Agents, for example) can serve Markdown to agents that ask." },
];

const after: CheckResult[] = before.map((r) => (r.id === "pricing-in-text" ? { id: r.id, status: "pass", summary: "/pricing states prices in its HTML." } : r));

export async function seedDemoAgents(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const [site] = await db.select({ id: s.sites.id }).from(s.sites).where(eq(s.sites.productId, productId)).limit(1);
  if (!site) return 0;
  const rows = [
    { results: before, checkedAt: ago(8, 2) },
    { results: after, checkedAt: ago(1, 2) },
  ];
  // The demo's scan queued a check; the demo makes no requests, so the seeded history stands instead.
  await db.delete(s.jobs).where(and(eq(s.jobs.queue, "agent_check"), sql`json_extract(${s.jobs.payload}, '$.siteId') = ${site.id}`));
  await db.insert(s.agentChecks).values(rows.map((r) => ({ workspaceId, siteId: site.id, score: readinessScore(r.results), results: r.results, checkedAt: r.checkedAt, createdAt: r.checkedAt })));
  return rows.length;
}
