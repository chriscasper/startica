import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq } from "drizzle-orm";
import { localDay } from "@startica/core/growth/moves";
import { hasAiKey } from "@startica/core/ai/client";
import { collectOpportunities } from "@startica/core/opportunities/collect";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { db, getActiveProduct } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { Audits, type AuditView } from "../../roadmap/roadmap-board";
import { OpportunityCard, type OpportunityView } from "./opportunity-ui";

export const metadata: Metadata = { title: "Opportunities" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "search", label: "Search" },
  { key: "site", label: "Site health" },
  { key: "ai", label: "AI answers" },
  { key: "closed", label: "Done and dismissed" },
] as const;

export default function OpportunitiesPage(props: PageProps<"/seo/opportunities">) {
  return (
    <>
      <PageHeader
        title="Opportunities"
        description="What to do next to be found, ranked: from Site health, Search and AI visibility, with fixes the AI can draft for you to copy."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Opportunities searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function Opportunities({ searchParams }: { searchParams: PageProps<"/seo/opportunities">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const param = (await searchParams).filter;
  const filter = FILTERS.find((f) => f.key === param)?.key ?? "all";
  const [all, aiReady, auditRows, todayMoves] = await Promise.all([
    collectOpportunities(product.id),
    hasAiKey(),
    (await db()).select().from(schema.audits).where(eq(schema.audits.productId, product.id)).orderBy(desc(schema.audits.createdAt)).limit(20),
    (await db())
      .select({ refId: schema.dailyMoves.refId })
      .from(schema.dailyMoves)
      .where(and(eq(schema.dailyMoves.productId, product.id), eq(schema.dailyMoves.day, localDay()))),
  ]);
  const onToday = new Set(todayMoves.map((m) => m.refId));
  const aiBlocked = desktopApp().demo ? "AI is off in the demo" : aiReady ? null : "Add an AI key in Settings first";
  const audits: AuditView[] = [];
  for (const a of auditRows) {
    if (audits.some((x) => x.kind === a.kind)) continue;
    audits.push({ id: a.id, kind: a.kind, status: a.status, summary: a.summary, error: a.error, date: date(a.createdAt), findings: a.findings });
  }
  const open = all.filter((o) => o.status === "open");
  const shown = filter === "closed" ? all.filter((o) => o.status !== "open") : open.filter((o) => filter === "all" || o.area === filter);
  const views: OpportunityView[] = shown.map((o) => ({
    key: o.key,
    area: o.area,
    title: o.title,
    why: o.why,
    action: o.action,
    impact: o.impact,
    href: o.href,
    status: o.status,
    draftKind: o.draft?.kind ?? null,
    hasBrief: Boolean(o.brief),
    draft: o.state?.draft ?? null,
    draftStatus: o.state?.draftStatus ?? null,
    draftError: o.state?.draftError ?? null,
    onRoadmap: Boolean(o.state?.roadmapItemId),
    onToday: onToday.has(o.key),
    contentPieceId: o.state?.contentPieceId ?? null,
  }));
  const count = (key: string) => (key === "closed" ? all.length - open.length : key === "all" ? open.length : open.filter((o) => o.area === key).length);

  return (
    <>
      <LiveRefresh tables={["seo_opportunities", "search_stats", "site_pages", "ai_visibility_runs", "audits", "content_pieces", "daily_moves"]} />
      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Filter">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? "/seo/opportunities" : `/seo/opportunities?filter=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", f.key === filter && "bg-background font-medium text-foreground shadow-sm")}
          >
            {f.label} <span className="tabular-nums">{count(f.key)}</span>
          </Link>
        ))}
      </nav>

      {views.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {filter === "closed"
            ? "Nothing done or dismissed yet."
            : all.length === 0
              ? "Nothing yet. Opportunities come from a site scan (Overview → Scan now), Search Console (Search) and AI visibility runs (AI visibility)."
              : "Nothing open here. Nice."}
        </p>
      ) : (
        <div className="grid gap-3">
          {views.map((o) => (
            <OpportunityCard key={o.key} productId={product.id} o={o} aiBlocked={aiBlocked} />
          ))}
        </div>
      )}

      <Audits productId={product.id} audits={audits} kinds={["seo", "geo"]} title="AI audits" />
    </>
  );
}
