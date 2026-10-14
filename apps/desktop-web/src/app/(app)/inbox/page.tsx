import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { cn } from "@/lib/utils";
import { getActiveProduct } from "@/lib/dal";
import { assistedPostingAvailable, postingContext } from "@/lib/posting";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { MAX_REDRAFTS, recentArchivedScores } from "@startica/core/distribution/thresholds";
import { replyRequest } from "@startica/core/posting/requests";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { InboxToolbar } from "./inbox-toolbar";
import { OpportunityCard, type OpportunityView } from "./opportunity-card";

export const metadata: Metadata = { title: "Inbox" };

const TABS = {
  review: { label: "To review", statuses: ["drafted", "failed"] },
  working: { label: "In progress", statuses: ["new", "drafting"] },
  posted: { label: "Posted", statuses: ["posted"] },
  archived: { label: "Archived", statuses: ["archived"] },
  dismissed: { label: "Dismissed", statuses: ["dismissed"] },
} as const;
type TabKey = keyof typeof TABS;

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

/** Loads one tab of the inbox. A plain function (not a component), so it may read the clock. */
async function loadInbox(productId: string, tab: TabKey) {
  const d = await db();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [statuses, rows, pubs, [product], [watched]] = await Promise.all([
    d.select({ status: schema.opportunities.status }).from(schema.opportunities).where(eq(schema.opportunities.productId, productId)),
    d
      .select({ o: schema.opportunities, c: schema.conversations })
      .from(schema.opportunities)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.opportunities.conversationId))
      .where(and(eq(schema.opportunities.productId, productId), inArray(schema.opportunities.status, [...TABS[tab].statuses])))
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

  const countFor = (key: TabKey) => statuses.filter((r) => (TABS[key].statuses as readonly string[]).includes(r.status)).length;
  const promoFor = (channel: string, community: string | null) => {
    const list = pubs.filter((p) => p.channel === channel && p.community === community);
    return { total: list.length, mentions: list.filter((p) => p.mentionsProduct).length };
  };

  const posting = assistedPostingAvailable();
  const context = posting ? await postingContext(productId) : {};
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
    };
  });

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
  const tab: TabKey = typeof params.tab === "string" && params.tab in TABS ? (params.tab as TabKey) : "review";
  const { views, counts, hasBrief, watchedSubreddits, scoring } = await loadInbox(product.id, tab);

  return (
    <>
      <LiveRefresh tables={["opportunities", "drafts", "publications"]} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Inbox views">
          {(Object.keys(TABS) as TabKey[]).map((key) => (
            <Link
              key={key}
              href={key === "review" ? "/inbox" : `/inbox?tab=${key}`}
              className={cn(
                "rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
                tab === key && "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {TABS[key].label} <span className="tabular-nums">({counts[key]})</span>
            </Link>
          ))}
        </nav>
        <InboxToolbar productId={product.id} scoring={scoring} />
      </div>

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

      {views.length === 0 ? (
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
