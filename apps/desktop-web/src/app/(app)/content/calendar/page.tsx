import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq } from "drizzle-orm";
import { CalendarClockIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, SparklesIcon } from "lucide-react";
import { hasAiKey } from "@startica/core/ai/client";
import { versionsToShow } from "@startica/core/chat/threads";
import { describeHint, hintFor, loadBestTimes } from "@startica/core/content/best-time";
import { calendarItems, type CalendarItem } from "@startica/core/content/calendar";
import { listContentPlans, planChannels, planEstimate } from "@startica/core/content/plan";
import { localDay } from "@startica/core/growth/moves";
import { pieceRequest, replyRequest } from "@startica/core/posting/requests";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { channelLabel } from "@/lib/channels";
import { db, getActiveProduct, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { planHint } from "@/lib/plan-hints";
import { assistedPostingAvailable, postingContext } from "@/lib/posting";
import { cn } from "@/lib/utils";
import { OpportunityCard, type OpportunityView } from "../../inbox/opportunity-card";
import { PieceCard, type PieceView } from "../content-studio";
import { PlanAgainButton, PlanDialog, type PlanView } from "./calendar-ui";

export const metadata: Metadata = { title: "Content calendar" };

export default function CalendarPage(props: PageProps<"/content/calendar">) {
  return (
    <>
      <PageHeader title="Content Studio" description="Plan when each post and reply goes out. Startica reminds you when it's due; you still press Post… and the site's own button." />
      <Suspense fallback={<PageSkeleton />}>
        <Calendar searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

type View = "week" | "month";
const DAY = 86400_000;
const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Monday on or before `d`. */
const monday = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** The days shown and what's planned on them. A plain loader: it reads the clock. */
async function loadCalendar(productId: string, view: View, anchorDay: string | null) {
  const today = new Date();
  const anchor = anchorDay && /^\d{4}-\d{2}-\d{2}$/.test(anchorDay) ? parseDay(anchorDay) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const first = view === "week" ? monday(anchor) : monday(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const last = view === "week" ? addDays(first, 7) : addDays(monday(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 7);
  const items = await calendarItems(productId, first, last);
  const days: { day: string; date: Date; items: CalendarItem[] }[] = [];
  for (let d = first; d < last; d = addDays(d, 1)) {
    const key = localDay(d);
    days.push({ day: key, date: d, items: items.filter((i) => localDay(i.plannedAt) === key) });
  }
  const prev = view === "week" ? addDays(anchor, -7) : new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
  const next = view === "week" ? addDays(anchor, 7) : new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  const title =
    view === "week"
      ? `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(first, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { days, anchor, prev: localDay(prev), next: localDay(next), today: localDay(today), title, overdue: items.filter((i) => !i.posted && i.plannedAt.getTime() < today.getTime() - DAY / 24).length };
}

async function Calendar({ searchParams }: { searchParams: PageProps<"/content/calendar">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const params = await searchParams;
  const view: View = params.view === "month" ? "month" : "week";
  const anchorDay = typeof params.date === "string" ? params.date : null;
  const focus = typeof params.focus === "string" ? params.focus : null;
  const workspace = await getWorkspace();
  const ctx = { workspaceId: workspace.id };
  const [cal, times, plans, base, onePiece, aiKey] = await Promise.all([
    loadCalendar(product.id, view, anchorDay),
    loadBestTimes(product.id),
    listContentPlans(product.id),
    planEstimate(ctx, 0),
    planEstimate(ctx, 1),
    hasAiKey(),
  ]);
  const link = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { view, date: anchorDay, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "view" && v === "week")) q.set(k, v);
    const s = q.toString();
    return `/content/calendar${s ? `?${s}` : ""}`;
  };
  const focused = focus ? await loadFocus(product.id, focus, times) : null;
  const planViews: PlanView[] = plans.map((p) => ({
    id: p.id,
    range: `${parseDay(p.startDay).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseDay(p.endDay).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    channels: p.channels.map((c) => channelLabel(c)).join(", "),
    postsPerWeek: p.postsPerWeek,
    status: p.status,
    error: p.error,
    summary: p.summary,
    pieces: p.items.filter((i) => i.pieceId).length,
    costUsd: p.costUsd,
  }));
  const hintChannels = planChannels.filter((c) => times.channels[c]);

  return (
    <>
      <LiveRefresh tables={["content_pieces", "content_plans", "content_images", "opportunities", "drafts", "jobs"]} />
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Content Studio views">
        {[
          ["/content", "Create"],
          ["/content?tab=library", "Library"],
          ["/content/calendar", "Calendar"],
          ["/content?tab=voices", "Voices"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href!}
            className={cn("rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground", label === "Calendar" && "bg-background font-medium text-foreground shadow-sm")}
          >
            {label}
          </Link>
        ))}
      </nav>

      {focused && (
        <section className="grid max-w-4xl gap-2" aria-label="Planned item">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{focused.kind === "piece" ? "Planned post" : "Planned reply"}</h2>
            <Link href={link({ focus: null })} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
              Close
            </Link>
          </div>
          {focused.kind === "piece" ? (
            <PieceCard key={`${focused.piece.id}-${focused.piece.status}-${focused.piece.updated}`} piece={focused.piece} />
          ) : focused.kind === "reply" ? (
            <OpportunityCard key={`${focused.opportunity.id}-${focused.opportunity.draft?.version ?? 0}`} opportunity={focused.opportunity} />
          ) : (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">That item is gone (deleted or dismissed).</p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={link({ date: cal.prev })} aria-label="Earlier" className="rounded-md border p-1.5 hover:bg-muted">
            <ChevronLeftIcon className="size-4" />
          </Link>
          <Link href={link({ date: cal.next })} aria-label="Later" className="rounded-md border p-1.5 hover:bg-muted">
            <ChevronRightIcon className="size-4" />
          </Link>
          <Link href={link({ date: null })} className="rounded-md border px-2 py-1 text-sm hover:bg-muted">
            Today
          </Link>
          <h2 className="ml-2 text-base font-medium">{cal.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            {(["week", "month"] as const).map((v) => (
              <Link key={v} href={link({ view: v })} className={cn("rounded-md px-3 py-1 text-muted-foreground", view === v && "bg-background font-medium text-foreground shadow-sm")}>
                {v === "week" ? "Week" : "Month"}
              </Link>
            ))}
          </div>
          <PlanDialog
            productId={product.id}
            channels={planChannels.map((c) => ({ value: c, label: channelLabel(c), hint: describeHint(hintFor(times, c)) }))}
            estimate={{ baseUsd: base.usd, perPieceUsd: onePiece.usd - base.usd, model: base.model }}
            aiKey={aiKey}
            busy={plans.some((p) => p.status === "working")}
          />
        </div>
      </div>

      {cal.overdue > 0 && (
        <p className="rounded-lg border p-3 text-sm">
          {cal.overdue === 1 ? "One planned item is" : `${cal.overdue} planned items are`} past their time and not posted: post them, or move them to a new time.
        </p>
      )}

      <div className={cn("grid gap-px overflow-hidden rounded-lg border bg-border", "grid-cols-1 sm:grid-cols-7")}>
        {cal.days.slice(0, 7).map((d) => (
          <div key={`h-${d.day}`} className="hidden bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground sm:block">
            {d.date.toLocaleDateString("en-US", { weekday: "short" })}
          </div>
        ))}
        {cal.days.map((d) => {
          const outside = view === "month" && d.date.getMonth() !== cal.anchor.getMonth();
          return (
            <div key={d.day} className={cn("grid content-start gap-1 bg-background p-2", view === "week" ? "min-h-48" : "min-h-24", outside && "bg-muted/30 text-muted-foreground")}>
              <span className={cn("text-xs tabular-nums", d.day === cal.today && "font-semibold text-foreground")}>
                <span className="sm:hidden">{d.date.toLocaleDateString("en-US", { weekday: "short" })} </span>
                {d.date.getDate()}
                {d.day === cal.today && " · today"}
              </span>
              {d.items.map((i) => (
                <Link
                  key={`${i.kind}-${i.id}`}
                  href={link({ focus: `${i.kind}:${i.id}` })}
                  className={cn("grid gap-0.5 rounded-md border p-1.5 text-xs hover:bg-muted/60", i.posted && "opacity-60", focus === `${i.kind}:${i.id}` && "ring-2 ring-ring")}
                  title={i.planWhy ?? undefined}
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {i.posted ? <CheckIcon className="size-3" aria-label="Posted" /> : <CalendarClockIcon className="size-3" aria-hidden />}
                    {time(i.plannedAt)} · {channelLabel(i.channel)}
                    {i.planId && <SparklesIcon className="size-3" aria-label="From a content plan" />}
                  </span>
                  <span className={cn("line-clamp-2 font-medium", view === "month" && "line-clamp-1")}>{i.title}</span>
                  {i.status === "drafting" && <span className="text-muted-foreground">Writing…</span>}
                  {i.status === "failed" && <span className="text-destructive">Failed</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Best times to post</CardTitle>
            <CardDescription>From when your own posts got the most engagement, or else when the communities you watch are busiest. Rules, not AI; your computer&apos;s time zone.</CardDescription>
          </CardHeader>
          <CardContent>
            {hintChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not enough data yet. Post with links (so Startica can track engagement) and watch communities on Intel; hints appear once there&apos;s enough to go on.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {hintChannels.map((c) => (
                  <li key={c} className="grid gap-0.5">
                    <span className="font-medium">{channelLabel(c)}</span>
                    <span className="text-muted-foreground">{describeHint(times.channels[c]!)}</span>
                  </li>
                ))}
                {Object.values(times.communities)
                  .filter((h) => h.enough)
                  .slice(0, 6)
                  .map((h) => (
                    <li key={h.key} className="grid gap-0.5">
                      <span className="font-medium">{h.label}</span>
                      <span className="text-muted-foreground">{describeHint(h)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Content plans</CardTitle>
            <CardDescription>The AI fills a week or two with planned posts from your Intel, the weekly analytics read-out and what worked. Each becomes a draft in the Library to edit; nothing posts on its own.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {planViews.length === 0 && <p className="text-sm text-muted-foreground">No plans yet. Use Plan with AI above.</p>}
            {planViews.map((p) => (
              <div key={p.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.range}</span>
                  <Badge variant={p.status === "failed" ? "destructive" : "outline"}>{p.status === "working" ? "Planning…" : p.status === "ready" ? `${p.pieces} posts` : "Failed"}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.channels} · {p.postsPerWeek}/week{p.costUsd > 0 && ` · $${p.costUsd.toFixed(2)}`}
                  </span>
                  {p.status !== "working" && <PlanAgainButton planId={p.id} disabled={!aiKey} />}
                </div>
                {p.summary && <p className="text-muted-foreground">{p.summary}</p>}
                {p.error && <p className="text-xs text-destructive">{p.error}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** The item a reminder (or a click on the calendar) opens, with Post… where the desktop app can post it. */
async function loadFocus(productId: string, focus: string, times: Awaited<ReturnType<typeof loadBestTimes>>) {
  const [kind, itemId] = focus.split(":");
  if (!itemId || !/^[0-9a-f-]{36}$/i.test(itemId)) return null;
  const d = await db();
  const posting = assistedPostingAvailable();
  const context = posting ? await postingContext(productId) : {};
  const aiReady = !desktopApp().demo && (await hasAiKey());
  const workspaceId = (await getWorkspace()).id;
  if (kind === "piece") {
    const [p] = await d.select().from(schema.contentPieces).where(and(eq(schema.contentPieces.id, itemId), eq(schema.contentPieces.productId, productId)));
    if (!p) return { kind: "gone" as const };
    const [images] = await d.select({ n: count() }).from(schema.contentImages).where(eq(schema.contentImages.pieceId, p.id));
    const piece: PieceView = {
      id: p.id,
      channel: p.channel,
      format: p.format,
      topic: p.topic,
      title: p.title,
      body: p.body,
      rationale: p.rationale,
      status: p.status,
      error: p.error,
      voice: null,
      postedUrl: p.postedUrl,
      engagement: null,
      traffic: null,
      notes: p.notes,
      created: p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      canPost: posting && pieceRequest(p, context) !== null,
      plannedAt: p.plannedAt?.getTime() ?? null,
      planWhy: p.planWhy,
      hint: p.status === "posted" ? null : planHint(times, p.channel),
      images: images?.n ?? 0,
      updated: p.updatedAt.getTime(),
      aiReady,
      versions: await versionsToShow(workspaceId, "content_piece", p.id),
    };
    return { kind: "piece" as const, piece };
  }
  if (kind === "reply") {
    const [row] = await d
      .select({ o: schema.opportunities, c: schema.conversations })
      .from(schema.opportunities)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.opportunities.conversationId))
      .where(and(eq(schema.opportunities.id, itemId), eq(schema.opportunities.productId, productId)));
    if (!row || row.o.status === "dismissed") return { kind: "gone" as const };
    const { o, c } = row;
    const [draft] = await d.select().from(schema.drafts).where(eq(schema.drafts.opportunityId, o.id)).orderBy(desc(schema.drafts.version)).limit(1);
    const opportunity: OpportunityView = {
      id: o.id,
      status: o.status,
      relevance: o.relevance,
      intent: o.intent,
      reasoning: o.reasoning,
      angle: o.angle,
      error: o.error,
      dismissReason: o.dismissReason,
      conversation: { channel: c.channel, community: c.community, kind: c.kind, url: c.url, title: c.title, threadTitle: c.threadTitle, body: c.body, author: c.author, postedAgo: null },
      draft: draft ? { version: draft.version, body: draft.body, mentionsProduct: draft.mentionsProduct, rationale: draft.rationale, source: draft.source } : null,
      promo: null,
      canPost: posting && draft != null && replyRequest(c, draft, o.id, context) !== null,
      postedUrl: null,
      plannedAt: o.plannedAt?.getTime() ?? null,
      planHint: o.status === "drafted" ? planHint(times, c.channel, c.community) : null,
      aiReady,
      versions: await versionsToShow(workspaceId, "reply_draft", o.id),
    };
    return { kind: "reply" as const, opportunity };
  }
  return null;
}
