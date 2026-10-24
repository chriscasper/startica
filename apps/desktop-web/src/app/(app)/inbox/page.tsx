import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { cn } from "@/lib/utils";
import { getActiveProduct } from "@/lib/dal";
import { planHint } from "@/lib/plan-hints";
import { assistedPostingAvailable, postingContext } from "@/lib/posting";
import { and, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { xEnabled } from "@startica/core/channels/x";
import { LISTEN_CHANNELS, listeningState } from "@startica/core/distribution/listening";
import { MAX_REDRAFTS, recentArchivedScores } from "@startica/core/distribution/thresholds";
import { loadReplies, replyStatusCounts, type ReplyStatus } from "@startica/core/distribution/replies";
import { listeningTrends, TREND_RANGES } from "@startica/core/distribution/trends";
import { loadBestTimes } from "@startica/core/content/best-time";
import { replyRequest } from "@startica/core/posting/requests";
import { hasAiKey } from "@startica/core/ai/client";
import { versionsToShowFor } from "@startica/core/chat/threads";
import { desktopApp } from "@/lib/desktop";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { channelLabel } from "@/lib/channels";
import { InboxToolbar } from "./inbox-toolbar";
import type { ListeningView } from "./listening-control";
import { OpportunityCard, type OpportunityView } from "./opportunity-card";
import { MarkAllSeen, ReplyCard, type ReplyView } from "./replies-list";
import { TrendsView } from "./trends-view";

export const metadata: Metadata = { title: "Inbox" };

const TABS = {
  review: { label: "To review", statuses: ["drafted", "failed"] },
  working: { label: "In progress", statuses: ["new", "drafting"] },
  posted: { label: "Posted", statuses: ["posted"] },
  archived: { label: "Archived", statuses: ["archived"] },
  dismissed: { label: "Dismissed", statuses: ["dismissed"] },
} as const;
type TabKey = keyof typeof TABS;
// Two more views: replies to the owner's own posts, and listening trends (ARCHITECTURE.md 8.1).
type ViewKey = TabKey | "replies" | "trends";
const REPLY_FILTERS = {
  open: { label: "New and seen", statuses: ["new", "seen"] },
  answered: { label: "Answered", statuses: ["answered"] },
  dismissed: { label: "Dismissed", statuses: ["dismissed"] },
} as const satisfies Record<string, { label: string; statuses: readonly ReplyStatus[] }>;
type ReplyFilter = keyof typeof REPLY_FILTERS;

const PAGE_SIZE = 50;

export default function InboxPage(props: PageProps<"/inbox">) {
  return (
    <>
      <PageHeader title="Inbox" description="Conversations worth joining, with replies drafted for you to review and post." />
      <Suspense fallback={<PageSkeleton />}>
        <InboxContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function ago(date: Date | null): string | null {
  if (!date) return null;
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type OpportunityRow = { o: typeof schema.opportunities.$inferSelect; c: typeof schema.conversations.$inferSelect };

/** Cards for opportunities: the latest draft, the community's recent promo rate, posting and the posted link. */
async function opportunityViews(rows: OpportunityRow[], pubs: { channel: string; community: string | null; mentionsProduct: boolean }[]): Promise<OpportunityView[]> {
  const d = await db();
  // Latest draft per opportunity on this page.
  const ids = rows.map((r) => r.o.id);
  const allDrafts = ids.length
    ? await d.select().from(schema.drafts).where(inArray(schema.drafts.opportunityId, ids)).orderBy(desc(schema.drafts.version))
    : [];
  // Posted replies: their link, if known (newest publication per opportunity).
  const postedIds = rows.filter((r) => r.o.status === "posted").map((r) => r.o.id);
  const postedPubs = postedIds.length
    ? await d
        .select({ opportunityId: schema.publications.opportunityId, url: schema.publications.url })
        .from(schema.publications)
        .where(inArray(schema.publications.opportunityId, postedIds))
        .orderBy(desc(schema.publications.postedAt))
    : [];
  const latestDraft = new Map<string, (typeof allDrafts)[number]>();
  for (const draft of allDrafts) if (!latestDraft.has(draft.opportunityId)) latestDraft.set(draft.opportunityId, draft);

  const promoFor = (channel: string, community: string | null) => {
    const list = pubs.filter((p) => p.channel === channel && p.community === community);
    return { total: list.length, mentions: list.filter((p) => p.mentionsProduct).length };
  };

  const posting = assistedPostingAvailable();
  const context = posting && rows[0] ? await postingContext(rows[0].o.productId) : {};
  // Content calendar: best-time hints for planning a reply (rules, no AI).
  const times = rows[0] ? await loadBestTimes(rows[0].o.productId) : null;
  // Refine (ARCHITECTURE.md 5.1): chats about a draft, and its versions.
  const aiReady = !desktopApp().demo && (await hasAiKey());
  const versions = rows[0] ? await versionsToShowFor(rows[0].o.workspaceId, "reply_draft", ids) : {};
  const views: OpportunityView[] = rows.map(({ o, c }) => {
    const draft = latestDraft.get(o.id);
    return {
      id: o.id,
      status: o.status,
      relevance: o.relevance,
      intent: o.intent,
      reasoning: o.reasoning,
      angle: o.angle,
      error: o.error,
      dismissReason: o.dismissReason,
      conversation: {
        channel: c.channel,
        community: c.community,
        kind: c.kind,
        url: c.url,
        title: c.title,
        threadTitle: c.threadTitle,
        body: c.body,
        author: c.author,
        postedAgo: ago(c.postedAt),
      },
      draft: draft
        ? { version: draft.version, body: draft.body, mentionsProduct: draft.mentionsProduct, rationale: draft.rationale, source: draft.source }
        : null,
      promo: promoFor(c.channel, c.community),
      canPost: posting && draft != null && replyRequest(c, draft, o.id, context) !== null,
      postedUrl: postedPubs.find((p) => p.opportunityId === o.id && p.url)?.url ?? null,
      plannedAt: o.plannedAt?.getTime() ?? null,
      planHint: times && o.status === "drafted" ? planHint(times, c.channel, c.community) : null,
      aiReady,
      versions: versions[o.id] ?? [],
    };
  });

  return views;
}

/** Loads one tab of the inbox. A plain function (not a component), so it may read the clock. */
async function loadInbox(productId: string, tab: TabKey | null) {
  const d = await db();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [statuses, rows, pubs, [product], [watched]] = await Promise.all([
    d
      .select({ status: schema.opportunities.status })
      .from(schema.opportunities)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.opportunities.conversationId))
      .where(and(eq(schema.opportunities.productId, productId), ne(schema.conversations.origin, "reply"))),
    // Replies and Trends list no opportunities of their own.
    !tab
      ? Promise.resolve([] as OpportunityRow[])
      : d
      .select({ o: schema.opportunities, c: schema.conversations })
      .from(schema.opportunities)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.opportunities.conversationId))
      // Answers to replies on the owner's own posts are listed under Replies instead.
      .where(and(eq(schema.opportunities.productId, productId), ne(schema.conversations.origin, "reply"), inArray(schema.opportunities.status, [...TABS[tab].statuses])))
      // Archived: closest calls first, so the noise sinks to the bottom.
      .orderBy(...(tab === "archived" ? [sql`${schema.opportunities.relevance} desc nulls last`, desc(schema.opportunities.intent)] : []), desc(schema.opportunities.createdAt))
      .limit(PAGE_SIZE),
    d
      .select({ channel: schema.publications.channel, community: schema.publications.community, mentionsProduct: schema.publications.mentionsProduct })
      .from(schema.publications)
      .where(and(eq(schema.publications.productId, productId), gte(schema.publications.postedAt, since))),
    d
      .select({ brief: schema.products.brief, relevanceThreshold: schema.products.relevanceThreshold, intentThreshold: schema.products.intentThreshold })
      .from(schema.products)
      .where(eq(schema.products.id, productId)),
    d
      .select({ n: count() })
      .from(schema.communities)
      .where(
        and(
          eq(schema.communities.productId, productId),
          eq(schema.communities.channel, "reddit"),
          eq(schema.communities.status, "watching"),
        ),
      ),
  ]);

  const views = await opportunityViews(rows, pubs);
  const countFor = (key: TabKey) => statuses.filter((r) => (TABS[key].statuses as readonly string[]).includes(r.status)).length;

  return {
    views,
    counts: Object.fromEntries((Object.keys(TABS) as TabKey[]).map((k) => [k, countFor(k)])) as Record<TabKey, number>,
    hasBrief: Boolean(product?.brief),
    scoring: {
      relevance: product?.relevanceThreshold ?? 0.7,
      intent: product?.intentThreshold ?? 0.5,
      archived: await recentArchivedScores(productId),
      maxRedrafts: MAX_REDRAFTS,
    },
    watchedSubreddits: watched?.n ?? 0,
    listening: await listeningView(productId),
  };
}

