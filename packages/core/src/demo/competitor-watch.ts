import { and, eq } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { localDay, periodStart } from "../competitors/briefs.ts";

/**
 * The demo's competitor watch (Intel → Competitors and Following): TerraJot researched in depth,
 * two fictional people at it (one followed, one suggested), its blog feed, its watched pricing page,
 * the CEO's LinkedIn and X briefed from web search, a week of posts and a page change written as
 * `competitor_sync` would store them (the demo makes no requests), link and person briefs, and
 * today's, this week's and this month's briefs. Every name, handle and link is made up (`.example` domains).
 */

const PROFILE = (model: string): s.CompetitorProfile => ({
  summary: "GPS field-data collection for survey crews: build a form, send it to phones, map the answers. Popular with consultancies that run the same survey many times.",
  audience: "Environmental and survey consultancies with crews of 5 to 50, and the agencies that hire them.",
  company: { founded: "2019", size: "about 25 people", funding: "Seed round (2022)", location: "unknown" },
  pricing: {
    model: "Per seat, billed yearly; a free trial, no free plan",
    plans: [
      { name: "Team", price: "$19 per seat a month", notes: "Up to 10 seats" },
      { name: "Agency", price: "$39 per seat a month", notes: "Going to $49 next month, per its CEO" },
    ],
  },
  features: ["Drag-and-drop form builder", "Offline maps (new)", "Map view of every answer", "CSV and shapefile export", "Crew assignments"],
  messaging: "“Every site visit, the same way.” It leads with consistency across a crew, not with notes or research.",
  channels: ["Its blog (weekly)", "Bluesky", "A monthly newsletter", "Webinars with consultancies"],
  recent: [
    { date: "2026-10", what: "Launched offline maps on every plan", url: "https://terrajot.example/blog/offline-maps" },
    { date: "2026-09", what: "Announced the Agency price rise to $49 a seat", url: "https://bsky.app/profile/morgan.terrajot.example/post/3demo2" },
    { date: "2026-06", what: "Hired a head of product from a mapping company", url: "https://terrajot.example/blog/welcome-jordan" },
  ],
  praise: ["The form builder is quick to learn", "The map view is great for reports"],
  complaints: ["No free-text notes: everything has to be a form field", "Too expensive for students and solo researchers", "Exports lose photo captions"],
  versus: {
    theyWin: ["Crew management for larger teams", "Offline maps out of the box"],
    youWin: ["Free-text field notes with photos and tags", "A price students and solo researchers can pay", "Exports keep captions"],
  },
  accounts: [
    { kind: "rss", url: "https://terrajot.example/blog" },
    { kind: "bluesky", url: "https://bsky.app/profile/terrajot.example" },
    { kind: "youtube", url: "https://www.youtube.com/@terrajot-example" },
  ],
  changes: ["Offline maps are now on every plan (were Agency only)", "The Agency plan goes from $39 to $49 a seat next month"],
  sources: [
    { url: "https://terrajot.example/pricing", title: "TerraJot pricing" },
    { url: "https://terrajot.example/blog/offline-maps", title: "Offline maps for every plan" },
    { url: "https://reviews.example/terrajot", title: "TerraJot reviews" },
  ],
  model,
});

type DemoPost = {
  account: "blog" | "company" | "morgan" | "pricing";
  id: string;
  url: string;
  title?: string;
  text: string;
  kind: "post" | "article" | "reply" | "change";
  daysAgo: number;
  engagement: number | null;
  seen: boolean;
  relevance: "high" | "medium" | "low";
  why: string;
};

