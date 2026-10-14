import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveProduct } from "@/lib/dal";
import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { channelFromUrl, redditCommunity } from "@startica/core/channels/index";
import { utmContentOf } from "@startica/core/distribution/utm";
import { localDay } from "@startica/core/growth/moves";
import { WEB_LABEL, webSource, type WebSource } from "@startica/core/metrics/web";
import { aiAndOrganicTraffic } from "@startica/core/search/ai-referrals";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { AddManualMetric, DeleteManualMetric, type ManualRow } from "./manual-metrics";
import { MetricChart, type Point } from "./metric-chart";

export const metadata: Metadata = { title: "Analytics" };

const DAYS = 30;

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader title="Analytics" description={`The last ${DAYS} days: traffic, community, revenue, and what Startica's replies and posts brought in.`} />
      <Suspense fallback={<PageSkeleton />}>
        <AnalyticsContent />
      </Suspense>
    </>
  );
}

type Snapshot = { id: string; day: string; source: string; metric: string; dimension: string; value: number };

/** Loads and shapes the numbers. A plain function, so it may read the clock. */
async function loadAnalytics(productId: string) {
  const d = await db();
  const today = new Date();
  const start = new Date(today.getTime() - (DAYS - 1) * 86400_000);
  // Local days, like GA4 (in the property's time zone) and Umami report them: UTC days would drop one late in the day.
  const startDay = localDay(start);
  const days = Array.from({ length: DAYS }, (_, i) => localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));

  // GA4 or Umami: every web metric below reads the product's one web analytics source.
  const web: WebSource = (await webSource(productId)) ?? "ga4";
  const [snapshots, publications, pieces, connections] = await Promise.all([
    d
      .select()
      .from(schema.metricsSnapshots)
      .where(and(eq(schema.metricsSnapshots.productId, productId), gte(schema.metricsSnapshots.day, startDay)))
      .orderBy(asc(schema.metricsSnapshots.day)),
    d
      .select()
      .from(schema.publications)
      .where(eq(schema.publications.productId, productId))
      .orderBy(desc(schema.publications.postedAt))
      .limit(50),
    d
      .select()
      .from(schema.contentPieces)
      .where(and(eq(schema.contentPieces.productId, productId), eq(schema.contentPieces.status, "posted"), isNotNull(schema.contentPieces.postedAt)))
      .orderBy(desc(schema.contentPieces.postedAt))
      .limit(50),
    d
      .select({ kind: schema.connections.kind, status: schema.connections.status, config: schema.connections.config })
      .from(schema.connections)
      .where(eq(schema.connections.productId, productId)),
  ]);
  const rows = snapshots as Snapshot[];
  const pick = (source: string, metric: string, dimension = "") =>
    rows.filter((r) => r.source === source && r.metric === metric && r.dimension === dimension);
  const sum = (list: Snapshot[]) => list.reduce((s, r) => s + Number(r.value), 0);
  const latest = (list: Snapshot[]) => (list.length ? Number(list[list.length - 1]!.value) : null);
  const series = (list: Snapshot[]): Point[] => {
    const byDay = new Map(list.map((r) => [r.day, Number(r.value)]));
    return days.map((day) => ({ day, value: byDay.get(day) ?? 0 }));
  };

  const sessions = pick(web, "sessions");
  const keyEvents = pick(web, "key_events");
  const signups = pick("product_db", "signups");

  const sources = new Map<string, number>();
  for (const r of rows) {
    if (r.source === web && r.metric === "sessions" && r.dimension.startsWith("source:")) {
      const name = r.dimension.slice("source:".length);
      sources.set(name, (sources.get(name) ?? 0) + Number(r.value));
    }
  }

  // Latest engagement (replies, removed) per reply and per piece; snapshots come newest first.
  const [replySnaps, pieceSnaps] = await Promise.all([
    publications.length
      ? d
          .select()
          .from(schema.engagementSnapshots)
          .where(inArray(schema.engagementSnapshots.publicationId, publications.map((p) => p.id)))
          .orderBy(desc(schema.engagementSnapshots.capturedAt))
      : [],
    pieces.length
      ? d
          .select()
          .from(schema.contentSnapshots)
          .where(inArray(schema.contentSnapshots.pieceId, pieces.map((p) => p.id)))
          .orderBy(desc(schema.contentSnapshots.capturedAt))
      : [],
  ]);
  const ga4 = (utmContent: string | null, metric: string) =>
    utmContent ? sum(rows.filter((r) => r.source === web && r.metric === metric && r.dimension === `utm_content:${utmContent}`)) : 0;
  const posts = [
    ...publications.map((p) => {
      const snap = replySnaps.find((s) => s.publicationId === p.id);
      return {
        id: p.id,
        kind: "reply" as const,
        postedAt: p.postedAt,
        channel: p.channel,
        community: p.community,
        url: p.url,
        text: p.body,
        mentionsProduct: p.mentionsProduct,
        replies: snap?.replies ?? null,
        removed: snap?.removed ?? false,
        visits: ga4(p.draftId, "sessions"),
        conversions: ga4(p.draftId, "key_events"),
      };
    }),
    ...pieces.map((p) => {
      const snap = pieceSnaps.find((s) => s.pieceId === p.id);
      const utmContent = utmContentOf(p.utmUrl);
      const linkChannel = p.postedUrl ? channelFromUrl(p.postedUrl) : "other";
      return {
        id: p.id,
        kind: "content" as const,
        postedAt: p.postedAt!,
        channel: linkChannel === "other" ? p.channel : linkChannel,
        community: p.postedUrl ? redditCommunity(p.postedUrl) : null,
        url: p.postedUrl,
        text: p.title ? `${p.title}: ${p.body}` : p.body,
        mentionsProduct: utmContent !== null,
        replies: snap?.replies ?? null,
        removed: snap?.removed ?? false,
        visits: ga4(utmContent, "sessions"),
        conversions: ga4(utmContent, "key_events"),
      };
    }),
  ]
    .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
    .slice(0, 50);

  const connected = new Set<string>(connections.filter((c) => c.status === "ok").map((c) => c.kind));
  if (connected.has(web)) connected.add("web");
  // The metrics the product database view defines (from the metric builder); empty for a pasted URL, whose view may define anything.
  const dbMetrics = connections.find((c) => c.kind === "product_db")?.config.metrics;
  const definedDbMetrics = Array.isArray(dbMetrics) ? (dbMetrics as { name: string }[]).map((m) => m.name) : null;
  return {
    today: localDay(today),
    web: WEB_LABEL[web],
    connected,
    definedDbMetrics,
    tiles: {
      sessions: sessions.length ? sum(sessions) : null,
      keyEvents: keyEvents.length ? sum(keyEvents) : null,
      signups: signups.length ? sum(signups) : null,
      // "active_posters" is the metric's earlier name; still read so older views keep working.
      activeUsers: latest(pick("product_db", "active_users").concat(pick("product_db", "active_posters")).sort((x, y) => x.day.localeCompare(y.day))),
      subscriptions: latest(pick("stripe", "active_subscriptions")),
      mrr: latest(pick("stripe", "mrr")),
    },
    sessionsSeries: sessions.length ? series(sessions) : null,
    signupsSeries: signups.length ? series(signups) : keyEvents.length ? series(keyEvents) : null,
    signupsLabel: signups.length ? "Signups" : "Key events",
    sources: [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
    posts,
    manual: rows
      .filter((r) => r.source === "manual")
      .map((r): ManualRow => ({ id: r.id, day: r.day, metric: r.metric, value: Number(r.value) }))
      .reverse(),
  };
}

