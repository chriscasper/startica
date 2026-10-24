import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { competitorAccounts, competitors, competitorSnapshots, products } from "@startica/db/schema";
import { runCompetitorSync } from "./accounts.ts";
import { followerGrowth, loadBenchmarks, observations, type SnapshotPoint } from "./report.ts";
import { bskyNumbers, hnNumbers, mastodonNumbers, normalizeHandle, redditNumbers } from "./sources.ts";
import { parseRedditFeed } from "../channels/reddit.ts";
import { saveIntel } from "../intel/build.ts";

const now = new Date("2026-10-21T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("handles", () => {
  it("reads handles and profile links per channel", () => {
    expect(normalizeHandle("bluesky", "@Someone.bsky.social")).toEqual({ handle: "someone.bsky.social", url: "https://bsky.app/profile/someone.bsky.social" });
    expect(normalizeHandle("bluesky", "https://bsky.app/profile/terrajot.example/post/3k")).toMatchObject({ handle: "terrajot.example" });
    expect(normalizeHandle("mastodon", "@Name@social.example")).toEqual({ handle: "name@social.example", url: "https://social.example/@Name" });
    expect(normalizeHandle("mastodon", "https://social.example/@name")).toMatchObject({ handle: "name@social.example" });
    expect(normalizeHandle("reddit", "https://www.reddit.com/user/Some_Name/")).toEqual({ handle: "some_name", url: "https://www.reddit.com/user/Some_Name" });
    expect(normalizeHandle("reddit", "u/some_name").handle).toBe("some_name");
    expect(normalizeHandle("hackernews", "https://news.ycombinator.com/user?id=CaseName")).toMatchObject({ handle: "CaseName" });
    expect(() => normalizeHandle("mastodon", "name")).toThrow(/@name@server/);
    expect(() => normalizeHandle("x", "someone")).toThrow(/X isn't benchmarked/);
  });
});

describe("source parsing", () => {
  it("Bluesky: profile counts, own posts only, engagement on top-level posts", () => {
    const post = (d: number, likes: number, extra: Partial<{ reply: unknown; did: string; repost: boolean }> = {}) => ({
      post: { author: { did: extra.did ?? "did:plc:me" }, record: { createdAt: daysAgo(d), ...(extra.reply ? { reply: {} } : {}) }, likeCount: likes, repostCount: 1, replyCount: 1, quoteCount: 0 },
      ...(extra.repost ? { reason: { $type: "app.bsky.feed.defs#reasonRepost" } } : {}),
    });
    const n = bskyNumbers(
      { did: "did:plc:me", handle: "me.bsky.social", followersCount: 120, postsCount: 40 },
      [post(1, 4), post(3, 8), post(2, 100, { did: "did:plc:other", repost: true }), post(4, 0, { reply: true }), post(10, 2)],
      now,
    );
    expect(n).toEqual({ followers: 120, totalPosts: 40, karma: null, postsLast7: 3, avgEngagement: 6.7, url: "https://bsky.app/profile/me.bsky.social" });
  });

  it("Mastodon: account counts and favourites + boosts + replies, without boosts of others", () => {
    const n = mastodonNumbers(
      { id: "1", url: "https://social.example/@me", followers_count: 50, statuses_count: 300 },
      [
        { created_at: daysAgo(1), favourites_count: 3, reblogs_count: 1, replies_count: 0 },
        { created_at: daysAgo(2), favourites_count: 9, reblogs_count: 0, replies_count: 1, in_reply_to_id: "9" },
        { created_at: daysAgo(3), reblog: {}, favourites_count: 50 },
        { created_at: daysAgo(9), favourites_count: 5, reblogs_count: 1, replies_count: 2 },
      ],
      now,
    );
    expect(n).toMatchObject({ followers: 50, totalPosts: 300, postsLast7: 2, avgEngagement: 6, url: "https://social.example/@me" });
  });

  it("Hacker News: karma, all items as posts, points + comments on stories", () => {
    const at = (d: number) => Math.floor((now.getTime() - d * 86_400_000) / 1000);
    const n = hnNumbers(
      { username: "demo", karma: 352 },
      { nbHits: 97, hits: [{ _tags: ["comment"], created_at_i: at(1), points: null }, { _tags: ["story"], created_at_i: at(2), points: 10, num_comments: 4 }, { _tags: ["story"], created_at_i: at(20), points: 2, num_comments: 0 }] },
      now,
    );
    expect(n).toEqual({ followers: null, totalPosts: 97, karma: 352, postsLast7: 2, avgEngagement: 8, url: "https://news.ycombinator.com/user?id=demo" });
  });

  it("Reddit: posting frequency only, from the overview feed", () => {
    const entry = (id: string, d: number) => `<entry><author><name>/u/demo</name></author><category term="example"/><content type="html">&lt;div class="md"&gt;&lt;p&gt;hi&lt;/p&gt;&lt;/div&gt;</content><id>${id}</id><link href="https://www.reddit.com/r/example/comments/abc/x/"/><updated>${daysAgo(d)}</updated><published>${daysAgo(d)}</published><title>Post</title></entry>`;
    const feed = `<feed>${entry("t3_a", 1)}${entry("t1_b", 2)}${entry("t3_c", 12)}</feed>`;
    expect(redditNumbers(parseRedditFeed(feed), now)).toEqual({ followers: null, totalPosts: null, karma: null, postsLast7: 2, avgEngagement: null, url: null });
  });
});

