import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { CheckIcon, MinusIcon } from "lucide-react";
import { allowedOffsite } from "@startica/core/offsite/check";
import { citedDomains, KIND_LABEL, RUNS, type CitedDomain, type DomainKind } from "@startica/core/offsite/domains";
import { jobs } from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, getActiveProduct } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import { CheckPagesButton, WatchButton } from "./offsite-ui";

export const metadata: Metadata = { title: "Off-site presence" };

const FILTERS: { key: string; label: string; kinds: DomainKind[] | null }[] = [
  { key: "all", label: "All", kinds: null },
  { key: "community", label: "Communities", kinds: ["community"] },
  { key: "directory", label: "Directories and reviews", kinds: ["directory"] },
  { key: "article", label: "Articles", kinds: ["article", "video"] },
  { key: "competitor", label: "Competitors and you", kinds: ["competitor", "own"] },
];

export default function OffsitePage(props: PageProps<"/seo/offsite">) {
  return (
    <>
      <PageHeader title="Off-site presence" description="The sites AI answers in your category lean on, whether you and your competitors appear there, and where to show up." />
      <Suspense fallback={<PageSkeleton />}>
        <Offsite searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function Presence({ d }: { d: CitedDomain }) {
  if (d.kind === "own") return <span className="text-xs text-muted-foreground">Your own pages</span>;
  if (d.youAppear === null) {
    // Nothing read: say why, from all of the site's pages.
    const statuses = new Set(d.pages.map((p) => p.read?.status ?? (allowedOffsite(p.url) ? "unread" : "not_allowed")));
    const label = statuses.has("unread")
      ? "Not read yet"
      : statuses.has("failed")
        ? "Couldn't read it"
        : statuses.has("blocked_by_robots")
          ? "Its robots.txt asks not to be read"
          : "Startica doesn't read this address";
    return <span className="text-xs text-muted-foreground">{label}</span>;
  }
  return d.youAppear ? (
    <Badge variant="secondary">
      <CheckIcon /> You&apos;re there
    </Badge>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <MinusIcon className="size-3" aria-hidden /> You&apos;re not there
    </span>
  );
}

function DomainCard({ d, productId }: { d: CitedDomain; productId: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {d.domain}
          <Badge variant="outline">{KIND_LABEL[d.kind]}</Badge>
          <Presence d={d} />
        </CardTitle>
        <CardDescription>
          Cited in {d.answers === 1 ? "1 answer" : `${d.answers} answers`}
          {d.kind !== "own" && d.answersWithoutYou > 0 ? `, ${d.answersWithoutYou} of them without mentioning you` : ""}
          {d.competitorsThere.length > 0 ? `. Competitors on its pages: ${d.competitorsThere.join(", ")}` : ""}.
        </CardDescription>
        <CardAction className="flex flex-wrap gap-1">
          {d.subreddits
            .filter((s) => !s.watching)
            .map((s) => (
              <WatchButton key={s.name} productId={productId} name={s.name} />
            ))}
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p>{d.suggestion}</p>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            {d.pages.length === 1 ? "The page" : `${d.pages.length} pages`} and the questions that cited it
          </summary>
          <div className="mt-2 grid gap-2">
            <ul className="grid gap-1 text-xs">
              {d.pages.map((p) => (
                <li key={p.url} className="flex flex-wrap items-baseline gap-x-2">
                  <a href={p.url} target="_blank" rel="noreferrer" className="truncate underline">
                    {p.read?.title || p.title}
                  </a>
                  <span className="text-muted-foreground">
                    {p.answers === 1 ? "1 citation" : `${p.answers} citations`}
                    {p.read?.status === "read" ? (p.read.mentionsProduct ? " · mentions you" : " · doesn't mention you") : ""}
                    {p.read?.competitors.length ? ` · names ${p.read.competitors.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Asked: {d.questions.map((q) => `“${q}”`).join(", ")}</p>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

async function Offsite({ searchParams }: { searchParams: PageProps<"/seo/offsite">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const param = (await searchParams).filter;
  const filter = FILTERS.find((f) => f.key === param) ?? FILTERS[0]!;
  const [{ domains, runs, answers }, waiting] = await Promise.all([
    citedDomains(product.id),
    (await db())
      .select({ payload: jobs.payload })
      .from(jobs)
      .where(and(eq(jobs.queue, "offsite_check"), inArray(jobs.status, ["queued", "running"]))),
  ]);
  const running = waiting.some((j) => j.payload.productId === product.id);
  const shown = domains.filter((d) => !filter.kinds || filter.kinds.includes(d.kind));
  // All of your hostnames together (fieldnote.example and docs.fieldnote.example are separate entries).
  const ownAnswers = Math.max(0, ...domains.filter((d) => d.kind === "own").map((d) => d.answers));
  const missing = domains.filter((d) => (d.kind === "directory" || d.kind === "article") && d.youAppear === false).length;
  const communities = domains.filter((d) => d.kind === "community").length;

  if (runs === 0) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Starts from AI visibility</CardTitle>
          <CardDescription>
            Off-site presence reads the sources AI answers cite. Add questions and run them on <Link href="/seo/ai" className="underline">AI visibility</Link>, and the sites they
            lean on show up here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <LiveRefresh tables={["offsite_pages", "ai_visibility_runs", "communities"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Filter">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/seo/offsite" : `/seo/offsite?filter=${f.key}`}
              aria-current={f.key === filter.key ? "page" : undefined}
              className={cn("rounded-md px-3 py-1 text-muted-foreground hover:text-foreground", f.key === filter.key && "bg-background font-medium text-foreground shadow-sm")}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <CheckPagesButton productId={product.id} running={running} disabled={desktopApp().demo ? "Off in the demo" : null} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sites cited", value: String(domains.length), sub: `in ${answers} answers from the last ${runs === 1 ? "run" : `${runs} runs`}` },
          { label: "Your site cited", value: `${Math.round((ownAnswers / answers) * 100)}%`, sub: ownAnswers ? `in at least ${ownAnswers} answers` : "in no answers yet" },
          { label: "Communities", value: String(communities), sub: "forums and threads answers quote" },
          { label: "Lists without you", value: String(missing), sub: "directories and articles you're not on" },
        ].map((t) => (
          <Card key={t.label} size="sm">
            <CardHeader>
              <CardDescription>{t.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{t.value}</CardTitle>
              <p className="text-xs text-muted-foreground">{t.sub}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing of this kind cited in the recent answers.</p>
      ) : (
        <div className="grid gap-3">
          {shown.slice(0, 40).map((d) => (
            <DomainCard key={d.domain} d={d} productId={product.id} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        From the citations in the last {RUNS} AI visibility runs. To see whether you and your competitors appear, Startica reads up to 30 of the cited pages after each
        run (at most 3 per site; a page read once rests for a week, one that failed is tried again), as StarticaOffsiteCheck, following each site&apos;s robots.txt. It never posts, signs up or contacts anyone:
        what you do with a site is up to you.
      </p>
    </>
  );
}
