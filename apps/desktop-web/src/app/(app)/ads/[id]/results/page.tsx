import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { addDays, campaignReview, listSpend, type AdResult, type Verdict } from "@startica/core/ads/results";
import { ownCampaign } from "@startica/core/ads/campaigns";
import { WEB_LABEL } from "@startica/core/metrics/web";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getWorkspace } from "@/lib/dal";
import { CampaignNav } from "../../campaign-nav";
import { AddSpendButton, RemoveSpendButton, SuggestionButtons, TargetButton } from "../../results-ui";

export const metadata: Metadata = { title: "Ad results" };

export default function ResultsPage(props: PageProps<"/ads/[id]/results">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Results params={props.params} />
    </Suspense>
  );
}

// In the ad account's currency, as entered: no symbol.
const money = (n: number | null) => (n == null ? "–" : n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US"));
const VERDICT: Record<Verdict, { label: string; variant: "default" | "outline" | "destructive" | "secondary" }> = {
  scale: { label: "Scale", variant: "default" },
  keep: { label: "Keep", variant: "secondary" },
  rewrite: { label: "Rewrite", variant: "outline" },
  stop: { label: "Stop", variant: "destructive" },
  wait: { label: "Too early", variant: "outline" },
};
const ctr = (r: Pick<AdResult, "clicks" | "impressions">) => (r.clicks != null && r.impressions ? `${((r.clicks / r.impressions) * 100).toFixed(2)}%` : "–");

async function Results({ params }: { params: PageProps<"/ads/[id]/results">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const campaign = /^[0-9a-f-]{36}$/i.test(id) ? await ownCampaign(workspace.id, id).catch(() => null) : null;
  if (!campaign) {
    return (
      <>
        <PageHeader title="Campaign not found" />
        <Link href="/ads" className="text-sm underline">
          Back to Ads
        </Link>
      </>
    );
  }
  const today = new Date().toLocaleDateString("en-CA");
  const [review, spend] = await Promise.all([campaignReview(campaign, today), listSpend(campaign.id)]);
  const { all, suggestions, target } = review;
  const adLabel = new Map(all.ads.map((a) => [a.adId, a.label]));
  const verdictFor = new Map(suggestions.map((s) => [s.adId, s]));
  const act = suggestions.filter((s) => s.verdict !== "wait");

  return (
    <>
      <LiveRefresh tables={["ad_spend", "ad_campaigns", "ads", "metrics_snapshots"]} />
      <PageHeader title={campaign.name} description="What each ad brought, what it cost, and what to do next." />
      <CampaignNav campaignId={campaign.id} current="results" />

      {!all.source && (
        <p className="rounded-lg border p-4 text-sm">
          Connect GA4 or Umami in <Link href="/settings?tab=products" className="underline">Settings → Products</Link> to see visits and results per ad. Every ad link carries the ad&apos;s id as utm_content, so
          nothing else needs setting up.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>This week</CardTitle>
          <CardDescription>The last 7 days against the 7 before.</CardDescription>
          <CardAction>
            <AddSpendButton campaignId={campaign.id} ads={all.ads.map((a) => ({ id: a.adId, label: a.label }))} today={today} weekAgo={addDays(today, -6)} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          {review.readOut.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per ad</CardTitle>
          <CardDescription>
            {all.window.from} to {all.window.to}
            {all.source && ` · visits and results from ${WEB_LABEL[all.source]}`} · {target.value ? `target ${money(target.value)} per result${target.set ? "" : " (the median of your ads)"}` : "no target yet"}
            {campaign.successMetric && ` · a result is: ${campaign.successMetric}`}
          </CardDescription>
          <CardAction>
            <TargetButton campaignId={campaign.id} value={campaign.targetCost} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {all.ads.length === 0 ? (
            <p className="text-sm text-muted-foreground">This campaign has no ads yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ad</TableHead>
                  <TableHead className="text-right">Spend</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Click rate</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Results</TableHead>
                  <TableHead className="text-right">Per visit</TableHead>
                  <TableHead className="text-right">Per result</TableHead>
                  <TableHead>Next</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.ads.map((a) => {
                  const s = verdictFor.get(a.adId);
                  return (
                    <TableRow key={a.adId}>
                      <TableCell className="max-w-64">
                        <div className="font-medium">{a.label}</div>
                        <div className="truncate text-xs text-muted-foreground">{a.copy.headlines?.[0] ?? a.copy.headline ?? a.copy.title ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(a.spend)}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.clicks ?? "–"}</TableCell>
                      <TableCell className="text-right tabular-nums">{ctr(a)}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.visits}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.results}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(a.costPerVisit)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(a.cpa)}</TableCell>
                      <TableCell>{s && <Badge variant={VERDICT[s.verdict].variant}>{VERDICT[s.verdict].label}</Badge>}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell className="font-medium">All ads{all.unassignedSpend > 0 && <div className="text-xs font-normal text-muted-foreground">includes {money(all.unassignedSpend)} entered for the whole campaign</div>}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(all.total.spend)}</TableCell>
                  <TableCell className="text-right tabular-nums">{all.total.clicks ?? "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{ctr(all.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{all.total.visits}</TableCell>
                  <TableCell className="text-right tabular-nums">{all.total.results}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(all.total.spend > 0 && all.total.visits > 0 ? all.total.spend / all.total.visits : null)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{money(all.total.cpa)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What to do next</CardTitle>
          <CardDescription>From the numbers above. Startica doesn&apos;t change anything in your ad account: you pause, scale or swap ads in the ad manager.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {act.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to change yet: {suggestions.length ? "every ad needs more spend before it can be judged." : "enter spend once the ads run."}</p>
          ) : (
            act.map((s) => (
              <div key={s.adId} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3">
                <div className="grid gap-1 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Badge variant={VERDICT[s.verdict].variant}>{VERDICT[s.verdict].label}</Badge>
                    {s.title}
                  </div>
                  <p className="text-muted-foreground">{s.why}</p>
                </div>
                <SuggestionButtons campaignId={campaign.id} adId={s.adId} verdict={s.verdict} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend entered</CardTitle>
          <CardDescription>Spend over several days counts evenly across them.</CardDescription>
        </CardHeader>
        <CardContent>
          {spend.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Enter spend from the ad manager as the campaign runs, weekly is plenty.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Days</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {spend.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">{s.startDay === s.endDay ? s.startDay : `${s.startDay} to ${s.endDay}`}</TableCell>
                    <TableCell>{s.adId ? (adLabel.get(s.adId) ?? "A deleted ad") : "Whole campaign (or a deleted ad)"}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(s.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.clicks ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.impressions?.toLocaleString("en-US") ?? "–"}</TableCell>
                    <TableCell className="text-right">
                      <RemoveSpendButton spendId={s.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
