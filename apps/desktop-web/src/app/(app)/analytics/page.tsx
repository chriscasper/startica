import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HISTORY_CHOICES, historyDays } from "@startica/core/metrics/history";
import { DEFAULT_RANGE, loadAnalyticsReport, rangesFor, RANGE_CHOICES } from "@startica/core/metrics/report";
import { latestAnalyticsSummaries } from "@startica/core/metrics/summary";
import { hasAiKey } from "@startica/core/ai/client";
import * as schema from "@startica/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { db, getActiveProduct } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { ConversionsTab, OverviewTab, RevenueTab, StarticaTab, TrafficTab } from "./tabs";

export const metadata: Metadata = { title: "Analytics" };

const TABS = {
  overview: "Overview",
  traffic: "Traffic",
  conversions: "Conversions",
  revenue: "Revenue",
  startica: "What Startica did",
} as const;
type Tab = keyof typeof TABS;

export default function AnalyticsPage(props: PageProps<"/analytics">) {
  return (
    <>
      <PageHeader title="Analytics" description="Traffic, conversions, revenue and what Startica's replies and posts brought in, against the period before." />
      <Suspense fallback={<PageSkeleton />}>
        <AnalyticsContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** Loader (plain function: reads the clock). */
async function load(productId: string, asked: number) {
  const ranges = rangesFor(await historyDays(productId));
  const range = ranges.some((x) => x.days === asked) ? asked : DEFAULT_RANGE;
  const [report, summaries, aiKey, [working]] = await Promise.all([
    loadAnalyticsReport(productId, range),
    latestAnalyticsSummaries(productId),
    hasAiKey(),
    (await db())
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.queue, "analytics_summary"), inArray(schema.jobs.status, ["queued", "running"])))
      .limit(1),
  ]);
  return { report, ranges, range, summaries, aiKey, writing: Boolean(working) };
}

const longDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function AnalyticsContent({ searchParams }: { searchParams: PageProps<"/analytics">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        No product yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link>.
      </p>
    );
  }
  const params = await searchParams;
  const tab: Tab = typeof params.tab === "string" && params.tab in TABS ? (params.tab as Tab) : "overview";
  const asked = RANGE_CHOICES.find((r) => String(r.days) === params.range)?.days ?? DEFAULT_RANGE;
  const { report, ranges, range, summaries, aiKey, writing } = await load(product.id, asked);
  const href = (next: { tab?: Tab; range?: number }) => {
    const q = new URLSearchParams();
    const t = next.tab ?? tab;
    const d = next.range ?? range;
    if (t !== "overview") q.set("tab", t);
    if (d !== DEFAULT_RANGE) q.set("range", String(d));
    return `/analytics${q.size ? `?${q}` : ""}`;
  };
  const historyLabel = HISTORY_CHOICES.find((c) => c.days === report.history)?.label ?? `${report.history} days`;

  return (
    <>
      <LiveRefresh tables={["connections", "metrics_snapshots", "publications", "content_snapshots", "analytics_summaries", "jobs"]} />
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Analytics sections">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={href({ tab: key })}
            aria-current={tab === key ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", tab === key && "bg-background font-medium text-foreground shadow-sm")}
          >
            {TABS[key]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex flex-wrap gap-1 rounded-lg border p-1 text-sm" aria-label="Period">
          {ranges.map((x) => (
            <Link
              key={x.days}
              href={href({ range: x.days })}
              aria-current={x.days === range ? "page" : undefined}
              className={cn("rounded-md px-2.5 py-0.5 text-muted-foreground hover:text-foreground", x.days === range && "bg-muted font-medium text-foreground")}
            >
              {x.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-muted-foreground">
          {longDay(report.current.start)} to {longDay(report.current.end)}
          {report.previousComplete ? `, compared with the ${range} days before.` : ". Not enough older data yet to compare with the period before."}{" "}
          Startica keeps {historyLabel} of history:{" "}
          <Link href="/settings?tab=products" className="underline">
            keep more
          </Link>
          {report.web && <>, or open {report.webLabel} for anything older</>}.
        </p>
      </div>

      {report.connected.size === 0 && (
        <p className="rounded-lg border p-4 text-sm">
          Nothing connected for {product.name} yet. Connect Google Analytics or Umami, Stripe and the product database in{" "}
          <Link href="/settings?tab=products" className="underline">
            Settings → Products
          </Link>
          ; numbers appear after the first sync.
        </p>
      )}

      {tab === "overview" && <OverviewTab r={report} productId={product.id} summaries={summaries} aiKey={aiKey} writing={writing} href={(t) => href({ tab: t as Tab })} />}
      {tab === "traffic" && <TrafficTab r={report} />}
      {tab === "conversions" && <ConversionsTab r={report} />}
      {tab === "revenue" && <RevenueTab r={report} />}
      {tab === "startica" && <StarticaTab r={report} />}
    </>
  );
}
