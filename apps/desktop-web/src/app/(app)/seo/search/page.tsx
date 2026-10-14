import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { aiAndOrganicTraffic, AI_ASSISTANTS_CHECKED } from "@startica/core/search/ai-referrals";
import { brandMatcher, dailyTotals, periods, siteTotals, topKeys, type Flag, type KeyRow, type Totals } from "@startica/core/search/report";
import { savedSitemaps } from "@startica/core/search/sync";
import { connections, type SearchSource } from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, getActiveProduct } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { MetricChart } from "../../analytics/metric-chart";

export const metadata: Metadata = { title: "Search" };

const RANGES = [7, 28, 90, 365] as const;
const FILTERS = [
  { key: "all", label: "All" },
  { key: "nonbrand", label: "Non-brand" },
  { key: "brand", label: "Brand" },
  { key: "striking", label: "Striking distance" },
  { key: "low_ctr", label: "Low click-through" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

const FLAG_LABEL: Record<Flag, { label: string; title: string }> = {
  striking: {
    label: "Striking distance",
    title: "Average position about 5 to 20 with real impressions: a better page or title could move it onto page 1 or up it.",
  },
  low_ctr: {
    label: "Low click-through",
    title: "Fewer clicks than usual for its position: the title and description may not match what people want.",
  },
};

export default function SearchPage(props: PageProps<"/seo/search">) {
  return (
    <>
      <PageHeader
        title="Search"
        description="What people search for when they find the site: clicks, impressions and positions from Google Search Console and Bing."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Search searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;
const pos = (n: number) => (n ? n.toFixed(1) : "—");
const num = (n: number) => n.toLocaleString("en-US");

function Change({ now, before, invert = false, absolute = false }: { now: number; before: number; invert?: boolean; absolute?: boolean }) {
  if (!before) return null;
  if (absolute) {
    const diff = now - before;
    if (Math.abs(diff) < 0.05) return <span className="text-xs text-muted-foreground">no change</span>;
    const good = invert ? diff < 0 : diff > 0;
    return <span className={cn("text-xs tabular-nums", good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{`${diff > 0 ? "+" : ""}${diff.toFixed(1)}`}</span>;
  }
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="text-xs text-muted-foreground">no change</span>;
  const good = invert ? change < 0 : change > 0;
  return (
    <span
      className={cn("text-xs tabular-nums", good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}
    >{`${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}</span>
  );
}

function Tile({ label, value, change, hint }: { label: string; value: string; change?: React.ReactNode; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription title={hint}>{label}</CardDescription>
        <CardTitle className="flex items-baseline gap-2 text-2xl tabular-nums">
          {value} {change}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function KeyTable({ rows, label, link, compare = true }: { rows: KeyRow[]; label: string; link?: boolean; compare?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing in this period.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">CTR</TableHead>
          <TableHead className="text-right">Position</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="max-w-md whitespace-normal">
              <div className="flex flex-wrap items-center gap-1.5">
                {link ? (
                  <a href={r.key} target="_blank" rel="noreferrer" className="font-mono text-xs underline">
                    {r.key.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </a>
                ) : (
                  <span>{r.key}</span>
                )}
                {r.brand && <Badge variant="outline">Brand</Badge>}
                {r.flags.map((f) => (
                  <Badge key={f} variant="secondary" title={FLAG_LABEL[f].title}>
                    {FLAG_LABEL[f].label}
                  </Badge>
                ))}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {num(r.current.clicks)} <Change now={r.current.clicks} before={compare ? r.previousClicks : 0} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{num(r.current.impressions)}</TableCell>
            <TableCell className="text-right tabular-nums">{pct(r.current.ctr)}</TableCell>
            <TableCell className="text-right tabular-nums">{pos(r.current.position)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Chips<T extends string | number>({ items, current, href }: { items: { key: T; label: string }[]; current: T; href: (key: T) => string }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm">
      {items.map((i) => (
        <Link
          key={String(i.key)}
          href={href(i.key)}
          aria-current={i.key === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1 text-muted-foreground hover:text-foreground",
            i.key === current && "bg-background font-medium text-foreground shadow-sm",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

function NotConnected() {
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Connect Google Search Console</CardTitle>
        <CardDescription>
          See the searches people find the site with: clicks, impressions and average position for every query and page, the last 16 months of them, and which
          queries are close to page 1. Search Console is free; Startica reads it with a read-only service account, the same way it reads GA4.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/settings?tab=products" className="text-sm underline">
          Connect it in Settings → Products → Connections
        </Link>
      </CardContent>
    </Card>
  );
}

async function Search({ searchParams }: { searchParams: PageProps<"/seo/search">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in{" "}
        <Link href="/settings?tab=products" className="underline">
          Settings
        </Link>{" "}
        first.
      </p>
    );
  }
  const params = await searchParams;
  const range = RANGES.find((r) => String(r) === params.range) ?? 28;
  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ?? "all") as FilterKey;
  const conns = await (
    await db()
  )
    .select()
    .from(connections)
    .where(and(eq(connections.productId, product.id), inArray(connections.kind, ["search_console", "bing_webmaster"])));
  const bingConn = conns.find((c) => c.kind === "bing_webmaster");
  const [googleP, bingP] = await Promise.all([periods(product.id, "google", range), periods(product.id, "bing", range)]);
  const hasBing = Boolean(bingConn || bingP.newest);
  const hasGoogle = Boolean(conns.some((c) => c.kind === "search_console") || googleP.newest);
  const source: SearchSource = params.source === "bing" && hasBing ? "bing" : hasGoogle ? "google" : hasBing ? "bing" : "google";
  const href = (next: { range?: number; filter?: string; source?: SearchSource }) => {
    const q = new URLSearchParams({
      source: next.source ?? source,
      range: String(next.range ?? range),
      filter: next.filter ?? filter,
    });
    return `/seo/search?${q}`;
  };
  const conn = conns.find((c) => c.kind === (source === "google" ? "search_console" : "bing_webmaster"));
  const p = source === "google" ? googleP : bingP;
  if (!hasGoogle && !hasBing) return <NotConnected />;
  const engine = source === "google" ? "Google" : "Bing";

  const isBrand = brandMatcher([product.name, ...(product.url ? [new URL(product.url).hostname.replace(/^www\./, "").split(".")[0]!] : [])]);
  const [now, before, allQueries, days, queries, pages, countries, devices, sitemaps, traffic] = await Promise.all([
    siteTotals(product.id, source, p.current),
    siteTotals(product.id, source, p.previous),
    siteTotals(product.id, source, p.current, "query"),
    dailyTotals(product.id, source, p.current),
    topKeys(product.id, source, "query", p.current, p.previous, { isBrand }),
    topKeys(product.id, source, "page", p.current, p.previous, { limit: 50 }),
    topKeys(product.id, source, "country", p.current, p.previous, { limit: 8 }),
    topKeys(product.id, source, "device", p.current, p.previous, { limit: 3 }),
    savedSitemaps(product.id),
    aiAndOrganicTraffic(product.id, p.current.start, p.current.end),
  ]);
  const shown = queries
    .filter((q) => (filter === "brand" ? q.brand : filter === "nonbrand" ? !q.brand : filter === "all" ? true : q.flags.includes(filter as Flag)))
    .slice(0, 100);
  // Google leaves rare queries out of query rows for privacy; Bing's query rows are weekly, so the gap means nothing there.
  const hidden = source === "google" ? Math.max(0, now.clicks - allQueries.clicks) : 0;
  // Compare only against a period the stored data fully covers (Search Console keeps 16 months).
  const compare = p.previousComplete;
  const was = (n: number) => (compare ? n : 0);
  const syncing = conn && conn.status === "untested";

  return (
    <>
      <LiveRefresh tables={["connections", "search_stats", "metrics_snapshots"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasGoogle && hasBing && (
          <Chips
            items={[
              { key: "google" as SearchSource, label: "Google" },
              { key: "bing" as SearchSource, label: "Bing and Copilot" },
            ]}
            current={source}
            href={(s) => href({ source: s })}
          />
        )}
        <Chips
          items={RANGES.map((r) => ({
            key: r,
            label: r === 365 ? "12 months" : `${r} days`,
          }))}
          current={range}
          href={(r) => href({ range: r })}
        />
        <p className="text-xs text-muted-foreground">
          {p.newest ? `${p.current.start} to ${p.current.end}${compare ? `, compared with the ${range === 365 ? "12 months" : `${range} days`} before` : " (not enough older data to compare)"}.` : ""}
          {conn?.status === "error" && <span className="text-destructive"> Last sync failed: {conn.lastError}</span>}
        </p>
      </div>
      {conn?.status === "ok" && !p.newest && (
        <div className="grid gap-1 rounded-lg border p-4 text-sm">
          <p className="font-medium">Connected to {String(conn.config.siteUrl ?? (source === "google" ? "Search Console" : "Bing"))}, but it has no search data yet.</p>
          <p className="text-muted-foreground">
            {source === "google"
              ? "The last sync worked; Google returned no clicks or impressions for this property in the last 16 months. That's normal for a property verified in the last few days or a site Google hardly shows yet. Check Performance → Search results in Search Console: if it shows numbers there, they appear here after the next sync (daily at 08:15, or Sync now in Settings)."
              : "The last sync worked; Bing returned no traffic for this site yet. Bing's numbers start a few days after a site is verified."}
          </p>
        </div>
      )}
      {syncing && (
        <p className="rounded-lg border p-4 text-sm">
          Reading {source === "google" ? "Search Console: the first sync fetches 16 months and" : "Bing Webmaster Tools: this"} can take a minute.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {source === "google"
          ? "Google counts searches in AI Overviews and AI Mode in these numbers; its API doesn't report them separately."
          : "Bing combines Bing search and Copilot. Daily totals update every day; queries and pages are weekly, so short ranges may show none."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Clicks" value={num(now.clicks)} change={<Change now={now.clicks} before={was(before.clicks)} />} />
        <Tile label="Impressions" value={num(now.impressions)} change={<Change now={now.impressions} before={was(before.impressions)} />} />
        <Tile label="Click-through rate" value={pct(now.ctr)} change={<Change now={now.ctr} before={was(before.ctr)} />} />
        <Tile
          label="Average position"
          value={pos(now.position)}
          change={<Change now={now.position} before={was(before.position)} invert absolute />}
          hint="Weighted by impressions. Lower is better: 1 is the top result."
        />
      </div>

      {days.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Clicks from {engine}</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricChart data={days.map((d) => ({ day: d.day, value: d.clicks }))} unit="clicks" label={`Clicks from ${engine}`} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Queries</CardTitle>
          <CardDescription>
            What people searched for. Brand queries mention {product.name}. Hover a flag to see what it means.
            {hidden > 0 && ` Google hides rare queries for privacy, so ${num(hidden)} of the ${num(now.clicks)} clicks aren't listed under any query.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Chips items={FILTERS.map((f) => ({ key: f.key, label: f.label }))} current={filter} href={(f) => href({ filter: f })} />
          <KeyTable rows={shown} label="Query" compare={compare} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pages</CardTitle>
          <CardDescription>The pages people landed on from {engine}.</CardDescription>
        </CardHeader>
        <CardContent>
          <KeyTable rows={pages} label="Page" link compare={compare} />
        </CardContent>
      </Card>

      {source === "google" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Countries and devices</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {countries.length + devices.length === 0 ? (
                <p className="text-muted-foreground">Nothing in this period.</p>
              ) : (
                <>
                  <Breakdown rows={countries} total={now} name={(k) => k.toUpperCase()} />
                  <Breakdown rows={devices} total={now} name={(k) => k.replace(/^\w/, (x) => x.toUpperCase())} />
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sitemaps</CardTitle>
              <CardDescription>
                As Search Console last read them
                {sitemaps ? `, checked ${sitemaps.checkedAt.slice(0, 10)}` : ""}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {!sitemaps?.sitemaps.length ? (
                <p className="text-muted-foreground">No sitemap submitted. Submit one in Search Console → Sitemaps so Google finds every page.</p>
              ) : (
                sitemaps.sitemaps.map((s) => (
                  <div key={s.path} className="grid gap-0.5">
                    <span className="font-mono text-xs">{s.path}</span>
                    <span className={cn("text-xs", s.errors ? "text-destructive" : "text-muted-foreground")}>
                      {s.submitted != null ? `${num(s.submitted)} pages listed · ` : ""}
                      {s.isPending ? "waiting for Google to read it" : s.lastDownloaded ? `read ${s.lastDownloaded.slice(0, 10)}` : "not read yet"}
                      {s.errors ? ` · ${s.errors} ${s.errors === 1 ? "error" : "errors"}` : ""}
                      {s.warnings ? ` · ${s.warnings} ${s.warnings === 1 ? "warning" : "warnings"}` : ""}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Visits from search and AI assistants</CardTitle>
          <CardDescription>
            From {traffic.source === "umami" ? "Umami" : "Google Analytics"}: sessions that came from a search engine&apos;s results, and from AI assistants that linked to the site. Assistant list
            checked {AI_ASSISTANTS_CHECKED}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          {!traffic.hasData ? (
            <p className="text-muted-foreground sm:col-span-2">
              Connect Google Analytics or Umami in{" "}
              <Link href="/settings?tab=products" className="underline">
                Settings → Products
              </Link>{" "}
              to see this.
            </p>
          ) : (
            <>
              <div className="grid content-start gap-1">
                <div className="text-xs text-muted-foreground">Organic search</div>
                <div className="text-2xl font-semibold tabular-nums">{num(Math.round(traffic.organic))}</div>
                {traffic.engines.slice(0, 5).map((e) => (
                  <div key={e.source} className="flex justify-between">
                    <span>{e.source}</span>
                    <span className="tabular-nums">{num(Math.round(e.sessions))}</span>
                  </div>
                ))}
              </div>
              <div className="grid content-start gap-1">
                <div className="text-xs text-muted-foreground">AI assistants</div>
                <div className="text-2xl font-semibold tabular-nums">{num(Math.round(traffic.ai))}</div>
                {traffic.assistants.length === 0 ? (
                  <p className="text-muted-foreground">No visits from AI assistants in this period.</p>
                ) : (
                  traffic.assistants.map((a) => (
                    <div key={a.name} className="flex justify-between">
                      <span>{a.name}</span>
                      <span className="tabular-nums">{num(Math.round(a.sessions))}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Breakdown({ rows, total, name }: { rows: KeyRow[]; total: Totals; name: (key: string) => string }) {
  return (
    <div className="grid gap-1">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-2">
          <span>{name(r.key)}</span>
          <span className="h-2 rounded-full bg-muted">
            <span
              className="block h-2 rounded-full bg-[var(--module-chart,#2a78d6)] dark:bg-[var(--module-chart,#3987e5)]"
              style={{
                width: `${total.clicks ? Math.round((r.current.clicks / total.clicks) * 100) : 0}%`,
              }}
            />
          </span>
          <span className="text-right tabular-nums">{num(r.current.clicks)}</span>
        </div>
      ))}
    </div>
  );
}