const POSTS: DemoPost[] = [
  { account: "blog", id: "tj-blog-offline", url: "https://terrajot.example/blog/offline-maps", title: "Offline maps for every plan", text: "Download a region before you head out and every form works without signal. Now on Team and Agency.", kind: "article", daysAgo: 2, engagement: null, seen: false, relevance: "high", why: "Offline use was one of Fieldnote's differentiators." },
  { account: "pricing", id: "change:demo-pricing", url: "https://terrajot.example/pricing", title: "Changed: TerraJot pricing", text: "Added:\n+ Agency $49 per seat a month, billed yearly\n+ Offline maps on every plan\n\nRemoved:\n- Agency $39 per seat a month, billed yearly\n- Offline maps (Agency only)", kind: "change", daysAgo: 0, engagement: null, seen: false, relevance: "high", why: "The price rise is now on the pricing page." },
  { account: "morgan", id: "at://did:plc:morgandemo/app.bsky.feed.post/3demo2", url: "https://bsky.app/profile/morgan.terrajot.example/post/3demo2", text: "Heads up for Agency customers: the plan goes to $49 a seat next month. Offline maps and crew assignments are why.", kind: "post", daysAgo: 3, engagement: 41, seen: false, relevance: "high", why: "A price rise pushes smaller crews to look elsewhere." },
  { account: "morgan", id: "at://did:plc:morgandemo/app.bsky.feed.post/3demo3", url: "https://bsky.app/profile/morgan.terrajot.example/post/3demo3", text: "Question for field ecologists: would you want free-text notes in TerraJot, or do forms cover it?", kind: "post", daysAgo: 1, engagement: 18, seen: false, relevance: "high", why: "It may build Fieldnote's main differentiator." },
  { account: "company", id: "at://did:plc:terrajot/app.bsky.feed.post/3demo4", url: "https://bsky.app/profile/terrajot.example/post/3demo4", text: "Webinar Thursday: running the same survey across five crews without losing your mind.", kind: "post", daysAgo: 4, engagement: 9, seen: true, relevance: "medium", why: "Aimed at consultancies, not Fieldnote's audience." },
  { account: "blog", id: "tj-blog-jordan", url: "https://terrajot.example/blog/welcome-jordan", title: "Welcome, Jordan", text: "Jordan joins as head of product from a mapping company.", kind: "article", daysAgo: 110, engagement: null, seen: true, relevance: "medium", why: "A hire that hints at mapping features." },
];

