import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DownloadIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { aiApiKey, taskModel } from "@startica/core/ai/client";
import { providerOf } from "@startica/core/ai/models";
import { loadCampaign } from "@startica/core/ads/campaigns";
import { CREATIVE_SPECS, imageEstimate, listCreatives, logoPath, picturePath, type AdCreative } from "@startica/core/ads/creatives";
import { TEMPLATE_LABEL } from "@startica/core/ads/templates";
import { jobByPayload } from "@startica/core/jobs/cancel";
import { LiveRefresh } from "@/components/app/live-refresh";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/page-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkspace } from "@/lib/dal";
import { CampaignNav } from "../../campaign-nav";
import { CreativeButtons, LogoControls, NewCreativeButton, SuggestIdeasButton, type CreativeValues } from "../../creatives-ui";

export const metadata: Metadata = { title: "Ad creatives" };

export default function CreativesPage(props: PageProps<"/ads/[id]/creatives">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Creatives params={props.params} />
    </Suspense>
  );
}

const STATUS: Record<AdCreative["status"], string> = { idea: "Idea", generating: "Drawing", rendering: "Rendering", ready: "Ready", failed: "Failed" };
const fileUrl = (c: { id: string }, file: string, download = false) => `/ads/creatives/${c.id}/${file}${download ? "?download" : ""}`;
const kb = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

