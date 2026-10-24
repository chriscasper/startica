import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { prioritizedGroups, IGNORE_LABEL } from "@startica/core/a11y/track";
import { sitePlans } from "@startica/core/a11y/fix-plan";
import { hasAiKey } from "@startica/core/ai/client";
import { loadSites, withSite } from "../data";
import { PlanSelection, SelectAllBox, SelectBox } from "../fix-plan-controls";
import { AutomatedNote, ImpactBadge, NoProduct, NoSite, PriorityBadge, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Accessibility issues" };

const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;
const STATUSES = { open: "Open", fixed: "Fixed", ignored: "Ignored" } as const;

export default function AccessibilityIssuesPage(props: PageProps<"/accessibility/issues">) {
  return (
    <>
      <PageHeader
        title="Issues"
        description="Accessibility issues found by automated checks, grouped so one fix covers every page it affects. Pick several to get one fix plan for all of them."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Issues searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Issues({ searchParams }: { searchParams: PageProps<"/accessibility/issues">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const status = params.status === "fixed" ? "fixed" : params.status === "ignored" ? "ignored" : "open";
  const impact = IMPACTS.find((i) => i === params.impact) ?? null;
  const criterion = typeof params.criterion === "string" && /^\d\.\d\.\d+$/.test(params.criterion) ? params.criterion : null;
  const all = (await prioritizedGroups(site, { status, kind: "issues" })).filter((r) => !criterion || r.group.criteria.includes(criterion));
  const ranked = impact ? all.filter((r) => r.group.impact === impact) : all;
  const plans = (await sitePlans(site.id)).length;
  const selectable = status === "open" && ranked.length > 0;
  const unavailable = ctx.demo ? "AI help is off in the demo." : (await hasAiKey()) ? null : "Add an AI key in Settings → General → AI.";

  const href = (next: { status?: string; impact?: string | null }) => {
    const p = new URLSearchParams({ site: site.id, status: next.status ?? status });
    const i = next.impact === undefined ? impact : next.impact;
    if (i) p.set("impact", i);
    if (criterion) p.set("criterion", criterion);
    return `/accessibility/issues?${p}`;
  };
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <LiveRefresh tables={["a11y_issue_groups"]} />
      <SitePicker ctx={ctx} path="/accessibility/issues" />
      <div className="flex flex-wrap gap-3">
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Status">
          {Object.entries(STATUSES).map(([key, label]) => (
            <Link key={key} href={href({ status: key })} className={pill(status === key)} aria-current={status === key ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Impact">
          <Link href={href({ impact: null })} className={pill(!impact)} aria-current={!impact ? "page" : undefined}>
            Any impact
          </Link>
          {IMPACTS.map((i) => (
            <Link key={i} href={href({ impact: i })} className={cn(pill(impact === i), "capitalize")} aria-current={impact === i ? "page" : undefined}>
              {i} ({all.filter((r) => r.group.impact === i).length})
            </Link>
          ))}
        </nav>
        {criterion && (
          <Link href={`/accessibility/issues?site=${site.id}&status=${status}`} className="self-center text-sm underline">
            WCAG {criterion} only · show all
          </Link>
        )}
        <div className="ml-auto flex gap-4 self-center text-sm">
          {plans > 0 && (
            <Link href={withSite("/accessibility/fix-plans", site.id)} className="underline">
              Fix plans ({plans})
            </Link>
          )}
          <a href={`/accessibility/export?site=${site.id}`} className="underline">
            Export CSV
          </a>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          {ranked.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {site.lastScanId ? `No ${status} issues${impact ? ` with ${impact} impact` : ""}.` : "Run a scan from the Overview to see issues here."}
            </p>
          ) : (
            <MaybeSelection on={selectable} siteId={site.id} ids={ranked.map((r) => r.group.id)} unavailable={unavailable}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectable && (
                      <TableHead className="w-8">
                        <SelectAllBox />
                      </TableHead>
                    )}
                    <TableHead>Issue</TableHead>
                    {status === "open" && <TableHead>Priority</TableHead>}
                    <TableHead>Impact</TableHead>
                    <TableHead>WCAG</TableHead>
                    <TableHead className="text-right">Pages</TableHead>
                    <TableHead className="text-right">Elements</TableHead>
                    {status === "open" && <TableHead className="text-right">Visits, 30 days</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map(({ group: g, band, traffic }) => (
                    <TableRow key={g.id}>
                      {selectable && (
                        <TableCell>
                          <SelectBox id={g.id} label={g.help} />
                        </TableCell>
                      )}
                      <TableCell className="max-w-xl whitespace-normal">
                        <Link href={withSite(`/accessibility/issues/${g.id}`, site.id)} className="font-medium hover:underline">
                          {g.help}
                        </Link>
                        <div className="truncate font-mono text-xs text-muted-foreground">{g.sampleSelector}</div>
                        {g.status === "ignored" && (
                          <div className="text-xs text-muted-foreground">
                            {IGNORE_LABEL[g.ignoreReason as keyof typeof IGNORE_LABEL] ?? "Ignored"}
                            {g.ignoreNote ? `: ${g.ignoreNote}` : ""}
                          </div>
                        )}
                        {g.kind === "needs_review" && <div className="text-xs text-muted-foreground">Failed on review</div>}
                      </TableCell>
                      {status === "open" && (
                        <TableCell>
                          <PriorityBadge band={band} />
                        </TableCell>
                      )}
                      <TableCell>
                        <ImpactBadge impact={g.impact} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {g.criteria.join(", ") || "–"} {g.level && <span className="text-muted-foreground">({g.level})</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.pagesCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.occurrencesCount}</TableCell>
                      {status === "open" && <TableCell className="text-right tabular-nums">{traffic > 0 ? Math.round(traffic).toLocaleString("en-US") : "–"}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </MaybeSelection>
          )}
          <AutomatedNote />
        </CardContent>
      </Card>
    </>
  );
}

/** The open list takes picks for a fix plan; Fixed and Ignored don't. */
function MaybeSelection({ on, children, ...props }: { on: boolean; siteId: string; ids: string[]; unavailable: string | null; children: React.ReactNode }) {
  return on ? <PlanSelection {...props}>{children}</PlanSelection> : <>{children}</>;
}
