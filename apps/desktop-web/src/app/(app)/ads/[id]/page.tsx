import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CircleAlertIcon, DownloadIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { adUrl, type AdFlag } from "@startica/core/ads/checks";
import { keywordNotation, loadCampaign, type CampaignAd, type CampaignDetail } from "@startica/core/ads/campaigns";
import { campaignBrief, dailyBudget, HANDOFF_STEPS } from "@startica/core/ads/exports";
import { AD_PLATFORMS, AD_SPECS_CHECKED } from "@startica/core/ads/platforms";
import type { AdCopy, AdPlatform } from "@startica/db/schema";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspace } from "@/lib/dal";
import { AddAdButton, AdButtons, CampaignControls, CopyButton, EditGroupButton, PLATFORM_LABEL, STATUS_LABEL } from "../ads-ui";
import { CampaignNav } from "../campaign-nav";

export const metadata: Metadata = { title: "Ad campaign" };

export default function CampaignPage(props: PageProps<"/ads/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaign params={props.params} />
    </Suspense>
  );
}

const FIELD_LABEL: Partial<Record<keyof AdCopy, string>> = {
  headlines: "Headlines",
  descriptions: "Descriptions",
  path1: "Path 1",
  path2: "Path 2",
  primaryText: "Primary text",
  headline: "Headline",
  description: "Description",
  title: "Headline",
  body: "Body",
  callToAction: "Call to action",
};

function Flag({ flag }: { flag: AdFlag }) {
  const Icon = flag.level === "error" ? CircleAlertIcon : TriangleAlertIcon;
  return (
    <span className={`inline-flex items-start gap-1 text-xs ${flag.level === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-400"}`}>
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {flag.message}
    </span>
  );
}

