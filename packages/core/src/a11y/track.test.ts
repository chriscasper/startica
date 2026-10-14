import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, jobs, roadmapItems, siteScans, sites } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";
import { buildCandidates } from "../growth/moves.ts";
import { addGroupToRoadmap, dueSites, ignoreGroup, issuesCsv, pageSessions, priorityOf, prioritizedGroups, reviewGroup, runScanDue, scoreHistory, unignoreGroup } from "./track.ts";
import { complianceView, profileCriteria } from "./wcag.ts";

/** A2 on the demo data (ARCHITECTURE.md section 9.3): priority with traffic, decisions, due scans, compliance views, export, Today. */

let workspaceId = "";
let productId = "";
let site: typeof sites.$inferSelect;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-track-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId, productId } = await seedDemo());
  site = (await getDb().select().from(sites))[0]!;
});
afterAll(() => closeDatabase());

const group = async (ruleId: string, kind: "violation" | "needs_review" = "violation") =>
  (await getDb().select().from(a11yIssueGroups).where(and(eq(a11yIssueGroups.ruleId, ruleId), eq(a11yIssueGroups.kind, kind))))[0]!;

describe("priority", () => {
  it("weighs impact, pages and traffic, and bands them", () => {
    const sessions = new Map([["/", 900], ["/pricing", 100]]);
    expect(priorityOf("critical", ["https://x.example/"], sessions, 1000)).toMatchObject({ score: 10 * 901, band: "high", traffic: 900 });
    expect(priorityOf("serious", ["https://x.example/help"], sessions, 1000)).toMatchObject({ band: "medium", traffic: 0 });
    expect(priorityOf("minor", ["https://x.example/"], sessions, 1000).band).toBe("low");
    expect(priorityOf("moderate", Array.from({ length: 5 }, (_, i) => `https://x.example/p${i}`), new Map(), 0).band).toBe("medium");
  });

  it("ranks the demo's issues by traffic: the shared logo on every page first", async () => {
    expect((await pageSessions(productId)).get("/")).toBeGreaterThan(1000);
    const ranked = await prioritizedGroups(site, { status: "open", kind: "issues" });
    expect(ranked[0]!.group.ruleId).toBe("image-alt");
    expect(ranked[0]).toMatchObject({ band: "high" });
    expect(ranked[0]!.traffic).toBeGreaterThan(0);
    expect(ranked.map((r) => r.score)).toEqual([...ranked.map((r) => r.score)].sort((a, b) => b - a));
  });
});

describe("decisions", () => {
  it("ignores with a reason and undoes it", async () => {
    const contrast = await group("color-contrast");
    await ignoreGroup(workspaceId, contrast.id, { reason: "wont_fix", note: "Legal text styling from the brand guide" });
    expect(await group("color-contrast")).toMatchObject({ status: "ignored", ignoreReason: "wont_fix", ignoreNote: "Legal text styling from the brand guide" });
    expect((await prioritizedGroups(site, { status: "open", kind: "issues" })).some((r) => r.group.id === contrast.id)).toBe(false);
    await unignoreGroup(workspaceId, contrast.id);
    expect(await group("color-contrast")).toMatchObject({ status: "open", ignoreReason: null });
  });

  it("a review item that fails becomes an issue; undo puts it back", async () => {
    const item = await group("color-contrast", "needs_review");
    expect((await prioritizedGroups(site, { status: "open", kind: "review" })).map((r) => r.group.id)).toEqual([item.id]);
    await reviewGroup(workspaceId, item.id, { decision: "fail", note: "The caption is unreadable over the bright part of the photo" });
    expect((await prioritizedGroups(site, { status: "open", kind: "issues" })).some((r) => r.group.id === item.id)).toBe(true);
    await expect(reviewGroup(workspaceId, (await group("label")).id, { decision: "pass", note: "" })).rejects.toThrow(/Needs review/);
    await reviewGroup(workspaceId, item.id, { decision: "undo", note: "" });
    expect((await group("color-contrast", "needs_review")).reviewStatus).toBeNull();
  });

  it("adds an issue to the Roadmap once", async () => {
    const alt = await group("image-alt");
    await addGroupToRoadmap(workspaceId, alt.id);
    await expect(addGroupToRoadmap(workspaceId, alt.id)).rejects.toThrow(/Already/);
    const [item] = await getDb().select().from(roadmapItems).where(eq(roadmapItems.playbook, "accessibility-fixes"));
    expect(item).toMatchObject({ source: "owner", priority: 1, title: "Accessibility: Images must have alternative text on fieldnote.example" });
  });
});

