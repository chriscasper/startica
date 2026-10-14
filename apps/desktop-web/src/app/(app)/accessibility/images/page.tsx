import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { asc, desc, eq } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { CopyBlock } from "@/components/app/copy-block";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { a11yImages } from "@startica/db/schema";
import { altEstimate, ALT_BATCH, COST_HINT } from "@startica/core/a11y/ai";
import { hasAiKey } from "@startica/core/ai/client";
import { db } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { ReviewAltTextButton } from "../controls";
import { loadSites, pathOf } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Images" };

export default function ImagesPage(props: PageProps<"/accessibility/images">) {
  return (
    <>
      <PageHeader title="Images" description="Every image the scans found, with its alt text. Your AI key can judge each alt text in context and suggest better text." />
      <Suspense fallback={<PageSkeleton />}>
        <Images searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const VERDICT: Record<string, { label: string; style: string }> = {
  good: { label: "Good", style: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  needs_better: { label: "Needs better", style: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  missing: { label: "Missing", style: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20" },
  decorative: { label: "Decorative", style: "" },
  skipped: { label: "Check by hand", style: "" },
};

async function Images({ searchParams }: { searchParams: PageProps<"/accessibility/images">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const filter = params.show === "all" ? "all" : "attention";
  const rows = await (await db()).select().from(a11yImages).where(eq(a11yImages.siteId, site.id)).orderBy(desc(a11yImages.pagesCount), asc(a11yImages.src));
  const attention = (r: (typeof rows)[number]) =>
    r.verdict === "needs_better" || r.verdict === "missing" || r.verdict === "decorative" || r.verdict === "skipped" || (!r.verdict && (r.alt === null || r.alt === ""));
  const shown = filter === "all" ? rows : rows.filter(attention);
  const estimate = await altEstimate(site.id);
  const aiReady = !ctx.demo && (await hasAiKey());
  const working = rows.some((r) => r.status === "working");
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <LiveRefresh tables={["a11y_images"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility/images" />
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Show">
          <Link href={`/accessibility/images?site=${site.id}`} className={pill(filter === "attention")} aria-current={filter === "attention" ? "page" : undefined}>
            Need attention ({rows.filter(attention).length})
          </Link>
          <Link href={`/accessibility/images?site=${site.id}&show=all`} className={pill(filter === "all")} aria-current={filter === "all" ? "page" : undefined}>
            All ({rows.length})
          </Link>
        </nav>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Alt text review</CardTitle>
          <CardDescription>
            Each run reviews up to {ALT_BATCH} images not reviewed yet, the most used first: {COST_HINT.alt}. Copy the suggestions you like; nothing changes on your
            site. SVGs and images over 4 MB are left for you to check by hand.
          </CardDescription>
          <CardAction>
            <ReviewAltTextButton siteId={site.id} count={estimate.next} cost={estimate.cost.toFixed(2)} disabled={!aiReady || working} />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!aiReady && <p className="text-xs text-muted-foreground">{ctx.demo ? "AI help is off in the demo." : "Add an AI key in Settings → General → AI to review alt text."}</p>}
          {rows.length === 0 && <p className="text-sm text-muted-foreground">{site.lastScanId ? "No images found yet; the next scan lists them." : "Run a scan from the Overview first."}</p>}
          {shown.map((r) => (
            <div key={r.id} className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-[6rem_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element -- the site's own image, as the scan saw it */}
              <img src={r.src} alt="" className="h-24 w-24 rounded border object-contain" referrerPolicy="no-referrer" loading="lazy" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {r.verdict ? (
                    <Badge variant="outline" className={VERDICT[r.verdict]!.style}>
                      {VERDICT[r.verdict]!.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{r.status === "working" ? "Reviewing…" : "Not reviewed"}</Badge>
                  )}
                  <span className="text-muted-foreground">
                    {r.pagesCount} {r.pagesCount === 1 ? "page" : "pages"}
                    {r.samplePage ? `, e.g. ${pathOf(r.samplePage)}` : ""}
                  </span>
                </div>
                <span className="truncate font-mono text-xs text-muted-foreground" title={r.src}>
                  {r.src}
                </span>
                <span>
                  Alt now: {r.alt === null ? <em>none (no alt attribute)</em> : r.alt === "" ? <em>empty (treated as decorative)</em> : `"${r.alt}"`}
                </span>
                {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                {r.error && <span className="text-destructive">{r.error}</span>}
                {r.verdict && r.verdict !== "good" && r.verdict !== "skipped" && r.suggestedAlt !== null && (
                  <CopyBlock text={r.verdict === "decorative" ? 'alt=""' : `alt="${r.suggestedAlt.replace(/"/g, "&quot;")}"`} label="the suggested alt" />
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
