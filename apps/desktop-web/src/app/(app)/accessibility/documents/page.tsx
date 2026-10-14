import type { Metadata } from "next";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteDocuments } from "@startica/db/schema";
import { DOCUMENT_RULES, type DocumentRule } from "@startica/core/a11y/documents";
import { db } from "@/lib/dal";
import { CheckContentButton } from "../controls";
import { ago, loadSites, pathOf } from "../data";
import { ImpactBadge, NoProduct, NoSite, SitePicker } from "../ui";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage(props: PageProps<"/accessibility/documents">) {
  return (
    <>
      <PageHeader title="Documents" description="The PDFs your site links to, checked for what screen readers need: tags, a title, a language, real text, alternative text and labels." />
      <Suspense fallback={<PageSkeleton />}>
        <Documents searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const IMPACT_ORDER = ["critical", "serious", "moderate", "minor"];

async function Documents({ searchParams }: { searchParams: PageProps<"/accessibility/documents">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <NoSite ctx={ctx} />;
  const site = ctx.site;
  const docs = (await (await db()).select().from(siteDocuments).where(eq(siteDocuments.siteId, site.id))).sort((a, b) => b.problems.length - a.problems.length || a.url.localeCompare(b.url));
  const checkedWhen = site.contentCheckedAt ? ago(site.contentCheckedAt) : null;

  return (
    <>
      <LiveRefresh tables={["sites"]} />
      <SitePicker ctx={ctx} path="/accessibility/documents" />
      <Card>
        <CardHeader>
          <CardTitle>
            {docs.length} {docs.length === 1 ? "document" : "documents"}, {docs.filter((d) => d.problems.length > 0).length} with problems
          </CardTitle>
          <CardDescription>
            PDFs on your own site that your pages link to (up to 200), checked after each full scan with pdf.js. These are the basics, not a full PDF/UA check: also open each
            one with a screen reader. {checkedWhen ? `Last checked ${checkedWhen}.` : "Not checked yet."}
          </CardDescription>
          <CardAction>
            <CheckContentButton siteId={site.id} disabled={!ctx.canScan} />
          </CardAction>
        </CardHeader>
      </Card>
      {docs.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle className="text-base">
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {d.checks?.title || pathOf(d.url)}
              </a>
            </CardTitle>
            <CardDescription>
              {pathOf(d.url)}
              {d.checks ? ` · ${d.checks.pages} ${d.checks.pages === 1 ? "page" : "pages"}` : ""}
              {d.bytes ? ` · ${Math.round(d.bytes / 1024)} KB` : ""} · linked from {d.linkedFrom.slice(0, 3).map(pathOf).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.status === "failed" && <p className="text-destructive">Couldn&apos;t check it: {d.error}</p>}
            {d.status === "ok" && d.problems.length === 0 && <p className="text-muted-foreground">No problems found by these checks.</p>}
            {[...d.problems]
              .sort((a, b) => IMPACT_ORDER.indexOf(DOCUMENT_RULES[a as DocumentRule].severity) - IMPACT_ORDER.indexOf(DOCUMENT_RULES[b as DocumentRule].severity))
              .map((p) => {
                const rule = DOCUMENT_RULES[p as DocumentRule];
                return (
                  <div key={p} className="flex flex-col gap-0.5 rounded-md border p-3">
                    <span className="flex items-center gap-2 font-medium">
                      <ImpactBadge impact={rule.severity} />
                      {rule.title}
                      {p === "pdf-figure-no-alt" && d.checks ? ` (${d.checks.figuresWithoutAlt} of ${d.checks.figures})` : ""}
                      {p === "pdf-unlabeled-fields" && d.checks ? ` (${d.checks.unlabeledFields} of ${d.checks.fields})` : ""}
                    </span>
                    <span className="text-muted-foreground">{rule.why}</span>
                    <span>{rule.fix}</span>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