describe("scheduled rescans", () => {
  it("are due when the last full scan is older than the interval, and off at 0", async () => {
    // Not due a day after the last scan; due once it's 8 days old (interval 7).
    await getDb().update(siteScans).set({ finishedAt: new Date(Date.now() - 86_400_000) }).where(eq(siteScans.id, site.lastScanId!));
    expect(await dueSites(workspaceId)).toEqual([]);
    await getDb().update(siteScans).set({ finishedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(siteScans.id, site.lastScanId!));
    expect((await dueSites(workspaceId)).map((s) => s.id)).toEqual([site.id]);
    await getDb().update(sites).set({ scanIntervalDays: 14 }).where(eq(sites.id, site.id));
    expect(await dueSites(workspaceId)).toEqual([]);
    await getDb().update(sites).set({ scanIntervalDays: 0 }).where(eq(sites.id, site.id));
    expect(await dueSites(workspaceId)).toEqual([]);
    await getDb().update(sites).set({ scanIntervalDays: 7 }).where(eq(sites.id, site.id));
    // The hourly job queues one scan per due site, and not a second while it waits.
    expect(await runScanDue({ workspaceId }, { workspaceId })).toEqual({ started: 1 });
    expect(await runScanDue({ workspaceId }, { workspaceId })).toEqual({ started: 0 });
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "site_scan"))).length).toBe(1);
  });
});

describe("history, compliance, export and Today", () => {
  it("keeps the score history oldest first", async () => {
    const history = await scoreHistory(site.id);
    expect(history.map((h) => h.score)).toEqual([54, 59, 63, site.score]);
  });

  it("builds each standard's criteria from its WCAG version", () => {
    const ids = (p: Parameters<typeof profileCriteria>[0]) => profileCriteria(p).map((c) => c.id);
    expect(ids("wcag22")).toContain("2.5.8");
    expect(ids("wcag22")).not.toContain("4.1.1"); // removed in 2.2
    expect(ids("en301549")).not.toContain("2.5.8");
    expect(ids("en301549")).toContain("1.3.4");
    expect(ids("s508")).not.toContain("1.3.4");
    expect(ids("s508")).toContain("4.1.1");
    expect(ids("wcag22")).toHaveLength(55); // 31 at A + 24 at AA
    expect(profileCriteria("wcag22", true).length).toBeGreaterThan(80);
  });

  it("marks criteria failing, needing review, clear or manual", async () => {
    const groups = await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.siteId, site.id));
    const view = new Map(complianceView("wcag22", groups).map((r) => [r.id, r.status]));
    expect(view.get("1.1.1")).toBe("failing"); // image-alt
    expect(view.get("1.4.3")).toBe("failing"); // color-contrast (the violation wins over the review item)
    expect(view.get("2.4.2")).toBe("no_failures"); // document-title is checked by axe
    expect(view.get("1.2.3")).toBe("manual"); // audio description: only a person can check
  });

  it("exports every element as CSV, safe for spreadsheets", async () => {
    const csv = await issuesCsv(site.id);
    const [header, ...rows] = csv.trim().split("\r\n");
    expect(header).toContain('"Issue","Kind","Impact"');
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(csv).toContain('"Images must have alternative text"');
  });

  it("puts the top issue on Today with its traffic", async () => {
    const moves = await buildCandidates(productId);
    const move = moves.find((m) => m.href?.startsWith("/accessibility/issues/"));
    expect(move?.title).toBe('Fix "Images must have alternative text" on 6 pages');
    expect(move?.why).toMatch(/visits in 30 days/);
  });
});
