import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { competitorAccounts, competitorDigests, competitorPeople, competitorPosts, competitors, jobs, products } from "@startica/db/schema";

// AI calls come from fakes, by prompt version; every call is kept to check what went in.
type Req = { promptVersion: string; system: string; messages: { content: string }[] };
const ai = vi.hoisted(() => ({ calls: [] as { promptVersion: string; content: string }[], answers: {} as Record<string, (req: Req) => unknown> }));
vi.mock("../ai/client.ts", async (original) => ({
  ...(await original<typeof import("../ai/client.ts")>()),
  runResearch: vi.fn(async (_ctx: unknown, req: Req) => {
    ai.calls.push({ promptVersion: req.promptVersion, content: req.messages[0]!.content });
    return "Notes: Avery spoke at a meetup about offline sync (https://meetup.example/talk).";
  }),
  runStructured: vi.fn(async (_ctx: unknown, req: Req) => {
    ai.calls.push({ promptVersion: req.promptVersion, content: req.messages[0]!.content });
    return ai.answers[req.promptVersion]!(req);
  }),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));

const { allowLocalPublicFetch } = await import("../net/public-fetch.ts");
const { changeText, diffLines, meaningful, normalizePageText, readPage, resetRobotsCache } = await import("./pages.ts");
const { checkDue, loadWatchSettings, periodUpdatesPerMonth, researchDueAt, saveWatchSettings, watchEstimate } = await import("./settings.ts");
const { childPeriod, competitorCandidates, latestBriefs, localDay, markBriefSeen, nextPeriodStart, periodStart, runCompetitorDigest } = await import("./briefs.ts");
const { runCompetitorSync } = await import("../benchmarks/accounts.ts");
const { followCompanyLink, addPerson } = await import("./people.ts");
const { loadActivity } = await import("./activity.ts");

describe("pages", () => {
  it("ignores dates, times and spacing, and counts only real changes", () => {
    expect(normalizePageText("Updated 2026-10-24 at 9:15 am\n\n  Team   $19  \nPosted 3 days ago")).toBe("Updated <date> at <time>\nTeam $19\nPosted <ago>");
    expect(normalizePageText("Oct 24, 2026")).toBe(normalizePageText("Nov 2, 2026"));
    const d = diffLines("Team $19\nAgency $39 per seat a month, billed yearly", "Team $19\nAgency $49 per seat a month, billed yearly\nOffline maps on every plan");
    expect(d).toEqual({ added: ["Agency $49 per seat a month, billed yearly", "Offline maps on every plan"], removed: ["Agency $39 per seat a month, billed yearly"] });
    expect(meaningful(d)).toBe(true);
    expect(meaningful(diffLines("Hello", "Hello!"))).toBe(false);
    expect(changeText(d)).toBe("Added:\n+ Agency $49 per seat a month, billed yearly\n+ Offline maps on every plan\n\nRemoved:\n- Agency $39 per seat a month, billed yearly");
  });
});

describe("settings", () => {
  it("checks as often as set, a little early is fine, and re-research follows the profile's date", () => {
    const now = new Date("2026-10-24T12:00:00Z");
    expect(checkDue("1d", null, now)).toBe(true);
    expect(checkDue("1d", new Date("2026-10-23T12:20:00Z"), now)).toBe(true); // 23h40m: within the half hour
    expect(checkDue("1d", new Date("2026-10-24T06:00:00Z"), now)).toBe(false);
    expect(checkDue("6h", new Date("2026-10-24T06:00:00Z"), now)).toBe(true);
    expect(researchDueAt("3m", new Date("2026-07-01T00:00:00Z"))).toEqual(new Date("2026-09-30T00:00:00Z"));
    expect(researchDueAt("never", new Date("2026-07-01T00:00:00Z"))).toBeNull();
    expect(researchDueAt("3m", null)).toBeNull();
    // A month of daily reads: the day's brief at most once a read plus its final version; a year's about once.
    expect(periodUpdatesPerMonth("day", 30.4)).toBeCloseTo(60.8);
    expect(periodUpdatesPerMonth("year", 30.4)).toBeCloseTo(1.08, 1);
  });

  it("has periods that start on local midnights, weeks on Monday", () => {
    const sat = new Date(2026, 9, 24, 15, 30); // Saturday
    expect(localDay(periodStart("day", sat))).toBe("2026-10-24");
    expect(localDay(periodStart("week", sat))).toBe("2026-10-19");
    expect(localDay(periodStart("week", new Date(2026, 9, 19, 0, 5)))).toBe("2026-10-19");
    expect(localDay(periodStart("month", sat))).toBe("2026-10-01");
    expect(localDay(nextPeriodStart("month", new Date(2026, 11, 1)))).toBe("2027-01-01");
    expect(localDay(periodStart("year", sat))).toBe("2026-01-01");
    expect(childPeriod("month", ["day", "week", "month"])).toBe("week");
    expect(childPeriod("month", ["day", "month"])).toBe("day");
    expect(childPeriod("year", ["year"])).toBeNull();
  });
});

describe("with a database", () => {
  let workspaceId = "";
  let productId = "";
  let competitorId = "";
  let server: Server;
  let base = "";
  let pricing = "<html><head><title>TerraJot pricing</title></head><body><main><h1>Pricing</h1><p>Team: $19 per seat a month, up to 10 seats.</p><p>Agency: $39 per seat a month, billed yearly.</p></main></body></html>";
  let robots = "User-agent: *\nDisallow: /private";

  beforeAll(async () => {
    openDatabase(join(mkdtempSync(join(tmpdir(), "startica-briefs-")), "test.db"));
    await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
    workspaceId = (await ensureWorkspace()).id;
    productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example" }).returning())[0]!.id;
    competitorId = (await getDb().insert(competitors).values({ workspaceId, productId, name: "TerraJot", url: "https://terrajot.example", source: "owner" }).returning())[0]!.id;
    server = createServer((req, res) => {
      if (req.url === "/robots.txt") return res.writeHead(200, { "content-type": "text/plain" }).end(robots);
      if (req.url === "/pricing" || req.url === "/private") return res.writeHead(200, { "content-type": "text/html" }).end(pricing);
      if (req.url === "/blog") return res.writeHead(200, { "content-type": "text/html" }).end("<html><head><title>Blog</title></head><body><main><p>Our blog has no feed, but this text is long enough to read as a page about our product.</p></main></body></html>");
      res.writeHead(404).end("no");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    allowLocalPublicFetch(true);
  });
  afterAll(() => {
    allowLocalPublicFetch(false);
    server.close();
    closeDatabase();
  });

  const posts = (accountId: string) => getDb().select().from(competitorPosts).where(eq(competitorPosts.accountId, accountId));
  const account = async (id: string) => (await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.id, id)))[0]!;

  it("reads pages only where robots.txt allows", async () => {
    await expect(readPage(`${base}/private`)).rejects.toThrow(/robots\.txt/);
    expect((await readPage(`${base}/pricing`)).text).toContain("Agency: $39");
    robots = "";
    resetRobotsCache();
  });

  it("watches a page: the first read is the baseline, a real change becomes a post, and a blog without a feed becomes a page", async () => {
    const pageId = await followCompanyLink(workspaceId, competitorId, `${base}/pricing`);
    const blogId = await followCompanyLink(workspaceId, competitorId, `${base}/blog`);
    expect([(await account(pageId)).channel, (await account(blogId)).channel]).toEqual(["page", "rss"]);
    const t0 = new Date("2026-10-23T05:23:00");
    await runCompetitorSync({ workspaceId }, { workspaceId, productId }, { gapMs: 0, now: () => t0 });
    expect(await posts(pageId)).toEqual([]);
    expect(await account(blogId)).toMatchObject({ channel: "page", status: "ok" });

    pricing = pricing.replace("$39", "$49").replace("</main>", "<p>Offline maps are now included on every plan.</p></main>");
    const t1 = new Date("2026-10-24T05:23:00");
    await runCompetitorSync({ workspaceId }, { workspaceId, productId }, { gapMs: 0, now: () => t1 });
    // Stored as found at the read's time (rows are stamped with the real clock otherwise).
    await getDb().update(competitorPosts).set({ createdAt: t1 });
    const [change] = await posts(pageId);
    expect(change).toMatchObject({ kind: "change", title: "Changed: TerraJot pricing", seenAt: null });
    expect(change!.text).toMatch(/\+ Agency: \$49/);
    expect(change!.text).toMatch(/- Agency: \$39/);
    // A read queues the briefs once.
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "competitor_digest"))).length).toBe(1);
    await getDb().delete(jobs);
  });

  it("skips the hourly read until the product's interval has passed", async () => {
    const t = new Date("2026-10-24T09:23:00");
    expect(await runCompetitorSync({ workspaceId }, { workspaceId }, { gapMs: 0, now: () => t })).toEqual({ skipped: "nothing due" });
    await saveWatchSettings(productId, { checkEvery: "6h" });
    expect(await runCompetitorSync({ workspaceId }, { workspaceId }, { gapMs: 0, now: () => new Date("2026-10-24T11:23:00") })).toMatchObject({ ok: 2 });
    await saveWatchSettings(productId, {});
    await getDb().delete(jobs);
  });

  it("estimates the monthly cost from what's followed", async () => {
    const settings = await loadWatchSettings(productId);
    expect(settings).toEqual({ periods: ["day", "week", "month", "year"], checkEvery: "1d", researchEvery: "never" });
    const e = await watchEstimate(workspaceId, productId, settings);
    expect(e.counts).toMatchObject({ links: 2, searchLinks: 0, people: 0, researched: 0 });
    expect(e.lines.map((l) => l.label)).toEqual(["Link briefs (2 links)", "Relevance of new posts", "Daily briefs", "Weekly briefs", "Monthly briefs", "Yearly briefs"]);
    expect(e.monthlyUsd).toBeGreaterThan(0);
    expect(e.monthlyUsd).toBeLessThan(5);
  });

  it("scores relevance, writes link and person briefs (LinkedIn from web search), and keeps only links it was given", async () => {
    await addPerson(workspaceId, competitorId, { name: "Avery Example", role: "CEO", links: "https://www.linkedin.com/in/avery-example" });
    ai.answers = {
      "competitor-relevance@1": () => ({ items: [{ n: 0, relevance: "high", why: "A price rise." }] }),
      "link-brief@1": (req) => ({
        summary: req.messages[0]!.content.includes("web_search_notes") ? "Avery's LinkedIn." : "TerraJot's pricing page.",
        covers: ["Plans", " "],
        recent: [],
        last_change: "",
        urls: [`${base}/pricing`, "https://meetup.example/talk", "https://made-up.example"],
      }),
      "person-brief@1": () => ({ summary: "TerraJot's CEO.", topics: ["Offline sync"], hints: [], activity: "Speaks at meetups.", urls: ["https://meetup.example/talk", "https://made-up.example"] }),
      "competitor-brief@1": () => ({ headline: "TerraJot raised its Agency price.", items: [{ competitor: "TerraJot", what: "Agency is $49.", why_it_matters: "Small crews look elsewhere.", urls: [`${base}/pricing`, "https://made-up.example"] }], suggestions: ["Compare prices"], quiet: [], since_last: [] }),
    };
    const now = new Date("2026-10-24T12:00:00");
    const r = await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => now });
    expect((r as Record<string, unknown>)[productId]).toMatchObject({ scored: 1, links: 3, people: 1 });

    const accounts = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.productId, productId));
    const pageBrief = accounts.find((a) => a.handle === `${base}/pricing`)!.brief;
    expect(pageBrief).toEqual({ summary: "TerraJot's pricing page.", covers: ["Plans"], recent: [], lastChange: "", from: "read", urls: [`${base}/pricing`] });
    expect(accounts.find((a) => a.channel === "search")!.brief).toMatchObject({ from: "web_search", urls: ["https://meetup.example/talk"] });
    expect(ai.calls.find((c) => c.promptVersion === "link-search@1")!.content).toContain("linkedin.com/in/avery-example");
    const [person] = await getDb().select().from(competitorPeople).where(eq(competitorPeople.name, "Avery Example"));
    expect(person!.brief).toMatchObject({ summary: "TerraJot's CEO.", urls: ["https://meetup.example/talk"] });
    expect((await loadActivity(productId))[0]).toMatchObject({ relevance: "high", relevanceWhy: "A price rise." });

    // Period briefs: today's from the posts, the week's, month's and year's from the shorter ones.
    const latest = await latestBriefs(productId);
    expect(Object.keys(latest).sort()).toEqual(["day", "month", "week", "year"]);
    expect(latest.day).toMatchObject({ periodStart: "2026-10-24", closed: false, digest: { items: [{ urls: [`${base}/pricing`] }], sinceLast: [] } });
    const weekCall = ai.calls.filter((c) => c.promptVersion === "competitor-brief@1")[1]!;
    expect(weekCall.content).toContain('<brief period="day" start="2026-10-24">');

    // Nothing new: nothing rewritten, and nothing again for links within a day.
    ai.calls = [];
    await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => new Date("2026-10-24T13:00:00") });
    expect(ai.calls).toEqual([]);
  });

  it("rewrites the current brief when something new arrives, marks it unread again, and closes the day when it ends", async () => {
    const day = (await latestBriefs(productId)).day!;
    await markBriefSeen(workspaceId, day.id);
    expect(await competitorCandidates(productId, new Date("2026-10-24T14:00:00"))).toMatchObject([{ title: "Read this week's competitor brief" }]);
    for (const p of ["week", "month", "year"] as const) await markBriefSeen(workspaceId, (await latestBriefs(productId))[p]!.id);

    const [pageAccount] = await getDb().select().from(competitorAccounts).where(and(eq(competitorAccounts.productId, productId), eq(competitorAccounts.handle, `${base}/pricing`)));
    await getDb().insert(competitorPosts).values({ workspaceId, productId, accountId: pageAccount!.id, externalId: "change:2", url: `${base}/pricing`, title: "Changed: TerraJot pricing", text: "Added:\n+ A free plan", kind: "change", postedAt: new Date("2026-10-24T15:00:00"), createdAt: new Date("2026-10-24T15:00:00"), relevance: "high" });
    ai.answers["competitor-brief@1"] = () => ({ headline: "TerraJot added a free plan.", items: [], suggestions: [], quiet: [], since_last: ["A free plan"] });
    ai.calls = [];
    await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => new Date("2026-10-24T16:00:00") });
    expect(ai.calls.filter((c) => c.promptVersion === "competitor-brief@1")).toHaveLength(1); // the week waits 20 hours
    expect(ai.calls.at(-1)!.content).toContain("<previous_version");
    expect((await latestBriefs(productId)).day).toMatchObject({ seenAt: null, digest: { headline: "TerraJot added a free plan.", sinceLast: ["A free plan"] } });
    expect(await competitorCandidates(productId, new Date("2026-10-24T16:00:00"))).toMatchObject([{ title: "Read today's competitor brief", href: "/intel?tab=following&brief=day" }]);

    // The next morning: yesterday's day is closed (nothing new since its last version, so no call for it).
    ai.calls = [];
    await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => new Date("2026-10-25T08:00:00") });
    const yesterday = await getDb().select().from(competitorDigests).where(and(eq(competitorDigests.period, "day"), eq(competitorDigests.periodStart, "2026-10-24")));
    expect(yesterday).toMatchObject([{ closed: true }]);
    expect(ai.calls.filter((c) => c.content.includes('<activity period="day" since="2026-10-24"'))).toEqual([]);
  });

  it("updates on request, even with nothing new, and says when a period is off", async () => {
    ai.calls = [];
    await runCompetitorDigest({ workspaceId }, { workspaceId, productId, period: "week" }, { now: () => new Date("2026-10-25T09:00:00") });
    expect(ai.calls.filter((c) => c.content.includes('<activity period="week"'))).toHaveLength(1);
    await saveWatchSettings(productId, { periods: ["week"] });
    await expect(runCompetitorDigest({ workspaceId }, { workspaceId, productId, period: "day" })).rejects.toThrow(/switched off/);
    await saveWatchSettings(productId, {});
  });

  it("researches a competitor again only when switched on, once it's due", async () => {
    await getDb().update(competitors).set({ profiledAt: new Date("2026-07-01T00:00:00"), profileStatus: "ready" }).where(eq(competitors.id, competitorId));
    expect(((await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => new Date("2026-10-25T10:00:00") })) as Record<string, unknown>)[productId]).not.toHaveProperty("research"); // off by default
    await saveWatchSettings(productId, { researchEvery: "3m" });
    const r = await runCompetitorDigest({ workspaceId }, { workspaceId, productId }, { now: () => new Date("2026-10-25T10:00:00") });
    expect((r as Record<string, Record<string, unknown>>)[productId]!.research).toMatch(/^TerraJot \(every quarter; about \$0\.30 to \$0\.80\)$/);
    expect((await getDb().select().from(jobs).where(eq(jobs.queue, "competitor_research"))).length).toBe(1);
  });
});
