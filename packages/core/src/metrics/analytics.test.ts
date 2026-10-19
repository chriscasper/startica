import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, lt, min } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { analyticsSummaries, jobs, metricsSnapshots } from "@startica/db/schema";

// The weekly summary calls the AI; the test answers with a fixed output and checks what's sent and stored.
const ai = vi.hoisted(() => ({ next: [] as unknown[], calls: [] as { task: string; promptVersion: string; content: string }[] }));
vi.mock("../ai/client.ts", () => ({
  runStructured: vi.fn(async (_ctx: unknown, req: { task: string; promptVersion: string; messages: { content: string }[] }) => {
    ai.calls.push({ task: req.task, promptVersion: req.promptVersion, content: req.messages[0]!.content });
    const out = ai.next.shift();
    if (out instanceof Error) throw out;
    return out;
  }),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));

const { seedDemo } = await import("../demo/seed.ts");
const { buildCandidates } = await import("../growth/moves.ts");
const { channelGroup } = await import("./channels.ts");
const { countryDimension, deviceDimension, topPerDay } = await import("./ga4.ts");
const { historyDays, localDayBefore, pruneMetrics, setHistoryDays, syncWindow } = await import("./history.ts");
const { daysOf, highlights, loadAnalyticsReport, periodsFor, rangesFor } = await import("./report.ts");
const { summarizeSubscriptions } = await import("./stripe.ts");
const { latestReadySummary, reportText, requestAnalyticsSummary, runAnalyticsSummary, SUMMARY_PROMPT_VERSION } = await import("./summary.ts");

let workspaceId = "";
let productId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-analytics-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId, productId } = await seedDemo());
}, 30_000);
afterAll(() => closeDatabase());

describe("history", () => {
  it("reads the whole history once, then the last few days", () => {
    const now = new Date(2026, 9, 19, 9);
    expect(syncWindow(null, 90, now)).toEqual({ from: "2026-07-22", days: 90, full: true });
    expect(syncWindow("2026-07-22", 90, now)).toEqual({ from: "2026-10-15", days: 5, full: false });
    // A longer history than the connection has read: read it all again.
    expect(syncWindow("2026-07-22", 486, now).full).toBe(true);
  });

  it("keeps 90 days unless the owner picks more, and drops synced rows past it", async () => {
    expect(await historyDays(productId)).toBe(90);
    await expect(setHistoryDays(productId, 100)).rejects.toThrow(/history lengths/);
    await setHistoryDays(productId, 486);
    expect(await historyDays(productId)).toBe(486);
    expect(rangesFor(486).map((r) => r.days)).toEqual([7, 30, 90, 180, 365, 486]);
    expect(rangesFor(90).map((r) => r.days)).toEqual([7, 30, 90]);
    await setHistoryDays(productId, 90);

    const db = getDb();
    const old = localDayBefore(new Date(), 200);
    await db.insert(metricsSnapshots).values([
      { workspaceId, productId, day: old, source: "ga4", metric: "sessions", value: 5 },
      { workspaceId, productId, day: old, source: "manual", metric: "waitlist", value: 5 },
    ]);
    await pruneMetrics(productId, 90);
    const left = await db.select({ source: metricsSnapshots.source }).from(metricsSnapshots).where(and(eq(metricsSnapshots.productId, productId), lt(metricsSnapshots.day, localDayBefore(new Date(), 89))));
    expect(left.map((r) => r.source)).toEqual(["manual"]);
  });
});

describe("splits", () => {
  it("groups sources into channels", () => {
    expect(channelGroup("google", "organic")).toBe("Organic search");
    expect(channelGroup("chatgpt.com", "referral")).toBe("AI assistants");
    expect(channelGroup("gemini.google.com", "ai-assistant")).toBe("AI assistants");
    expect(channelGroup("reddit", "community")).toBe("Communities");
    expect(channelGroup("news.ycombinator.com", "referral")).toBe("Communities");
    expect(channelGroup("old.reddit.com", "referral")).toBe("Communities");
    expect(channelGroup("t.co", "referral")).toBe("Social");
    expect(channelGroup("linkedin", "social")).toBe("Social");
    expect(channelGroup("newsletter", "email")).toBe("Email");
    expect(channelGroup("google", "paid")).toBe("Paid");
    expect(channelGroup("google", "cpc")).toBe("Paid");
    expect(channelGroup("(direct)", "(none)")).toBe("Direct");
    expect(channelGroup("blog.example.com", "referral")).toBe("Referral");
  });

  it("names countries and devices the same way for GA4 and Umami, and keeps the top values per day", () => {
    expect(countryDimension("us")).toBe("country:US");
    expect(countryDimension("(not set)")).toBeNull();
    expect(deviceDimension("laptop")).toBe("device:desktop");
    expect(deviceDimension("mobile")).toBe("device:mobile");
    const rows = [5, 9, 1, 7].map((value, i) => ({ day: "2026-10-01", metric: "sessions", dimension: `page:/p${i}`, value }));
    const other = { day: "2026-10-02", metric: "sessions", dimension: "page:/x", value: 1 };
    expect(topPerDay([...rows, other], 2).map((r) => r.dimension).sort()).toEqual(["page:/p1", "page:/p3", "page:/x"]);
  });
});

