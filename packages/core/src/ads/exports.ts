import type { AdTargeting } from "@startica/db/schema";
import { adUrl } from "./checks.ts";
import type { CampaignDetail } from "./campaigns.ts";
import { keywordNotation } from "./campaigns.ts";
import { AD_PLATFORMS, CTA_LABEL } from "./platforms.ts";

/**
 * Hand-off files (ARCHITECTURE.md section 8.6). Startica never touches an ad account: the founder
 * imports these into the platform's own tool, reviews them there and launches. Everything
 * imports paused, so an import alone never spends money.
 */

function cell(v: string | number | undefined | null, sep: string): string {
  const s = v == null ? "" : String(v);
  return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Comma-separated by default; Google Ads Editor's documented format is tab-separated. */
export function toCsv(header: string[], rows: Record<string, string | number | undefined>[], sep = ","): string {
  return [header.map((h) => cell(h, sep)).join(sep), ...rows.map((r) => header.map((h) => cell(r[h], sep)).join(sep))].join("\r\n") + "\r\n";
}

/** UTF-16 little-endian with a byte order mark: what Excel calls "Unicode Text", the encoding Google Ads Editor documents. */
export function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

/** A daily budget from the test plan, or from the monthly budget when there's no test yet. */
export function dailyBudget(c: CampaignDetail["campaign"]): number {
  const daily = c.testBudget && c.testDays ? c.testBudget / c.testDays : c.monthlyBudget / 30.4;
  return Math.max(1, Math.round(daily * 100) / 100);
}

const MATCH = { broad: "Broad", phrase: "Phrase", exact: "Exact" } as const;

/**
 * A file for Google Ads Editor (Account → Import → From file): the campaign, its ad groups,
 * keywords, negative keywords and responsive search ads, all paused. One row per item,
 * tab-separated; encode with utf16le() for download. Editor matches headers ignoring case
 * and spaces. The responsive search ad columns (Headline 1–15, Description 1–4) aren't in
 * Google's column reference yet: if Editor reports one, export an ad from Editor to compare.
 */
export function googleAdsEditorCsv({ campaign, groups }: CampaignDetail): string {
  const header = [
    "Campaign",
    "Campaign Type",
    "Networks",
    "Budget",
    "Budget type",
    "Bid Strategy Type",
    "Campaign Status",
    "Location",
    "Ad Group",
    "Ad Group Status",
    "Keyword",
    "Criterion Type",
    "Ad type",
    ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
    ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
    "Path 1",
    "Path 2",
    "Final URL",
    "Status",
  ];
  const name = campaign.name;
  const rows: Record<string, string | number | undefined>[] = [
    {
      Campaign: name,
      "Campaign Type": "Search",
      Networks: "Google search",
      Budget: dailyBudget(campaign).toFixed(2),
      "Budget type": "Daily",
      "Bid Strategy Type": /^\s*maximi[sz]e conversions/i.test(campaign.bidStrategy ?? "") ? "Maximize conversions" : "Maximize clicks",
      "Campaign Status": "Paused",
    },
  ];
  const locations = new Set(groups.flatMap((g) => g.targeting.locations ?? []));
  for (const location of locations) rows.push({ Campaign: name, Location: location });
  for (const g of groups) {
    rows.push({ Campaign: name, "Ad Group": g.name, "Ad Group Status": "Paused" });
    for (const k of g.targeting.keywords ?? []) rows.push({ Campaign: name, "Ad Group": g.name, Keyword: k.text, "Criterion Type": MATCH[k.match] });
    for (const k of g.targeting.negativeKeywords ?? []) rows.push({ Campaign: name, "Ad Group": g.name, Keyword: k, "Criterion Type": "Negative Broad" });
    for (const a of g.ads) {
      const row: Record<string, string | undefined> = {
        Campaign: name,
        "Ad Group": g.name,
        "Ad type": "Responsive search ad",
        "Path 1": a.copy.path1,
        "Path 2": a.copy.path2,
        "Final URL": adUrl(campaign.landingUrl, "google", campaign.utmCampaign, a.id),
        Status: "Paused",
      };
      (a.copy.headlines ?? []).slice(0, 15).forEach((h, i) => (row[`Headline ${i + 1}`] = h));
      (a.copy.descriptions ?? []).slice(0, 4).forEach((d, i) => (row[`Description ${i + 1}`] = d));
      rows.push(row);
    }
  }
  return toCsv(header, rows, "\t");
}

/**
 * A spreadsheet in the columns of Meta Ads Manager's bulk import (Import ads in bulk):
 * one row per ad, carrying its campaign and ad set, all paused. Images are added in Ads
 * Manager after import.
 */
export function metaBulkCsv({ campaign, groups }: CampaignDetail): string {
  const header = [
    "Campaign Name",
    "Campaign Status",
    "Campaign Objective",
    "Buying Type",
    "Ad Set Name",
    "Ad Set Run Status",
    "Ad Set Daily Budget",
    "Countries",
    "Ad Name",
    "Ad Status",
    "Title",
    "Body",
    "Link Description",
    "Link",
    "Call to Action",
  ];
  const perGroup = groups.length ? dailyBudget(campaign) / groups.length : dailyBudget(campaign);
  const objective = /sale|purchase|buy/i.test(campaign.goal) ? "Outcome Sales" : /lead|signup|sign up|trial|register/i.test(campaign.goal) ? "Outcome Leads" : "Outcome Traffic";
  const rows = groups.flatMap((g) =>
    g.ads.map((a, i) => ({
      "Campaign Name": campaign.name,
      "Campaign Status": "PAUSED",
      "Campaign Objective": objective,
      "Buying Type": "AUCTION",
      "Ad Set Name": g.name,
      "Ad Set Run Status": "PAUSED",
      "Ad Set Daily Budget": perGroup.toFixed(2),
      Countries: (g.targeting.locations ?? []).join(", "),
      "Ad Name": `${g.name} ${i + 1}`,
      "Ad Status": "PAUSED",
      Title: a.copy.headline,
      Body: a.copy.primaryText,
      "Link Description": a.copy.description,
      Link: adUrl(campaign.landingUrl, "meta", campaign.utmCampaign, a.id),
      "Call to Action": a.copy.callToAction,
    })),
  );
  return toCsv(header, rows);
}

function targetingLines(t: AdTargeting): string[] {
  const out: string[] = [];
  if (t.audience) out.push(`Audience: ${t.audience}`);
  if (t.keywords?.length) out.push(`Keywords: ${t.keywords.map(keywordNotation).join(", ")}`);
  if (t.negativeKeywords?.length) out.push(`Negative keywords: ${t.negativeKeywords.join(", ")}`);
  if (t.communities?.length) out.push(`Communities: ${t.communities.map((c) => `r/${c}`).join(", ")}`);
  if (t.interests?.length) out.push(`Interests: ${t.interests.join(", ")}`);
  if (t.placements?.length) out.push(`Placements: ${t.placements.join(", ")}`);
  if (t.locations?.length) out.push(`Locations: ${t.locations.join(", ")}`);
  return out;
}

/** Every step to set the campaign up by hand, with the copy to paste. Works for every platform; Reddit has no import. */
export function campaignBrief({ campaign, groups }: CampaignDetail): string {
  const spec = AD_PLATFORMS[campaign.platform];
  const lines: (string | null | undefined)[] = [
    `# ${campaign.name}`,
    "",
    `${spec.name}: ${spec.format}.`,
    `Goal: ${campaign.goal}`,
    `Landing page: ${campaign.landingUrl}`,
    campaign.bidStrategy && `Bidding: ${campaign.bidStrategy}`,
    `Budget: ${dailyBudget(campaign).toFixed(2)} a day${campaign.testBudget && campaign.testDays ? ` (a ${campaign.testBudget} test over ${campaign.testDays} days)` : ""}`,
    campaign.successMetric && `Success: ${campaign.successMetric}`,
    "",
    campaign.summary ?? "",
  ];
  for (const g of groups) {
    lines.push("", `## ${g.name}`, "");
    if (g.angle) lines.push(g.angle, "");
    lines.push(...targetingLines(g.targeting).map((l) => `- ${l}`));
    g.ads.forEach((a, i) => {
      lines.push("", `### Ad ${i + 1}`, "");
      const c = a.copy;
      if (c.headlines?.length) lines.push("Headlines:", ...c.headlines.map((h) => `- ${h}`));
      if (c.descriptions?.length) lines.push("Descriptions:", ...c.descriptions.map((d) => `- ${d}`));
      if (c.path1 || c.path2) lines.push(`Display path: /${[c.path1, c.path2].filter(Boolean).join("/")}`);
      if (c.title) lines.push(`Headline: ${c.title}`);
      if (c.body) lines.push(`Body: ${c.body}`);
      if (c.primaryText) lines.push(`Primary text: ${c.primaryText}`);
      if (c.headline) lines.push(`Headline: ${c.headline}`);
      if (c.description) lines.push(`Description: ${c.description}`);
      if (c.callToAction) lines.push(`Call to action: ${campaign.platform === "meta" ? CTA_LABEL(c.callToAction) : c.callToAction}`);
      lines.push(`Link: ${adUrl(campaign.landingUrl, campaign.platform, campaign.utmCampaign, a.id)}`);
    });
  }
  return `${lines.filter((l): l is string => typeof l === "string").join("\n").trim()}\n`;
}

/** The steps to launch, per platform, shown on the campaign's Hand off card. */
export const HANDOFF_STEPS: Record<"google" | "meta" | "reddit", string[]> = {
  google: [
    "Install Google Ads Editor and sign in to your Google Ads account.",
    "Account → Import → From file, and choose the downloaded file. Review the changes, then Keep.",
    "Check the campaign's settings, set up conversion tracking for your goal if it isn't already, and post the changes.",
    "The campaign imports paused. Enable it in Google Ads when you're ready to spend.",
  ],
  meta: [
    "In Ads Manager, open the menu next to Create and choose Import ads in bulk (or Export & import → Import).",
    "Choose the CSV and review the campaigns, ad sets and ads it creates.",
    "Add an image to each ad: download them from the campaign's Creatives page (4:5 for the feed, 9:16 for Stories and Reels).",
    "Everything imports paused. Publish it in Ads Manager when you're ready to spend.",
  ],
  reddit: [
    "In Reddit Ads Manager, create a campaign with the objective that matches your goal.",
    "Create one ad group per group below: set the communities, interests, locations and budget.",
    "Create the ads: paste each headline, body and call to action, with its link (already tagged for analytics).",
    "Review, then launch when you're ready to spend.",
  ],
};