async function Creatives({ params }: { params: PageProps<"/ads/[id]/creatives">["params"] }) {
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
  const { campaign, groups } = detail;
  const ctx = { workspaceId: workspace.id };
  const [creatives, estimate, imageModel, openaiKey, ideasJob] = await Promise.all([
    listCreatives(campaign.id),
    imageEstimate(ctx),
    taskModel(ctx, "image"),
    aiApiKey("openai"),
    jobByPayload(workspace.id, ["ad_creative_ideas"], "campaignId", campaign.id),
  ]);
  const canDraw = Boolean(openaiKey) && providerOf(imageModel.model) === "openai";
  const estimateText = `about $${estimate.usd.toFixed(2)} at ${estimate.quality} quality`;
  const spec = CREATIVE_SPECS[campaign.platform];
  const logoUrl = logoPath(campaign.productId) ? `/ads/logo/${campaign.productId}` : null;
  const ads = groups.flatMap((g) => g.ads.map((a, i) => ({ id: a.id, label: `${g.name}: ad ${i + 1}` })));
  const adLabel = new Map(ads.map((a) => [a.id, a.label]));
  const dialog = { campaignId: campaign.id, ads, estimate: estimateText, canDraw, logoUrl };
  const spent = creatives.reduce((n, c) => n + c.costUsd, 0);

  return (
    <>
      <LiveRefresh tables={["ad_creatives", "ad_campaigns"]} />
      <PageHeader title={campaign.name} description="Images for the ads: the AI draws the picture, a template adds the words, in every size the platform takes." />
      <CampaignNav campaignId={campaign.id} current="creatives" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <NewCreativeButton {...dialog} />
          <SuggestIdeasButton campaignId={campaign.id} busy={Boolean(ideasJob)} disabled={groups.length === 0} />
        </div>
        <LogoControls campaignId={campaign.id} logoUrl={logoUrl} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sizes for {campaign.platform === "google" ? "Google Ads" : campaign.platform === "meta" ? "Meta" : "Reddit"}</CardTitle>
          <CardDescription>
            {spec.sizes.map((s) => `${s.size} ${s.width}×${s.height} (${s.use})`).join(" · ")}. Kept under {kb(spec.maxBytes)} each.
            {campaign.platform === "google" && " Search ads don't show images: use these in Demand Gen, Display or Performance Max campaigns."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 text-xs text-muted-foreground">
          <p>{spec.aiLabel}</p>
          <p>
            Pictures are drawn with {imageModel.model} on your OpenAI key ({canDraw ? estimateText : "no OpenAI key yet: upload pictures instead, or add a key in Settings"}), and count toward your monthly AI
            budget. {spent > 0 && `This campaign's pictures have cost $${spent.toFixed(2)} so far.`}
          </p>
        </CardContent>
      </Card>

      {creatives.length === 0 && !ideasJob && (
        <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
          No creatives yet. Start a new one, or let Startica suggest three ideas from your ads (the pictures are drawn only when you ask).
        </p>
      )}
      {ideasJob && (
        <p className="flex items-center gap-2 rounded-lg border p-4 text-sm">
          <Loader2Icon className="size-4 animate-spin" aria-hidden /> Suggesting ideas from the campaign&apos;s ads…
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {creatives.map((c) => {
          const preview = c.renders.find((r) => r.size === "4:5") ?? c.renders.find((r) => r.size === "1:1") ?? c.renders[0];
          const hasPicture = Boolean(picturePath(c));
          const values: CreativeValues = {
            id: c.id,
            concept: c.concept,
            text: c.text,
            template: c.template,
            colors: c.colors,
            adId: c.adId,
            useLogo: c.useLogo,
            picture: hasPicture && c.imageFile ? fileUrl(c, c.imageFile) : null,
          };
          const busy = c.status === "generating" || c.status === "rendering";
          // Sizes where the words don't fit, or had to shrink a lot (the template's fit script reports it).
          const overflow = c.renders.filter((r) => r.fit === "overflow").map((r) => r.size);
          const small = c.renders.filter((r) => r.fit === "small").map((r) => r.size);
          return (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {c.text.headline || "Untitled"}
                  <Badge variant={c.status === "failed" ? "destructive" : "outline"}>
                    {busy && <Loader2Icon className="animate-spin" aria-hidden />}
                    {STATUS[c.status]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {TEMPLATE_LABEL[c.template].name} · {c.adId ? adLabel.get(c.adId) : "Whole campaign"}
                  {c.costUsd > 0 && ` · $${c.costUsd.toFixed(2)}`}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                {c.error && <p className="text-xs text-destructive">{c.error}</p>}
                {(overflow.length > 0 || small.length > 0) && !busy && (
                  <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300" role="status">
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      {overflow.length > 0 && <>The words don&apos;t fit at {overflow.join(", ")}: they&apos;re cut off. </>}
                      {small.length > 0 && <>The words had to shrink a lot to fit at {small.join(", ")}, so they may be hard to read. </>}
                      Shorten the headline or supporting line, or try another template.
                    </span>
                  </p>
                )}
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${fileUrl(c, preview.file)}?v=${c.updatedAt.getTime()}`} alt={`${c.text.headline}, ${preview.size}`} className="max-h-96 w-auto justify-self-start rounded-md border" />
                ) : (
                  <div className="grid aspect-[4/5] max-h-72 place-items-center rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground" style={{ background: c.colors.background, color: c.colors.text }}>
                    {busy ? (c.status === "generating" ? "Drawing the picture…" : "Rendering…") : c.status === "idea" ? "Not drawn yet" : "No images yet"}
                  </div>
                )}
                {c.concept && (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Picture:</span> {c.concept}
                  </p>
                )}
                {c.renders.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.renders.map((r) => (
                      <Button key={r.file} size="sm" variant="outline" nativeButton={false} render={<a href={fileUrl(c, r.file, true)} download />}>
                        {r.fit === "overflow" ? <TriangleAlertIcon className="text-amber-600" aria-label="Words cut off" /> : <DownloadIcon />} {r.size} <span className="text-muted-foreground">{kb(r.bytes)}</span>
                      </Button>
                    ))}
                  </div>
                )}
                {c.prompt && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Prompt sent to the image model</summary>
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{c.prompt}</pre>
                  </details>
                )}
                <CreativeButtons creative={{ id: c.id, status: c.status, concept: c.concept, hasPicture, imageSource: c.imageSource }} dialog={{ ...dialog, values }} estimate={estimateText} canDraw={canDraw} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
