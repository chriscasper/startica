import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiVisibilityAnswers, aiVisibilityRuns, communities, competitors, jobs, offsitePages, products } from "@startica/db/schema";
import { allowedOffsite, allowLocalOffsite, privateAddress, OFFSITE_USER_AGENT, queueOffsiteCheck, runOffsiteCheck, watchSubreddit } from "./check.ts";
import { citedDomains, classify, subredditOf } from "./domains.ts";

let server: Server;
let base = "";
let workspaceId = "";
let productId = "";
const hits: { path: string; ua: string }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push({ path: req.url ?? "", ua: String(req.headers["user-agent"] ?? "") });
    if (req.url === "/robots.txt") return res.writeHead(200).end("User-agent: StarticaOffsiteCheck\nDisallow: /private\n");
    if (req.url === "/best-field-apps") return res.writeHead(200, { "content-type": "text/html" }).end("<title>Best field notes apps</title><p>We tried TerraJot and Quadrat.</p>");
    if (req.url === "/moved") return res.writeHead(302, { location: "http://10.0.0.1/admin" }).end();
    if (req.url === "/review") return res.writeHead(200, { "content-type": "text/html" }).end("<p>Fieldnote works offline. Unlike Quadrat, it syncs.</p>");
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  allowLocalOffsite(true);

  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-offsite-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example" }).returning())[0]!.id;
  await getDb().insert(competitors).values([
    { workspaceId, productId, name: "TerraJot", url: "https://terrajot.example" },
    { workspaceId, productId, name: "Quadrat" },
  ]);
  const [run] = await getDb()
    .insert(aiVisibilityRuns)
    .values({ workspaceId, productId, model: "claude-sonnet-5-5", status: "done", promptCount: 3, capUsd: 2, metrics: { answered: 3, mentioned: 1, recommended: 0, cited: 0, avgPosition: null, brands: [] } })
    .returning();
  const cite = (url: string) => ({ url, title: url });
  await getDb()
    .insert(aiVisibilityAnswers)
    .values([
      { workspaceId, runId: run!.id, promptText: "best field notes app", mentioned: false, citations: [cite(`${base}/best-field-apps`), cite("https://www.reddit.com/r/ecology/comments/abc/field_notes/"), cite("https://terrajot.example/features")] },
      { workspaceId, runId: run!.id, promptText: "offline notes for ecologists", mentioned: false, citations: [cite(`${base}/best-field-apps`), cite(`${base}/private/list`)] },
      { workspaceId, runId: run!.id, promptText: "Quadrat alternatives", mentioned: true, citations: [cite(`${base}/review`), cite("https://fieldnote.example/compare")] },
    ]);
});
afterAll(async () => {
  allowLocalOffsite(false);
  await new Promise((r) => server.close(r));
  closeDatabase();
});

describe("cited domains", () => {
  it("classifies sites and finds subreddits", () => {
    expect(classify("reddit.com", "fieldnote.example", [])).toBe("community");
    expect(classify("forum.example.org", null, [])).toBe("community");
    expect(classify("alternativeto.net", null, [])).toBe("directory");
    expect(classify("docs.fieldnote.example", "fieldnote.example", [])).toBe("own");
    expect(classify("terrajot.example", null, ["terrajot.example"])).toBe("competitor");
    expect(classify("someblog.example", null, [])).toBe("article");
    expect(subredditOf("https://old.reddit.com/r/ecology/comments/x")).toBe("ecology");
    expect(subredditOf("https://example.com/r/ecology")).toBeNull();
  });

  it("ranks where the product is missing, and never lets the AI's URLs reach private addresses", async () => {
    const { domains, runs, answers } = await citedDomains(productId);
    expect({ runs, answers }).toEqual({ runs: 1, answers: 3 });
    expect(domains[0]).toMatchObject({ domain: "127.0.0.1", answers: 3, answersWithoutYou: 2 });
    expect(domains.at(-1)?.kind).toBe("own");
    expect(domains.find((d) => d.domain === "reddit.com")?.subreddits).toEqual([{ name: "ecology", watching: false }]);

    allowLocalOffsite(false);
    expect(allowedOffsite(`${base}/x`)).toBe(false);
    expect(allowedOffsite("http://10.0.0.5/admin")).toBe(false);
    expect(allowedOffsite("https://public.example.org:8443/")).toBe(false);
    expect(allowedOffsite("https://user:pw@public.example.org/")).toBe(false);
    expect(allowedOffsite("file:///etc/passwd")).toBe(false);
    expect(allowedOffsite("https://reviews.example.org/best")).toBe(true);
    allowLocalOffsite(true);
  });
});

