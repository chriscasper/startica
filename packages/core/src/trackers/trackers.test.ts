import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, a11yOccurrences, issueTrackers, products, securityFindings, sitePages, sites, trackerIssues } from "@startica/db/schema";
import { fileKeyCipher, setCipher } from "@startica/db/secrets";
import { a11yIssueText, createIssueForGroup, runTrackerSync, saveTracker, trackerBaseUrl, trackerInput } from "./trackers.ts";
// @ts-expect-error plain JS helper shared with the smoke test
import { startTrackerStandin, STANDIN_TOKEN } from "./standin.mjs";

let api: { url: string; issues: Map<string, { title: string; body: string; labels: string[]; state: string; comments: string[] }>; close: () => Promise<void> };
let workspaceId = "";
let productId = "";
let siteId = "";
let pageId = "";

async function group(rule: string, impact: "critical" | "serious" | "moderate" | "minor", pages = 1) {
  const [g] = await getDb()
    .insert(a11yIssueGroups)
    .values({ workspaceId, siteId, ruleId: rule, fingerprint: `${rule}-${impact}`, impact, help: `${rule} help`, description: "desc", helpUrl: "https://dequeuniversity.com/rules/axe/4.14/x", criteria: ["1.1.1"], level: "A", pagesCount: pages, occurrencesCount: pages })
    .returning();
  await getDb().insert(a11yOccurrences).values({ workspaceId, pageId, groupId: g!.id, selector: "header > a > img", html: '<img src="/logo.svg">', failureSummary: "Fix any of the following:\n  Element does not have an alt attribute" });
  return g!;
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-trackers-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  api = await startTrackerStandin(0);
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning())[0]!.id;
  siteId = (await getDb().insert(sites).values({ workspaceId, productId, name: "fieldnote.example", startUrl: "https://fieldnote.example/", ownershipConfirmedAt: new Date() }).returning())[0]!.id;
  pageId = (await getDb().insert(sitePages).values({ workspaceId, siteId, url: "https://fieldnote.example/pricing", state: "done" }).returning())[0]!.id;
});
afterAll(async () => {
  await api.close();
  closeDatabase();
});

