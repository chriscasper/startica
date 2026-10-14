import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checklist } from "@startica/core/a11y/manual";
import { STATUS_LABEL, type CriterionStatus } from "@startica/core/a11y/wcag";
import { cn } from "@/lib/utils";
import { CriterionReview } from "../controls";
import { loadSites } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Checklist" };

export default function ChecklistPage(props: PageProps<"/accessibility/checklist">) {
  return (
    <>
      <PageHeader title="Checklist" description="Every WCAG success criterion, with what the automated checks found and your own result from checking it by hand." />
      <Suspense fallback={<PageSkeleton />}>
        <Checklist searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const PRINCIPLES: Record<string, string> = { "1": "Perceivable", "2": "Operable", "3": "Understandable", "4": "Robust" };
const AUTO_STYLE: Record<CriterionStatus, string> = {
  failing: "border-transparent bg-destructive/10 text-destructive dark:bg-destructive/20",
  needs_review: "border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300",
  no_failures: "border-transparent bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  manual: "",
};
const FILTERS = [
  { key: "todo", label: "To check" },
  { key: "fail", label: "Failing" },
  { key: "all", label: "All" },
] as const;

async function Checklist({ searchParams }: { searchParams: PageProps<"/accessibility/checklist">["searchParams"] }) {
  const params = await searchParams;
  const ctx = await loadSites(params.site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const filter = FILTERS.find((f) => f.key === params.show)?.key ?? "todo";
  const items = await checklist(site);
  const done = items.filter((c) => c.manual !== "not_tested").length;
  const shown = items.filter((c) => (filter === "todo" ? c.manual === "not_tested" : filter === "fail" ? c.manual === "fail" || c.status === "failing" : true));
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");
  const count = (key: (typeof FILTERS)[number]["key"]) =>
    items.filter((c) => (key === "todo" ? c.manual === "not_tested" : key === "fail" ? c.manual === "fail" || c.status === "failing" : true)).length;

  return (
    <>
      <LiveRefresh tables={["a11y_issue_groups"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility/checklist" />
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Show">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/accessibility/checklist?site=${site.id}&show=${f.key}`} className={pill(filter === f.key)} aria-current={filter === f.key ? "page" : undefined}>
              {f.label} ({count(f.key)})
            </Link>
          ))}
        </nav>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            {done} of {items.length} criteria checked by hand
          </CardTitle>
          <CardDescription>
            WCAG 2.2 level A and AA{site.includeAaa ? " (and AAA, which this site checks)" : ""}. Automated checks can only decide some criteria, and even a clean result can miss
            things: work through each one with the keyboard, a screen reader and zoom, and record what you find. Your results feed the report, the accessibility
            statement and the conformance draft.
          </CardDescription>
        </CardHeader>
      </Card>
      {Object.entries(PRINCIPLES).map(([p, name]) => {
        const rows = shown.filter((c) => c.id.startsWith(`${p}.`));
        if (rows.length === 0) return null;
        return (
          <Card key={p}>
            <CardHeader>
              <CardTitle>
                {p}. {name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y">
              {rows.map((c) => (
                <div key={c.id} className="grid gap-2 py-3 text-sm first:pt-0 last:pb-0 lg:grid-cols-[1fr_auto]">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        <span className="tabular-nums">{c.id}</span> {c.title}
                      </span>
                      <Badge variant="outline">{c.level}</Badge>
                      <Badge variant="outline" className={AUTO_STYLE[c.status]}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                      {c.status === "failing" && (
                        <Link href={`/accessibility/issues?site=${site.id}&criterion=${c.id}`} className="text-xs underline">
                          {c.issues} {c.issues === 1 ? "issue" : "issues"}
                        </Link>
                      )}
                    </div>
                    {c.howToTest && <p className="text-muted-foreground">{c.howToTest}</p>}
                    {c.note && <p className="rounded bg-muted px-2 py-1">{c.note}</p>}
                    <a href={c.understanding} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center gap-1 text-xs underline">
                      Understanding {c.id} (W3C)
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </a>
                  </div>
                  <CriterionReview siteId={site.id} criterion={c.id} status={c.manual} note={c.note} failing={c.status === "failing"} />
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">{filter === "todo" ? "Every criterion has a result. Nice work." : "Nothing here."}</p>}
    </>
  );
}
