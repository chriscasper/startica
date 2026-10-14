import { describe, expect, it } from "vitest";
import { pageFindings, readStructuredData } from "./checks.ts";
import { parseRobots, robotsAllows } from "./robots.ts";
import { seoPageScore, siteFiles } from "./site.ts";

const seo = (over: Partial<Parameters<typeof pageFindings>[1]> = {}) => ({
  description: "A note-taking app for field researchers, with offline notebooks and GPS tags.",
  canonical: null,
  robots: null,
  xRobotsTag: null,
  h1: ["Fieldnote"],
  ogTitle: null,
  ogImage: null,
  structuredTypes: [],
  wordCount: 300,
  ...over,
});

describe("robots.txt", () => {
  const groups = parseRobots(
    "User-agent: *\nDisallow: /private/\nAllow: /private/press$\n\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n",
  );
  it("uses the crawler's own group, else *, with the longest matching rule", () => {
    expect(robotsAllows(groups, "GPTBot", "/")).toBe(false);
    expect(robotsAllows(groups, "claudebot", "/pricing")).toBe(false); // case-insensitive, shared group
    expect(robotsAllows(groups, "OAI-SearchBot", "/")).toBe(true);
    expect(robotsAllows(groups, "PerplexityBot", "/pricing")).toBe(true); // falls under *
    expect(robotsAllows(groups, "PerplexityBot", "/private/notes")).toBe(false);
    expect(robotsAllows(groups, "PerplexityBot", "/private/press")).toBe(true); // longer Allow wins
    expect(robotsAllows(parseRobots(""), "GPTBot", "/")).toBe(true);
  });
});

describe("page checks", () => {
  it("finds missing and overlong basics, noindex in the sitemap and canonicals elsewhere", () => {
    const rules = (title: string | null, over = {}, inSitemap = false) => pageFindings({ url: "https://fieldnote.example/pricing", title, inSitemap }, seo(over), []).map((f) => f.rule);
    expect(rules("Pricing: Fieldnote")).toEqual([]);
    expect(rules(null, { description: null, h1: [] })).toEqual(["title-missing", "description-missing", "h1-missing"]);
    expect(rules("x".repeat(70), { h1: ["a", "b"] })).toEqual(["title-too-long", "h1-multiple"]);
    expect(rules("Pricing: Fieldnote", { robots: "noindex, follow" }, true)).toEqual(["noindex-in-sitemap"]);
    expect(rules("Pricing: Fieldnote", { xRobotsTag: "noindex" })).toEqual(["noindex"]);
    expect(rules("Pricing: Fieldnote", { canonical: "https://fieldnote.example/plans" })).toEqual(["canonical-elsewhere"]);
  });

  it("reads JSON-LD: types (incl. @graph), invalid blocks and missing properties", () => {
    const data = readStructuredData([
      '{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Fieldnote","url":"https://fieldnote.example"},{"@type":"Product","name":"Fieldnote"}]}',
      '{"@type": "Product" "name": "x"}',
    ]);
    expect(data.types).toEqual(["Organization", "Product"]);
    expect(data.invalid).toEqual([2]);
    expect(data.incomplete).toEqual([{ type: "Product", missing: ["offers or review or aggregateRating"] }]);
  });

  it("scores a page 100 minus 15 / 7 / 2 per high / medium / low finding", () => {
    expect(seoPageScore([])).toBe(100);
    expect(seoPageScore(["title-missing", "description-missing", "h1-multiple", "noindex"])).toBe(76);
  });
});

describe("site files", () => {
  it("tells a real llms.txt and robots.txt from a catch-all page, and spots soft 404s", async () => {
    const { createServer } = await import("node:http");
    // A single-page app: every unknown address answers 200 with the app's HTML (like many Next.js sites).
    const spa = createServer((_req, res) => res.writeHead(200, { "content-type": "text/html" }).end("<!DOCTYPE html><html><body>App</body></html>"));
    const good = createServer((req, res) => {
      if (req.url === "/llms.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("# Fieldnote\n\n> Offline field notes.\n");
      if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end("User-agent: *\nAllow: /\n");
      res.writeHead(404).end("Not found");
    });
    await Promise.all([spa, good].map((s) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r))));
    const url = (s: typeof spa) => `http://127.0.0.1:${(s.address() as { port: number }).port}/`;
    try {
      expect(await siteFiles(url(spa))).toEqual({ llmsTxt: "missing", robotsNotText: true, soft404: true });
      expect(await siteFiles(url(good))).toEqual({ llmsTxt: "present", robotsNotText: false, soft404: false });
    } finally {
      await Promise.all([spa, good].map((s) => new Promise((r) => s.close(r))));
    }
  });
});
