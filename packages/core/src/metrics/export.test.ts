import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, migrateDatabase, openDatabase } from "@startica/db/client";
import { seedDemo } from "../demo/seed.ts";
import { loadBenchmarks } from "../benchmarks/report.ts";
import { analyticsExport, reportHtml, reportMarkdown } from "./export.ts";

let productId = "";
const now = new Date();

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-export-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ productId } = await seedDemo(now));
}, 30_000);
afterAll(() => closeDatabase());

describe("analytics report export", () => {
  it("writes the demo's period as Markdown, the same way every time", async () => {
    const { doc, fileBase } = await analyticsExport(productId, 30, now);
    const md = reportMarkdown(doc);
    expect(fileBase).toMatch(/^fieldnote-analytics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}$/);
    expect(md).toMatch(/^# Analytics report: Fieldnote\n\n.+\(30 days\)/);
    for (const heading of ["## Overview", "## What changed", "## Weekly read-out", "## Traffic", "## Conversions", "## Revenue", "## What Startica did"]) expect(md).toContain(heading);
    expect(md).toMatch(/\| Metric \| This period \| Period before \| Change \|\n\| --- \| ---: \| ---: \| ---: \|\n\| Visits \(30d\) \| [\d,]+ \| [\d,]+ \| [+-]?\d+% \|/);
    expect(md).toContain("> Written by AI (demo)");
    expect(md).toContain("| MRR |");
    expect(md).toMatch(/\| Where \| Posts \| Replies to them \| Visits \| Key events \|/);
    expect(reportMarkdown((await analyticsExport(productId, 30, now)).doc)).toBe(md);
  });

  it("prints the same content as a standalone page with print styles", async () => {
    const { doc } = await analyticsExport(productId, 7, now);
    const html = reportHtml(doc);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("@media print");
    expect(html).toContain("<h2>What Startica did</h2>");
    expect(html).not.toMatch(/\*\*/); // bold markers became <strong>
  });

  it("escapes table cells in Markdown", () => {
    const md = reportMarkdown({ title: "T", subtitle: "S", footer: "F", sections: [{ title: "X", blocks: [{ kind: "table", head: ["A"], rows: [["a | b"]] }] }] });
    expect(md).toContain("| a \\| b |");
  });
});

describe("demo benchmarks", () => {
  it("compares Fieldnote with its competitors", async () => {
    const b = await loadBenchmarks(productId, now);
    expect(b.channels).toEqual(["bluesky", "mastodon", "reddit", "hackernews"]);
    expect(b.accounts.filter((a) => a.own).map((a) => a.handle)).toEqual(["fieldnote.example", "fieldnote@social.example", "fieldnote_demo"]);
    expect(b.accounts.find((a) => a.handle === "quadrat@social.example")).toMatchObject({ status: "error", latest: null });
    const texts = b.observations.map((o) => o.text);
    expect(texts).toContain("TerraJot posts 3× more often than you on Bluesky (12 vs 4 posts in the last 7 days).");
    expect(texts).toContain("Add your own Reddit account to compare with Quadrat.");
    expect(b.accounts.find((a) => a.handle === "terrajot.example")!.series.length).toBeGreaterThanOrEqual(30);
  });
});