/** The Replies view: replies to the owner's posts, each with its drafted answer's card when there is one. */
async function loadRepliesView(productId: string, filter: ReplyFilter) {
  const d = await db();
  const replies = await loadReplies(productId, REPLY_FILTERS[filter].statuses);
  const oppIds = replies.flatMap((r) => (r.opportunityId ? [r.opportunityId] : []));
  const rows = oppIds.length
    ? await d
        .select({ o: schema.opportunities, c: schema.conversations })
        .from(schema.opportunities)
        .innerJoin(schema.conversations, eq(schema.conversations.id, schema.opportunities.conversationId))
        .where(and(eq(schema.opportunities.productId, productId), inArray(schema.opportunities.id, oppIds)))
    : [];
  const pubs = rows.length
    ? await d
        .select({ channel: schema.publications.channel, community: schema.publications.community, mentionsProduct: schema.publications.mentionsProduct })
        .from(schema.publications)
        .where(and(eq(schema.publications.productId, productId), gte(schema.publications.postedAt, new Date(Date.now() - 30 * 86400_000))))
    : [];
  const answers = new Map((await opportunityViews(rows, pubs)).map((v) => [v.id, v]));
  const views: ReplyView[] = replies.map((r) => ({
    id: r.id,
    channelLabel: channelLabel(r.channel),
    url: r.url,
    author: r.author,
    body: r.body,
    postedAgo: ago(r.postedAt),
    status: r.status,
    hasAnswer: Boolean(r.opportunityId && answers.has(r.opportunityId)),
    post: { kind: r.post.kind, label: r.post.label, url: r.post.url },
  }));
  return { views, answers: replies.map((r) => (r.opportunityId ? (answers.get(r.opportunityId) ?? null) : null)) };
}

