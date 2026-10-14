import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { agentChecks, jobs, products, sitePages, sites } from "@startica/db/schema";
import { AGENT_USER_AGENT, probe, queueAgentCheck, runAgentCheck } from "./run.ts";

let server: Server;
let base = "";
let workspaceId = "";
let siteId = "";
const seen: { path: string; accept: string; ua: string }[] = [];

beforeAll(async () => {
  // A single-page app: an empty shell for every path, a pricing page, an API catalog, and a Markdown answer when asked.
  server = createServer((req, res) => {
    seen.push({ path: req.url ?? "", accept: String(req.headers.accept ?? ""), ua: String(req.headers["user-agent"] ?? "") });
    if (req.url === "/" && String(req.headers.accept).startsWith("text/markdown")) {
      res.writeHead(200, { "content-type": "text/markdown; charset=utf-8", vary: "Accept" });
      return res.end("# Fieldnote\n\nOffline field notes.");
    }
    if (req.url === "/pricing") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<h1>Pricing</h1><p>Free for 3 projects. Team $8 per user per month.</p>");
    }
    if (req.url === "/.well-known/api-catalog") {
      res.writeHead(200, { "content-type": "application/linkset+json" });
      return res.end('{"linkset":[]}');
    }
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<html><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-agents-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  const productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
  siteId = (await getDb().insert(sites).values({ workspaceId, productId, name: "Fieldnote", startUrl: base, ownershipConfirmedAt: new Date() }).returning())[0]!.id;
  await getDb()
    .insert(sitePages)
    .values([
      { workspaceId, siteId, url: base, state: "done", httpStatus: 200, title: "Fieldnote" },
      { workspaceId, siteId, url: `${base}pricing`, state: "done", httpStatus: 200, title: "Pricing" },
    ]);
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  closeDatabase();
});

describe("running the checks", () => {
  it("requests only the site's own pages, as itself, and keeps a history", async () => {
    expect(await probe("https://elsewhere.example.org/", base)).toBeNull();
    expect(await probe("https://fieldnote.example/", "https://fieldnote.example/")).toBeNull(); // reserved names are never fetched

    expect(await runAgentCheck({ workspaceId }, { workspaceId, siteId })).toEqual({ score: expect.any(Number) });
    const [check] = await getDb().select().from(agentChecks).where(eq(agentChecks.siteId, siteId));
    const by = Object.fromEntries(check!.results.map((r) => [r.id, r.status]));
    expect(by).toMatchObject({
      "content-without-js": "fail", // the shell has no text
      "pricing-in-text": "pass",
      "public-pages": "pass",
      "no-bot-wall": "pass",
      "api-description": "pass", // the API catalog answered as JSON
      "agent-tools": "info", // the SPA's HTML answers for /.well-known/ai-catalog.json don't count
      markdown: "pass",
      "controls-named": "unknown", // no scan yet
    });
    expect(seen.every((s) => s.ua === AGENT_USER_AGENT)).toBe(true);
  });

  it("queues one check at a time", async () => {
    await queueAgentCheck({ id: siteId, workspaceId });
    await queueAgentCheck({ id: siteId, workspaceId });
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "agent_check"))).length).toBe(1);
  });
});