describe("observations", () => {
  const point = (p: Partial<SnapshotPoint>): SnapshotPoint => ({ day: "2026-10-21", followers: null, postsLast7: null, avgEngagement: null, karma: null, totalPosts: null, ...p });

  it("measures follower growth over about four weeks", () => {
    const series = [point({ day: "2026-09-01", followers: 10 }), point({ day: "2026-09-23", followers: 100 }), point({ day: "2026-10-21", followers: 150 })];
    expect(followerGrowth(series)).toEqual({ from: 100, to: 150, days: 28 });
    expect(followerGrowth([point({ day: "2026-10-18", followers: 1 }), point({ followers: 2 })])).toBeNull();
  });

  it("compares competitors with the owner's own account per channel", () => {
    const out = observations([
      { name: "You", own: true, channel: "bluesky", latest: point({ postsLast7: 4, avgEngagement: 9.5, followers: 468 }), followerGrowth: { from: 410, to: 468, days: 28 } },
      { name: "TerraJot", own: false, channel: "bluesky", latest: point({ postsLast7: 12, avgEngagement: 7, followers: 3060 }), followerGrowth: { from: 2950, to: 3060, days: 28 } },
      { name: "Quadrat", own: false, channel: "bluesky", latest: point({ postsLast7: 5, avgEngagement: 21, followers: 1500 }), followerGrowth: { from: 1100, to: 1500, days: 28 } },
      { name: "Quadrat", own: false, channel: "reddit", latest: point({ postsLast7: 9 }), followerGrowth: null },
    ]);
    const texts = out.map((o) => o.text);
    expect(texts).toContain("TerraJot posts 3× more often than you on Bluesky (12 vs 4 posts in the last 7 days).");
    expect(texts.some((t) => t.startsWith("Quadrat gained 400 followers on Bluesky in 4 weeks (+36%); you gained 58 (+14%)"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Quadrat's Bluesky posts get 2.2× the engagement of yours"))).toBe(true);
    expect(texts).toContain("Add your own Reddit account to compare with Quadrat.");
    // Small gaps say nothing: TerraJot's engagement is below yours but not by 1.5×.
    expect(texts.some((t) => t.includes("engagement of TerraJot's") || t.startsWith("TerraJot's"))).toBe(false);
    expect(texts).toContain("Your Bluesky followers grew faster than TerraJot's: +14% against +4% in 4 weeks.");
  });

  it("notices when the owner didn't post at all, and when the owner is ahead", () => {
    const texts = observations([
      { name: "You", own: true, channel: "mastodon", latest: point({ postsLast7: 0, avgEngagement: 8 }), followerGrowth: null },
      { name: "TerraJot", own: false, channel: "mastodon", latest: point({ postsLast7: 6, avgEngagement: 2 }), followerGrowth: null },
    ]).map((o) => o.text);
    expect(texts).toContain("TerraJot posted 6 times on Mastodon in the last 7 days; you didn't post there.");
    expect(texts).toContain("Your Mastodon posts get 4× the engagement of TerraJot's (8 vs 2 on average).");
  });
});

describe("with a database", () => {
  let workspaceId = "";
  let productId = "";

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "startica-benchmarks-"));
    openDatabase(join(dir, "test.db"));
    await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
    workspaceId = (await ensureWorkspace()).id;
    productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example" }).returning())[0]!.id;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => closeDatabase());

  it("keeps AI-written competitors with tracked accounts when Intel is rebuilt", async () => {
    const db = getDb();
    const [kept, dropped] = await db
      .insert(competitors)
      .values([
        { workspaceId, productId, name: "TerraJot", source: "ai" as const },
        { workspaceId, productId, name: "Logbook Pro", source: "ai" as const },
      ])
      .returning();
    await db.insert(competitorAccounts).values({ workspaceId, productId, competitorId: kept!.id, channel: "bluesky", handle: "terrajot.example" });
    const brief = { summary: "", category: "", audience: "", problem: "", value_props: [], differentiators: [], positioning: "", pricing_notes: "", open_questions: [] };
    const competitor = (name: string) => ({ name, url: "", positioning: "", strengths: [], weaknesses: [] });
    await saveIntel(
      { id: productId, workspaceId, name: "Fieldnote", url: null, oneLiner: null, ownerNotes: "", briefSource: "ai" } as Parameters<typeof saveIntel>[0],
      { brief, personas: [], competitors: [competitor("terrajot"), competitor("Quadrat")], keywords: [], communities: [] },
    );
    const names = (await db.select().from(competitors).where(eq(competitors.productId, productId))).map((c) => c.name).sort();
    expect(names).toEqual(["Quadrat", "TerraJot"]); // kept, not duplicated; Logbook Pro replaced
    expect(dropped).toBeDefined();
    expect(await db.select().from(competitorAccounts).where(eq(competitorAccounts.competitorId, kept!.id))).toHaveLength(1);
  });

  it("writes one snapshot a day per account and keeps errors per account", async () => {
    const db = getDb();
    await db.insert(competitorAccounts).values([
      { workspaceId, productId, competitorId: null, channel: "bluesky", handle: "fieldnote.example" },
      { workspaceId, productId, competitorId: null, channel: "mastodon", handle: "gone@social.example" },
      { workspaceId, productId, competitorId: null, channel: "x", handle: "ignored" },
    ]);
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("social.example")) return new Response("{}", { status: 404 });
        if (url.includes("getProfile")) {
          const actor = new URL(url).searchParams.get("actor")!;
          return Response.json({ did: `did:plc:${actor.split(".")[0]}`, handle: actor, followersCount: 468, postsCount: 236 });
        }
        if (url.includes("getAuthorFeed")) return Response.json({ feed: [] });
        return new Response("not found", { status: 404 });
      }),
    );
    const clock = () => now;
    const result = await runCompetitorSync({ workspaceId }, { workspaceId, productId }, { gapMs: 0, now: clock });
    expect(result).toEqual({ ok: 2, failed: 1 }); // two Bluesky accounts (TerraJot's from the test above and the owner's), the Mastodon one fails; X is never read
    expect(calls.some((c) => c.includes("x.com") || c.includes("twitter"))).toBe(false);
    await runCompetitorSync({ workspaceId }, { workspaceId, productId }, { gapMs: 0, now: clock });
    const accounts = await db.select().from(competitorAccounts).where(eq(competitorAccounts.productId, productId));
    const own = accounts.find((a) => a.handle === "fieldnote.example")!;
    expect(own.status).toBe("ok");
    expect(await db.select().from(competitorSnapshots).where(eq(competitorSnapshots.accountId, own.id))).toHaveLength(1);
    const gone = accounts.find((a) => a.channel === "mastodon")!;
    expect(gone).toMatchObject({ status: "error" });
    expect(gone.lastError).toMatch(/404/);
    expect(accounts.find((a) => a.channel === "x")!.status).toBe("untested");

    const view = await loadBenchmarks(productId, now);
    expect(view.accounts[0]!.name).toBe("You");
    expect(view.accounts.find((a) => a.handle === "terrajot.example")!.name).toBe("TerraJot");
    expect(view.channels).toEqual(["bluesky", "mastodon"]);
  });
});
