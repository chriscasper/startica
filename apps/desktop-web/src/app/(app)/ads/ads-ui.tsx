"use client";

import { useTransition } from "react";
import { CopyIcon, Loader2Icon, PencilIcon, PlusIcon, SparklesIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type ActionResult, type Field } from "@/components/app/form-dialog";
import { Button } from "@/components/ui/button";
import type { AdCopy, AdPlatform, AdTargeting } from "@startica/db/schema";
import { changeStatus, editAd, newAd, newCampaign, removeAd, removeCampaign, replan, rewrite, saveCampaign, saveGroup, stopPlan } from "./actions";

export const PLATFORM_LABEL: Record<AdPlatform, string> = { google: "Google Ads", meta: "Meta", reddit: "Reddit" };

export const STATUS_LABEL: Record<string, string> = {
  planning: "Planning",
  draft: "Draft",
  failed: "Planning failed",
  handed_off: "Handed off",
  running: "Running",
  ended: "Ended",
};

function useAction() {
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, ok?: string) =>
    startTransition(async () => {
      const { error } = await fn();
      if (error) toast.error(error);
      else if (ok) toast.success(ok);
    });
  return [pending, run] as const;
}

const briefFields = (withPlatform: boolean): Field[] => [
  ...(withPlatform
    ? [
        {
          name: "platform",
          label: "Platform",
          type: "select",
          options: [
            { value: "google", label: "Google Ads: search ads for people looking for a solution" },
            { value: "meta", label: "Meta: Facebook and Instagram ads by audience" },
            { value: "reddit", label: "Reddit: promoted posts in communities" },
          ],
        } satisfies Field,
      ]
    : []),
  { name: "name", label: "Campaign name", type: "text", required: true, placeholder: "e.g. Search: field notes app" },
  { name: "goal", label: "Goal", type: "text", required: true, placeholder: "e.g. Trial signups from small field teams" },
  { name: "landing_url", label: "Landing page", type: "url", required: true, placeholder: "https://example.com/signup" },
  { name: "monthly_budget", label: "Monthly budget you can spend", type: "number", hint: "In your ad account's currency. The plan starts with a smaller test." },
  { name: "notes", label: "Notes for the plan (optional)", type: "textarea", rows: 3, placeholder: "Audiences to try or avoid, offers, countries…" },
];

export function NewCampaignButton({ productId, landingUrl, disabled }: { productId: string; landingUrl: string | null; disabled?: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button disabled={disabled}>
          <PlusIcon /> New campaign
        </Button>
      }
      title="New ad campaign"
      description="Startica plans the campaign and writes the ads. You review them, then launch it yourself in the platform's ad manager."
      fields={briefFields(true)}
      values={{ platform: "google", monthly_budget: "300", landing_url: landingUrl ?? "" }}
      submitLabel="Plan it"
      action={(formData) => newCampaign(productId, formData)}
    />
  );
}

export function CampaignControls({
  campaign,
}: {
  campaign: { id: string; status: string; name: string; goal: string; landingUrl: string; monthlyBudget: number; notes: string | null };
}) {
  const [pending, run] = useAction();
  const planning = campaign.status === "planning";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {planning ? (
        <Button variant="outline" disabled={pending} onClick={() => run(() => stopPlan(campaign.id))}>
          <SquareIcon /> Stop
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (campaign.status === "failed" || confirm("Planning again replaces the groups and ads, including your edits. Continue?"))
              run(() => replan(campaign.id), "Planning again");
          }}
        >
          <SparklesIcon /> Plan again
        </Button>
      )}
      <FormDialog
        trigger={
          <Button variant="outline">
            <PencilIcon /> Edit brief
          </Button>
        }
        title="Campaign brief"
        description="Name, goal and landing page apply to links and download files right away. The groups and ads change only when you plan again."
        fields={briefFields(false)}
        values={{ name: campaign.name, goal: campaign.goal, landing_url: campaign.landingUrl, monthly_budget: String(campaign.monthlyBudget), notes: campaign.notes ?? "" }}
        action={(formData) => saveCampaign(campaign.id, formData)}
      />
      {!planning && (
        <select
          aria-label="Campaign status"
          value={campaign.status === "failed" ? "draft" : campaign.status}
          disabled={pending}
          onChange={(e) => run(() => changeStatus(campaign.id, e.target.value))}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="draft">Draft</option>
          <option value="handed_off">Handed off</option>
          <option value="running">Running</option>
          <option value="ended">Ended</option>
        </select>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Delete campaign"
        disabled={pending}
        onClick={() => confirm(`Delete "${campaign.name}"? This only deletes Startica's copy; anything you launched keeps running.`) && run(() => removeCampaign(campaign.id))}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

const keywordNotation = (k: { text: string; match: string }) => (k.match === "exact" ? `[${k.text}]` : k.match === "phrase" ? `"${k.text}"` : k.text);

function targetingFields(platform: AdPlatform): Field[] {
  const common: Field[] = [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "angle", label: "Angle", type: "textarea", rows: 2 },
  ];
  const locations: Field = { name: "locations", label: "Locations (comma-separated)", type: "text" };
  if (platform === "google")
    return [
      ...common,
      { name: "keywords", label: 'Keywords: [exact], "phrase" or broad', type: "lines", rows: 6 },
      { name: "negative_keywords", label: "Negative keywords", type: "lines", rows: 4 },
      locations,
    ];
  if (platform === "meta")
    return [
      ...common,
      { name: "audience", label: "Audience", type: "textarea", rows: 2 },
      { name: "interests", label: "Interests (comma-separated)", type: "text" },
      { name: "placements", label: "Placements (comma-separated)", type: "text" },
      locations,
    ];
  return [
    ...common,
    { name: "communities", label: "Communities (comma-separated, without r/)", type: "text" },
    { name: "interests", label: "Interests (comma-separated)", type: "text" },
    locations,
  ];
}

export function EditGroupButton({ platform, group }: { platform: AdPlatform; group: { id: string; name: string; angle: string | null; targeting: AdTargeting } }) {
  const t = group.targeting;
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="icon" aria-label={`Edit ${group.name}`}>
          <PencilIcon />
        </Button>
      }
      title="Ad group"
      fields={targetingFields(platform)}
      values={{
        name: group.name,
        angle: group.angle ?? "",
        keywords: (t.keywords ?? []).map(keywordNotation),
        negative_keywords: t.negativeKeywords ?? [],
        audience: t.audience ?? "",
        interests: (t.interests ?? []).join(", "),
        placements: (t.placements ?? []).join(", "),
        communities: (t.communities ?? []).join(", "),
        locations: (t.locations ?? []).join(", "),
      }}
      action={(formData) => saveGroup(group.id, formData)}
    />
  );
}

