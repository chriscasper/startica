import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveProduct } from "@/lib/dal";
import { and, asc, count, eq, inArray, isNotNull } from "drizzle-orm";
import { unseenCounts } from "@startica/core/competitors/activity";
import { loadBenchmarks } from "@startica/core/benchmarks/report";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
import { BenchmarksSection } from "./benchmarks-section";
import { aiBlocked } from "./competitor-views";
import { FollowingSection } from "./following-section";
import { BuildControls, OwnerNotesForm, type IntelStatus } from "./intel-controls";
import {
  BriefSection,
  CommunitiesSection,
  CompetitorsSection,
  KeywordsSection,
  PersonasSection,
  type Brief,
  type Community,
  type Competitor,
  type Keyword,
  type Persona,
} from "./intel-sections";

export const metadata: Metadata = { title: "Intel" };

const TABS = ["brief", "personas", "competitors", "following", "communities", "keywords", "benchmarks"] as const;

export default function IntelPage(props: PageProps<"/intel">) {
  return (
    <>
      <PageHeader
        title="Intel"
        description="What Startica knows about the product, its audience and its competitors. Everything here feeds listening, drafting and the roadmap."
      />
      <Suspense fallback={<PageSkeleton />}>
        <IntelContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function IntelContent({ searchParams }: { searchParams: PageProps<"/intel">["searchParams"] }) {
  const params = await searchParams;
  const asked = params.tab;
  const tab = TABS.find((t) => t === asked) ?? "brief";
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const following = { brief: one(params.brief), briefId: one(params.briefId), relevant: params.relevant === "1" };
  const active = await getActiveProduct();
  if (!active) {
    return (
      <>
        <p className="text-sm text-muted-foreground">
          No product yet. <Link href="/settings?tab=products" className="underline">Add one in Settings</Link>.
        </p>
      </>
    );
  }

  const d = await db();
  const [[p], personas, competitors, keywords, communities, benchmarks, [syncing], unseen, followedRows, watchJobs, blocked] = await Promise.all([
    d.select().from(schema.products).where(eq(schema.products.id, active.id)),
    d.select().from(schema.personas).where(eq(schema.personas.productId, active.id)).orderBy(asc(schema.personas.createdAt)),
    d.select().from(schema.competitors).where(eq(schema.competitors.productId, active.id)).orderBy(asc(schema.competitors.createdAt)),
    d.select().from(schema.keywords).where(eq(schema.keywords.productId, active.id)).orderBy(asc(schema.keywords.keyword)),
    d
      .select()
      .from(schema.communities)
      .where(eq(schema.communities.productId, active.id))
      .orderBy(asc(schema.communities.status), asc(schema.communities.name)),
    loadBenchmarks(active.id),
    d
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.queue, "competitor_sync"), inArray(schema.jobs.status, ["queued", "running"])))
      .limit(1),
    unseenCounts(active.id),
    d
      .select({ competitorId: schema.competitorAccounts.competitorId, n: count() })
      .from(schema.competitorAccounts)
      .where(and(eq(schema.competitorAccounts.productId, active.id), isNotNull(schema.competitorAccounts.competitorId)))
      .groupBy(schema.competitorAccounts.competitorId),
    d
      .select({ queue: schema.jobs.queue, payload: schema.jobs.payload })
      .from(schema.jobs)
      .where(and(inArray(schema.jobs.queue, ["competitor_research", "competitor_digest"]), inArray(schema.jobs.status, ["queued", "running"]))),
    aiBlocked(),
  ]);
  if (!p) throw new Error("Product not found");

  // The section components use the original snake_case view shapes.
  const keywordViews: Keyword[] = keywords.map((k) => ({ id: k.id, keyword: k.keyword, intent: k.intent, use_for: k.useFor, source: k.source }));
  const communityViews: Community[] = communities.map((c) => ({ ...c, promo_rules: c.promoRules }));

  const researching = new Set(watchJobs.filter((j) => j.queue === "competitor_research").map((j) => j.payload.competitorId));
  const competitorViews: Competitor[] = competitors.map((c) => ({
    ...c,
    researched: c.profiledAt ? c.profiledAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
    researching: researching.has(c.id),
    unseen: unseen[c.id] ?? 0,
  }));
  const followed = new Map(followedRows.map((r) => [r.competitorId, r.n]));
  const totalUnseen = Object.values(unseen).reduce((a, b) => a + b, 0);

  const counts = {
    personas: personas.length,
    competitors: competitors.length,
    communities: communities.length,
    keywords: keywords.length,
  };

  return (
    <>
      <LiveRefresh tables={["products", "personas", "competitors", "keywords", "communities", "competitor_accounts", "competitor_snapshots", "competitor_people", "competitor_posts", "competitor_digests", "jobs"]} />
      <Card>
        <CardHeader>
          <CardTitle>Build intel for {p.name}</CardTitle>
          <CardDescription>
            Reads {p.url ? <span className="font-medium text-foreground">{p.url}</span> : "the product"}, researches the
            market on the web, and writes everything below.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          <BuildControls
            productId={p.id}
            status={p.intelStatus as IntelStatus}
            error={p.intelError}
            updatedAt={p.intelUpdatedAt?.toISOString() ?? null}
          />
          <div className="grid gap-2">
            <h3 className="text-sm font-medium">Your notes for Startica</h3>
            <OwnerNotesForm productId={p.id} notes={p.ownerNotes} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="personas">Personas ({counts.personas})</TabsTrigger>
          <TabsTrigger value="competitors">Competitors ({counts.competitors})</TabsTrigger>
          <TabsTrigger value="following">Following{totalUnseen > 0 ? ` (${totalUnseen} new)` : ""}</TabsTrigger>
          <TabsTrigger value="communities">Communities ({counts.communities})</TabsTrigger>
          <TabsTrigger value="keywords">Keywords ({counts.keywords})</TabsTrigger>
          <TabsTrigger value="benchmarks">Benchmarks ({benchmarks.accounts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="brief" className="pt-4">
          <BriefSection
            productId={p.id}
            brief={p.brief as Brief | null}
            source={p.briefSource}
          />
        </TabsContent>
        <TabsContent value="personas" className="pt-4">
          <PersonasSection productId={p.id} personas={personas as Persona[]} />
        </TabsContent>
        <TabsContent value="competitors" className="pt-4">
          <CompetitorsSection productId={p.id} competitors={competitorViews} canResearch={!blocked} />
        </TabsContent>
        <TabsContent value="following" className="pt-4">
          <FollowingSection
            productId={p.id}
            competitors={competitors.map((c) => ({ id: c.id, name: c.name, followed: followed.get(c.id) ?? 0 }))}
            briefRunning={watchJobs.some((j) => j.queue === "competitor_digest" && j.payload.productId === p.id)}
            asked={following}
          />
        </TabsContent>
        <TabsContent value="communities" className="pt-4">
          <CommunitiesSection productId={p.id} communities={communityViews} />
        </TabsContent>
        <TabsContent value="keywords" className="pt-4">
          <KeywordsSection productId={p.id} keywords={keywordViews} />
        </TabsContent>
        <TabsContent value="benchmarks" className="pt-4">
          <BenchmarksSection productId={p.id} data={benchmarks} running={Boolean(syncing)} demo={process.env.STARTICA_DEMO === "1"} />
        </TabsContent>
      </Tabs>
    </>
  );
}
