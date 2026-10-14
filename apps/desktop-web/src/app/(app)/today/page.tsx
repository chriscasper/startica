import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, count, eq, gte } from "drizzle-orm";
import { monthlyBudgetUsd, monthToDateSpendUsd } from "@startica/core/ai/client";
import { ensureTodayMoves, recentReplanSummary } from "@startica/core/growth/moves";
import * as schema from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, getActiveProduct, getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";
import { communitySuggestions, setupFlags, setupStatus } from "@startica/core/setup/status";
import { GettingStarted, type ChecklistStatus } from "./getting-started";
import { MoveList, type MoveView } from "./move-list";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" description="What to do today, ranked: what's waiting first, then the roadmap's next steps." />
      <Suspense fallback={<PageSkeleton />}>
        <TodayContent />
      </Suspense>
    </>
  );
}

/** Loader (plain function: reads the clock). */
async function loadToday(workspaceId: string, productId: string) {
  const d = await db();
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [moves, plan, [posted], spent, budget] = await Promise.all([
    ensureTodayMoves(workspaceId, productId),
    recentReplanSummary(productId),
    d
      .select({ n: count() })
      .from(schema.publications)
      .where(and(eq(schema.publications.productId, productId), gte(schema.publications.postedAt, weekAgo))),
    monthToDateSpendUsd(workspaceId),
    monthlyBudgetUsd(),
  ]);
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return { moves, plan, postedThisWeek: posted?.n ?? 0, spent, budget, weekday, planAge: plan ? Math.round((Date.now() - plan.createdAt.getTime()) / 86400_000) : null };
}

async function TodayContent() {
  const [workspace, product] = await Promise.all([getWorkspace(), getActiveProduct()]);
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        <Link href="/welcome" className="underline">Set up your first product</Link> (or add one in <Link href="/settings?tab=products" className="underline">Settings</Link>) to get a
        daily plan.
      </p>
    );
  }
  const [t, flags, setup, suggestions] = await Promise.all([
    loadToday(workspace.id, product.id),
    setupFlags(),
    setupStatus(workspace.id, product.id),
    communitySuggestions(product.id),
  ]);
  const checklist: ChecklistStatus = { hasKey: setup.hasKey, intel: setup.intel, watching: setup.watching, scanned: setup.scanned, analytics: setup.analytics, posted: setup.posted };
  // Analytics is optional: the checklist finishes on the five required steps (Today's
  // moves keep suggesting analytics after that). Never in the demo: it's set up already.
  const requiredDone = setup.hasKey && setup.intel === "ready" && setup.watching > 0 && setup.scanned && setup.posted;
  const showChecklist = !flags.checklistDismissed && !requiredDone && !desktopApp().demo;
  // While the checklist shows, it owns the setup steps; don't repeat them as moves.
  const fromChecklist = (m: { kind: string; title: string }) => showChecklist && (m.kind === "setup" || (m.kind === "intel" && m.title.startsWith("Build intel")));
  const moves: MoveView[] = t.moves.filter((m) => !fromChecklist(m)).map((m) => ({
    id: m.id,
    rank: m.rank,
    kind: m.kind,
    title: m.title,
    why: m.why,
    href: m.href,
    status: m.status,
    source: m.source,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <LiveRefresh tables={["daily_moves", "opportunities", "roadmap_items", "products", "communities", "job_runs", "connections", "publications", "content_pieces"]} />
      {showChecklist && (
        <div className="lg:col-span-2">
          <GettingStarted
            productId={product.id}
            status={checklist}
            suggestions={suggestions.map((s) => ({ id: s.id, channel: s.channel, name: s.name, why: s.why, preselected: s.preselected }))}
          />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t.weekday}</CardTitle>
          <CardDescription>{product.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <MoveList productId={product.id} moves={moves} />
        </CardContent>
      </Card>

      <div className="grid content-start gap-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Replies posted this week</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{t.postedThisWeek}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>AI spend this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              ${t.spent.toFixed(2)} <span className="text-sm font-normal text-muted-foreground">of ${t.budget}</span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Latest plan{t.planAge !== null ? ` (${t.planAge === 0 ? "today" : `${t.planAge}d ago`})` : ""}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {t.plan ? (
              <p className="line-clamp-6 text-muted-foreground">{t.plan.summary}</p>
            ) : (
              <p className="text-muted-foreground">No roadmap yet.</p>
            )}
            <Link href="/roadmap" className="mt-2 inline-block underline-offset-4 hover:underline">
              Open the roadmap →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