describe("stripe history", () => {
  it("rebuilds subscriptions, trials and MRR per day, with MRR movement and revenue", () => {
    const ts = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
    const item = (amount: number) => ({ data: [{ quantity: 1, price: { unit_amount: amount, recurring: { interval: "month", interval_count: 1 } } }] });
    const now = new Date("2026-10-09T12:00:00Z");
    const rows = summarizeSubscriptions(
      [
        { status: "active", created: ts("2026-10-01T09:00:00Z"), canceled_at: null, items: item(1000) },
        { status: "canceled", created: ts("2026-09-20T09:00:00Z"), canceled_at: ts("2026-10-03T08:00:00Z"), ended_at: ts("2026-10-05T08:00:00Z"), items: item(2000) },
        { status: "trialing", created: ts("2026-10-07T09:00:00Z"), canceled_at: null, trial_start: ts("2026-10-07T09:00:00Z"), trial_end: ts("2026-10-21T09:00:00Z"), items: item(500) },
        { status: "incomplete_expired", created: ts("2026-10-02T09:00:00Z"), canceled_at: null, items: item(9900) },
      ],
      now,
      10,
      [{ amount_paid: 1000, created: ts("2026-10-01T09:00:00Z"), status_transitions: { paid_at: ts("2026-10-01T09:05:00Z") } }],
    );
    const get = (metric: string, day: string) => rows.find((r) => r.metric === metric && r.day === day)?.value;
    expect(get("active_subscriptions", "2026-09-30")).toBe(1);
    expect(get("active_subscriptions", "2026-10-02")).toBe(2);
    expect(get("mrr", "2026-10-02")).toBe(30);
    expect(get("mrr", "2026-10-05")).toBe(10); // the canceled one ended that morning
    expect(get("trials", "2026-10-08")).toBe(1);
    expect(get("active_subscriptions", "2026-10-09")).toBe(2); // today: current status
    expect(get("mrr_new", "2026-10-01")).toBe(10);
    expect(get("mrr_churned", "2026-10-05")).toBe(20);
    expect(get("cancellations", "2026-10-03")).toBe(1);
    expect(get("new_subscriptions", "2026-10-02")).toBe(0); // never started
    expect(get("revenue", "2026-10-01")).toBe(10);
  });
});

describe("report", () => {
  it("lays out periods as local days", () => {
    const p = periodsFor(7, new Date(2026, 9, 19, 9));
    expect(p.current).toEqual({ start: "2026-10-13", end: "2026-10-19", days: 7 });
    expect(p.previous).toEqual({ start: "2026-10-06", end: "2026-10-12", days: 7 });
    expect(daysOf(p.current)).toHaveLength(7);
  });

  it("fills every tab from the demo product, compared with the period before", async () => {
    const r = await loadAnalyticsReport(productId, 30);
    expect(r.previousComplete).toBe(true);
    expect(r.traffic.sessions.now).toBeGreaterThan(r.traffic.sessions.before!);
    expect(r.traffic.sessionsSeries).toHaveLength(30);
    expect(r.traffic.sessionsSeries!.every((p) => p.before != null)).toBe(true);
    const groups = r.traffic.channels.map((c) => c.group);
    expect(groups).toEqual(expect.arrayContaining(["Organic search", "Communities", "Direct", "AI assistants", "Social", "Email"]));
    expect(r.traffic.channels.find((c) => c.group === "Communities")!.sources.map((s) => s.key).sort()).toEqual(["news.ycombinator.com / referral", "reddit / community"]);
    expect(r.traffic.aiAssistants.map((a) => a.name).sort()).toEqual(["ChatGPT", "Claude", "Perplexity"]);
    expect(r.traffic.countries[0]).toMatchObject({ key: "US", label: "United States" });
    expect(r.traffic.devices.map((d) => d.label)).toEqual(["Desktop", "Mobile", "Tablet"]);
    expect(r.traffic.landing[0]!.engaged).toBeGreaterThan(0);
    expect(r.traffic.engagedRate!.now).toBeGreaterThan(0.3);
    expect(r.conversions.events.map((e) => e.key)).toEqual(["sign_up", "start_trial"]);
    expect(r.conversions.signups!.now).toBeGreaterThan(0);
    expect(r.revenue.mrr.now).toBe(r.revenue.activeSubs.now * 24);
    expect(r.revenue.mrrSeries).toHaveLength(30);
    expect(r.product.other.map((m) => m.metric)).toEqual(["field_notes_created"]);
    expect(r.funnel.map((s) => s.label)).toEqual(["Visits", "Key events", "Signups", "New subscriptions"]);
    expect(r.startica.places.length).toBeGreaterThan(0);
    expect(r.startica.fromPosts.visits).toBeGreaterThan(0);
  });

  it("doesn't compare with a period the data doesn't cover", async () => {
    const r = await loadAnalyticsReport(productId, 90);
    expect(r.previousComplete).toBe(false);
    expect(r.traffic.sessions.before).toBeNull();
    // Stripe's history doesn't reach that far either.
    expect(r.revenue.newSubs.before).toBeNull();
  });

  it("says what changed in plain sentences, strongest first", async () => {
    const week = await loadAnalyticsReport(productId, 7, new Date(Date.now() - 7 * 86400_000));
    // The week of the Hacker News spike: visits up, mostly from Communities, and a landing page that loses people.
    expect(week.highlights[0]!.text).toMatch(/^Visits up \d+% on the period before .*most of it from Communities/);
    expect(week.highlights.some((h) => /\/blog\/offline-field-kit: .* only \d+% stayed engaged/.test(h.text))).toBe(true);
    // A quiet period says nothing.
    const quiet = { ...week, traffic: { ...week.traffic, sessions: { now: 100, before: 98 } } };
    expect(highlights(quiet).some((h) => h.text.startsWith("Visits"))).toBe(false);
  });
});