describe("reading cited pages", () => {
  it("reads pages politely, respects robots.txt and records who appears", async () => {
    const result = await runOffsiteCheck({ workspaceId }, { workspaceId, productId }, { pauseMs: 0 });
    expect(result.read).toBe(2);
    const rows = Object.fromEntries((await getDb().select().from(offsitePages)).map((r) => [new URL(r.url).pathname, r]));
    expect(rows["/best-field-apps"]).toMatchObject({ status: "read", title: "Best field notes apps", mentionsProduct: false, competitors: ["TerraJot", "Quadrat"] });
    expect(rows["/review"]).toMatchObject({ status: "read", mentionsProduct: true, competitors: ["Quadrat"] });
    expect(rows["/private/list"]).toMatchObject({ status: "blocked_by_robots" });
    expect(hits.some((h) => h.path === "/private/list")).toBe(false);
    expect(hits.every((h) => h.ua === OFFSITE_USER_AGENT)).toBe(true);

    const local = (await citedDomains(productId)).domains.find((d) => d.domain === "127.0.0.1")!;
    expect(local).toMatchObject({ youAppear: true, competitorsThere: ["TerraJot", "Quadrat"] });

    // Read pages aren't read again within a week.
    const before = hits.length;
    await runOffsiteCheck({ workspaceId }, { workspaceId, productId }, { pauseMs: 0 });
    expect(hits.filter((h, i) => i >= before && h.path !== "/robots.txt").length).toBe(0);
  });

  it("queues one check at a time, and watches a subreddit in the Inbox", async () => {
    await queueOffsiteCheck(workspaceId, productId);
    await queueOffsiteCheck(workspaceId, productId);
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "offsite_check"))).length).toBe(1);
    await watchSubreddit({ workspaceId, productId }, "r/ecology", "Cited by AI answers");
    await watchSubreddit({ workspaceId, productId }, "ecology", "again");
    const rows = await getDb().select().from(communities).where(eq(communities.productId, productId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "reddit", name: "ecology", status: "watching" });
    await expect(watchSubreddit({ workspaceId, productId }, "bad name!", "")).rejects.toThrow(/Not a subreddit/);
  });
});

describe("safety on URLs from AI answers", () => {
  it("knows private, local and reserved addresses", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "0.0.0.0", "100.64.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "224.0.0.1", "::1", "fe80::1", "fd00::1", "::ffff:10.0.0.1"])
      expect(privateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700::1111", "::ffff:8.8.8.8"]) expect(privateAddress(ip), ip).toBe(false);
  });

  it("checks every redirect before following it, and treats an unreachable robots.txt as no", async () => {
    // A second site whose robots.txt errors.
    const broken = createServer((req, res) => (req.url === "/robots.txt" ? res.writeHead(503).end() : res.writeHead(200).end("<p>Fieldnote</p>")));
    await new Promise<void>((r) => broken.listen(0, "127.0.0.1", r));
    const brokenBase = `http://127.0.0.1:${(broken.address() as { port: number }).port}`;
    try {
      const [run] = await getDb().select().from(aiVisibilityRuns).limit(1);
      await getDb()
        .insert(aiVisibilityAnswers)
        .values({ workspaceId, runId: run!.id, promptText: "more", mentioned: false, citations: [{ url: `${base}/moved`, title: "Moved" }, { url: `${brokenBase}/list`, title: "List" }] });
      const before = hits.length;
      await runOffsiteCheck({ workspaceId }, { workspaceId, productId }, { pauseMs: 0 });
      const rows = Object.fromEntries((await getDb().select().from(offsitePages)).map((r) => [r.url, r]));
      // The redirect to 10.0.0.1 is refused before any request goes there.
      expect(rows[`${base}/moved`]).toMatchObject({ status: "failed" });
      expect(hits.slice(before).map((h) => h.path)).toContain("/moved");
      expect(rows[`${brokenBase}/list`]).toMatchObject({ status: "blocked_by_robots", error: "Its robots.txt couldn't be read" });
    } finally {
      await new Promise((r) => broken.close(r));
    }
  });
});
