import Link from "next/link";
import type { ReactNode } from "react";
import { and, desc, eq } from "drizzle-orm";
import { ArrowDownRightIcon, ArrowUpRightIcon, InfoIcon } from "lucide-react";
import type { AnalyticsReport } from "@startica/core/metrics/report";
import type { latestAnalyticsSummaries } from "@startica/core/metrics/summary";
import * as schema from "@startica/db/schema";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/lib/dal";
import { AddManualMetric, DeleteManualMetric, type ManualRow } from "./manual-metrics";
import { MetricChart } from "./metric-chart";
import { BarTable, Change, Empty, money, NotConnected, num, pct, SectionCard, Tile, Tiles } from "./parts";
import { WriteSummaryButton } from "./summary-button";

type R = AnalyticsReport;

/** Why a tile is empty: the connection is missing, the product database doesn't define the metric, or no data yet. */
function missing(r: R, kind: "web" | "stripe" | "product_db", metric?: string): ReactNode {
  const names = { web: "GA4 or Umami", stripe: "Stripe", product_db: "product DB" };
  if (!r.connected.has(kind)) return `Needs ${names[kind]}`;
  if (kind === "product_db" && metric && r.definedDbMetrics && !r.definedDbMetrics.includes(metric)) {
    return (
      <>
        No <code>{metric}</code> metric yet:{" "}
        <Link href="/settings?tab=products" className="underline">
          add it
        </Link>
      </>
    );
  }
  return "No data in this period";
}

const grid2 = "grid gap-4 lg:grid-cols-2";

// --- Overview --------------------------------------------------------------------------------

type Summary = Awaited<ReturnType<typeof latestAnalyticsSummaries>>[number];