/** The Searching control's state (reads the clock: a timed pause may have run out). */
async function listeningView(productId: string): Promise<ListeningView> {
  const [state, x] = await Promise.all([listeningState(productId), xEnabled()]);
  return {
    paused: state.paused,
    until: state.until,
    sources: LISTEN_CHANNELS.map((channel) => ({
      channel,
      label: channelLabel(channel),
      paused: state.channels.includes(channel),
      note: channel === "x" && !x ? "needs an X API token" : channel === "reddit" ? "watched subreddits" : channel === "mastodon" ? "watched hashtags" : channel === "discourse" ? "watched forums" : "by keyword",
    })),
  };
}

async function InboxContent({ searchParams }: { searchParams: PageProps<"/inbox">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        No product yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link>.
      </p>
    );
  }
  const params = await searchParams;
  const view: ViewKey = params.tab === "replies" || params.tab === "trends" ? params.tab : typeof params.tab === "string" && params.tab in TABS ? (params.tab as TabKey) : "review";
  const tab = view === "replies" || view === "trends" ? null : view;
  const replyFilter: ReplyFilter = typeof params.show === "string" && params.show in REPLY_FILTERS ? (params.show as ReplyFilter) : "open";
  const range = TREND_RANGES.find((r) => String(r) === params.range) ?? 30;
  const [{ views, counts, hasBrief, watchedSubreddits, scoring, listening }, replyCounts, repliesView, trends] = await Promise.all([
    loadInbox(product.id, tab),
    replyStatusCounts(product.id),
    view === "replies" ? loadRepliesView(product.id, replyFilter) : null,
    view === "trends" ? listeningTrends(product.id, range) : null,
  ]);
  const pill = (active: boolean) =>
    cn("rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <LiveRefresh tables={["opportunities", "drafts", "publications", "publication_replies"]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Inbox views">
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <Link
              key={key}
              href={key === "review" ? "/inbox" : `/inbox?tab=${key}`}
              className={pill(view === key)}
            >
              {TABS[key].label} <span className="tabular-nums">({counts[key]})</span>
            </Link>
          ))}
          <Link href="/inbox?tab=replies" className={pill(view === "replies")}>
            Replies <span className="tabular-nums">({replyCounts.new} new)</span>
          </Link>
          <Link href="/inbox?tab=trends" className={pill(view === "trends")}>
            Trends
          </Link>
        </nav>
        <InboxToolbar productId={product.id} scoring={scoring} listening={listening} />
      </div>

      {listening.paused && (
        <p className="rounded-lg border p-4 text-sm">
          The hourly search for {product.name} is paused{" "}
          {listening.until
            ? `until ${new Date(listening.until).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
            : "until you resume it"}
          . Scan now still searches once; resume it under Search paused.
        </p>
      )}

      {!hasBrief && (
        <p className="rounded-lg border p-4 text-sm">
          Build intel for {product.name} first (<Link href="/intel" className="underline">Intel</Link>): scoring and drafting use
          its brief and personas.
        </p>
      )}

      {hasBrief && watchedSubreddits === 0 && (
        <p className="rounded-lg border p-4 text-sm">
          No subreddits watched yet. On <Link href="/intel" className="underline">Intel → Communities</Link>, click Watch on
          the subreddits you want Startica to check every hour.
        </p>
      )}

      {repliesView ? (
        <div className="grid max-w-4xl gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className="flex flex-wrap gap-1 text-sm" aria-label="Which replies">
              {(Object.keys(REPLY_FILTERS) as ReplyFilter[]).map((key) => (
                <Link key={key} href={key === "open" ? "/inbox?tab=replies" : `/inbox?tab=replies&show=${key}`} className={pill(replyFilter === key)}>
                  {REPLY_FILTERS[key].label}{" "}
                  <span className="tabular-nums">({REPLY_FILTERS[key].statuses.reduce((n, s) => n + replyCounts[s], 0)})</span>
                </Link>
              ))}
            </nav>
            <MarkAllSeen ids={repliesView.views.filter((r) => r.status === "new").map((r) => r.id)} />
          </div>
          <p className="text-sm text-muted-foreground">
            Replies to what you posted with Startica (Inbox replies and Content Studio posts with a link) from the last 14 days, read every 6 hours from Reddit, Hacker News, Bluesky, Mastodon and Discourse. Your own replies are left out.
          </p>
          {repliesView.views.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No replies here.</p>
          ) : (
            repliesView.views.map((r, i) => {
              const answer = repliesView.answers[i];
              return <ReplyCard key={r.id} reply={r} answer={answer ? <OpportunityCard key={`${answer.id}-${answer.draft?.version ?? 0}`} opportunity={answer} /> : undefined} />;
            })
          )}
        </div>
      ) : trends ? (
        <>
          <nav className="flex gap-1 text-sm" aria-label="Period">
            {TREND_RANGES.map((r) => (
              <Link key={r} href={r === 30 ? "/inbox?tab=trends" : `/inbox?tab=trends&range=${r}`} className={pill(range === r)}>
                Last {r} days
              </Link>
            ))}
          </nav>
          <TrendsView trends={trends} />
        </>
      ) : views.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {tab === "review"
            ? "Nothing to review. Click “Scan now”, or paste a link to a conversation you want to join."
            : "Nothing here."}
        </p>
      ) : (
        <div className="grid max-w-4xl gap-4">
          {views.map((o) => (
            <OpportunityCard key={`${o.id}-${o.draft?.version ?? 0}`} opportunity={o} />
          ))}
        </div>
      )}
    </>
  );
}
