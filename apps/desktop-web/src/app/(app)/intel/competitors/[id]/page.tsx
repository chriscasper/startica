import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { ExternalLinkIcon } from "lucide-react";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, getWorkspace } from "@/lib/dal";
import { ActivityFeed, CompanyAccounts, PeopleSection, ResearchButton } from "../../competitor-ui";
import { activityViews, aiBlocked, linkView, nextResearchLine, peopleAndAccounts } from "../../competitor-views";

export const metadata: Metadata = { title: "Competitor" };

/** One competitor in depth (ARCHITECTURE.md section 3, "Competitor watch"): the researched profile, the people at it, what it and they post. */
export default function CompetitorPage(props: PageProps<"/intel/competitors/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Competitor params={props.params} />
    </Suspense>
  );
}

function Lines({ items, empty = "Nothing found." }: { items: string[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

const known = (v: string) => v && v.toLowerCase() !== "unknown";

async function Competitor({ params }: { params: PageProps<"/intel/competitors/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const d = await db();
  const [c] = /^[0-9a-f-]{36}$/i.test(id) ? await d.select().from(schema.competitors).where(and(eq(schema.competitors.id, id), eq(schema.competitors.workspaceId, workspace.id))) : [];
  if (!c) {
    return (
      <>
        <PageHeader title="Competitor not found" />
        <Link href="/intel?tab=competitors" className="text-sm underline">
          Back to Intel
        </Link>
      </>
    );
  }
  const [{ people, company }, activity, blocked, next, [researching]] = await Promise.all([
    peopleAndAccounts(c.id),
    activityViews(c.productId, c.id),
    aiBlocked(),
    nextResearchLine(c.productId, c.profiledAt),
    d
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.queue, "competitor_research"), inArray(schema.jobs.status, ["queued", "running"])))
      .limit(1),
  ]);
  const p = c.profile;
  const working = c.profileStatus === "working" && Boolean(researching);
  const followed = new Set(company.map((a) => a.url ?? a.handle));
  const suggestions = (p?.accounts ?? []).map(linkView).filter((l) => !followed.has(l.url));
  const facts = p ? ([["Founded", p.company.founded], ["Size", p.company.size], ["Funding", p.company.funding], ["Based in", p.company.location]] as const).filter(([, v]) => known(v)) : [];

  return (
    <>
      <LiveRefresh tables={["competitors", "competitor_people", "competitor_accounts", "competitor_posts", "jobs"]} />
      <PageHeader title={c.name} description={p?.summary || c.positioning || "A competitor of your product."} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/intel?tab=competitors" className="text-muted-foreground hover:underline">
            Intel → Competitors
          </Link>
          {c.url && (
            <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
              {c.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          {c.profiledAt && c.profileStatus !== "working" && (
            <span className="text-xs text-muted-foreground">
              Researched {c.profiledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {next && ` · ${next}`}
            </span>
          )}
          <ResearchButton competitorId={c.id} again={Boolean(p)} working={working} why={blocked} />
        </div>
      </div>
      {c.profileStatus === "failed" && c.profileError && <p className="text-sm text-destructive">The research failed: {c.profileError}</p>}
      {working && <p className="text-sm text-muted-foreground">Researching on the web, then writing the profile. It takes a few minutes and costs about $0.30 to $0.80; it runs in the background.</p>}

      {!p ? (
        <Card>
          <CardHeader>
            <CardTitle>In-depth profile</CardTitle>
            <CardDescription>
              Startica researches {c.name} on the web: its pricing, features, messaging, recent launches and changes, what users praise and complain about, how it compares with your product, the people worth following and its own accounts and blog.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {p.changes.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>What changed since the last research</CardTitle>
              </CardHeader>
              <CardContent>
                <Lines items={p.changes} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Who it&apos;s for and how it pitches itself</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {known(p.audience) && <p>{p.audience}</p>}
              {known(p.messaging) && (
                <p>
                  <span className="font-medium">Messaging: </span>
                  {p.messaging}
                </p>
              )}
              {facts.length > 0 && (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {facts.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {p.channels.length > 0 && (
                <p>
                  <span className="font-medium">Markets itself on: </span>
                  {p.channels.join(", ")}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              {known(p.pricing.model) && <CardDescription>{p.pricing.model}</CardDescription>}
            </CardHeader>
            <CardContent>
              {p.pricing.plans.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {p.pricing.plans.map((plan, i) => (
                    <li key={i}>
                      <span className="font-medium">{plan.name}</span> {plan.price && <span>· {plan.price}</span>} {plan.notes && <span className="text-muted-foreground">· {plan.notes}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No plans found.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
            </CardHeader>
            <CardContent>
              <Lines items={p.features} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recently</CardTitle>
            </CardHeader>
            <CardContent>
              {p.recent.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {p.recent.map((r, i) => (
                    <li key={i}>
                      {r.date && <span className="text-muted-foreground tabular-nums">{r.date} · </span>}
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                          {r.what}
                        </a>
                      ) : (
                        r.what
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing recent found.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>What users say</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Praise</span>
                <Lines items={p.praise} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Complaints</span>
                <Lines items={p.complaints} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Against your product</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Where it&apos;s stronger</span>
                <Lines items={p.versus.theyWin} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium">Where you&apos;re stronger</span>
                <Lines items={p.versus.youWin} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
            <CardDescription>Founders and the people who speak for {c.name}. Follow them to see what they post, with a brief on each.</CardDescription>
          </CardHeader>
          <CardContent>
            <PeopleSection competitorId={c.id} people={people} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Its accounts and blog</CardTitle>
            <CardDescription>
              The company&apos;s own profiles, feeds and pages, each with a brief. Watched pages show what changed; LinkedIn and X are briefed from web search. Bluesky, Mastodon, Reddit and Hacker News accounts also show in Benchmarks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyAccounts competitorId={c.id} accounts={company} suggestions={suggestions} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>What {c.name} and the people you follow there posted, and what changed on its watched pages, newest first. Read as often as Intel → Following → Settings says (daily by default) while Startica is open.</CardDescription>
          {activity.some((a) => !a.seen) && (
            <CardAction>
              <Badge>{activity.filter((a) => !a.seen).length} new</Badge>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <ActivityFeed productId={c.productId} competitorId={c.id} items={activity} />
        </CardContent>
      </Card>

      {p && p.sources.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Sources ({p.sources.length}), written by {p.model}</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {p.sources.map((s) => (
              <li key={s.url} className="truncate">
                <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
