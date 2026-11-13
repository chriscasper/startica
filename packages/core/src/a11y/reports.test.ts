import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";
import { acrHtml } from "./acr-print.ts";
import { buildAcr, buildStatement } from "./manual.ts";
import { statementHtml } from "./statement-html.ts";

/** The statement as HTML and the ACR draft as a printable page (ARCHITECTURE.md section 9.5). */

let site: typeof sites.$inferSelect;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-reports-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  await seedDemo();
  site = (await getDb().select().from(sites))[0]!;
});
afterAll(() => closeDatabase());

describe("statement HTML", () => {
  it("converts headings, paragraphs and lists, escapes the rest and links addresses", () => {
    const md = "# Statement for <Site>\n\nWe aim high & mean it.\nStill one paragraph.\n\n## Known limitations\n\n- One <b>issue</b>\n- Two\n\nContact us: help@fieldnote.example or https://fieldnote.example/help.";
    expect(statementHtml(md)).toBe(
      [
        "<h1>Statement for &lt;Site&gt;</h1>",
        "<p>We aim high &amp; mean it. Still one paragraph.</p>",
        "<h2>Known limitations</h2>",
        "<ul>\n  <li>One &lt;b&gt;issue&lt;/b&gt;</li>\n  <li>Two</li>\n</ul>",
        '<p>Contact us: <a href="mailto:help@fieldnote.example">help@fieldnote.example</a> or <a href="https://fieldnote.example/help">https://fieldnote.example/help</a>.</p>',
        "",
      ].join("\n"),
    );
    expect(statementHtml("# Title", { topLevel: 2 })).toBe("<h2>Title</h2>\n");
  });

  it("turns the demo's statement into HTML with every section", async () => {
    const md = await buildStatement(site);
    expect(md).toBeTruthy();
    const out = statementHtml(md!);
    for (const heading of ["The standard we aim for", "How we check", "Known limitations", "Feedback", "Date"]) expect(out).toContain(`<h2>${heading}</h2>`);
    expect(out).toMatch(/<ul>\n {2}<li>/);
    expect(out).not.toMatch(/compliant|certified/i);
  });
});

describe("ACR draft page", () => {
  it("has every row of the draft, says it's a draft and never claims conformance", async () => {
    const rows = await buildAcr(site);
    const out = await acrHtml(site, "wcag22", new Date("2026-11-07T12:00:00Z"));
    expect(out).toMatch(/^<!doctype html>/);
    expect(out).toContain("2026-11-07");
    expect((out.match(/<tr><td>/g) ?? []).length).toBe(rows.length);
    expect(out).toContain("It is not a certification.");
    expect(out).not.toMatch(/\bcompliant\b|\bcertified\b/i);
  });
});