describe("issue trackers", () => {
  it("only talks to https servers, or http on this computer or network", () => {
    expect(trackerBaseUrl("github", "")).toBe("https://api.github.com");
    expect(trackerBaseUrl("gitlab", "https://gitlab.fieldnote.example/")).toBe("https://gitlab.fieldnote.example");
    expect(trackerBaseUrl("gitlab", "http://localhost:8080")).toBe("http://localhost:8080");
    expect(() => trackerBaseUrl("gitlab", "http://gitlab.fieldnote.example")).toThrow(/https/);
    expect(trackerInput.parse({ provider: "github", repo: "https://github.com/fieldnote/web.git" }).repo).toBe("fieldnote/web");
  });

  it("refuses a bad token and records the error", async () => {
    await expect(saveTracker(workspaceId, productId, trackerInput.parse({ provider: "github", base_url: api.url, repo: "fieldnote/web", token: "wrong" }))).rejects.toThrow(/token is invalid/);
    const [t] = await getDb().select().from(issueTrackers);
    expect(t!.status).toBe("error");
  });

  it("opens one issue per finding by hand, with where it fails and how to fix it", async () => {
    await saveTracker(workspaceId, productId, trackerInput.parse({ provider: "github", base_url: api.url, repo: "fieldnote/web", token: STANDIN_TOKEN, labels: "accessibility, a11y" }));
    const g = await group("image-alt", "critical", 3);
    const first = await createIssueForGroup(g.id);
    const again = await createIssueForGroup(g.id);
    expect(again).toMatchObject({ url: first.url, existed: true }); // no duplicate
    const issue = api.issues.get(`github:fieldnote/web#${first.number}`)!;
    expect(issue.title).toBe("Accessibility: image-alt help (3 pages)");
    expect(issue.labels).toEqual(["accessibility", "a11y"]);
    expect(issue.body).toContain("https://fieldnote.example/pricing");
    expect(issue.body).toContain("<!-- startica:a11y:");
    expect(issue.body).toMatch(/cover only part of WCAG/);
  });

  it("after a scan: opens issues at or above the chosen impact, closes fixed ones and reopens them if they come back", async () => {
    await saveTracker(workspaceId, productId, trackerInput.parse({ provider: "github", base_url: api.url, repo: "fieldnote/web", auto_min_impact: "serious", close_when_fixed: "on" }));
    const serious = await group("color-contrast", "serious");
    const minor = await group("region", "minor");
    const result = await runTrackerSync({ workspaceId }, { workspaceId, productId });
    expect(result).toMatchObject({ created: 1, closed: 0 });
    const opened = await getDb().select().from(trackerIssues).where(eq(trackerIssues.sourceId, serious.id));
    expect(opened).toHaveLength(1);
    expect(await getDb().select().from(trackerIssues).where(eq(trackerIssues.sourceId, minor.id))).toHaveLength(0);

    await getDb().update(a11yIssueGroups).set({ status: "fixed" }).where(eq(a11yIssueGroups.id, serious.id));
    expect(await runTrackerSync({ workspaceId }, { workspaceId, productId })).toMatchObject({ closed: 1 });
    expect(api.issues.get(`github:fieldnote/web#${opened[0]!.number}`)!.state).toBe("closed");

    await getDb().update(a11yIssueGroups).set({ status: "open" }).where(eq(a11yIssueGroups.id, serious.id));
    expect(await runTrackerSync({ workspaceId }, { workspaceId, productId })).toMatchObject({ reopened: 1 });
    const back = api.issues.get(`github:fieldnote/web#${opened[0]!.number}`)!;
    expect(back.state).toBe("open");
    expect(back.comments.at(-1)).toMatch(/found this problem again/);
  });

  it("opens security issues at or above the chosen severity, never for imported findings, and closes fixed ones", async () => {
    await saveTracker(workspaceId, productId, trackerInput.parse({ provider: "github", base_url: api.url, repo: "fieldnote/web", auto_min_security: "high", close_when_fixed: "on" }));
    const now = new Date();
    const finding = async (groupKey: string, rule: string, severity: "critical" | "high" | "medium" | "low", source: "scan" | "monitor" | "import" = "scan") =>
      (await getDb().insert(securityFindings).values({ workspaceId, siteId, groupKey, rule, severity, source, status: "open", firstSeenAt: now, lastSeenAt: now, detail: {} }).returning())[0]!;
    const takeover = await finding("takeover:old-shop.fieldnote.example", "subdomain-takeover", "high", "monitor");
    await finding("csp-missing", "csp-missing", "medium");
    await finding("import:abc", "imported", "critical", "import");
    const before = (await getDb().select().from(trackerIssues)).length;
    await runTrackerSync({ workspaceId }, { workspaceId, productId });
    const security = await getDb().select().from(trackerIssues).where(eq(trackerIssues.sourceKind, "security"));
    expect(security.map((i) => i.sourceId)).toEqual([takeover.id]);
    expect((await getDb().select().from(trackerIssues)).length).toBe(before + 1);
    const issue = api.issues.get(`github:fieldnote/web#${security[0]!.number}`)!;
    expect(issue.title).toBe("Security: Subdomain points to a service that no longer exists");
    expect(issue.labels).toEqual(["security"]);

    await getDb().update(securityFindings).set({ status: "fixed" }).where(eq(securityFindings.id, takeover.id));
    await runTrackerSync({ workspaceId }, { workspaceId, productId });
    expect(api.issues.get(`github:fieldnote/web#${security[0]!.number}`)!.state).toBe("closed");
  });

  it("forgets the issues it opened when the tracker points at another repository", async () => {
    expect((await getDb().select().from(trackerIssues)).length).toBeGreaterThan(0);
    await saveTracker(workspaceId, productId, trackerInput.parse({ provider: "github", base_url: api.url, repo: "fieldnote/website", close_when_fixed: "on" }));
    expect(await getDb().select().from(trackerIssues)).toEqual([]);
  });

  it("works the same on GitLab", async () => {
    await getDb().delete(issueTrackers);
    await saveTracker(workspaceId, productId, trackerInput.parse({ provider: "gitlab", base_url: api.url, repo: "fieldnote/apps/web", token: STANDIN_TOKEN }));
    const g = await group("label", "critical");
    const created = await createIssueForGroup(g.id);
    expect(created.url).toContain("/fieldnote/apps/web/-/issues/");
    expect(api.issues.get(`gitlab:fieldnote/apps/web#${created.number}`)!.labels).toEqual(["accessibility"]);
  });

  it("writes a fence that a snippet can't break out of", async () => {
    const [g] = await getDb().select().from(a11yIssueGroups).limit(1);
    const text = await a11yIssueText(g!, ["accessibility"], new Date("2026-10-10T00:00:00Z"));
    expect(text.body).toContain("````html");
    expect(text.body).toContain("on 2026-10-10");
  });
});
