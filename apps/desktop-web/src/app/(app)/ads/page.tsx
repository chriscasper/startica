import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loader2Icon } from "lucide-react";
import { listCampaigns } from "@startica/core/ads/campaigns";
import { hasAiKey } from "@startica/core/ai/client";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getActiveProduct } from "@/lib/dal";
import { NewCampaignButton, PLATFORM_LABEL, STATUS_LABEL } from "./ads-ui";

export const metadata: Metadata = { title: "Ads" };

export default function AdsPage() {
  return (
    <>
      <PageHeader title="Ads" description="Plan paid campaigns for Google, Meta and Reddit, with ads ready to import. You launch them and you pay; Startica never spends." />
      <Suspense fallback={<PageSkeleton />}>
        <Campaigns />
      </Suspense>
    </>
  );
}

async function Campaigns() {
  const product = await getActiveProduct();
  if (!product) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a product in <Link href="/settings?tab=products" className="underline">Settings</Link> first.
      </p>
    );
  }
  const [campaigns, aiReady] = await Promise.all([listCampaigns(product.id), hasAiKey()]);

  return (
    <>
      <LiveRefresh tables={["ad_campaigns", "ads"]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {aiReady ? (
            <>Campaigns for {product.name}. Each is a small test first: a budget, a few days and a result that says whether it works.</>
          ) : (
            <>
              Add an AI key in <Link href="/settings" className="underline">Settings</Link> to plan campaigns.
            </>
          )}
        </p>
        <NewCampaignButton productId={product.id} landingUrl={product.url} disabled={!aiReady} />
      </div>
      {campaigns.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No campaigns yet. Pick a platform and a goal, and Startica plans the targeting and writes the ads.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ads</TableHead>
              <TableHead className="text-right">Monthly budget</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link href={`/ads/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{c.goal}</div>
                </TableCell>
                <TableCell>{PLATFORM_LABEL[c.platform]}</TableCell>
                <TableCell>
                  <Badge variant={c.status === "failed" ? "destructive" : c.status === "running" ? "default" : "outline"}>
                    {c.status === "planning" && <Loader2Icon className="animate-spin" aria-hidden />}
                    {STATUS_LABEL[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.adCount}</TableCell>
                <TableCell className="text-right tabular-nums">{c.monthlyBudget.toLocaleString("en-US")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
