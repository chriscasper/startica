import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { matchConversation, type Matchers } from "../distribution/matching.ts";

/**
 * The demo's listening history and replies (ARCHITECTURE.md 8.1), written as listen_scan,
 * scoring and engagement_sync would store them (no AI, no network): 90 days of
 * conversations the search found and scoring archived as off target, so Inbox → Trends has
 * daily counts per keyword and community, a sentiment mix and share of voice, with a burst
 * about offline note taking in the last two days (a spike); and a few replies to Fieldnote's
 * posted replies and content. All fictional, with example.com links.
 */

type Spot = { channel: "reddit" | "hackernews" | "bluesky"; community: string | null };
const SPOTS: Spot[] = [
  { channel: "reddit", community: "ecology" },
  { channel: "reddit", community: "GradSchool" },
  { channel: "reddit", community: "UXResearch" },
  { channel: "hackernews", community: "Hacker News" },
  { channel: "bluesky", community: null },
];

// Each text names one listening keyword; some name Fieldnote or a competitor too.
const TEXTS: { text: string; sentiment: s.Sentiment }[] = [
  { text: "Is there a field notes app that handles photos per plot? Asking before the season starts.", sentiment: "neutral" },
  { text: "Offline note taking on a tablet keeps failing me when the sync conflicts. So frustrating.", sentiment: "negative" },
  { text: "Any tips to digitize field notebook pages faster than retyping them every night?", sentiment: "neutral" },
  { text: "Our lab moved transect data collection to tablets and it saved us hours a week. Recommend it.", sentiment: "positive" },
  { text: "Which fieldwork tablet survives rain? Mine died on day two.", sentiment: "negative" },
  { text: "Tried TerraJot for transect data collection; great forms, but no free-text notes. Mixed feelings.", sentiment: "mixed" },
  { text: "Quadrat is fine for single sightings, but I need a field notes app for a whole project.", sentiment: "mixed" },
  { text: "Logbook Pro needs a connection to sync, which defeats offline note taking in the field.", sentiment: "negative" },
  { text: "Fieldnote's templates made our field notes app question moot: everyone uses the same transect sheet now.", sentiment: "positive" },
  { text: "Has anyone compared Fieldnote and TerraJot for offline note taking on site visits?", sentiment: "neutral" },
];
const SPIKE_TEXTS = [
  "Offline note taking advice? Field season starts next week and the station has no signal.",
  "What do you all use for offline note taking when the cabin has no internet for days?",
  "Offline note taking on an old phone: which app keeps GPS and photos together?",
  "Lost a day of offline note taking to a sync bug. How do others back up in the field?",
];

const DEMO_REPLIES = [
  { author: "demo_reader_1", body: "Thanks, the plot-code trick in filenames is simple and it works. Does the CSV export keep the photo names?", status: "new" as const, hoursAgo: 5 },
  { author: "demo_reader_2", body: "We tried something similar last season. How does it handle two people editing the same plot offline?", status: "new" as const, hoursAgo: 20 },
  { author: "demo_reader_3", body: "Good point about typing only what changed. Saving this for my field school.", status: "seen" as const, hoursAgo: 40 },
  { author: "demo_reader_4", body: "Is there a student discount? Our department buys licenses per lab.", status: "answered" as const, hoursAgo: 70 },
];