export async function seedDemoCompetitorWatch(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const [terrajot] = await db.select().from(s.competitors).where(and(eq(s.competitors.productId, productId), eq(s.competitors.name, "TerraJot")));
  const [quadrat] = await db.select().from(s.competitors).where(and(eq(s.competitors.productId, productId), eq(s.competitors.name, "Quadrat")));
  if (!terrajot) return 0;
  await db.update(s.competitors).set({ profile: PROFILE("claude-sonnet-5-5"), profileStatus: "ready", profiledAt: ago(1, 3) }).where(eq(s.competitors.id, terrajot.id));

  const scope = { workspaceId, productId };
  const [morgan] = await db
    .insert(s.competitorPeople)
    .values({
      ...scope,
      competitorId: terrajot.id,
      name: "Morgan Fieldhouse",
      role: "Co-founder and CEO",
      why: "Announces pricing and roadmap changes first, on Bluesky.",
      links: [
        { kind: "bluesky", url: "https://bsky.app/profile/morgan.terrajot.example" },
        { kind: "linkedin", url: "https://www.linkedin.com/in/morgan-fieldhouse-example" },
        { kind: "x", url: "https://x.com/morgan_tj_example" },
      ],
      status: "following",
      source: "ai",
    })
    .returning();
  await db.insert(s.competitorPeople).values([
    {
      ...scope,
      competitorId: terrajot.id,
      name: "Jordan Placeholder",
      role: "Head of product",
      why: "Writes the release notes; worth following for what ships next.",
      links: [
        { kind: "mastodon", url: "https://social.example/@jordan_tj" },
        { kind: "linkedin", url: "https://www.linkedin.com/in/jordan-placeholder-example" },
      ],
      status: "suggested",
      source: "ai",
    },
    ...(quadrat
      ? [{ ...scope, competitorId: quadrat.id, name: "Casey Sample", role: "Founder", why: "Runs Quadrat's community calls.", links: [{ kind: "website" as const, url: "https://casey.example" }], status: "suggested" as const, source: "ai" as const }]
      : []),
  ]);

  const [blog] = await db
    .insert(s.competitorAccounts)
    .values({ ...scope, competitorId: terrajot.id, channel: "rss", handle: "https://terrajot.example/blog", url: "https://terrajot.example/blog", status: "ok", lastCheckedAt: ago(0, 4), createdAt: ago(120) })
    .returning();
  const [morganAccount] = await db
    .insert(s.competitorAccounts)
    .values({ ...scope, competitorId: terrajot.id, personId: morgan!.id, channel: "bluesky", handle: "morgan.terrajot.example", url: "https://bsky.app/profile/morgan.terrajot.example", status: "ok", lastCheckedAt: ago(0, 4), createdAt: ago(30) })
    .returning();
  const [pricing] = await db
    .insert(s.competitorAccounts)
    .values({
      ...scope,
      competitorId: terrajot.id,
      channel: "page",
      handle: "https://terrajot.example/pricing",
      url: "https://terrajot.example/pricing",
      status: "ok",
      lastCheckedAt: ago(0, 4),
      createdAt: ago(40),
      briefedAt: ago(0, 3),
      brief: {
        summary: "TerraJot's pricing page: two per-seat plans billed yearly, a free trial and no free plan.",
        covers: ["Team: $19 per seat a month, up to 10 seats", "Agency: $49 per seat a month", "Offline maps and crew assignments on every plan"],
        recent: ["Agency went from $39 to $49 a seat", "Offline maps moved from Agency to every plan"],
        lastChange: "This morning the Agency price changed to $49 a seat and offline maps were added to every plan.",
        from: "read",
        urls: ["https://terrajot.example/pricing"],
      },
    })
    .returning();
  await db.insert(s.competitorPages).values({
    workspaceId,
    accountId: pricing!.id,
    hash: "demo",
    title: "TerraJot pricing",
    text: "Team\n$19 per seat a month, billed yearly\nUp to 10 seats\nAgency\nAgency $49 per seat a month, billed yearly\nOffline maps on every plan\nStart a free trial",
    fetchedAt: ago(0, 4),
  });
  // The CEO's LinkedIn and X: never opened, briefed from web search.
  await db.insert(s.competitorAccounts).values([
    {
      ...scope,
      competitorId: terrajot.id,
      personId: morgan!.id,
      channel: "search",
      handle: "https://www.linkedin.com/in/morgan-fieldhouse-example",
      url: "https://www.linkedin.com/in/morgan-fieldhouse-example",
      status: "ok",
      createdAt: ago(30),
      briefedAt: ago(2),
      brief: {
        summary: "Morgan Fieldhouse co-founded TerraJot and runs it as CEO; public coverage describes a former survey-crew lead.",
        covers: ["Talks about running surveys across crews", "Shares TerraJot hires and webinars"],
        recent: ["Spoke on a podcast about consistent site visits", "TerraJot is hiring two engineers for offline sync"],
        lastChange: "",
        from: "web_search",
        urls: ["https://podcast.example/episodes/site-visits"],
      },
    },
    {
      ...scope,
      competitorId: terrajot.id,
      personId: morgan!.id,
      channel: "search",
      handle: "https://x.com/morgan_tj_example",
      url: "https://x.com/morgan_tj_example",
      status: "ok",
      createdAt: ago(30),
      briefedAt: ago(2),
      brief: { summary: "Morgan's X account; search finds little beyond reposts of TerraJot's own announcements.", covers: ["Reposts of TerraJot news"], recent: [], lastChange: "", from: "web_search", urls: [] },
    },
  ]);
  await db
    .update(s.competitorAccounts)
    .set({
      briefedAt: ago(0, 3),
      brief: {
        summary: "TerraJot's blog: a weekly post on product news and how consultancies run surveys.",
        covers: ["Launches and release notes", "Customer stories from consultancies", "Hires"],
        recent: ["Offline maps for every plan"],
        lastChange: "Two days ago: offline maps are now on Team and Agency.",
        from: "read",
        urls: ["https://terrajot.example/blog/offline-maps"],
      },
    })
    .where(eq(s.competitorAccounts.id, blog!.id));
  await db
    .update(s.competitorAccounts)
    .set({
      briefedAt: ago(0, 3),
      brief: {
        summary: "Morgan's Bluesky: where TerraJot's pricing and roadmap news shows up first.",
        covers: ["Pricing changes", "Questions to field ecologists", "Webinars"],
        recent: ["The Agency plan goes to $49 a seat next month", "Asked whether ecologists want free-text notes"],
        lastChange: "Yesterday: asked field ecologists about free-text notes.",
        from: "read",
        urls: ["https://bsky.app/profile/morgan.terrajot.example/post/3demo2", "https://bsky.app/profile/morgan.terrajot.example/post/3demo3"],
      },
    })
    .where(eq(s.competitorAccounts.id, morganAccount!.id));
  await db
    .update(s.competitorPeople)
    .set({
      briefedAt: ago(0, 3),
      brief: {
        summary: "TerraJot's co-founder and CEO, and the first to announce its pricing and roadmap, mostly on Bluesky.",
        topics: ["Pricing and plans", "What field ecologists need", "Running surveys across crews"],
        hints: ["Asking about free-text notes suggests TerraJot may add them", "Hiring for offline sync"],
        activity: "Posts on Bluesky a few times a week; LinkedIn and X mostly repeat company news.",
        urls: ["https://bsky.app/profile/morgan.terrajot.example/post/3demo3"],
      },
    })
    .where(eq(s.competitorPeople.id, morgan!.id));
  const [company] = await db.select().from(s.competitorAccounts).where(and(eq(s.competitorAccounts.competitorId, terrajot.id), eq(s.competitorAccounts.handle, "terrajot.example")));
  const accountOf = { blog: blog!, morgan: morganAccount!, company, pricing: pricing! };

  let n = 0;
  for (const p of POSTS) {
    const account = accountOf[p.account];
    if (!account) continue;
    await db.insert(s.competitorPosts).values({
      ...scope,
      accountId: account.id,
      externalId: p.id,
      url: p.url,
      title: p.title ?? null,
      text: p.text,
      kind: p.kind,
      postedAt: ago(p.daysAgo, 2),
      engagement: p.engagement,
      seenAt: p.seen ? ago(p.daysAgo - 0.5) : null,
      relevance: p.relevance,
      relevanceWhy: p.why,
    });
    n += 1;
  }

  const now = ago(0);
  const brief = (period: s.BriefPeriod, digest: s.CompetitorDigest, seen: boolean) => ({
    ...scope,
    status: "ready" as const,
    period,
    periodStart: localDay(periodStart(period, now)),
    since: periodStart(period, now),
    until: ago(0, 3),
    posts: 5,
    model: "claude-sonnet-5-5",
    createdAt: ago(0, 3),
    seenAt: seen ? ago(0, 2) : null,
    digest,
  });
  const priceRise = {
    competitor: "TerraJot",
    what: "The Agency plan goes from $39 to $49 a seat, announced by its CEO and now on the pricing page.",
    whyItMatters: "Smaller consultancies and researchers priced out of TerraJot are your audience; this is a good week to say what Fieldnote costs.",
    urls: ["https://terrajot.example/pricing", "https://bsky.app/profile/morgan.terrajot.example/post/3demo2"],
  };
  const offline = {
    competitor: "TerraJot",
    what: "Offline maps are now on every plan.",
    whyItMatters: "Offline use was one of your differentiators against it; lead with free-text notes and exports instead.",
    urls: ["https://terrajot.example/blog/offline-maps"],
  };
  const notes = {
    competitor: "TerraJot",
    what: "Its CEO asked ecologists whether they want free-text notes.",
    whyItMatters: "It may build what sets Fieldnote apart. The replies to that post show what people want from notes.",
    urls: ["https://bsky.app/profile/morgan.terrajot.example/post/3demo3"],
  };
  await db.insert(s.competitorDigests).values([
    brief(
      "day",
      {
        headline: "TerraJot's pricing page now shows the $49 Agency plan.",
        items: [{ ...priceRise, what: "The pricing page changed this morning: Agency is $49 a seat and offline maps are on every plan." }],
        suggestions: ["Post a plain comparison of what a 5-person crew pays for Fieldnote and TerraJot"],
        quiet: ["Quadrat", "Logbook Pro"],
        sinceLast: ["The pricing page now shows the new Agency price"],
      },
      false,
    ),
    brief(
      "week",
      {
        headline: "TerraJot is moving up-market: a price rise for agencies, and offline maps for everyone.",
        items: [priceRise, offline, notes],
        suggestions: ["Post a plain comparison of what a 5-person crew pays for Fieldnote and TerraJot", "Write about field notes that don't fit a form, with an example", "Check the replies to the CEO's notes question for people to help"],
        quiet: ["Quadrat", "Logbook Pro"],
        sinceLast: [],
      },
      true,
    ),
    brief(
      "month",
      {
        headline: "TerraJot spent the month on bigger customers: offline maps, crew features and a higher Agency price.",
        items: [priceRise, offline],
        suggestions: ["Make the case for small teams and solo researchers on your pricing page"],
        quiet: ["Quadrat", "Logbook Pro"],
        sinceLast: [],
      },
      true,
    ),
  ]);
  return n;
}
