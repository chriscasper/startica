import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { topicsSettingKey } from "@startica/core/content/jobs";
import { webSource } from "@startica/core/metrics/web";
import { utmContentOf } from "@startica/core/distribution/utm";
import { pieceRequest } from "@startica/core/posting/requests";
import { getSetting } from "@startica/db/bootstrap";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { cn } from "@/lib/utils";
import { db, getActiveProduct } from "@/lib/dal";
import { assistedPostingAvailable, postingContext } from "@/lib/posting";
import { CreatePanel, LibraryPanel, VoicesPanel, type PieceView, type ProfileView, type SourceView, type TopicView } from "./content-studio";

export const metadata: Metadata = { title: "Content Studio" };

const TABS = { create: "Create", library: "Library", voices: "Voices" } as const;
type Tab = keyof typeof TABS;

export default function ContentPage(props: PageProps<"/content">) {
  return (
    <>
      <PageHeader title="Content Studio" description="Posts, threads and articles in a voice your audience already likes." />
      <Suspense fallback={<PageSkeleton />}>
        <ContentStudio searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function ContentStudio({ searchParams }: { searchParams: PageProps<"/content">["searchParams"] }) {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const params = await searchParams;
  const tab: Tab = typeof params.tab === "string" && params.tab in TABS ? (params.tab as Tab) : "create";
  const d = await db();

  const [sources, sampleCounts, profiles, pieces, pendingJobs, topicsSetting] = await Promise.all([
    d.select().from(schema.voiceSources).where(eq(schema.voiceSources.productId, product.id)).orderBy(schema.voiceSources.createdAt),
    d
      .select({ sourceId: schema.voiceSamples.sourceId, n: count() })
      .from(schema.voiceSamples)
      .innerJoin(schema.voiceSources, eq(schema.voiceSources.id, schema.voiceSamples.sourceId))
      .where(eq(schema.voiceSources.productId, product.id))
      .groupBy(schema.voiceSamples.sourceId),
    d.select().from(schema.voiceProfiles).where(eq(schema.voiceProfiles.productId, product.id)).orderBy(desc(schema.voiceProfiles.createdAt)),
    d.select().from(schema.contentPieces).where(eq(schema.contentPieces.productId, product.id)).orderBy(desc(schema.contentPieces.createdAt)).limit(50),
    d
      .select({ queue: schema.jobs.queue, payload: schema.jobs.payload })
      .from(schema.jobs)
      .where(and(inArray(schema.jobs.queue, ["voice_import", "content_topics"]), inArray(schema.jobs.status, ["queued", "running"]))),
    getSetting<{ topics: TopicView[] }>(topicsSettingKey(product.id)),
  ]);

  // How posted pieces did: latest engagement snapshot, and web analytics (GA4 or Umami) visits by tracking link.
  const posted = pieces.filter((p) => p.status === "posted");
  const utmIds = posted.map((p) => utmContentOf(p.utmUrl)).filter((u): u is string => u !== null);
  const web = (await webSource(product.id)) ?? "ga4";
  const [snapshots, visitRows, [ga4]] = await Promise.all([
    posted.length
      ? d
          .select()
          .from(schema.contentSnapshots)
          .where(inArray(schema.contentSnapshots.pieceId, posted.map((p) => p.id)))
          .orderBy(desc(schema.contentSnapshots.capturedAt))
      : [],
    utmIds.length
      ? d
          .select({ metric: schema.metricsSnapshots.metric, dimension: schema.metricsSnapshots.dimension, value: schema.metricsSnapshots.value })
          .from(schema.metricsSnapshots)
          .where(
            and(
              eq(schema.metricsSnapshots.productId, product.id),
              eq(schema.metricsSnapshots.source, web),
              inArray(schema.metricsSnapshots.dimension, utmIds.map((u) => `utm_content:${u}`)),
            ),
          )
      : [],
    d
      .select({ status: schema.connections.status })
      .from(schema.connections)
      .where(and(eq(schema.connections.productId, product.id), eq(schema.connections.kind, web))),
  ]);
  const ga4Total = (utm: string | null, metric: string) =>
    visitRows.filter((r) => r.metric === metric && r.dimension === `utm_content:${utm}`).reduce((n, r) => n + Number(r.value), 0);

  const importing = new Set(pendingJobs.filter((j) => j.queue === "voice_import").map((j) => j.payload.sourceId as string));
  const sourceNames = new Map(sources.map((s) => [s.id, s.name]));
  const sourceViews: SourceView[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    platform: s.platform,
    handle: s.handle,
    url: s.url,
    samples: sampleCounts.find((c) => c.sourceId === s.id)?.n ?? 0,
    importing: importing.has(s.id),
  }));
  const profileViews: ProfileView[] = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    error: p.error,
    guide: p.guide,
    sources: p.sourceIds.map((id) => sourceNames.get(id)).filter((n): n is string => Boolean(n)),
  }));
  const profileNames = new Map(profiles.map((p) => [p.id, p.name]));
  const posting = assistedPostingAvailable();
  const context = posting ? await postingContext(product.id) : {};
  const pieceViews: PieceView[] = pieces.map((p) => ({
    id: p.id,
    channel: p.channel,
    format: p.format,
    topic: p.topic,
    title: p.title,
    body: p.body,
    rationale: p.rationale,
    status: p.status,
    error: p.error,
    voice: p.voiceProfileId ? (profileNames.get(p.voiceProfileId) ?? null) : null,
    postedUrl: p.postedUrl,
    engagement: (() => {
      const snap = snapshots.find((x) => x.pieceId === p.id);
      return snap
        ? { replies: snap.replies, score: snap.score, removed: snap.removed, checked: snap.capturedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) }
        : null;
    })(),
    traffic:
      p.status === "posted" && ga4?.status === "ok" && utmContentOf(p.utmUrl)
        ? { visits: ga4Total(utmContentOf(p.utmUrl), "sessions"), keyEvents: ga4Total(utmContentOf(p.utmUrl), "key_events") }
        : null,
    notes: p.notes,
    canPost: posting && pieceRequest(p, context) !== null,
    created: p.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
  const drafting = pieceViews.filter((p) => p.status === "drafting").length;

  return (
    <>
      <LiveRefresh tables={["content_pieces", "content_snapshots", "voice_profiles", "voice_samples", "voice_sources", "jobs"]} />
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1 text-sm" aria-label="Content Studio views">
        {(Object.keys(TABS) as Tab[]).map((key) => (
          <Link
            key={key}
            href={key === "create" ? "/content" : `/content?tab=${key}`}
            className={cn(
              "rounded-md px-3 py-1 text-muted-foreground transition-colors hover:text-foreground",
              tab === key && "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            {TABS[key]}
            {key === "library" && ` (${pieceViews.length}${drafting ? `, ${drafting} writing` : ""})`}
            {key === "voices" && ` (${profileViews.filter((p) => p.status === "ready").length})`}
          </Link>
        ))}
      </nav>
      {tab === "create" && (
        <CreatePanel
          productId={product.id}
          profiles={profileViews}
          topics={topicsSetting?.topics ?? []}
          topicsPending={pendingJobs.some((j) => j.queue === "content_topics")}
        />
      )}
      {tab === "library" && <LibraryPanel pieces={pieceViews} />}
      {tab === "voices" && <VoicesPanel productId={product.id} sources={sourceViews} profiles={profileViews} />}
    </>
  );
}
