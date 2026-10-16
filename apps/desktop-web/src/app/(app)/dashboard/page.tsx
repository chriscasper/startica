import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AccessibilityIcon, ActivityIcon, ArrowDownRightIcon, ArrowUpRightIcon, CheckCircle2Icon, ChevronRightIcon, MegaphoneIcon, SearchIcon, ShieldIcon, type LucideIcon } from "lucide-react";
import { dashboardSummary, type Attention, type DashboardModule, type DashboardSummary, type SiteStatus } from "@startica/core/dashboard/summary";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, getActiveProduct, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { Score } from "../accessibility/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Everything at a glance: what needs you, and how marketing, accessibility, search and security are doing." />
      <Suspense fallback={<PageSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

/** Loader (plain function: reads the clock). */
async function loadDashboard(workspaceId: string, productId: string) {
  await db(); // request time
  const demo = desktopApp().demo;
  const summary = await dashboardSummary(workspaceId, productId, { demo });
  return { summary, demo, now: Date.now() };
}

async function DashboardContent() {
  const [workspace, product] = await Promise.all([getWorkspace(), getActiveProduct()]);
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/welcome" className="underline">Set up your first product</Link> (or add one in <Link href="/settings?tab=products" className="underline">Settings</Link>) to see how it&apos;s doing.
      </p>
    );
  }
  const { summary: s, demo, now } = await loadDashboard(workspace.id, product.id);
  return (
    <>
      <LiveRefresh
        tables={["jobs", "job_runs", "daily_moves", "opportunities", "content_pieces", "ad_campaigns", "ad_spend", "roadmap_items", "connections", "metrics_snapshots", "sites", "site_scans", "a11y_issue_groups", "security_findings", "search_stats", "ai_visibility_runs", "ai_runs", "products"]}
      />
      <NeedsYou items={s.attention} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Marketing s={s} />
        <AccessibilityCard sites={s.sites} now={now} />
        <SeoCard s={s} now={now} />
        <SecurityCard sites={s.sites} now={now} />
      </div>
      <SystemCard s={s} demo={demo} />
    </>
  );
}

// --- Pieces ---------------------------------------------------------------------------

const MODULE_LABEL: Record<DashboardModule, string> = { marketing: "Marketing", accessibility: "Accessibility", seo: "SEO & GEO", security: "Security", system: "System" };

/** A module's accent (globals.css, [data-module]); System stays neutral. */
function Accent({ module, children, className }: { module: DashboardModule; children: ReactNode; className?: string }) {
  return (
    <div data-module={module === "system" ? undefined : module} className={className}>
      {children}
    </div>
  );
}