export async function seedDemoListening(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<{ conversations: number; replies: number }> {
  const base = { workspaceId, productId };
  const [product] = await db.select({ name: s.products.name }).from(s.products).where(eq(s.products.id, productId));
  const words = await db.select({ keyword: s.keywords.keyword, useFor: s.keywords.useFor }).from(s.keywords).where(eq(s.keywords.productId, productId));
  const rivals = await db.select({ id: s.competitors.id, name: s.competitors.name }).from(s.competitors).where(eq(s.competitors.productId, productId));
  const matchers: Matchers = { product: product?.name ?? "Fieldnote", keywords: words.filter((w) => w.useFor !== "seo").map((w) => w.keyword), competitors: rivals };

  // Deterministic "random": the demo looks the same on every load.
  let seed = 7;
  const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);

  let n = 0;
  const add = async (daysAgo: number, hour: number, spot: Spot, text: string, sentiment: s.Sentiment) => {
    const at = ago(daysAgo, hour);
    const key = `listen-${n++}`;
    const [conversation] = await db
      .insert(s.conversations)
      .values({
        workspaceId,
        channel: spot.channel,
        externalId: `demo-${key}`,
        url: `https://example.com/demo/${spot.channel}/${key}`,
        kind: "post",
        community: spot.community,
        author: `demo_user_${100 + (n % 40)}`,
        title: null,
        body: text,
        postedAt: at,
        origin: "listening",
        createdAt: at,
      })
      .returning({ id: s.conversations.id });
    await db.insert(s.opportunities).values({
      ...base,
      conversationId: conversation!.id,
      matchedOn: spot.channel,
      relevance: Math.round((0.05 + rand() * 0.2) * 100) / 100,
      intent: Math.round(rand() * 30) / 100,
      reasoning: "Matched a keyword but isn't asking for a tool the owner could help with.",
      status: "archived",
      sentiment,
      ...matchConversation({ title: null, body: text }, matchers),
      scoredAt: at,
      createdAt: at,
    });
  };

  // 90 days, 1 to 4 a day, a little busier lately.
  for (let day = 89; day >= 2; day--) {
    const perDay = 1 + Math.floor(rand() * (day < 30 ? 4 : 3));
    for (let i = 0; i < perDay; i++) {
      const t = TEXTS[Math.floor(rand() * TEXTS.length)]!;
      await add(day, Math.floor(rand() * 12), SPOTS[Math.floor(rand() * SPOTS.length)]!, t.text, t.sentiment);
    }
  }
  // The spike: offline note taking in r/ecology, yesterday and today.
  for (let i = 0; i < 9; i++) await add(i < 3 ? 0 : 1, i < 3 ? i * 0.3 : i, SPOTS[0]!, SPIKE_TEXTS[i % SPIKE_TEXTS.length]!, i % 3 === 0 ? "negative" : "neutral");

  // The hand-written Inbox conversations: matches and a sentiment as scoring would give them.
  const hand = await db
    .select({ id: s.opportunities.id, title: s.conversations.title, body: s.conversations.body, status: s.opportunities.status })
    .from(s.opportunities)
    .innerJoin(s.conversations, eq(s.conversations.id, s.opportunities.conversationId))
    .where(and(eq(s.opportunities.productId, productId), isNull(s.opportunities.matchedKeywords)));
  for (const [i, o] of hand.entries()) {
    await db
      .update(s.opportunities)
      .set({ ...matchConversation(o, matchers), sentiment: o.status === "archived" ? "neutral" : i % 3 === 0 ? "negative" : "neutral" })
      .where(eq(s.opportunities.id, o.id));
  }

  // Replies to Fieldnote's posted replies, and one to a posted Content Studio piece.
  const pubs = await db
    .select({ id: s.publications.id, channel: s.publications.channel, url: s.publications.url })
    .from(s.publications)
    .where(and(eq(s.publications.productId, productId), isNotNull(s.publications.url)));
  const [piece] = await db
    .select({ id: s.contentPieces.id, channel: s.contentPieces.channel, url: s.contentPieces.postedUrl })
    .from(s.contentPieces)
    .where(and(eq(s.contentPieces.productId, productId), eq(s.contentPieces.status, "posted"), isNotNull(s.contentPieces.postedUrl)))
    .limit(1);
  const targets = [...pubs.slice(0, 3).map((p) => ({ publicationId: p.id, channel: p.channel, url: p.url! })), ...(piece ? [{ pieceId: piece.id, channel: piece.channel, url: piece.url! }] : [])];
  let replies = 0;
  for (const [i, r] of DEMO_REPLIES.entries()) {
    const target = targets[i % Math.max(1, targets.length)];
    if (!target) break;
    const channel = (s.channels as readonly string[]).includes(target.channel) ? (target.channel as s.Channel) : "reddit";
    await db.insert(s.publicationReplies).values({
      ...base,
      publicationId: "publicationId" in target ? target.publicationId : null,
      pieceId: "pieceId" in target ? target.pieceId : null,
      channel,
      externalId: `demo-reply-${i + 1}`,
      inReplyTo: null,
      url: `https://example.com/demo/${channel}/reply-${i + 1}`,
      author: r.author,
      body: r.body,
      postedAt: ago(0, r.hoursAgo),
      status: r.status,
      createdAt: ago(0, r.hoursAgo - 1),
    });
    replies++;
  }
  return { conversations: n, replies };
}
