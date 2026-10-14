import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadSites, pathOf } from "../../accessibility/data";
import { NoProduct } from "../../accessibility/ui";
import { seoRuleGroups, type RuleGroup } from "../data";
import { ruleOf, SeoNoSite, SeoSitePicker, SeverityBadge } from "../shared";

export const metadata: Metadata = { title: "Site health" };

const CATEGORIES: { key: string; title: string }[] = [
  { key: "ai", title: "AI access" },
  { key: "indexing", title: "Indexing" },
  { key: "links", title: "Links" },
  { key: "basics", title: "Titles, descriptions and headings" },
  { key: "structured", title: "Structured data" },
];

export default function SiteHealthPage(props: PageProps<"/seo/health">) {
  return (
    <>
      <PageHeader title="Site health" description="What search engines, AI assistants and AI crawlers need from the site, checked on every page." />
      <Suspense fallback={<PageSkeleton />}>
        <Health searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** A short line about one page's finding, from its details. */
function detailLine(rule: string, d: Record<string, unknown>): string | null {
  if (rule === "title-too-long" || rule === "title-too-short") return `"${String(d.title)}" (${String(d.length)} characters)`;
  if (rule === "description-too-long") return `${String(d.length)} characters`;
  if (rule === "h1-multiple") return (d.headings as string[]).map((h) => `"${h}"`).join(", ");
  if (rule === "canonical-elsewhere" || rule === "canonical-broken") return `Canonical: ${String(d.canonical)}`;
  if (rule === "noindex" || rule === "noindex-in-sitemap") return `From the ${String(d.from)}`;
  if (rule === "jsonld-invalid") return `Block ${(d.blocks as number[]).join(", ")} on the page`;
  if (rule === "jsonld-incomplete") return `${String(d.type)}: missing ${(d.missing as string[]).join(", ")}`;
  return null;
}

function RuleCard({ group }: { group: RuleGroup }) {
  const rule = ruleOf(group.rule);
  return (
    <Card id={group.rule} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {rule.title} <SeverityBadge severity={group.severity} />
          {group.pageCount > 0 && <span className="text-sm font-normal text-muted-foreground">{group.pageCount === 1 ? "1 page" : `${group.pageCount} pages`}</span>}
        </CardTitle>
        <CardDescription>{rule.why}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p>
          <span className="font-medium">How to fix: </span>
          {rule.fix}
        </p>
        {group.groups
          .filter((g) => g.pages.some((p) => p.url) || Object.keys(g.detail).length > 0)
          .map((g) => (
          <div key={g.key} className="grid gap-1 rounded-md border p-3">
            {group.rule === "title-duplicate" && <div className="font-medium">&quot;{String(g.detail.title)}&quot; on {g.pages.length} pages</div>}
            {group.rule === "broken-internal-link" && (
              <div>
                <span className="font-medium">{g.pages[0]?.url ? pathOf(g.pages[0].url) : ""}</span> answers HTTP {String(g.detail.status)}, linked from{" "}
                {(g.detail.from as string[]).map((u) => pathOf(u)).join(", ")}
                {Number(g.detail.linkedFrom) > (g.detail.from as string[]).length ? " and more" : ""}
              </div>
            )}
            {(group.rule === "ai-search-blocked" || group.rule === "ai-training-blocked") && <div>Blocked: {(g.detail.crawlers as string[]).join(", ")}</div>}
            {group.rule !== "broken-internal-link" &&
              g.pages
                .filter((p) => p.url)
                .map((p) => (
                  <div key={p.url} className="flex flex-wrap items-baseline gap-x-2">
                    <a href={p.url!} target="_blank" rel="noreferrer" className="font-mono text-xs underline">
                      {pathOf(p.url!)}
                    </a>
                    {detailLine(group.rule, p.detail) && <span className="text-xs text-muted-foreground">{detailLine(group.rule, p.detail)}</span>}
                  </div>
                ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

async function Health({ searchParams }: { searchParams: PageProps<"/seo/health">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <SeoNoSite ctx={ctx} />;
  const rules = await seoRuleGroups(ctx.site.id);
  const problems = rules.filter((r) => r.severity !== "info");
  const facts = rules.filter((r) => r.severity === "info");

  return (
    <>
      <LiveRefresh tables={["site_pages", "sites"]} />
      <SeoSitePicker ctx={ctx} path="/seo/health" />
      {rules.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {ctx.site.lastScanId ? "No problems found by the checks." : <>Run a scan from the <Link href={`/seo?site=${ctx.site.id}`} className="underline">Overview</Link> to check the site.</>}
        </p>
      )}
      {CATEGORIES.map((c) => {
        const inCategory = problems.filter((r) => r.category === c.key);
        if (inCategory.length === 0) return null;
        return (
          <section key={c.key} className="grid gap-3">
            <h2 className="text-lg font-semibold">{c.title}</h2>
            {inCategory.map((r) => (
              <RuleCard key={r.rule} group={r} />
            ))}
          </section>
        );
      })}
      {facts.length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Good to know</h2>
          {facts.map((r) => (
            <RuleCard key={r.rule} group={r} />
          ))}
        </section>
      )}
    </>
  );
}
