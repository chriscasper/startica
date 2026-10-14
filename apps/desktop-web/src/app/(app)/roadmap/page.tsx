import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { db, getActiveProduct } from "@/lib/dal";
import { Audits, Board, RoadmapHeader, type AuditView, type ItemView, type PlanView } from "./roadmap-board";

export const metadata: Metadata = { title: "Roadmap" };

export default function RoadmapPage() {
  return (
    <>
      <PageHeader title="Roadmap" description="A short list of growth bets across the funnel, re-planned weekly from what's working." />
      <Suspense fallback={<PageSkeleton />}>
        <RoadmapContent />
      </Suspense>
    </>
  );
}

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

async function RoadmapContent() {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const d = await db();
  const [items, [plan], pendingJobs, auditRows, [productRow]] = await Promise.all([
    d.select().from(schema.roadmapItems).where(eq(schema.roadmapItems.productId, product.id)).orderBy(asc(schema.roadmapItems.priority)),
    d
      .select()
      .from(schema.roadmapReplans)
      .where(eq(schema.roadmapReplans.productId, product.id))
      .orderBy(desc(schema.roadmapReplans.createdAt))
      .limit(1),
    d
      .select({ payload: schema.jobs.payload })
      .from(schema.jobs)
      .where(and(eq(schema.jobs.queue, "roadmap_plan"), inArray(schema.jobs.status, ["queued", "running"]))),
    d.select().from(schema.audits).where(eq(schema.audits.productId, product.id)).orderBy(desc(schema.audits.createdAt)).limit(20),
    d.select({ brief: schema.products.brief }).from(schema.products).where(eq(schema.products.id, product.id)),
  ]);
  const planning = pendingJobs.some((j) => !j.payload.productId || j.payload.productId === product.id);
  const latestAudits: AuditView[] = [];
  for (const a of auditRows) {
    if (latestAudits.some((x) => x.kind === a.kind)) continue;
    latestAudits.push({ id: a.id, kind: a.kind, status: a.status, summary: a.summary, error: a.error, date: date(a.createdAt), findings: a.findings });
  }
  const planView: PlanView = plan ? { summary: plan.summary, changes: plan.changes, date: date(plan.createdAt) } : null;

  return (
    <>
      <LiveRefresh tables={["roadmap_items", "roadmap_replans", "audits", "jobs"]} />
      {!productRow?.brief && (
        <p className="rounded-lg border p-4 text-sm">
          Build intel for {product.name} first (<Link href="/intel" className="underline">Intel</Link>): the roadmap is planned from it.
        </p>
      )}
      <RoadmapHeader productId={product.id} planning={planning} plan={planView} />
      <Board productId={product.id} items={items as ItemView[]} />
      <Audits productId={product.id} audits={latestAudits} kinds={["landing", "onboarding"]} />
    </>
  );
}