function CopyField({ label, value, max, recommended, flags }: { label: string; value: string; max?: number; recommended?: number; flags: AdFlag[] }) {
  const limit = recommended ?? max;
  const tone = max && value.length > max ? "text-destructive" : recommended && value.length > recommended ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";
  return (
    <div className="grid gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="whitespace-pre-wrap">{value}</span>
        {limit && <span className={`shrink-0 text-xs tabular-nums ${tone}`}>{value.length}/{limit}</span>}
      </div>
      {flags.map((f, i) => (
        <Flag key={i} flag={f} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function AdCopyView({ platform, ad, link }: { platform: AdPlatform; ad: CampaignAd; link: string }) {
  const spec = AD_PLATFORMS[platform];
  const flagsFor = (field: keyof AdCopy, index?: number) => ad.flags.filter((f) => f.field === field && f.index === index);
  return (
    <div className="grid gap-3 text-sm">
      {spec.fields.map((field) => {
        const value = ad.copy[field.key];
        const listFlags = flagsFor(field.key);
        if (Array.isArray(value) || field.count) {
          const items = (value as string[] | undefined) ?? [];
          return (
            <div key={field.key} className="grid gap-1">
              <div className="text-xs font-medium text-muted-foreground">
                {field.label} ({items.length})
              </div>
              <ol className="grid gap-1">
                {items.map((text, i) => (
                  <li key={i}>
                    <CopyField label={`${field.label} ${i + 1}`} value={text} max={field.max} flags={flagsFor(field.key, i)} />
                  </li>
                ))}
              </ol>
              {listFlags.map((f, i) => (
                <Flag key={i} flag={f} />
              ))}
            </div>
          );
        }
        if (!value && field.optional) return null;
        return (
          <div key={field.key} className="grid gap-1">
            <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
            <CopyField label={field.label} value={String(value ?? "")} max={field.max} recommended={field.recommended} flags={listFlags} />
          </div>
        );
      })}
      {ad.copy.callToAction && (
        <div className="text-xs text-muted-foreground">
          {FIELD_LABEL.callToAction}: <span className="text-foreground">{ad.copy.callToAction.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>
        </div>
      )}
      <div className="truncate font-mono text-xs text-muted-foreground" title={link}>
        {link}
      </div>
    </div>
  );
}

function Targeting({ platform, t }: { platform: AdPlatform; t: CampaignDetail["groups"][number]["targeting"] }) {
  const rows: [string, string][] = [];
  if (t.audience) rows.push(["Audience", t.audience]);
  if (platform === "google") {
    rows.push(["Keywords", (t.keywords ?? []).map(keywordNotation).join(", ") || "none"]);
    if (t.negativeKeywords?.length) rows.push(["Negative keywords", t.negativeKeywords.join(", ")]);
  }
  if (t.communities?.length) rows.push(["Communities", t.communities.map((c) => `r/${c}`).join(", ")]);
  if (t.interests?.length) rows.push(["Interests", t.interests.join(", ")]);
  if (t.placements?.length) rows.push(["Placements", t.placements.join(", ")]);
  rows.push(["Locations", t.locations?.length ? t.locations.join(", ") : "not set"]);
  return (
    <dl className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

async function Campaign({ params }: { params: PageProps<"/ads/[id]">["params"] }) {
  const { id } = await params;
  const workspace = await getWorkspace();
  const detail = /^[0-9a-f-]{36}$/i.test(id) ? await loadCampaign(workspace.id, id) : null;
  if (!detail) {
    return (
      <>
        <PageHeader title="Campaign not found" />
        <Link href="/ads" className="text-sm underline">
          Back to Ads
        </Link>
      </>
    );
  }
  const { campaign, groups, errors, warnings } = detail;
  const spec = AD_PLATFORMS[campaign.platform];
  const planning = campaign.status === "planning";
  const ready = !planning && groups.length > 0;
  const download = (kind: string) => `/ads/${campaign.id}/export/${kind}`;

  return (
    <>
      <LiveRefresh tables={["ad_campaigns", "ad_groups", "ads"]} />
      <PageHeader title={campaign.name} description={`${spec.name} · ${spec.format}. ${campaign.goal}`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/ads" className="text-muted-foreground hover:underline">
            Ads
          </Link>
          <span className="text-muted-foreground">/</span>
          <Badge variant={campaign.status === "failed" ? "destructive" : "outline"}>
            {planning && <Loader2Icon className="animate-spin" aria-hidden />}
            {STATUS_LABEL[campaign.status]}
          </Badge>
          <span className="text-muted-foreground">{PLATFORM_LABEL[campaign.platform]}</span>
        </div>
        <CampaignControls
          campaign={{ id: campaign.id, status: campaign.status, name: campaign.name, goal: campaign.goal, landingUrl: campaign.landingUrl, monthlyBudget: campaign.monthlyBudget, notes: campaign.notes }}
        />
      </div>
      <CampaignNav campaignId={campaign.id} current="plan" />

      {planning && (
        <p className="flex items-center gap-2 rounded-lg border p-4 text-sm">
          <Loader2Icon className="size-4 animate-spin" aria-hidden /> Planning the campaign: the targeting, the test and the ads. This takes a minute or two.
        </p>
      )}
      {campaign.status === "failed" && (
        <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">Planning didn&apos;t finish: {campaign.error ?? "unknown error"}. Plan again to retry.</p>
      )}

      {campaign.summary && (
        <Card>
          <CardHeader>
            <CardTitle>The plan</CardTitle>
            <CardDescription>{campaign.summary}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">Test</div>
              <div className="font-medium tabular-nums">
                {campaign.testBudget != null && campaign.testDays != null ? `${campaign.testBudget.toLocaleString("en-US")} over ${campaign.testDays} days` : "not set"}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">About {dailyBudget(campaign).toFixed(2)} a day</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Works if</div>
              <div>{campaign.successMetric ?? "not set"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bidding</div>
              <div>{campaign.bidStrategy ?? "not set"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader>
            <CardTitle>{g.name}</CardTitle>
            {g.angle && <CardDescription>{g.angle}</CardDescription>}
            <CardAction>
              <EditGroupButton platform={campaign.platform} group={{ id: g.id, name: g.name, angle: g.angle, targeting: g.targeting }} />
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Targeting platform={campaign.platform} t={g.targeting} />
            <div className="grid gap-3 lg:grid-cols-2">
              {g.ads.map((a, i) => (
                <div key={a.id} className="grid content-start gap-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      Ad {i + 1}
                      <Badge variant="outline">{a.source === "ai" ? "AI" : "You"}</Badge>
                      {a.status === "failed" && <Badge variant="destructive">Rewrite failed</Badge>}
                    </div>
                    <AdButtons platform={campaign.platform} ctas={spec.callsToAction ?? []} ad={{ id: a.id, copy: a.copy, status: a.status }} />
                  </div>
                  {a.status === "failed" && a.error && <p className="text-xs text-destructive">{a.error}</p>}
                  <AdCopyView platform={campaign.platform} ad={a} link={adUrl(campaign.landingUrl, campaign.platform, campaign.utmCampaign, a.id)} />
                </div>
              ))}
            </div>
            <div>
              <AddAdButton groupId={g.id} />
            </div>
          </CardContent>
        </Card>
      ))}

      {ready && (
        <Card id="hand-off">
          <CardHeader>
            <CardTitle>Hand off</CardTitle>
            <CardDescription>
              Startica doesn&apos;t touch your ad account. Import or paste these, review them in {spec.name}, and launch when you&apos;re ready.
              {campaign.platform !== "reddit" && " Everything imports paused, so importing alone never spends money."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {errors > 0 ? (
              <p className="flex items-center gap-1 text-destructive">
                <CircleAlertIcon className="size-4" aria-hidden /> Fix {errors === 1 ? "1 problem" : `${errors} problems`} marked in red first: the platform will reject {errors === 1 ? "it" : "them"}.
              </p>
            ) : warnings > 0 ? (
              <p className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <TriangleAlertIcon className="size-4" aria-hidden /> {warnings === 1 ? "1 warning" : `${warnings} warnings`}: worth a look, but they won&apos;t block the import.
              </p>
            ) : null}
            <ol className="grid gap-2">
              {HANDOFF_STEPS[campaign.platform].map((step, i) => (
                <li key={i} className="grid grid-cols-[1.5rem_1fr] items-baseline gap-1">
                  <span className="grid size-5 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              {campaign.platform === "google" && (
                <Button nativeButton={false} render={<a href={download("google")} download />}>
                  <DownloadIcon /> Google Ads Editor file
                </Button>
              )}
              {campaign.platform === "meta" && (
                <Button nativeButton={false} render={<a href={download("meta")} download />}>
                  <DownloadIcon /> Meta bulk import file
                </Button>
              )}
              <Button variant="outline" nativeButton={false} render={<a href={download("brief")} download />}>
                <DownloadIcon /> Campaign brief (Markdown)
              </Button>
              <CopyButton text={campaignBrief(detail)} label="Copy the brief" />
            </div>
            <p className="text-xs text-muted-foreground">
              Every link carries utm_source={campaign.platform}, utm_medium=paid, utm_campaign={campaign.utmCampaign} and the ad&apos;s id, so Analytics can tell which ad brought each visit.
              Limits checked against the platforms&apos; help pages on {AD_SPECS_CHECKED}.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
