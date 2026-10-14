import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { seoFindings, siteFindings, siteLinks, sitePages } from "@startica/db/schema";
import { RULE_KIND_LABEL } from "@startica/core/a11y/content";
import { isBroken, isRefused } from "@startica/core/a11y/documents";
import { db } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { AddRuleButton, CheckContentButton, IgnoreWordButton, ReadabilityTargetButton, RemoveRuleButton } from "../controls";
import { ago, loadSites, pathOf } from "../data";
import { NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Content" };

export default function ContentPage(props: PageProps<"/accessibility/content">) {
  return (
    <>
      <PageHeader title="Content" description="Broken links, spelling, readability and your own content rules, from every scanned page." />
      <Suspense fallback={<PageSkeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const TABS = [
  { key: "links", label: "Broken links" },
  { key: "spelling", label: "Spelling" },
  { key: "readability", label: "Readability" },
  { key: "rules", label: "Your rules" },
] as const;

/** Everything the tabs show. A plain function, so it may read the clock. */
async function load(siteParam: string | string[] | undefined) {
  const ctx = await loadSites(siteParam);
  if (!ctx?.site) return { ctx, data: null };
  const site = ctx.site;
  const d = await db();
  const [findings, links, internal, pages] = await Promise.all([
    d
      .select({ kind: siteFindings.kind, key: siteFindings.key, detail: siteFindings.detail, pageId: sitePages.id, url: sitePages.url, title: sitePages.title })
      .from(siteFindings)
      .innerJoin(sitePages, eq(sitePages.id, siteFindings.pageId))
      .where(and(eq(siteFindings.siteId, site.id), isNull(sitePages.goneAt))),
    d.select().from(siteLinks).where(eq(siteLinks.siteId, site.id)),
    d
      .select({ url: sitePages.url, detail: seoFindings.detail })
      .from(seoFindings)
      .innerJoin(sitePages, eq(sitePages.id, seoFindings.pageId))
      .where(and(eq(seoFindings.siteId, site.id), eq(seoFindings.rule, "broken-internal-link"))),
    d
      .select({ id: sitePages.id, url: sitePages.url, title: sitePages.title, readability: sitePages.readability })
      .from(sitePages)
      .where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt), isNotNull(sitePages.readability)))
      .orderBy(desc(sitePages.updatedAt)),
  ]);
  const words = new Map<string, { count: number; suggestions: string[]; pages: { id: string; url: string }[] }>();
  for (const f of findings.filter((x) => x.kind === "spelling")) {
    const w = words.get(f.key) ?? { count: 0, suggestions: (f.detail.suggestions as string[]) ?? [], pages: [] };
    w.count += Number(f.detail.count ?? 1);
    w.pages.push({ id: f.pageId, url: f.url });
    words.set(f.key, w);
  }
  return {
    ctx,
    data: {
      site,
      checkedWhen: site.contentCheckedAt ? ago(site.contentCheckedAt) : null,
      broken: links.filter(isBroken),
      refused: links.filter(isRefused),
      linkCount: links.length,
      internal,
      words: [...words].sort((a, b) => b[1].pages.length - a[1].pages.length || b[1].count - a[1].count),
      readable: pages.map((p) => ({ ...p, readability: p.readability! })).sort((a, b) => b.readability.grade - a.readability.grade),
      ruleHits: findings.filter((f) => f.kind === "rule"),
    },
  };
}

async function Content({ searchParams }: { searchParams: PageProps<"/accessibility/content">["searchParams"] }) {
  const params = await searchParams;
  const { ctx, data } = await load(params.site);
  if (!ctx) return <NoProduct />;
  if (!data) return <NoSite ctx={ctx} />;
  const { site } = data;
  const tab = TABS.find((t) => t.key === params.tab)?.key ?? "links";
  const counts: Record<(typeof TABS)[number]["key"], number> = {
    links: data.broken.length + data.internal.length,
    spelling: data.words.length,
    readability: data.readable.filter((p) => p.readability.grade > site.readabilityTarget).length,
    rules: new Set(data.ruleHits.map((r) => r.key)).size,
  };
  const pill = (active: boolean) => cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", active && "bg-background font-medium text-foreground shadow-sm");

  return (
    <>
      <LiveRefresh tables={["site_pages", "sites"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/accessibility/content" />
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Sections">
          {TABS.map((t) => (
            <Link key={t.key} href={`/accessibility/content?site=${site.id}&tab=${t.key}`} className={pill(tab === t.key)} aria-current={tab === t.key ? "page" : undefined}>
              {t.label} ({counts[t.key]})
            </Link>
          ))}
        </nav>
      </div>

      {tab === "links" && (
        <Card>
          <CardHeader>
            <CardTitle>Broken links</CardTitle>
            <CardDescription>
              Links on your pages that lead nowhere. Links to your own pages come from each scan; links to other sites are checked after each full scan, at most one request a
              second per site, and again after a week. {data.checkedWhen ? `Last checked ${data.checkedWhen}, ${data.linkCount} links to other sites.` : "Not checked yet."}
            </CardDescription>
            <CardAction>
              <CheckContentButton siteId={site.id} disabled={!ctx.canScan} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {counts.links === 0 && <p className="text-sm text-muted-foreground">No broken links found.</p>}
            {(data.internal.length > 0 || data.broken.length > 0) && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Link</TableHead>
                    <TableHead>Answer</TableHead>
                    <TableHead>On</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.internal.map((l) => (
                    <TableRow key={`i:${l.url}`}>
                      <TableCell className="max-w-sm truncate font-mono text-xs">{pathOf(l.url)}</TableCell>
                      <TableCell>HTTP {String(l.detail.status ?? "error")}</TableCell>
                      <TableCell className="text-xs">{((l.detail.from as string[]) ?? []).slice(0, 3).map(pathOf).join(", ")}</TableCell>
                    </TableRow>
                  ))}
                  {data.broken.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-sm truncate font-mono text-xs" title={l.url}>
                        {l.url}
                      </TableCell>
                      <TableCell>{l.error ?? `HTTP ${l.httpStatus}`}</TableCell>
                      <TableCell className="text-xs">{l.linkedFrom.slice(0, 3).map(pathOf).join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {data.refused.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {data.refused.length} {data.refused.length === 1 ? "site" : "sites"} refused the check (401, 403 or 429), so they couldn&apos;t be checked: {data.refused.slice(0, 5).map((l) => new URL(l.url).host).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "spelling" && (
        <Card>
          <CardHeader>
            <CardTitle>Possible misspellings</CardTitle>
            <CardDescription>
              Pages in US English (or with no language set), against a Hunspell US English dictionary. Capitalized words, acronyms and the product&apos;s name and keywords are skipped. Mark words that are
              right with Not a mistake.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {data.words.length === 0 && <p className="text-muted-foreground">No misspellings found.</p>}
            {data.words.map(([word, w]) => (
              <div key={word} className="flex flex-wrap items-center gap-2 border-b pb-2 last:border-0">
                <span className="font-medium">{word}</span>
                {w.suggestions.length > 0 && <span className="text-muted-foreground">→ {w.suggestions.join(", ")}</span>}
                <span className="text-xs text-muted-foreground">
                  on {w.pages.slice(0, 3).map((p) => (
                    <Link key={p.id} href={`/accessibility/pages/${p.id}`} className="mr-1 underline">
                      {pathOf(p.url)}
                    </Link>
                  ))}
                  {w.pages.length > 3 ? `and ${w.pages.length - 3} more` : ""}
                </span>
                <span className="ml-auto">
                  <IgnoreWordButton siteId={site.id} word={word} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "readability" && (
        <Card>
          <CardHeader>
            <CardTitle>Readability</CardTitle>
            <CardDescription>
              The US school grade needed to read each English page&apos;s main text easily (Flesch–Kincaid), for pages with 100 words or more. Shorter sentences and everyday
              words help everyone, especially people with cognitive disabilities and readers in a second language.
            </CardDescription>
            <CardAction>
              <ReadabilityTargetButton siteId={site.id} target={site.readabilityTarget} />
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.readable.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pages with enough English text yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right">Grade</TableHead>
                    <TableHead className="text-right">Reading ease</TableHead>
                    <TableHead className="text-right">Words</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.readable.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/accessibility/pages/${p.id}`} className="hover:underline">
                          {p.title || pathOf(p.url)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.readability.grade > site.readabilityTarget ? <Badge variant="outline" className="border-transparent bg-amber-500/10 text-amber-800 dark:text-amber-300">{p.readability.grade}</Badge> : p.readability.grade}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.readability.ease}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.readability.words}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "rules" && (
        <Card>
          <CardHeader>
            <CardTitle>Your rules</CardTitle>
            <CardDescription>Things every page should or shouldn&apos;t have: placeholder text, a footer, links to an old domain. Checked on every page from the next scan.</CardDescription>
            <CardAction>
              <AddRuleButton siteId={site.id} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {(site.contentRules ?? []).length === 0 && <p className="text-muted-foreground">No rules yet.</p>}
            {(site.contentRules ?? []).map((rule) => {
              const hits = data.ruleHits.filter((h) => h.key === rule.id);
              const invalid = hits.some((h) => h.detail.invalid);
              return (
                <div key={rule.id} className="flex flex-col gap-1 border-b pb-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rule.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {RULE_KIND_LABEL[rule.kind]}: <code className="font-mono">{rule.value}</code>
                    </span>
                    <Badge variant="outline">{invalid ? "Invalid selector" : `${hits.length} ${hits.length === 1 ? "page" : "pages"}`}</Badge>
                    <span className="ml-auto">
                      <RemoveRuleButton siteId={site.id} ruleId={rule.id} />
                    </span>
                  </div>
                  {!invalid && hits.length > 0 && (
                    <span className="text-xs">
                      {hits.slice(0, 8).map((h) => (
                        <Link key={h.pageId} href={`/accessibility/pages/${h.pageId}`} className="mr-2 underline">
                          {pathOf(h.url)}
                        </Link>
                      ))}
                      {hits.length > 8 ? `and ${hits.length - 8} more` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </>
  );
}