/**
 * Why a tile is empty: the connection is missing, the product database doesn't define
 * that metric (set up with the metric builder), or there's simply no data yet.
 */
function missingReason(a: { connected: Set<string>; definedDbMetrics: string[] | null }, kind: "web" | "stripe" | "product_db", metric?: string): ReactNode {
  const names = { web: "GA4 or Umami", stripe: "Stripe", product_db: "product DB" };
  if (!a.connected.has(kind)) return `Needs ${names[kind]}`;
  if (kind === "product_db" && metric && a.definedDbMetrics && !a.definedDbMetrics.includes(metric)) {
    return (
      <>
        No <code>{metric}</code> metric yet:{" "}
        <Link href="/settings?tab=products" className="underline">
          add it
        </Link>
      </>
    );
  }
  return `No data in the last ${DAYS} days`;
}

function Tile({
  label,
  value,
  format = (n: number) => n.toLocaleString(),
  missing,
}: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
  missing: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value == null ? "—" : format(value)}</CardTitle>
        {value == null && <p className="text-xs text-muted-foreground">{missing}</p>}
      </CardHeader>
    </Card>
  );
}

function NotConnected({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Connect {what} in <Link href="/settings?tab=products" className="underline">Settings → Products</Link> to see this.
    </p>
  );
}

/** Organic and AI-assistant visits for the same window. A plain function, so it may read the clock. */
async function loadTraffic(productId: string) {
  const today = new Date();
  const start = new Date(today.getTime() - (DAYS - 1) * 86400_000);
  return aiAndOrganicTraffic(productId, localDay(start), localDay(today));
}