describe("weekly summary", () => {
  const answer = {
    headline: "Reddit brought the visitors who signed up.",
    summary: "Visits grew, led by Communities.",
    wins: ["Communities converted at 4.5%."],
    concerns: [],
    tryNext: [{ title: "Reply in two more r/fieldwork threads", why: "They convert best." }],
  };

  it("sends the numbers, not guesses, and stores the read-out", async () => {
    const week = await loadAnalyticsReport(productId, 7);
    const month = await loadAnalyticsReport(productId, 30);
    const text = reportText(week, month);
    expect(text).toMatch(/Visits: [\d,]+ \(before: [\d,]+\)/);
    expect(text).toMatch(/By channel: .*Communities/);
    expect(text).toMatch(/MRR: \$[\d,]+/);

    await getDb().delete(analyticsSummaries);
    await requestAnalyticsSummary(workspaceId, productId);
    await expect(requestAnalyticsSummary(workspaceId, productId)).rejects.toThrow(/Already/);
    await getDb().delete(jobs);
    ai.next.push(answer);
    await runAnalyticsSummary({ workspaceId }, { workspaceId, productId });
    const call = ai.calls.at(-1)!;
    expect(call.promptVersion).toBe(SUMMARY_PROMPT_VERSION);
    expect(call.content).toMatch(/<product>[\s\S]*Fieldnote[\s\S]*<numbers>/);
    const saved = await latestReadySummary(productId);
    expect(saved?.body.headline).toBe(answer.headline);
    expect(saved?.model).toBe("claude-sonnet-5-5");
    // The week ends yesterday: today is still filling in.
    expect(saved?.periodEnd).toBe(localDayBefore(new Date(), 1));
  });

  it("runs once a week on schedule, and shows its first suggestion on Today", async () => {
    const calls = ai.calls.length;
    expect(await runAnalyticsSummary({ workspaceId }, { workspaceId })).toEqual({ [productId]: "already summarized" });
    expect(ai.calls.length).toBe(calls);
    const moves = await buildCandidates(productId);
    expect(moves.find((m) => m.kind === "analytics")).toMatchObject({ title: answer.tryNext[0]!.title, href: "/analytics" });
  });

  it("records a failure and keeps the last good read-out", async () => {
    ai.next.push(new Error("The AI provider is overloaded"));
    await expect(runAnalyticsSummary({ workspaceId }, { workspaceId, productId })).rejects.toThrow(/overloaded/);
    const [failed] = await getDb().select().from(analyticsSummaries).where(eq(analyticsSummaries.status, "failed"));
    expect(failed?.error).toMatch(/overloaded/);
    expect((await latestReadySummary(productId))?.body.headline).toBe(answer.headline);
  });
});

describe("demo", () => {
  it("seeds 90 days", async () => {
    const [row] = await getDb().select({ oldest: min(metricsSnapshots.day) }).from(metricsSnapshots).where(and(eq(metricsSnapshots.productId, productId), eq(metricsSnapshots.source, "ga4")));
    expect(row?.oldest).toBe(localDayBefore(new Date(), 89));
  });
});
