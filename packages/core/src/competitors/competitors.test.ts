import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { competitorAccounts, competitorPeople, competitorPosts, competitors, competitorSnapshots, products } from "@startica/db/schema";

// AI calls come from fakes: research notes, then the structured profile or digest.
const ai = vi.hoisted(() => ({ notes: "Notes.", structured: null as unknown, calls: [] as { system: string; content: string }[] }));
vi.mock("../ai/client.ts", () => ({
  runResearch: vi.fn(async (_ctx: unknown, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ system: req.system, content: req.messages[0]!.content });
    return ai.notes;
  }),
  runStructured: vi.fn(async (_ctx: unknown, req: { system: string; messages: { content: string }[] }) => {
    ai.calls.push({ system: req.system, content: req.messages[0]!.content });
    return ai.structured;
  }),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));

const { discoverFeed, fetchFeedPosts, looksLikeFeed, parseFeed } = await import("./feeds.ts");
const { allowLocalPublicFetch } = await import("../net/public-fetch.ts");
const { bskyPosts, hnPosts, mastodonPosts, normalizeHandle, redditPosts } = await import("../benchmarks/sources.ts");
const { parseRedditFeed } = await import("../channels/reddit.ts");
const { runCompetitorSync, storePosts } = await import("../benchmarks/accounts.ts");
const { loadBenchmarks } = await import("../benchmarks/report.ts");
const { runCompetitorResearch } = await import("./research.ts");
const { addPerson, followCompanyLink, followPerson, ignorePerson, linkKind, parseLinks, updatePerson } = await import("./people.ts");
const { loadActivity, unseenCounts } = await import("./activity.ts");
const { competitorCandidates } = await import("./briefs.ts");

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>TerraJot blog</title>
<item><title>Offline maps are here</title><link>https://terrajot.example/blog/offline</link><guid>tj-1</guid><pubDate>Tue, 20 Oct 2026 09:00:00 GMT</pubDate><description><![CDATA[<p>Download a region &amp; go.</p>]]></description></item>
<item><title>No link</title></item>
</channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Notes</title>
<entry><id>urn:1</id><title>Pricing update</title><link rel="alternate" href="/posts/pricing"/><published>2026-10-19T08:00:00Z</published><summary>Pro is now $8.</summary></entry>
</feed>`;

describe("feeds", () => {
  it("reads RSS and Atom, skipping entries without a link", () => {
    expect(looksLikeFeed(RSS)).toBe(true);
    expect(looksLikeFeed("<!doctype html><html></html>")).toBe(false);
    expect(parseFeed(RSS)).toEqual([{ externalId: "tj-1", url: "https://terrajot.example/blog/offline", title: "Offline maps are here", text: "Download a region & go.", postedAt: new Date("2026-10-20T09:00:00Z") }]);
    expect(parseFeed(ATOM, "https://notes.example/")).toEqual([{ externalId: "urn:1", url: "https://notes.example/posts/pricing", title: "Pricing update", text: "Pro is now $8.", postedAt: new Date("2026-10-19T08:00:00Z") }]);
  });

  it("finds the feed a page points to", () => {
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="alternate" hreflang="de" href="/de"></head></html>`;
    expect(discoverFeed(html, "https://terrajot.example/blog")).toBe("https://terrajot.example/feed.xml");
    expect(discoverFeed("<html></html>", "https://terrajot.example/")).toBeNull();
  });

  it("takes a blog's address as the handle", () => {
    expect(normalizeHandle("rss", "terrajot.example/blog#top")).toEqual({ handle: "https://terrajot.example/blog", url: "https://terrajot.example/blog" });
    expect(() => normalizeHandle("rss", "ftp://terrajot.example")).toThrow(/http/);
  });

  describe("fetching", () => {
    let server: Server;
    let base = "";
    beforeAll(async () => {
      server = createServer((req, res) => {
        if (req.url === "/blog") return res.writeHead(200, { "content-type": "text/html" }).end(`<html><head><link rel="alternate" type="application/atom+xml" href="/atom"></head></html>`);
        if (req.url === "/atom") return res.writeHead(200, { "content-type": "application/atom+xml" }).end(ATOM);
        if (req.url === "/moved") return res.writeHead(301, { location: "/blog" }).end();
        if (req.url === "/feed") return res.writeHead(200, { "content-type": "application/rss+xml" }).end(RSS);
        res.writeHead(404).end("no");
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      allowLocalPublicFetch(true);
    });
    afterAll(() => {
      allowLocalPublicFetch(false);
      server.close();
    });

    it("follows redirects and the page's feed link, or the usual feed paths", async () => {
      const found = await fetchFeedPosts(`${base}/moved`);
      expect(found.feedUrl).toBe(`${base}/atom`);
      expect(found.posts[0]!.title).toBe("Pricing update");
      expect((await fetchFeedPosts(`${base}/`)).feedUrl).toBe(`${base}/feed`); // the homepage 404s; /feed is tried
    });

    it("never reads private addresses outside test mode", async () => {
      allowLocalPublicFetch(false);
      await expect(fetchFeedPosts(`${base}/feed`)).rejects.toThrow(/can't read that address/);
      await expect(fetchFeedPosts("http://10.0.0.5/feed")).rejects.toThrow(/can't read that address/);
      allowLocalPublicFetch(true);
    });
  });
});

describe("posts from each source", () => {
  it("keeps own posts with links and engagement", () => {
    const profile = { did: "did:plc:tj", handle: "terrajot.example" };
    const bsky = bskyPosts(profile, [
      { post: { uri: "at://did:plc:tj/app.bsky.feed.post/3abc", author: { did: "did:plc:tj" }, record: { text: "We shipped offline maps", createdAt: "2026-10-20T10:00:00Z" }, likeCount: 4, repostCount: 1, replyCount: 2 } },
      { post: { uri: "at://did:plc:other/app.bsky.feed.post/1", author: { did: "did:plc:other" }, record: { text: "not theirs" } }, reason: { $type: "repost" } },
    ]);
    expect(bsky).toEqual([{ externalId: "at://did:plc:tj/app.bsky.feed.post/3abc", url: "https://bsky.app/profile/terrajot.example/post/3abc", title: null, text: "We shipped offline maps", kind: "post", postedAt: new Date("2026-10-20T10:00:00Z"), engagement: 7 }]);

    expect(mastodonPosts([{ id: "9", url: "https://social.example/@tj/9", content: "<p>Hello <b>there</b></p>", created_at: "2026-10-20T10:00:00Z", in_reply_to_id: "8", favourites_count: 1 }, { id: "10", created_at: "2026-10-20T10:00:00Z", reblog: {} }])).toMatchObject([
      { externalId: "9", text: "Hello there", kind: "reply", engagement: 1 },
    ]);

    expect(hnPosts({ hits: [{ objectID: "1", _tags: ["story"], title: "Show HN: TerraJot", points: 10, num_comments: 3, created_at_i: 1_760_000_000 }, { objectID: "2", _tags: ["comment"], story_title: "Field apps", comment_text: "We do this" }] })).toMatchObject([
      { url: "https://news.ycombinator.com/item?id=1", title: "Show HN: TerraJot", kind: "story", engagement: 13 },
      { title: "On: Field apps", text: "We do this", kind: "comment", engagement: null },
    ]);

    const feed = `<feed><entry><id>t3_a</id><link href="https://www.reddit.com/r/hiking/comments/a/x/"/><title>Trail logs</title><category term="hiking"/><published>2026-10-20T10:00:00Z</published><content>&lt;div class="md"&gt;&lt;p&gt;Hi&lt;/p&gt;&lt;/div&gt;</content></entry></feed>`;
    expect(redditPosts(parseRedditFeed(feed))).toMatchObject([{ title: "Trail logs (r/hiking)", text: "Hi", kind: "post" }]);
  });
});

describe("links", () => {
  it("guesses each link's kind", () => {
    expect(linkKind("https://www.linkedin.com/in/someone")).toBe("linkedin");
    expect(linkKind("https://x.com/someone")).toBe("x");
    expect(linkKind("https://bsky.app/profile/someone.example")).toBe("bluesky");
    expect(linkKind("https://social.example/@someone")).toBe("mastodon");
    expect(linkKind("https://someone.substack.com")).toBe("rss");
    expect(linkKind("https://someone.example/feed.xml")).toBe("rss");
    expect(linkKind("https://someone.example")).toBe("website");
    expect(parseLinks("linkedin.com/in/a\nhttps://x.com/a, javascript:alert(1)")).toEqual([
      { kind: "linkedin", url: "https://linkedin.com/in/a" },
      { kind: "x", url: "https://x.com/a" },
    ]);
  });
});

describe("with a database", () => {
  let workspaceId = "";
  let productId = "";
  let competitorId = "";
  const now = new Date("2026-10-21T12:00:00Z");

  beforeAll(async () => {
    openDatabase(join(mkdtempSync(join(tmpdir(), "startica-competitors-")), "test.db"));
    await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
    workspaceId = (await ensureWorkspace()).id;
    productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", url: "https://fieldnote.example" }).returning())[0]!.id;
    competitorId = (await getDb().insert(competitors).values({ workspaceId, productId, name: "TerraJot", url: "https://terrajot.example", source: "owner" }).returning())[0]!.id;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(() => closeDatabase());

  const profileOut = (people: { name: string; role: string; why: string; links: { kind: string; url: string }[] }[], changes: string[] = []) => ({
    summary: "Field notes for hikers.",
    audience: "Hikers",
    company: { founded: "2021", size: "unknown", funding: "unknown", location: "unknown" },
    pricing: { model: "freemium", plans: [{ name: "Pro", price: "$6/month", notes: "" }, { name: " ", price: "", notes: "" }] },
    features: ["Offline maps", " "],
    messaging: "Your trail, remembered.",
    channels: ["Blog", "Bluesky"],
    recent: [{ date: "2026-10", what: "Launched offline maps", url: "https://terrajot.example/blog/offline" }],
    praise: ["Simple"],
    complaints: ["No export"],
    they_win: ["Offline maps"],
    you_win: ["Export"],
    people,
    accounts: [{ kind: "rss", url: "https://terrajot.example/blog" }, { kind: "x", url: "javascript:alert(1)" }],
    changes,
    sources: [{ url: "https://terrajot.example/pricing", title: "Pricing" }],
  });

  it("researches a competitor: the profile, people as suggestions, and what changed next time", async () => {
    ai.structured = profileOut([{ name: "Avery Example", role: "Co-founder", why: "Posts the roadmap", links: [{ kind: "bluesky", url: "https://bsky.app/profile/avery.example" }, { kind: "linkedin", url: "https://www.linkedin.com/in/avery-example" }] }]);
    await runCompetitorResearch({ workspaceId }, { workspaceId, competitorId });
    const [c] = await getDb().select().from(competitors).where(eq(competitors.id, competitorId));
    expect(c).toMatchObject({ profileStatus: "ready", profileError: null });
    expect(c!.profile).toMatchObject({ features: ["Offline maps"], pricing: { plans: [{ name: "Pro" }] }, accounts: [{ kind: "rss", url: "https://terrajot.example/blog" }], versus: { theyWin: ["Offline maps"], youWin: ["Export"] }, model: "claude-sonnet-5-5" });
    expect(ai.calls.at(-2)!.system).toMatch(/Never personal details/);
    const people = await getDb().select().from(competitorPeople).where(eq(competitorPeople.competitorId, competitorId));
    expect(people).toMatchObject([{ name: "Avery Example", status: "suggested", source: "ai" }]);
    expect(await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.competitorId, competitorId))).toEqual([]); // nothing read until followed

    // Again: the previous profile goes in, the same person isn't added twice but gets the new link.
    ai.structured = profileOut([{ name: "avery example", role: "CEO", why: "", links: [{ kind: "rss", url: "https://avery.example/feed.xml" }] }], ["Pro went from $5 to $6"]);
    await runCompetitorResearch({ workspaceId }, { workspaceId, competitorId });
    expect(ai.calls.at(-2)!.content).toContain("<previous_profile");
    const again = await getDb().select().from(competitorPeople).where(eq(competitorPeople.competitorId, competitorId));
    expect(again).toHaveLength(1);
    expect(again[0]!.links.map((l) => l.kind)).toEqual(["bluesky", "linkedin", "rss"]);
    expect((await getDb().select().from(competitors).where(eq(competitors.id, competitorId)))[0]!.profile!.changes).toEqual(["Pro went from $5 to $6"]);
  });

  it("follows every link a person has, LinkedIn through web search, and stops when ignored", async () => {
    const [person] = await getDb().select().from(competitorPeople).where(eq(competitorPeople.competitorId, competitorId));
    expect(await followPerson(workspaceId, person!.id)).toEqual([]);
    const accounts = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, person!.id));
    expect(accounts.map((a) => [a.channel, a.handle]).sort()).toEqual([
      ["bluesky", "avery.example"],
      ["rss", "https://avery.example/feed.xml"],
      ["search", "https://www.linkedin.com/in/avery-example"],
    ]); // LinkedIn is never fetched: briefed from web search
    expect(await followPerson(workspaceId, person!.id)).toEqual([]); // twice is fine

    await ignorePerson(workspaceId, person!.id);
    expect(await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, person!.id))).toEqual([]);
    expect((await getDb().select().from(competitorPeople).where(eq(competitorPeople.id, person!.id)))[0]!.status).toBe("ignored");
  });

  it("adds a person by hand and drops an account when its link is removed", async () => {
    const { id, problems } = await addPerson(workspaceId, competitorId, { name: "Sam Sample", role: "Head of growth", links: "https://social.example/@sam\nhttps://x.com/sam" });
    expect(problems).toEqual([]);
    const handles = async () => (await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, id))).map((a) => `${a.channel} ${a.handle}`).sort();
    expect(await handles()).toEqual(["mastodon sam@social.example", "search https://x.com/sam"]);
    await updatePerson(workspaceId, id, { name: "Sam Sample", links: "https://x.com/sam\nhttps://github.com/sam-example" });
    expect(await handles()).toEqual(["page https://github.com/sam-example", "search https://x.com/sam"]);

    // The company's links: LinkedIn through web search, a pricing page watched, a homepage or blog through its feed.
    const channelOf = async (accountId: string) => (await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.id, accountId)))[0]!.channel;
    expect(await channelOf(await followCompanyLink(workspaceId, competitorId, "https://www.linkedin.com/company/terrajot"))).toBe("search");
    expect(await channelOf(await followCompanyLink(workspaceId, competitorId, "terrajot.example/pricing"))).toBe("page");
    expect(await channelOf(await followCompanyLink(workspaceId, competitorId, "https://terrajot.example/"))).toBe("rss");
  });

  it("stores posts: the first read is seen, later ones are new; benchmarks leave people's accounts out", async () => {
    const accountId = await followCompanyLink(workspaceId, competitorId, "https://terrajot.example/blog");
    const { id: personId } = await addPerson(workspaceId, competitorId, { name: "Riley Placeholder", links: "https://bsky.app/profile/riley.example" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getProfile")) return Response.json({ did: "did:plc:riley", handle: "riley.example", followersCount: 10, postsCount: 3 });
        if (url.includes("getAuthorFeed"))
          return Response.json({ feed: [{ post: { uri: "at://did:plc:riley/app.bsky.feed.post/1", author: { did: "did:plc:riley" }, record: { text: "Hiring a designer", createdAt: "2026-10-20T10:00:00Z" }, likeCount: 2 } }] });
        return new Response("no", { status: 404 });
      }),
    );
    // Only the person's Bluesky account here; the blog is stored by hand below (feeds go through the public fetch).
    const [personAccount] = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.personId, personId));
    await runCompetitorSync({ workspaceId }, { workspaceId, productId, accountId: personAccount!.id }, { gapMs: 0, now: () => now });
    expect(await loadActivity(productId, { unseenOnly: true })).toEqual([]); // first read: seen
    expect(await getDb().select().from(competitorSnapshots).where(eq(competitorSnapshots.accountId, personAccount!.id))).toHaveLength(1);
    expect((await loadBenchmarks(productId, now)).accounts).toEqual([]);

    const [blog] = await getDb().select().from(competitorAccounts).where(eq(competitorAccounts.id, accountId));
    await storePosts(blog!, [{ externalId: "tj-1", url: "https://terrajot.example/blog/offline", title: "Offline maps are here", text: "Download a region.", kind: "article", postedAt: new Date("2026-10-20T09:00:00Z"), engagement: null }], now, false);
    await storePosts(blog!, [{ externalId: "tj-1", url: "https://terrajot.example/blog/offline", title: "Offline maps are here", text: "Download a region.", kind: "article", postedAt: new Date("2026-10-20T09:00:00Z"), engagement: null }], now, false);
    const activity = await loadActivity(productId);
    expect(activity.map((a) => [a.title ?? a.text, a.person, a.seen])).toEqual([
      ["Hiring a designer", "Riley Placeholder", true],
      ["Offline maps are here", null, false],
    ]);
    expect(await unseenCounts(productId)).toEqual({ [competitorId]: 1 });
    expect((await competitorCandidates(productId))[0]).toMatchObject({ kind: "competitors", title: "Catch up on a new post from TerraJot", href: "/intel?tab=following" });
  });

  it("keeps posts when someone is ignored only for that person", async () => {
    const before = await getDb().select().from(competitorPosts);
    const [riley] = await getDb().select().from(competitorPeople).where(eq(competitorPeople.name, "Riley Placeholder"));
    await ignorePerson(workspaceId, riley!.id);
    const after = await getDb().select().from(competitorPosts);
    expect(after.length).toBe(before.length - 1);
  });
});