/** Starts closed so the module cards show first; the summary line says whether anything is waiting. */
function NeedsYou({ items }: { items: Attention[] }) {
  const toFix = items.filter((a) => a.tone === "bad").length;
  const waiting = items.length - toFix;
  if (items.length === 0) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2">
          <CardTitle>Needs you</CardTitle>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Nothing right now
          </span>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card size="sm">
      <details className="group/needs">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-(--card-spacing) [&::-webkit-details-marker]:hidden">
          <CardTitle>Needs you</CardTitle>
          <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            {toFix > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-destructive" aria-hidden />
                {toFix} to fix
              </span>
            )}
            {waiting > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                {waiting} waiting
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground group-open/needs:hidden">Show</span>
          <span className="hidden text-xs text-muted-foreground group-open/needs:inline">Hide</span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open/needs:rotate-90" aria-hidden />
        </summary>
        <div className="px-(--card-spacing) pt-2">
          <CardDescription className="mb-1">Broken or risky things first, then work that&apos;s waiting.</CardDescription>
          <ul className="-mx-2 divide-y">
            {items.map((a) => (
              <li key={`${a.module}:${a.title}`}>
                <Accent module={a.module}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-muted/60">
                    <span
                      className={cn("size-2 shrink-0 rounded-full", a.tone === "bad" ? "bg-destructive" : "bg-amber-500")}
                      role="img"
                      aria-label={a.tone === "bad" ? "Needs fixing" : "Worth doing"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.title}</span>
                      {a.detail && <span className="block truncate text-xs text-muted-foreground">{a.detail}</span>}
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
                      {a.module !== "system" && <span className="size-1.5 rounded-full bg-(--module)" aria-hidden />}
                      {MODULE_LABEL[a.module]}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                  </Link>
                </Accent>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </Card>
  );
}

function ModuleCard({ module, icon: Icon, title, href, status, children }: { module: DashboardModule; icon: LucideIcon; title: string; href: string; status: string; children: ReactNode }) {
  return (
    <Accent module={module} className="flex">
      <Card className="flex-1 border-t-2 border-t-(--module)">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon className="size-4 text-(--module)" aria-hidden />
            <Link href={href} className="hover:underline">
              {title}
            </Link>
          </CardTitle>
          <CardDescription>{status}</CardDescription>
          <CardAction>
            <Link href={href} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              Open
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </Accent>
  );
}

/** One number with its label, linking to where it comes from. */
function Stat({ label, value, detail, href }: { label: string; value: ReactNode; detail?: ReactNode; href: string }) {
  return (
    <Link href={href} className="block rounded-md p-2 -m-2 hover:bg-muted/60">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block text-xl font-semibold tabular-nums">{value}</span>
      {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
    </Link>
  );
}

function Change({ now, before }: { now: number; before: number | null }) {
  if (!before) return null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span>no change</span>;
  const Arrow = change > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className={cn("inline-flex items-center gap-0.5", change > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
      <Arrow className="size-3" aria-hidden />
      {Math.round(Math.abs(change) * 100)}%<span className="sr-only">{change > 0 ? " up" : " down"}</span>
    </span>
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

function ago(at: number | null, now: number): string {
  if (at === null) return "never";
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 60) return minutes < 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function NoSites({ what }: { what: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      No site yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link> to {what}.
    </p>
  );
}

/** A small table of the product's sites, one row each. */
function SiteRows({ sites, columns }: { sites: SiteStatus[]; columns: { label: string; cell: (s: SiteStatus) => ReactNode; href: (s: SiteStatus) => string }[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="pb-1 font-normal">Site</th>
          {columns.map((c) => (
            <th key={c.label} className="pb-1 font-normal">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y">
        {sites.map((site) => (
          <tr key={site.id}>
            <td className="max-w-40 truncate py-1.5 pr-3 font-medium">{site.name}</td>
            {columns.map((c) => (
              <td key={c.label} className="py-1.5 pr-3">
                <Link href={c.href(site)} className="hover:underline">
                  {c.cell(site)}
                </Link>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const withSite = (href: string, s: SiteStatus) => `${href}?site=${s.id}`;

// --- Modules --------------------------------------------------------------------------

const INTEL_STATUS: Record<string, string> = {
  none: "Intel not built yet",
  queued: "Intel queued",
  crawling: "Building intel…",
  researching: "Building intel…",
  writing: "Building intel…",
  ready: "Intel ready",
  failed: "Intel failed",
};

function Marketing({ s }: { s: DashboardSummary }) {
  const m = s.marketing;
  const status = [INTEL_STATUS[s.product.intel] ?? s.product.intel, m.ads.running ? plural(m.ads.running, "campaign") + " running" : null].filter(Boolean).join(" · ");
  return (
    <ModuleCard module="marketing" icon={MegaphoneIcon} title="Marketing" href="/today" status={status}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Stat label="Today" value={m.moves.total ? `${m.moves.done} of ${m.moves.total}` : "–"} detail={m.moves.total ? "moves done" : "Open Today to plan"} href="/today" />
        <Stat label="Inbox" value={fmt(m.inbox.review)} detail={`to review${m.inbox.working ? ` · ${m.inbox.working} in progress` : ""}`} href="/inbox" />
        <Stat label="Posted, 30 days" value={fmt(m.inbox.posted30 + m.content.posted30)} detail={`${m.inbox.posted30} replies · ${m.content.posted30} content`} href="/analytics" />
        <Stat
          label="Visits, 30 days"
          value={m.web ? fmt(m.web.sessions) : "–"}
          detail={m.web ? <><Change now={m.web.sessions} before={m.web.previous} /> {plural(m.web.keyEvents, "key event")}</> : "Connect GA4 or Umami"}
          href={m.web ? "/analytics" : "/settings?tab=products"}
        />
        <Stat
          label={m.mrr !== null ? "MRR" : "Signups, 30 days"}
          value={m.mrr !== null ? `$${fmt(m.mrr)}` : m.signups30 !== null ? fmt(m.signups30) : "–"}
          detail={m.mrr !== null && m.signups30 !== null ? `${plural(m.signups30, "signup")} in 30 days` : m.mrr === null && m.signups30 === null ? "Connect Stripe or your database" : undefined}
          href={m.mrr === null && m.signups30 === null ? "/settings?tab=products" : "/analytics"}
        />
        <Stat label="Roadmap" value={fmt(m.roadmap.doing + m.roadmap.todo)} detail={`open · ${m.roadmap.doing} in progress`} href="/roadmap" />
      </div>
      <p className="text-xs text-muted-foreground">
        <Link href="/content" className="hover:underline">Content Studio</Link>: {plural(m.content.drafts, "draft")}
        {m.content.writing ? `, ${m.content.writing} being written` : ""} · <Link href="/ads" className="hover:underline">Ads</Link>: {plural(m.ads.total, "campaign")}
      </p>
    </ModuleCard>
  );
}

function AccessibilityCard({ sites, now }: { sites: SiteStatus[]; now: number }) {
  const critical = sites.reduce((n, s) => n + s.a11y.critical, 0);
  const status = !sites.length ? "No site yet" : critical ? `${plural(critical, "critical issue")} open` : sites.every((s) => s.a11y.lastScanAt !== null) ? "No critical issues" : "Not scanned yet";
  return (
    <ModuleCard module="accessibility" icon={AccessibilityIcon} title="Accessibility" href="/accessibility" status={status}>
      {sites.length === 0 ? (
        <NoSites what="check it for accessibility" />
      ) : (
        <SiteRows
          sites={sites}
          columns={[
            { label: "Score", cell: (s) => <><Score value={s.a11y.score} target={s.a11y.target} /><span className="text-muted-foreground"> / 100</span></>, href: (s) => withSite("/accessibility", s) },
            { label: "Open issues", cell: (s) => (s.a11y.critical ? <><span className="text-destructive">{s.a11y.critical} critical</span> · {s.a11y.open}</> : fmt(s.a11y.open)), href: (s) => withSite("/accessibility/issues", s) },
            { label: "Last scan", cell: (s) => ago(s.a11y.lastScanAt, now), href: (s) => withSite("/accessibility", s) },
          ]}
        />
      )}
    </ModuleCard>
  );
}

function SeoCard({ s, now }: { s: DashboardSummary; now: number }) {
  const high = s.sites.reduce((n, x) => n + x.seo.high, 0);
  const status = !s.sites.length ? "No site yet" : high ? `${plural(high, "high-priority problem")}` : "No high-priority problems";
  return (
    <ModuleCard module="seo" icon={SearchIcon} title="SEO & GEO" href="/seo" status={status}>
      <div className="grid grid-cols-2 gap-x-4">
        <Stat
          label="Clicks from Google, 28 days"
          value={s.search.clicks !== null ? fmt(s.search.clicks) : "–"}
          detail={s.search.clicks !== null ? (s.search.change !== null ? <Change now={1 + s.search.change} before={1} /> : "first 28 days") : s.search.connected ? "Waiting for the first sync" : "Connect Search Console"}
          href={s.search.connected ? "/seo/search" : "/settings?tab=products"}
        />
        <Stat
          label="Named in AI answers"
          value={s.visibility ? `${Math.round((s.visibility.mentioned / s.visibility.answered) * 100)}%` : "–"}
          detail={s.visibility ? `${s.visibility.mentioned} of ${s.visibility.answered} questions · ${ago(s.visibility.at, now)}` : "No run yet"}
          href="/seo/ai"
        />
      </div>
      {s.sites.length === 0 ? (
        <NoSites what="check its site health" />
      ) : (
        <SiteRows
          sites={s.sites}
          columns={[
            { label: "Health", cell: (x) => <><Score value={x.seo.score} target={90} /><span className="text-muted-foreground"> / 100</span></>, href: (x) => withSite("/seo/health", x) },
            {
              label: "Problems",
              cell: (x) => (x.seo.high + x.seo.medium + x.seo.low === 0 ? "none" : <>{x.seo.high ? <span className="text-destructive">{x.seo.high} high</span> : null}{x.seo.high ? " · " : ""}{x.seo.medium + x.seo.low} other</>),
              href: (x) => withSite("/seo/health", x),
            },
            { label: "AI search", cell: (x) => (x.seo.aiBlocked === null ? "not checked" : x.seo.aiBlocked ? <span className="text-amber-700 dark:text-amber-400">partly blocked</span> : "open"), href: (x) => withSite("/seo", x) },
          ]}
        />
      )}
    </ModuleCard>
  );
}

function SecurityCard({ sites, now }: { sites: SiteStatus[]; now: number }) {
  const serious = sites.reduce((n, s) => n + s.security.critical + s.security.high, 0);
  const verified = sites.filter((s) => s.security.verified).length;
  const status = !sites.length ? "No site yet" : !verified ? "No site verified yet" : serious ? `${plural(serious, "serious finding")} open` : "No serious findings";
  return (
    <ModuleCard module="security" icon={ShieldIcon} title="Security" href="/security" status={status}>
      {sites.length === 0 ? (
        <NoSites what="check its security" />
      ) : (
        <SiteRows
          sites={sites}
          columns={[
            {
              label: "Score",
              cell: (s) => (s.security.verified ? <><Score value={s.security.score} target={90} /><span className="text-muted-foreground"> / 100</span></> : <span className="text-muted-foreground">verify first</span>),
              href: (s) => withSite("/security", s),
            },
            {
              label: "Open findings",
              cell: (s) => (!s.security.verified ? "–" : s.security.critical + s.security.high ? <><span className="text-destructive">{s.security.critical + s.security.high} serious</span> · {s.security.open}</> : fmt(s.security.open)),
              href: (s) => withSite("/security/findings", s),
            },
            {
              label: "Certificate",
              cell: (s) =>
                s.security.certDays === null ? "–" : <span className={cn(s.security.certDays < 14 && "text-destructive")}>{s.security.certDays < 0 ? "expired" : `${s.security.certDays} days left`}</span>,
              href: (s) => withSite("/security", s),
            },
            { label: "Checked", cell: (s) => (s.security.verified ? ago(s.security.checkedAt, now) : "–"), href: (s) => withSite("/security", s) },
          ]}
        />
      )}
    </ModuleCard>
  );
}

function SystemCard({ s, demo }: { s: DashboardSummary; demo: boolean }) {
  const y = s.system;
  const share = y.budget > 0 ? Math.min(1, y.spent / y.budget) : 0;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ActivityIcon className="size-4 text-muted-foreground" aria-hidden />
          <Link href="/system" className="hover:underline">System</Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/settings" className="-m-2 block rounded-md p-2 hover:bg-muted/60">
          <span className="block text-xs text-muted-foreground">AI spend this month</span>
          <span className="block text-sm font-medium tabular-nums">
            ${y.spent.toFixed(2)} <span className="font-normal text-muted-foreground">of ${y.budget}</span>
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(share * 100)}% of the monthly budget`}>
            <span className={cn("block h-full rounded-full", share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-amber-500" : "bg-foreground/60")} style={{ width: `${share * 100}%` }} />
          </span>
        </Link>
        <Stat label="AI key" value={<span className="text-sm">{demo ? "Off in the demo" : y.hasKey ? "Saved" : "Missing"}</span>} href="/settings" />
        <Stat label="Background jobs" value={<span className="text-sm">{y.running ? `${y.running} running or waiting` : "Idle"}</span>} href="/system" />
        <Stat
          label="Failed this week"
          value={<span className={cn("text-sm", y.failed.count && "text-destructive")}>{y.failed.count ? plural(y.failed.count, "job") : "None"}</span>}
          detail={y.failed.latest ? <span className="line-clamp-1">{y.failed.latest.label}</span> : undefined}
          href="/system"
        />
      </CardContent>
    </Card>
  );
}
