import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { products, siteDocuments, siteFindings, siteLinks, sitePages, sites } from "@startica/db/schema";
import { addRule, candidateWords, ignoreWord, misspellings, readability, removeRule, ruleMatches, syllables, textMatcher } from "./content.ts";
import { analyzePdf, checkLink, documentProblems, isBroken, runContentCheck } from "./documents.ts";
import { playwrightScanner } from "./playwright-backend.ts";
import { runSiteScan } from "./scan.ts";
import { setScanner, type ScannerBackend } from "./scanner.ts";
import { createSite, siteInput, startSiteScan } from "./sites.ts";
// @ts-expect-error plain JS helper shared with the smoke tests
import { startStandin } from "./standin/server.mjs";

/** A5 (ARCHITECTURE.md section 9.6): spelling, readability, content rules, PDFs and external links. */

const PDF = readFileSync(join(import.meta.dirname, "standin/docs/price-list.pdf"));

describe("spelling", () => {
  it("checks lowercase words only, and knows the site's own words", async () => {
    expect([...candidateWords("Fieldnote and NASA sync 3d notes we've got teh. See robots.txt, html-has-lang and user@mail.example")].map(([w]) => w)).toEqual(["and", "sync", "notes", "we've", "got", "teh"]); // "and" twice, counted once
    expect((await misspellings("we recieve notes and fieldnotes sync", new Set(["fieldnotes"]))).map((m) => m.word)).toEqual(["recieve"]);
    expect((await misspellings("we recieve it", new Set()))[0]!.suggestions[0]).toBe("receive");
  });
});

describe("readability", () => {
  it("counts syllables roughly and grades text", () => {
    expect([syllables("note"), syllables("paper"), syllables("documentation"), syllables("the")]).toEqual([1, 2, 5, 1]);
    expect(readability("Too short.")).toBeNull();
    const plain = readability("We take notes. The app saves them. You can find them later. It works offline. ".repeat(8))!;
    const dense = readability("The organisation's comprehensive documentation methodology necessitates considerable deliberation regarding interoperability considerations. ".repeat(10))!;
    expect(plain.grade).toBeLessThan(4);
    expect(dense.grade).toBeGreaterThan(14);
    expect(dense.ease).toBeLessThan(plain.ease);
  });
});

describe("content rules", () => {
  it("matches text, regular expressions, selectors and linked domains", () => {
    expect(textMatcher("Lorem")("lorem ipsum, LOREM")).toBe(2);
    expect(textMatcher("/\\bv\\d+\\.\\d+/")("v1.2 and v3.4")).toBe(2);
    expect(textMatcher("/[/")("anything")).toBe(0); // an invalid expression matches nothing
    const rules = [
      { id: "a", name: "No placeholder text", kind: "text_contains" as const, value: "lorem" },
      { id: "b", name: "Has a footer", kind: "selector_missing" as const, value: "footer" },
      { id: "c", name: "No old CDN", kind: "links_to" as const, value: "old-cdn.example" },
      { id: "d", name: "No banners", kind: "selector_exists" as const, value: "[[bad" },
    ];
    const hits = ruleMatches(rules, { text: "Lorem ipsum", links: ["https://assets.old-cdn.example/a.js"], selectorCounts: [0, -1] });
    expect(hits.map((h) => [h.rule.id, h.detail])).toEqual([
      ["a", { matches: 1 }],
      ["b", {}],
      ["c", { matches: 1, links: ["https://assets.old-cdn.example/a.js"] }],
      ["d", { invalid: true }],
    ]);
  });
});

describe("documents", () => {
  it("reads a PDF's basics with pdf.js and lists its problems", async () => {
    const checks = await analyzePdf(new Uint8Array(PDF));
    expect(checks).toMatchObject({ pages: 1, tagged: false, title: null, lang: null, hasText: true, figures: 0 });
    expect(documentProblems(checks)).toEqual(["pdf-untagged", "pdf-no-title", "pdf-no-lang"]);
    expect(documentProblems({ ...checks, hasText: false, tagged: true, title: "Price list", showsTitle: true, lang: "en", pages: 25 })).toEqual(["pdf-no-text", "pdf-no-headings", "pdf-no-bookmarks"]);
  });
});

// --- End to end on the stand-in site (real browser): the planted content problems.

