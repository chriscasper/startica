import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getActiveProduct } from "@/lib/dal";
import { asc, eq } from "drizzle-orm";
import * as schema from "@startica/db/schema";
import { db } from "@/lib/dal";
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

export default function IntelPage() {
  return (
    <>
      <PageHeader
        title="Intel"
        description="What Startica knows about the product, its audience and its competitors. Everything here feeds listening, drafting and the roadmap."
      />
      <Suspense fallback={<PageSkeleton />}>
        <IntelContent />
      </Suspense>
    </>
  );
}

async function IntelContent() {
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
  const [[p], personas, competitors, keywords, communities] = await Promise.all([
    d.select().from(schema.products).where(eq(schema.products.id, active.id)),
    d.select().from(schema.personas).where(eq(schema.personas.productId, active.id)).orderBy(asc(schema.personas.createdAt)),
    d.select().from(schema.competitors).where(eq(schema.competitors.productId, active.id)).orderBy(asc(schema.competitors.createdAt)),
    d.select().from(schema.keywords).where(eq(schema.keywords.productId, active.id)).orderBy(asc(schema.keywords.keyword)),
    d
      .select()
      .from(schema.communities)
      .where(eq(schema.communities.productId, active.id))
      .orderBy(asc(schema.communities.status), asc(schema.communities.name)),
  ]);
  if (!p) throw new Error("Product not found");

  // The section components use the original snake_case view shapes.
  const keywordViews: Keyword[] = keywords.map((k) => ({ id: k.id, keyword: k.keyword, intent: k.intent, use_for: k.useFor, source: k.source }));
  const communityViews: Community[] = communities.map((c) => ({ ...c, promo_rules: c.promoRules }));

  const counts = {
    personas: personas.length,
    competitors: competitors.length,
    communities: communities.length,
    keywords: keywords.length,
  };

  return (
    <>
      <LiveRefresh tables={["products", "personas", "competitors", "keywords", "communities"]} />
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

      <Tabs defaultValue="brief">
        <TabsList>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="personas">Personas ({counts.personas})</TabsTrigger>
          <TabsTrigger value="competitors">Competitors ({counts.competitors})</TabsTrigger>
          <TabsTrigger value="communities">Communities ({counts.communities})</TabsTrigger>
          <TabsTrigger value="keywords">Keywords ({counts.keywords})</TabsTrigger>
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
          <CompetitorsSection productId={p.id} competitors={competitors as Competitor[]} />
        </TabsContent>
        <TabsContent value="communities" className="pt-4">
          <CommunitiesSection productId={p.id} communities={communityViews} />
        </TabsContent>
        <TabsContent value="keywords" className="pt-4">
          <KeywordsSection productId={p.id} keywords={keywordViews} />
        </TabsContent>
      </Tabs>
    </>
  );
}
