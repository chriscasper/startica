import type { AdCopy, AdPlatform } from "@startica/db/schema";
import { AD_PLATFORMS } from "./platforms.ts";

/**
 * Checks ad copy before hand-off (ARCHITECTURE.md section 8.6): the platform's limits, then the
 * common reasons ads get rejected or perform badly. Advice, not a policy decision: the
 * platforms' own review has the last word.
 */

export type AdFlag = { field: keyof AdCopy; index?: number; level: "error" | "warning"; message: string };

const SUPERLATIVE = /\b(best|number one|top[- ]rated|cheapest|leading)\b|#1\b/i;
const ALLOWED_CAPS = new Set(["SEO", "GEO", "API", "CSV", "PDF", "GDPR", "HIPAA", "SAAS", "GPS", "HTML", "JSON", "USA"]);
const GUARANTEE = /\b(guarantee[ds]?|risk[- ]free|100% (free|safe|effective)|instant(ly)? results?)\b/i;
// Meta: ads must not assert or imply personal attributes ("Are you struggling with…", "your debt").
const PERSONAL = /\b(are you (struggling|depressed|overweight|in debt|single|divorced)|your (debt|diagnosis|condition|disability|religion|sexual))\b/i;
const CLICKBAIT = /\b(click here|you won'?t believe|shocking)\b/i;

function textChecks(platform: AdPlatform, text: string, competitors: string[]): string[] {
  const out: string[] = [];
  if (SUPERLATIVE.test(text)) out.push("Superlatives (best, #1…) need proof on the landing page, or the ad may be disapproved.");
  if (GUARANTEE.test(text)) out.push("Guarantees and risk-free claims are often rejected; say what's true instead.");
  if (CLICKBAIT.test(text)) out.push("Clickbait phrasing lowers quality and is often rejected.");
  if (platform === "meta" && PERSONAL.test(text)) out.push("Meta rejects ads that assert or imply personal attributes; talk about the product, not the reader's situation.");
  if (platform === "google" && (text.match(/\b[A-Z]{4,}\b/g) ?? []).some((w) => !ALLOWED_CAPS.has(w))) out.push("Google disapproves excessive capitals (ALL CAPS words).");
  const competitor = competitors.find((c) => c.length > 2 && new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  if (competitor) out.push(`Mentions ${competitor}: competitor names in ads can be restricted by trademark rules.`);
  return out;
}

export function checkAdCopy(platform: AdPlatform, copy: AdCopy, competitors: string[] = []): AdFlag[] {
  const flags: AdFlag[] = [];
  for (const spec of AD_PLATFORMS[platform].fields) {
    const value = copy[spec.key];
    const items = Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
    if (spec.count) {
      if (items.length < spec.count.min) flags.push({ field: spec.key, level: "error", message: `At least ${spec.count.min} ${spec.label.toLowerCase()} needed (${items.length} now).` });
      if (items.length > spec.count.max) flags.push({ field: spec.key, level: "error", message: `At most ${spec.count.max} ${spec.label.toLowerCase()} (${items.length} now).` });
    } else if (!spec.optional && items.length === 0) {
      flags.push({ field: spec.key, level: "error", message: `${spec.label} is required.` });
    }
    items.forEach((text, i) => {
      const index = spec.count ? i : undefined;
      if (text.length > spec.max) flags.push({ field: spec.key, index, level: "error", message: `${text.length} characters: the limit is ${spec.max}.` });
      else if (spec.recommended && text.length > spec.recommended) flags.push({ field: spec.key, index, level: "warning", message: `${text.length} characters: over about ${spec.recommended}, it's cut off in some placements.` });
      if (platform === "google" && spec.key === "descriptions" && (text.match(/!/g) ?? []).length > 1)
        flags.push({ field: spec.key, index, level: "warning", message: "Google allows one exclamation mark per description." });
      if (platform === "google" && spec.key === "headlines" && text.includes("!")) flags.push({ field: spec.key, index, level: "error", message: "Google doesn't allow exclamation marks in headlines." });
      for (const message of textChecks(platform, text, competitors)) flags.push({ field: spec.key, index, level: "warning", message });
    });
  }
  if (platform === "google") {
    const headlines = (copy.headlines ?? []).map((h) => h.trim().toLowerCase());
    if (new Set(headlines).size < headlines.length) flags.push({ field: "headlines", level: "error", message: "Two headlines are the same; Google needs each to be different." });
  }
  return flags;
}

/** The link an ad points to, tagged so GA4 attributes visits and signups to it (ARCHITECTURE.md 8.2). */
export function adUrl(landingUrl: string, platform: AdPlatform, utmCampaign: string, adId: string): string {
  const url = new URL(landingUrl);
  url.searchParams.set("utm_source", platform);
  url.searchParams.set("utm_medium", "paid");
  url.searchParams.set("utm_campaign", utmCampaign);
  url.searchParams.set("utm_content", adId);
  return url.toString();
}

/** A UTM-safe campaign name: "Fieldnote search: field notes app" → "fieldnote-search-field-notes-app". */
export function utmSlug(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "campaign"
  );
}