function copyFields(platform: AdPlatform, ctas: string[]): Field[] {
  const cta: Field = { name: "call_to_action", label: "Call to action", type: "select", options: ctas.map((c) => ({ value: c, label: c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase()) })) };
  if (platform === "google")
    return [
      { name: "headlines", label: "Headlines, up to 30 characters (3 to 15)", type: "lines", rows: 8 },
      { name: "descriptions", label: "Descriptions, up to 90 characters (2 to 4)", type: "lines", rows: 4 },
      { name: "path1", label: "Path 1 (up to 15 characters)", type: "text" },
      { name: "path2", label: "Path 2 (up to 15 characters)", type: "text" },
    ];
  if (platform === "meta")
    return [
      { name: "primary_text", label: "Primary text (about 125 characters show before “See more”)", type: "textarea", rows: 4 },
      { name: "headline", label: "Headline (about 40 characters)", type: "text" },
      { name: "description", label: "Description (optional, about 30 characters)", type: "text" },
      cta,
    ];
  return [
    { name: "title", label: "Headline (under 100 characters is best, 300 at most)", type: "textarea", rows: 2 },
    { name: "body", label: "Body text (optional, up to 500 characters)", type: "textarea", rows: 4 },
    cta,
  ];
}

export function AdButtons({ platform, ctas, ad }: { platform: AdPlatform; ctas: string[]; ad: { id: string; copy: AdCopy; status: string } }) {
  const [pending, run] = useAction();
  const c = ad.copy;
  const busy = ad.status === "rewriting";
  return (
    <div className="flex items-center gap-1">
      {busy && <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Rewriting" />}
      <FormDialog
        trigger={
          <Button variant="ghost" size="sm" disabled={busy}>
            <SparklesIcon /> Rewrite
          </Button>
        }
        title="Rewrite this ad"
        description="The AI rewrites it with your guidance and fixes any problems flagged. Your edits to this ad are replaced."
        fields={[{ name: "guidance", label: "Guidance (optional)", type: "textarea", rows: 3, placeholder: "e.g. Lead with the offline mode; less formal" }]}
        submitLabel="Rewrite"
        action={(formData) => rewrite(ad.id, formData)}
      />
      <FormDialog
        trigger={
          <Button variant="ghost" size="icon" aria-label="Edit ad" disabled={busy}>
            <PencilIcon />
          </Button>
        }
        title="Edit ad"
        fields={copyFields(platform, ctas)}
        values={{
          headlines: c.headlines ?? [],
          descriptions: c.descriptions ?? [],
          path1: c.path1 ?? "",
          path2: c.path2 ?? "",
          primary_text: c.primaryText ?? "",
          headline: c.headline ?? "",
          description: c.description ?? "",
          title: c.title ?? "",
          body: c.body ?? "",
          call_to_action: c.callToAction ?? ctas[0] ?? "",
        }}
        action={(formData) => editAd(ad.id, formData)}
      />
      <Button variant="ghost" size="icon" aria-label="Delete ad" disabled={pending || busy} onClick={() => confirm("Delete this ad?") && run(() => removeAd(ad.id))}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

export function AddAdButton({ groupId }: { groupId: string }) {
  const [pending, run] = useAction();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => newAd(groupId))}>
      <PlusIcon /> Add an ad
    </Button>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => toast.success("Copied"),
          () => toast.error("Couldn't copy"),
        )
      }
    >
      <CopyIcon /> {label}
    </Button>
  );
}
