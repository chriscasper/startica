import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { roadmapItems, sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";
import { acrLevel, acrMarkdown, buildAcr, buildStatement, checklist, criterionToRoadmap, reportHtml, saveCriterionReview, saveStatementInput, statementInput } from "./manual.ts";
import { HOW_TO_TEST, profileCriteria } from "./wcag.ts";

/** A4 on the demo (ARCHITECTURE.md section 9.5): the checklist, the statement, the conformance draft and the report, none claiming compliance. */

let workspaceId = "";
let site: typeof sites.$inferSelect;
const CLAIMS = /\b(compliant|compliance with|certified|fully accessible|is accessible|conforms to|meets WCAG)\b/i;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-manual-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId } = await seedDemo());
  site = (await getDb().select().from(sites))[0]!;
});
afterAll(() => closeDatabase());

const fresh = async () => (await getDb().select().from(sites).where(eq(sites.id, site.id)))[0]!;

describe("checklist", () => {
  it("covers every WCAG 2.2 A and AA criterion with a manual test", () => {
    expect(profileCriteria("wcag22").every((c) => HOW_TO_TEST[c.id])).toBe(true);
  });

  it("joins the automated result and the owner's review", async () => {
    const items = await checklist(site);
    expect(items).toHaveLength(55);
    const by = new Map(items.map((c) => [c.id, c]));
    expect(by.get("1.1.1")).toMatchObject({ status: "failing", manual: "not_tested" });
    expect(by.get("2.4.7")).toMatchObject({ manual: "fail", note: expect.stringContaining("focus outline") });
    expect(by.get("1.2.2")!.manual).toBe("not_applicable");

    await saveCriterionReview(workspaceId, site.id, "1.3.1", { status: "pass", note: "Headings and lists checked with VoiceOver", remark: "" });
    expect((await checklist(site)).find((c) => c.id === "1.3.1")).toMatchObject({ manual: "pass", reviewedAt: expect.any(Date) });
    await saveCriterionReview(workspaceId, site.id, "1.3.1", { status: "not_tested", note: "", remark: "" });
    expect((await checklist(site)).find((c) => c.id === "1.3.1")).toMatchObject({ manual: "not_tested", reviewedAt: null });
    await expect(saveCriterionReview(workspaceId, site.id, "drop table", { status: "pass", note: "", remark: "" })).rejects.toThrow(/Unknown/);
  });

  it("turns a manual failure into a roadmap item once", async () => {
    await criterionToRoadmap(workspaceId, site.id, "2.4.7");
    await expect(criterionToRoadmap(workspaceId, site.id, "2.4.7")).rejects.toThrow(/Already/);
    const [item] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.title, "Accessibility: meet WCAG 2.4.7 Focus Visible on fieldnote.example"));
    expect(item).toMatchObject({ playbook: "accessibility-fixes", priority: 2, why: expect.stringContaining("focus outline") });
  });
});

describe("conformance draft", () => {
  it("only says Supports after a manual pass, and never for unchecked criteria", () => {
    expect(acrLevel({ status: "no_failures", manual: "not_tested", issues: 0 }, 0, 10)).toBe("Not Evaluated");
    expect(acrLevel({ status: "no_failures", manual: "pass", issues: 0 }, 0, 10)).toBe("Supports");
    expect(acrLevel({ status: "failing", manual: "pass", issues: 1 }, 2, 10)).toBe("Partially Supports");
    expect(acrLevel({ status: "failing", manual: "not_tested", issues: 1 }, 6, 10)).toBe("Does Not Support");
    expect(acrLevel({ status: "manual", manual: "fail", issues: 0 }, 0, 10)).toBe("Does Not Support");
    expect(acrLevel({ status: "manual", manual: "not_applicable", issues: 0 }, 0, 10)).toBe("Not Applicable");
  });

  it("fills each row from the results and the checklist", async () => {
    const rows = new Map((await buildAcr(site)).map((r) => [r.id, r]));
    expect(rows.get("1.1.1")).toMatchObject({ conformance: "Does Not Support", remarks: expect.stringContaining("Images must have alternative text") }); // the logo, on 6 of 7 pages
    expect(rows.get("2.1.1")!.conformance).toBe("Supports");
    expect(rows.get("2.4.2")!.conformance).toBe("Not Evaluated");
    const md = await acrMarkdown(site);
    expect(md).toMatch(/^# Accessibility conformance report \(draft\)/);
    expect(md).toContain("It is not a certification.");
  });
});

describe("statement and report", () => {
  it("writes the statement from the details and results, without claiming compliance", async () => {
    const text = (await buildStatement(await fresh()))!;
    expect(text).toContain("We aim to meet the Web Content Accessibility Guidelines (WCAG 2.2 level AA)");
    expect(text).toContain("Images must have alternative text");
    expect(text).toContain("WCAG 2.4.7 Focus Visible: The focus outline is removed");
    expect(text).toContain("accessibility@fieldnote.example");
    expect(text).not.toMatch(CLAIMS);

    await saveStatementInput(workspaceId, site.id, statementInput.parse({ organization: "Fieldnote", contact: "https://fieldnote.example/contact", target: "wcag21aa", limitations: "Older PDFs aren't tagged." }));
    const updated = (await buildStatement(await fresh()))!;
    expect(updated).toContain("WCAG 2.1 level AA");
    expect(updated).toContain("Older PDFs aren't tagged.");
    expect(() => statementInput.parse({ organization: "", contact: "x" })).toThrow();
  });

  it("builds a printable report with every section", async () => {
    const page = await reportHtml(await fresh());
    expect(page).toMatch(/^<!doctype html>/);
    for (const part of ["<h2>Score</h2>", "By criterion", "<h2>Top issues</h2>", "Pages with the lowest scores"]) expect(page).toContain(part);
    expect(page).toContain("Images must have alternative text");
    expect(page.replace(/isn't a statement of conformance/, "")).not.toMatch(CLAIMS);
  });
});