function WeeklySummary({ productId, summaries, aiKey, writing, measured }: { productId: string; summaries: Summary[]; aiKey: boolean; writing: boolean; measured: boolean }) {
  const latest = summaries[0];
  const ready = summaries.filter((s) => s.status === "ready" && s.body);
  const shown = latest?.status === "ready" ? latest : ready[0];
  const when = (s: Summary) =>
    `${new Date(`${s.periodStart}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} to ${new Date(`${s.periodEnd}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return (
    <SectionCard
      title="This week, read by AI"
      description={
        shown
          ? `${when(shown)}, written ${shown.createdAt.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}${shown.model ? ` by ${shown.model}` : ""}. It reads the numbers on this page; check anything surprising against them.`
          : "Every Monday at 08:45, after the morning sync, the AI reads the last 7 full days against the week before and writes what worked, what to watch and what to try next."
      }
      action={measured && aiKey ? <WriteSummaryButton productId={productId} writing={writing} again={Boolean(shown)} /> : undefined}
    >
      {writing && !shown && <Empty>Writing the summary…</Empty>}
      {latest?.status === "failed" && <p className="mb-3 text-sm text-destructive">The last summary failed: {latest.error}</p>}
      {!shown && !writing && (
        <Empty>
          {!measured ? (
            <>
              Connect web analytics, Stripe or the product database in <Link href="/settings?tab=products" className="underline">Settings → Products</Link> first.
            </>
          ) : !aiKey ? (
            <>
              Add an AI key in <Link href="/settings" className="underline">Settings</Link> to get a weekly summary.
            </>
          ) : (
            "No summary yet. The first one is written next Monday, or now with Write it now."
          )}
        </Empty>
      )}
      {shown?.body && (
        <div className="grid gap-4 text-sm">
          <div className="grid gap-1">
            <p className="font-medium text-base">{shown.body.headline}</p>
            <p className="text-muted-foreground">{shown.body.summary}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <List title="Worked" items={shown.body.wins} empty="Nothing stood out." />
            <List title="Watch" items={shown.body.concerns} empty="Nothing worrying." />
            <div className="grid content-start gap-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Try next</h3>
              <ol className="grid gap-1.5">
                {shown.body.tryNext.map((t, i) => (
                  <li key={i}>
                    <span className="font-medium">{t.title}</span> <span className="text-muted-foreground">{t.why}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          {ready.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Earlier weeks</summary>
              <ul className="mt-2 grid gap-2">
                {ready.filter((s) => s.id !== shown.id).map((s) => (
                  <li key={s.id}>
                    <span className="text-muted-foreground">{when(s)}:</span> {s.body!.headline}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </SectionCard>
  );
}

function List({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="grid content-start gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length ? (
        <ul className="grid list-disc gap-1.5 pl-4">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Funnel({ r }: { r: R }) {
  const steps = r.funnel;
  if (steps.length === 0) return null;
  const top = Math.max(steps[0]!.value, 1);
  return (
    <SectionCard title="From visit to customer" description="Each step's count in this period, and how many of the step before it got there. The steps come from different sources, so read them as rough rates.">
      <ol className="grid gap-3">
        {steps.map((s, i) => {
          const prev = steps[i - 1];
          return (
            <li key={s.label} className="grid gap-1 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span>
                  <span className="font-medium">{s.label}</span> <span className="text-xs text-muted-foreground">{s.source}</span>
                </span>
                <span className="tabular-nums">
                  {num(s.value)}
                  {prev && <span className="ml-2 text-xs text-muted-foreground">{prev.value ? pct(s.value / prev.value) : "—"} of {prev.label.toLowerCase()}</span>}
                </span>
              </div>
              <div aria-hidden className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-(--viz-series-1) [--viz-series-1:var(--module-chart,#2a78d6)] dark:[--viz-series-1:var(--module-chart,#3987e5)]" style={{ width: `${Math.max(1, (s.value / top) * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

const TONE_ICON = { up: ArrowUpRightIcon, down: ArrowDownRightIcon, note: InfoIcon } as const;

export async function OverviewTab({ r, productId, summaries, aiKey, writing, href }: { r: R; productId: string; summaries: Summary[]; aiKey: boolean; writing: boolean; href: (tab: string) => string }) {
  const manual = (
    await (await db())
      .select()
      .from(schema.metricsSnapshots)
      .where(and(eq(schema.metricsSnapshots.productId, productId), eq(schema.metricsSnapshots.source, "manual")))
      .orderBy(desc(schema.metricsSnapshots.day))
      .limit(100)
  ).map((m): ManualRow => ({ id: m.id, day: m.day, metric: m.metric, value: Number(m.value) }));
  const measured = ["web", "stripe", "product_db"].some((k) => r.connected.has(k));
  const days = r.current.days;
  return (
    <>
      <Tiles>
        <Tile label={`Visits (${days}d)`} pair={r.traffic.has ? r.traffic.sessions : null} missing={missing(r, "web")} />
        <Tile label={`Key events (${days}d)`} pair={r.traffic.has ? r.conversions.keyEvents : null} missing={missing(r, "web")} />
        <Tile label="Key events per visit" pair={r.traffic.has ? r.conversions.rate : null} format="percent" missing={missing(r, "web")} />
        <Tile label={`Signups (${days}d)`} pair={r.conversions.signups} missing={missing(r, "product_db", "signups")} />
        <Tile label="Active users" pair={r.product.activeUsers.has ? r.product.activeUsers : null} missing={missing(r, "product_db", "active_users")} hint="The latest value in this period" />
        <Tile label="MRR" pair={r.revenue.has ? r.revenue.mrr : null} format="money" missing={missing(r, "stripe")} />
        <Tile label="Subscriptions" pair={r.revenue.has ? r.revenue.activeSubs : null} missing={missing(r, "stripe")} hint="Active, trialing and past due, at the end of the period" />
        <Tile label={`Cancellations (${days}d)`} pair={r.revenue.has ? r.revenue.cancellations : null} invert missing={missing(r, "stripe")} />
      </Tiles>

      <WeeklySummary productId={productId} summaries={summaries} aiKey={aiKey} writing={writing} measured={measured} />

      <div className={grid2}>
        <SectionCard title="What changed" description="The biggest changes against the period before, worked out from the numbers (no AI).">
          {r.highlights.length === 0 ? (
            <Empty>{r.previousComplete ? "No big changes: everything moved less than about 15%." : "Once there's a full period before this one to compare with, the biggest changes show here."}</Empty>
          ) : (
            <ul className="grid gap-2.5 text-sm">
              {r.highlights.map((h, i) => {
                const Icon = TONE_ICON[h.tone];
                const tab = h.href?.replace("?tab=", "");
                return (
                  <li key={i} className="flex gap-2">
                    <Icon aria-hidden className={h.tone === "up" ? "mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400" : h.tone === "down" ? "mt-0.5 size-4 shrink-0 text-destructive" : "mt-0.5 size-4 shrink-0 text-muted-foreground"} />
                    <span>
                      {h.text}{" "}
                      {tab && (
                        <Link href={href(tab)} className="text-muted-foreground underline">
                          Details
                        </Link>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <Funnel r={r} />
      </div>

      <div className={grid2}>
        <SectionCard title="Visits per day" description={`All traffic, from ${r.webLabel}.`}>
          {r.traffic.sessionsSeries ? <MetricChart data={r.traffic.sessionsSeries} unit="visits" label="Visits" /> : <NotConnected what="Google Analytics or Umami" />}
        </SectionCard>
        <SectionCard
          title={r.conversions.signupsSeries ? "Signups per day" : "Key events per day"}
          description={r.conversions.signupsSeries ? "From the product database." : `${r.webLabel} key events (connect the product database for signups).`}
        >
          {r.conversions.signupsSeries ? (
            <MetricChart data={r.conversions.signupsSeries} unit="signups" label="Signups" />
          ) : r.conversions.series ? (
            <MetricChart data={r.conversions.series} unit="key events" label="Key events" />
          ) : (
            <NotConnected what="the product database, Google Analytics or Umami" />
          )}
        </SectionCard>
      </div>

      <SectionCard title="Numbers you entered" description="Anything Startica can't read on its own." action={<AddManualMetric productId={productId} today={r.current.end} />}>
        {manual.length === 0 ? (
          <Empty>None yet.</Empty>
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
              {manual.map((m) => (
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
      </SectionCard>
    </>
  );
}

// --- Traffic -----------------------------------------------------------------------------------

export function TrafficTab({ r }: { r: R }) {
  const t = r.traffic;
  if (!t.has) return <NotConnected what="Google Analytics or Umami" />;
  const total = Math.max(t.sessions.now, 1);
  const organic = t.channels.find((c) => c.group === "Organic search");
  const ai = t.channels.find((c) => c.group === "AI assistants");
  const sources = t.channels
    .flatMap((c) => c.sources.map((s) => ({ ...s, group: c.group })))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 25);
  const engaged = (x: { sessions: number; engaged?: number }) => (r.web === "ga4" || x.engaged ? pct(x.sessions ? (x.engaged ?? 0) / x.sessions : null, 0) : "—");
  return (
    <>
      <Tiles>
        <Tile label="Visits" pair={t.sessions} />
        <Tile label="Visitors per day" pair={t.avgDailyUsers} format="decimal" hint="Daily visitors, averaged over the period: someone who comes back on another day counts again" />
        <Tile label="New visitors" pair={t.newUsers} missing={r.web === "umami" ? "Umami doesn't report new visitors" : "No data in this period"} />
        <Tile label="Page views" pair={t.pageviews} missing="No data in this period" />
        <Tile label="Pages per visit" pair={t.pagesPerSession} format="decimal" missing="No data in this period" />
        <Tile label="Engaged visits" pair={t.engagedRate} format="percent" missing="No data in this period" hint={r.web === "umami" ? "Visits that viewed more than one page" : "GA4's engaged sessions: 10 seconds or more, a key event, or two or more pages"} />
        <Tile label="Time per visit" pair={t.secondsPerSession} format="duration" missing="No data in this period" hint="Engaged time divided by visits" />
        <Tile label="Key events per visit" pair={r.conversions.rate} format="percent" />
      </Tiles>

      <SectionCard title="Visits per day" description={`All traffic, from ${r.webLabel}.`}>
        {t.sessionsSeries && <MetricChart data={t.sessionsSeries} unit="visits" label="Visits" />}
      </SectionCard>

      <div className={grid2}>
        <SectionCard title="Channels" description="Where visits came from, grouped. Startica's own tracking links put replies under Communities, emails under Email and ads under Paid.">
          <BarTable
            label="Channel"
            valueLabel="Visits"
            extraLabels={["Share", "Engaged", "Key events"]}
            rows={t.channels.map((c) => ({
              key: c.group,
              label: c.group,
              value: c.sessions,
              before: c.before,
              extra: [pct(c.sessions / total, 0), engaged(c), r.web === "ga4" ? num(c.keyEvents) : "—"],
            }))}
          />
          {r.web === "umami" && <p className="mt-2 text-xs text-muted-foreground">Umami can&apos;t split key events or engagement by source, so those columns show a dash.</p>}
        </SectionCard>
        <SectionCard
          title="Search and AI assistants"
          description={
            <>
              Visits from search results and from AI assistants that linked to the site.{" "}
              <Link href="/seo/search" className="underline">
                Search details
              </Link>
            </>
          }
        >
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Organic search</div>
              <div className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                {num(organic?.sessions ?? 0)} <Change now={organic?.sessions ?? 0} before={organic?.before ?? null} />
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">AI assistants</div>
              <div className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                {num(ai?.sessions ?? 0)} <Change now={ai?.sessions ?? 0} before={ai?.before ?? null} />
              </div>
            </div>
            <div className="grid content-start gap-0.5 sm:col-span-2">
              {t.aiAssistants.length === 0 ? (
                <span className="text-muted-foreground">No visits from AI assistants yet.</span>
              ) : (
                t.aiAssistants.slice(0, 6).map((x) => (
                  <div key={x.name} className="flex justify-between gap-4">
                    <span>{x.name}</span>
                    <span className="tabular-nums">{num(x.sessions)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Sources" description="The top 25 source / medium pairs.">
        <BarTable
          label="Source / medium"
          valueLabel="Visits"
          extraLabels={["Channel", "Key events"]}
          rows={sources.map((s) => ({ key: s.key, label: s.label, value: s.sessions, before: s.before, extra: [s.group, r.web === "ga4" ? num(s.keyEvents ?? 0) : "—"] }))}
        />
      </SectionCard>

      <div className={grid2}>
        <SectionCard title="Landing pages" description="The first page of each visit: where people arrive, and whether they stay.">
          <BarTable
            label="Page"
            valueLabel="Visits"
            extraLabels={["Engaged", "Key events"]}
            rows={t.landing.map((l) => ({ key: l.key, label: <span className="font-mono text-xs">{l.key}</span>, value: l.sessions, before: l.before, extra: [engaged(l), r.web === "ga4" ? num(l.keyEvents ?? 0) : "—"] }))}
            empty="No landing pages yet: they're read from the next sync on."
          />
        </SectionCard>
        <SectionCard title="Pages viewed" description="Visits that viewed each page.">
          <BarTable label="Page" valueLabel="Visits" rows={t.pages.map((p) => ({ key: p.key, label: <span className="font-mono text-xs">{p.key}</span>, value: p.sessions, before: p.before }))} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Countries">
          <BarTable label="Country" valueLabel="Visits" rows={t.countries.map((c) => ({ key: c.key, label: c.label, value: c.sessions, before: c.before }))} empty="No countries yet: they're read from the next sync on." />
        </SectionCard>
        <SectionCard title="Devices">
          <BarTable label="Device" valueLabel="Visits" extraLabels={["Share"]} rows={t.devices.map((d) => ({ key: d.key, label: d.label, value: d.sessions, before: d.before, extra: [pct(d.sessions / total, 0)] }))} empty="No devices yet: they're read from the next sync on." />
        </SectionCard>
        <SectionCard title="Browsers">
          <BarTable label="Browser" valueLabel="Visits" rows={t.browsers.map((b) => ({ key: b.key, label: b.label, value: b.sessions, before: b.before }))} empty="No browsers yet: they're read from the next sync on." />
        </SectionCard>
      </div>
    </>
  );
}

// --- Conversions --------------------------------------------------------------------------------

export function ConversionsTab({ r }: { r: R }) {
  const c = r.conversions;
  const byChannel = r.traffic.channels.filter((x) => x.sessions > 0);
  const landing = [...r.traffic.landing].filter((l) => (l.keyEvents ?? 0) > 0).sort((a, b) => (b.keyEvents ?? 0) - (a.keyEvents ?? 0));
  return (
    <>
      <Tiles>
        <Tile label="Key events" pair={r.traffic.has ? c.keyEvents : null} missing={missing(r, "web")} />
        <Tile label="Key events per visit" pair={r.traffic.has ? c.rate : null} format="percent" missing={missing(r, "web")} />
        <Tile label="Signups" pair={c.signups} missing={missing(r, "product_db", "signups")} />
        <Tile label="Signups per visit" pair={c.signupRate} format="percent" missing={c.signups ? missing(r, "web") : missing(r, "product_db", "signups")} />
      </Tiles>

      <div className={grid2}>
        <SectionCard title="Key events per day" description={`${r.webLabel}: the events you marked as key events.`}>
          {c.series ? <MetricChart data={c.series} unit="key events" label="Key events" /> : <NotConnected what="Google Analytics or Umami" />}
        </SectionCard>
        <SectionCard title="Signups per day" description="From the product database.">
          {c.signupsSeries ? <MetricChart data={c.signupsSeries} unit="signups" label="Signups" /> : <NotConnected what="the product database" />}
        </SectionCard>
      </div>

      <div className={grid2}>
        <SectionCard title="Key events by name" description="Every key event, so you can tell signups from other goals.">
          <BarTable label="Event" valueLabel="Count" rows={c.events.map((e) => ({ key: e.key, label: <code className="text-xs">{e.key}</code>, value: e.count, before: e.before }))} empty={r.traffic.has ? "No key events in this period. Mark your signup or purchase event as a key event in GA4, or list it on the Umami connection." : "Connect Google Analytics or Umami to see this."} />
        </SectionCard>
        <SectionCard title="Converting channels" description="Key events per visit, by channel.">
          {r.web === "umami" ? (
            <Empty>Umami can&apos;t split key events by source. Visits through Startica&apos;s tracking links still show key events, under What Startica did.</Empty>
          ) : (
            <BarTable
              label="Channel"
              valueLabel="Key events"
              extraLabels={["Visits", "Per visit"]}
              rows={byChannel.sort((a, b) => b.keyEvents - a.keyEvents).map((x) => ({ key: x.group, label: x.group, value: x.keyEvents, extra: [num(x.sessions), pct(x.sessions ? x.keyEvents / x.sessions : null)] }))}
            />
          )}
        </SectionCard>
      </div>

      {r.web !== "umami" && (
        <SectionCard title="Converting landing pages" description="Landing pages by the key events of the visits that started there.">
          <BarTable
            label="Page"
            valueLabel="Key events"
            extraLabels={["Visits", "Per visit"]}
            rows={landing.map((l) => ({ key: l.key, label: <span className="font-mono text-xs">{l.key}</span>, value: l.keyEvents ?? 0, extra: [num(l.sessions), pct(l.sessions ? (l.keyEvents ?? 0) / l.sessions : null)] }))}
            empty="No key events from landing pages in this period."
          />
        </SectionCard>
      )}

      <div className={grid2}>
        <SectionCard title="Active users" description="From the product database: the latest value each day.">
          {r.product.activeUsersSeries ? <MetricChart data={r.product.activeUsersSeries} unit="active users" label="Active users" /> : <NotConnected what="the product database (with an active_users metric)" />}
        </SectionCard>
        <SectionCard title="Other product numbers" description="Every other metric your product database view returns, summed over the period.">
          {r.product.other.length === 0 ? (
            <Empty>{r.connected.has("product_db") ? "Only signups and active users so far. Add more metrics in the database's Change setup dialog." : "Connect the product database to see this."}</Empty>
          ) : (
            <BarTable label="Metric" valueLabel="Total" rows={r.product.other.map((m) => ({ key: m.metric, label: m.metric.replaceAll("_", " "), value: m.now, before: m.before }))} />
          )}
        </SectionCard>
      </div>
    </>
  );
}

// --- Revenue -------------------------------------------------------------------------------------

export function RevenueTab({ r }: { r: R }) {
  const v = r.revenue;
  if (!v.has) return <NotConnected what="Stripe" />;
  const net = v.mrrNew && v.mrrChurned ? v.mrrNew.now - v.mrrChurned.now : null;
  return (
    <>
      <Tiles>
        <Tile label="MRR" pair={v.mrr} format="money" hint="Monthly recurring revenue at the end of the period" />
        <Tile label="Paying subscriptions" pair={v.paying} hint="Active and past due, without trials" />
        <Tile label="Trials" pair={v.trials} missing="No trials" />
        <Tile label="Revenue per customer" value={v.arpa == null ? "—" : money(v.arpa)} hint="MRR divided by paying subscriptions" />
        <Tile label="New subscriptions" pair={v.newSubs} />
        <Tile label="Cancellations" pair={v.cancellations} invert />
        <Tile label="Cancellation rate" value={v.churnRate == null ? "—" : pct(v.churnRate)} hint="Cancellations in the period divided by subscriptions at its start" />
        <Tile label="Revenue paid" pair={v.revenue} format="money" missing="Needs read access to invoices on the Stripe key" hint="Invoices paid in the period" />
      </Tiles>

      {v.mrrNew && v.mrrChurned && (
        <SectionCard title="MRR movement" description="MRR added by subscriptions that started in the period and lost to ones that ended. Upgrades and downgrades aren't split out: they change MRR from the day Startica sees them.">
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">New</div>
              <div className="text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">+{money(v.mrrNew.now)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lost</div>
              <div className="text-2xl font-semibold text-destructive tabular-nums">−{money(v.mrrChurned.now)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net</div>
              <div className="text-2xl font-semibold tabular-nums">
                {net! >= 0 ? "+" : "−"}
                {money(Math.abs(net!))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      <div className={grid2}>
        <SectionCard title="MRR" description="At the end of each day.">
          {v.mrrSeries && <MetricChart data={v.mrrSeries} unit="" label="MRR" format="money" />}
        </SectionCard>
        <SectionCard title="Subscriptions" description="Active, trialing and past due, at the end of each day.">
          {v.subsSeries && <MetricChart data={v.subsSeries} unit="subscriptions" label="Subscriptions" />}
        </SectionCard>
        <SectionCard title="New subscriptions per day">
          {v.newSubsSeries ? <MetricChart data={v.newSubsSeries} unit="new" label="New subscriptions" /> : <Empty>None in this period.</Empty>}
        </SectionCard>
        <SectionCard title="Cancellations per day" description="The day the customer canceled, which can be before the subscription ends.">
          {v.cancellationsSeries ? <MetricChart data={v.cancellationsSeries} unit="cancellations" label="Cancellations" /> : <Empty>None in this period.</Empty>}
        </SectionCard>
      </div>
      <p className="text-xs text-muted-foreground">
        Amounts are shown in US dollars; Startica doesn&apos;t convert currencies, so read them in your Stripe currency. Past days&apos; MRR uses each subscription&apos;s current price.
      </p>
    </>
  );
}

// --- What Startica did -----------------------------------------------------------------------------

export function StarticaTab({ r }: { r: R }) {
  const s = r.startica;
  const web = r.connected.has("web");
  return (
    <>
      <Tiles>
        <Tile label="Posted" value={num(s.posts.length)} hint="Inbox replies and Content Studio pieces marked as posted in this period" />
        <Tile label="Linking the product" value={num(s.posts.filter((p) => p.mentionsProduct).length)} />
        <Tile label="Visits from posts" value={web ? num(s.fromPosts.visits) : "—"} missing={missing(r, "web")} hint="Through the posts' tracking links, since they were posted" />
        <Tile label="Key events from posts" value={web ? num(s.fromPosts.keyEvents) : "—"} missing={missing(r, "web")} />
      </Tiles>

      <SectionCard title="Where it worked" description="Each community or channel you posted in this period: posts, replies people wrote back, and what the links brought in.">
        {s.places.length === 0 ? (
          <Empty>
            Nothing posted in this period. Post a reply from the <Link href="/inbox" className="underline">Inbox</Link> or a piece from <Link href="/content" className="underline">Content Studio</Link>.
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Where</TableHead>
                <TableHead className="text-right">Posts</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Key events</TableHead>
                <TableHead className="text-right">Visits per linked post</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.places.map((p) => (
                <TableRow key={p.where}>
                  <TableCell>
                    {p.where} {p.removed > 0 && <Badge variant="destructive" className="ml-1">{p.removed} removed</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.posts}
                    {p.linked < p.posts && <span className="text-xs text-muted-foreground"> ({p.linked} linked)</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{num(p.replies)}</TableCell>
                  <TableCell className="text-right tabular-nums">{web ? num(p.visits) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{web ? num(p.keyEvents) : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{web && p.linked ? (p.visits / p.linked).toFixed(1) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      {s.ads && s.ads.length > 0 && (
        <SectionCard title="Ads" description={<>Spend you entered for this period, and visits and key events through each campaign&apos;s links. Per-ad numbers are on each campaign&apos;s Results.</>}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Visits</TableHead>
                <TableHead className="text-right">Key events</TableHead>
                <TableHead className="text-right">Cost per key event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.ads.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/ads/${a.id}/results`} className="underline-offset-4 hover:underline">
                      {a.name}
                    </Link>{" "}
                    <span className="text-xs text-muted-foreground capitalize">{a.platform}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(a.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(a.visits)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(a.results)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.results ? money(a.spend / a.results) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      <SectionCard
        title="Posted by Startica"
        description={`Inbox replies and Content Studio pieces you marked as posted in this period. Replies below them are checked every 6 hours on Reddit, Hacker News, Bluesky, Mastodon and Discourse (and X, with an X API token) for two weeks. Visits and key events come from ${r.webLabel}, matched by the tracking link (only posts that link to the product can bring tracked visits).`}
      >
        {s.posts.length === 0 ? (
          <Empty>Nothing posted in this period.</Empty>
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
              {s.posts.slice(0, 100).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.postedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                        {p.where}
                      </a>
                    ) : (
                      p.where
                    )}
                  </TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {p.kind === "content" && <Badge variant="secondary" className="mr-2">Content</Badge>}
                    {p.removed && <Badge variant="destructive" className="mr-2">Removed</Badge>}
                    {p.mentionsProduct && <Badge variant="outline" className="mr-2">Links product</Badge>}
                    {p.text}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.replies ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{web ? p.visits : "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{web ? p.keyEvents : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