let standin: { url: string; close: () => Promise<void> };
let scanner: ScannerBackend | null = null;
let workspaceId = "";
let siteId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-content-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  standin = await startStandin(0);
  scanner = await playwrightScanner(58300);
  setScanner(scanner);
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  siteId = await createSite(workspaceId, p!.id, siteInput.parse({ name: "Stand-in", start_url: standin.url, respect_robots: "on" }));
}, 60_000);
afterAll(async () => {
  await scanner?.close?.();
  await standin?.close();
  closeDatabase();
});

const pathOf = async (pageId: string) => new URL((await getDb().select({ url: sitePages.url }).from(sitePages).where(eq(sitePages.id, pageId)))[0]!.url).pathname;

describe("content checks on the stand-in site (real browser)", () => {
  it("finds the planted spelling, readability and rule problems in the scan, then the PDF and broken link after it", async (t) => {
    if (!scanner) return t.skip();
    await addRule(workspaceId, siteId, { name: "Every page has a footer", kind: "selector_missing", value: "footer" });
    await addRule(workspaceId, siteId, { name: "No links to the old partner", kind: "links_to", value: "127.0.0.1" });
    const scanId = await startSiteScan({ id: siteId, workspaceId });
    await runSiteScan({ workspaceId }, { workspaceId, scanId });

    const findings = await getDb().select().from(siteFindings).where(eq(siteFindings.siteId, siteId));
    const of = async (kind: string) => (await Promise.all(findings.filter((f) => f.kind === kind).map(async (f) => `${f.key}@${await pathOf(f.pageId)}`))).sort();
    expect(await of("spelling")).toEqual(["lang@/about.html", "operationalization@/about.html", "organisation@/about.html", "recieve@/about.html"]);
    expect((await of("spelling")).filter((k) => k.startsWith("fieldnote"))).toEqual([]); // the product's own name
    expect(await of("readability")).toEqual(["readability@/about.html"]);
    const rules = findings.filter((f) => f.kind === "rule");
    expect(rules.filter((f) => f.detail.name === "No links to the old partner").length).toBe(1);
    expect(rules.filter((f) => f.detail.name === "Every page has a footer").length).toBe(6); // every checked page
    const [about] = await getDb().select().from(sitePages).where(and(eq(sitePages.siteId, siteId), eq(sitePages.url, `${standin.url}/about.html`)));
    expect(about!.readability!.grade).toBeGreaterThan(9);

    // The planted PDF, plus the missing /field-guide.pdf the home page links to; example.com is never requested.
    expect(await runContentCheck({ workspaceId }, { workspaceId, siteId })).toEqual({ documents: 2, links: 1 });
    const docs = await getDb().select().from(siteDocuments).where(eq(siteDocuments.siteId, siteId));
    expect(docs.find((d) => d.url.endsWith("/field-guide.pdf"))).toMatchObject({ status: "failed", httpStatus: 404 });
    const doc = docs.find((d) => d.url.endsWith("/price-list.pdf"));
    expect(doc).toMatchObject({ url: `${standin.url}/docs/price-list.pdf`, status: "ok", problems: ["pdf-untagged", "pdf-no-title", "pdf-no-lang"], linkedFrom: [`${standin.url}/about.html`] });
    const [link] = await getDb().select().from(siteLinks).where(eq(siteLinks.siteId, siteId));
    expect(link).toMatchObject({ httpStatus: 404, linkedFrom: [`${standin.url}/about.html`] });
    expect(link!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/gone\.html$/);
    expect(isBroken(link!)).toBe(true);
  }, 180_000);

  it("ignores a word and removes a rule's findings with it", async () => {
    await ignoreWord(workspaceId, siteId, "Recieve");
    const [site] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    expect(site!.spellingIgnore).toContain("recieve");
    expect(await getDb().select().from(siteFindings).where(and(eq(siteFindings.siteId, siteId), eq(siteFindings.key, "recieve")))).toEqual([]);
    const footer = site!.contentRules!.find((r) => r.name === "Every page has a footer")!;
    await removeRule(workspaceId, siteId, footer.id);
    expect(await getDb().select().from(siteFindings).where(and(eq(siteFindings.siteId, siteId), eq(siteFindings.key, footer.id)))).toEqual([]);
  });

  it("treats a missing page as broken, and an answering one as fine", async () => {
    expect(await checkLink(`${standin.url}/missing.html`)).toEqual({ status: 404, error: null });
    expect(await checkLink(`${standin.url}/`)).toEqual({ status: 200, error: null });
    expect((await checkLink("http://127.0.0.1:9/")).status).toBeNull();
  });
});
