import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildSecurityReport } from "@startica/core/security/report";
import { loadSites, withSite } from "../../accessibility/data";
import { NoProduct, SitePicker } from "../../accessibility/ui";
import { SecurityNoSite } from "../shared";

export const metadata: Metadata = { title: "Security report" };

export default function ReportPage(props: PageProps<"/security/report">) {
  return (
    <>
      <PageHeader title="Report" description="What the automated checks found, with references for your auditor. Download it as Markdown to share." />
      <Suspense fallback={<PageSkeleton />}>
        <Report searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** Bold (**text**) inside a line of the report. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/** Renders the report's Markdown: it's Startica's own output (headings, paragraphs, bullet lists, bold), not arbitrary Markdown. */
function ReportBody({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`l${blocks.length}`} className="list-disc pl-5">{list.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>);
    list = [];
  };
  for (const line of markdown.split("\n")) {
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const k = `b${blocks.length}`;
    if (line.startsWith("### ")) blocks.push(<h4 key={k} className="mt-2 font-semibold">{line.slice(4)}</h4>);
    else if (line.startsWith("## ")) blocks.push(<h3 key={k} className="mt-4 text-lg font-semibold">{line.slice(3)}</h3>);
    else if (line.startsWith("# ")) blocks.push(<h2 key={k} className="text-xl font-semibold">{line.slice(2)}</h2>);
    else blocks.push(<p key={k}>{inline(line)}</p>);
  }
  flush();
  return <div className="flex max-w-3xl flex-col gap-2 text-sm leading-relaxed">{blocks}</div>;
}

async function Report({ searchParams }: { searchParams: PageProps<"/security/report">["searchParams"] }) {
  const ctx = await loadSites((await searchParams).site);
  if (!ctx) return <NoProduct />;
  if (!ctx.site) return <SecurityNoSite ctx={ctx} />;
  const site = ctx.site;
  if (!site.securityVerifiedAt) {
    return (
      <p className="text-sm">
        Security checks are off until you prove the site is yours.{" "}
        <Link href={withSite("/security", site.id)} className="underline">
          Verify {site.name}
        </Link>
      </p>
    );
  }
  const markdown = await buildSecurityReport(site);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SitePicker ctx={ctx} path="/security/report" />
        <a href={`/security/report/download?site=${site.id}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          <DownloadIcon />
          Download Markdown
        </a>
      </div>
      <Card>
        <CardContent>
          <ReportBody markdown={markdown} />
        </CardContent>
      </Card>
    </>
  );
}