async function AnalyticsContent() {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        No product yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link>.
      </p>
    );
  }
  const a = await loadAnalytics(product.id);
  const traffic = await loadTraffic(product.id);
  const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const where = (channel: string, community: string | null) =>
    channel === "reddit" && community ? `r/${community}` : (community ?? channel);

  return (
    <>
      {a.connected.size === 0 && (
        <p className="rounded-lg border p-4 text-sm">
          Nothing connected for {product.name} yet. Connect Google Analytics or Umami, Stripe and the product database in{" "}
          <Link href="/settings?tab=products" className="underline">Settings → Products</Link>; numbers appear after the first sync.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label={`Sessions (${DAYS}d)`} value={a.tiles.sessions} missing={missingReason(a, "web")} />
        <Tile label={`Key events (${DAYS}d)`} value={a.tiles.keyEvents} missing={missingReason(a, "web")} />
        <Tile label={`Signups (${DAYS}d)`} value={a.tiles.signups} missing={missingReason(a, "product_db", "signups")} />
        <Tile label="Active users" value={a.tiles.activeUsers} missing={missingReason(a, "product_db", "active_users")} />
        <Tile label="Subscriptions" value={a.tiles.subscriptions} missing={missingReason(a, "stripe")} />
        <Tile label="MRR" value={a.tiles.mrr} format={money} missing={missingReason(a, "stripe")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sessions per day</CardTitle>
            <CardDescription>All traffic, from {a.web}.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.sessionsSeries ? <MetricChart data={a.sessionsSeries} unit="sessions" label="Sessions" /> : <NotConnected what="Google Analytics or Umami" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{a.signupsLabel} per day</CardTitle>
            <CardDescription>
              {a.signupsLabel === "Signups" ? "From the product database." : `${a.web} key events (connect the product database for signups).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a.signupsSeries ? (
              <MetricChart data={a.signupsSeries} unit={a.signupsLabel.toLowerCase()} label={a.signupsLabel} />
            ) : (
              <NotConnected what="the product database, Google Analytics or Umami" />
            )}
          </CardContent>
        </Card>
      </div>

      {traffic.hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Search and AI assistants</CardTitle>
            <CardDescription>
              Sessions from search engines&apos; results and from AI assistants that linked to the site, last {DAYS} days.{" "}
              <Link href="/seo/search" className="underline">
                Search details
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Organic search</div>
              <div className="text-2xl font-semibold tabular-nums">{Math.round(traffic.organic).toLocaleString("en-US")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">AI assistants</div>
              <div className="text-2xl font-semibold tabular-nums">{Math.round(traffic.ai).toLocaleString("en-US")}</div>
            </div>
            <div className="grid content-start gap-0.5">
              {traffic.assistants.length === 0 ? (
                <span className="text-muted-foreground">No visits from AI assistants yet.</span>
              ) : (
                traffic.assistants.slice(0, 4).map((x) => (
                  <div key={x.name} className="flex justify-between gap-4">
                    <span>{x.name}</span>
                    <span className="tabular-nums">{Math.round(x.sessions).toLocaleString("en-US")}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Posted by Startica</CardTitle>
          <CardDescription>
            Inbox replies and Content Studio pieces you marked as posted. Replies below them are checked every 6 hours on
            Reddit, Hacker News, Bluesky, Mastodon and Discourse (and X, with an X API token) for two weeks. Visits and key events come from {a.web}, matched by the tracking link (only
            posts that link to the product can bring tracked visits).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {a.posts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing posted yet. Post a reply from the <Link href="/inbox" className="underline">Inbox</Link> or a piece
              from <Link href="/content" className="underline">Content Studio</Link>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Posted</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>Post</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Key events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.posts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {r.postedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                          {where(r.channel, r.community)}
                        </a>
                      ) : (
                        where(r.channel, r.community)
                      )}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {r.kind === "content" && <Badge variant="secondary" className="mr-2">Content</Badge>}
                      {r.removed && <Badge variant="destructive" className="mr-2">Removed</Badge>}
                      {r.mentionsProduct && <Badge variant="outline" className="mr-2">Links product</Badge>}
                      {r.text}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.replies ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.connected.has("web") ? r.visits : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.connected.has("web") ? r.conversions : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top traffic sources</CardTitle>
            <CardDescription>Sessions by source / medium, last {DAYS} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.sources.length === 0 ? (
              <NotConnected what="Google Analytics or Umami" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source / medium</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.sources.map(([name, value]) => (
                    <TableRow key={name}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="text-right tabular-nums">{value.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Numbers you entered</CardTitle>
            <CardDescription>Anything Startica can&apos;t read on its own.</CardDescription>
            <CardAction>
              <AddManualMetric productId={product.id} today={a.today} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {a.manual.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {a.manual.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.day}</TableCell>
                      <TableCell>{m.metric.replaceAll("_", " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.value.toLocaleString()}</TableCell>
                      <TableCell>
                        <DeleteManualMetric row={m} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
