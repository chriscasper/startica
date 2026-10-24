import { z } from "zod";
import type { AdCopy, AdPlatform, AdTargeting } from "@startica/db/schema";
import { AD_PLATFORMS } from "./platforms.ts";

export const AD_PLAN_PROMPT_VERSION = "ad-plan@2";
export const AD_COPY_PROMPT_VERSION = "ad-copy@1";

const COMMON = `You plan paid ad campaigns inside Startica for a small founder with a small budget. The founder launches the campaign themselves in the platform's ad manager; you write the plan and the ads they'll paste or import.

Rules for every plan:
- A first campaign is a test: a small budget over 14 to 30 days, with one success metric and a number (for example "cost per signup under $25"). Say what result means stop, and what means keep going.
- 1 to 3 ad groups, each one angle: a distinct reason someone would want the product (a pain, a use case, an alternative they're leaving). Fewer, sharper groups beat many thin ones at small budgets.
- Write like the product's own site: plain, specific, honest. No superlatives you can't prove (best, #1), no guarantees, no fake urgency, no clickbait, no ALL CAPS.
- Never name competitors in ad copy. You may target people who search for or follow alternatives where the platform allows it.
- Respect every character limit exactly. Count characters; shorter is fine.
- Don't invent facts: prices, numbers of users, awards or features that aren't in the product description.
- When <research> lists keywords or communities, start from them: they come from the founder's own research and the conversations Startica found. Use the ones that fit the platform and the angle, and add others only where they're clearly needed. Competitor keywords are for targeting only, never for ad copy.`;

const PLATFORM_RULES: Record<AdPlatform, string> = {
  google: `Platform: Google Ads, a Search campaign with responsive search ads (RSAs).
- Each ad group: 5 to 15 keywords that show buying or problem intent, mostly phrase and exact match (broad only with a reason), and negative keywords that exclude jobs, free-only, tutorials and unrelated meanings.
- One RSA per ad group: 10 to 15 headlines of at most 30 characters, each different and able to stand alone in any order (Google mixes them); include the main keyword in 2 or 3, the product name in 1, benefits, features and a call to action. No exclamation marks in headlines.
- 4 descriptions of at most 90 characters each; at most one exclamation mark across all of them.
- path1 and path2: at most 15 characters each, words from the keyword (for example "notes" / "field-teams"); may be empty.
- Bid strategy: "Maximize clicks" with a max CPC limit for a first test without conversion data, or "Maximize conversions" once conversion tracking works. Say which and why.`,
  meta: `Platform: Meta (Facebook and Instagram), a Sales or Leads or Traffic campaign with single-image ads.
- Each ad set (group): an audience. Describe it in plain words, and list interests to try. Advantage+ audience with a few interest suggestions usually beats narrow targeting at small budgets; say so when it applies. Advantage+ placements unless there's a reason.
- 2 or 3 ads per group, each a different hook: primary text (keep the first 125 characters complete on its own), a headline of about 40 characters or less, an optional description of about 30, and a call to action from the list.
- Talk about the product and what it does. Never assert or imply the reader's personal attributes (health, finances, religion, identity, "Are you struggling with…").`,
  reddit: `Platform: Reddit Ads, promoted posts.
- Each group: an audience of 3 to 10 communities (subreddit names without r/) where people with this problem actually talk, plus interests. Only name communities you're confident exist.
- 2 or 3 ads per group. The headline is the post title, written like a good post in those communities: direct, specific, no marketing gloss; under 100 characters is best. The optional body adds detail for text posts.
- Redditors dislike hype. Plain claims and a clear "what it is" do best.`,
};

export function adPlanSystem(platform: AdPlatform): string {
  return `${COMMON}\n\n${PLATFORM_RULES[platform]}`;
}

export function adCopySystem(platform: AdPlatform): string {
  return `${COMMON}\n\n${PLATFORM_RULES[platform]}\n\nNow you're rewriting one ad. Keep what works, follow the founder's guidance, and fix any problems listed.`;
}

const keyword = z.object({ text: z.string(), match: z.enum(["broad", "phrase", "exact"]) });

function ctaEnum(platform: AdPlatform) {
  const ctas = AD_PLATFORMS[platform].callsToAction ?? ["Learn More"];
  return z.enum(ctas as [string, ...string[]]);
}

/** The structured output for one ad, per platform. */
export function adSchema(platform: AdPlatform) {
  if (platform === "google")
    return z.object({
      headlines: z.array(z.string()).describe("10 to 15, each at most 30 characters"),
      descriptions: z.array(z.string()).describe("4, each at most 90 characters"),
      path1: z.string().describe("At most 15 characters, or empty"),
      path2: z.string().describe("At most 15 characters, or empty"),
    });
  if (platform === "meta")
    return z.object({
      primary_text: z.string(),
      headline: z.string().describe("About 40 characters or less"),
      description: z.string().describe("About 30 characters or less, or empty"),
      call_to_action: ctaEnum(platform),
    });
  return z.object({
    title: z.string().describe("The post title, under 100 characters is best (300 at most)"),
    body: z.string().describe("Optional body text, at most 500 characters, or empty"),
    call_to_action: ctaEnum(platform),
  });
}

function targetingSchema(platform: AdPlatform) {
  if (platform === "google")
    return z.object({
      keywords: z.array(keyword),
      negative_keywords: z.array(z.string()),
      locations: z.array(z.string()).describe("Countries or regions; empty for the product's usual market"),
    });
  if (platform === "meta")
    return z.object({
      audience: z.string().describe("Who this ad set reaches, in a sentence"),
      interests: z.array(z.string()),
      placements: z.array(z.string()).describe('Usually ["Advantage+ placements"]'),
      locations: z.array(z.string()),
    });
  return z.object({
    communities: z.array(z.string()).describe("Subreddit names without r/"),
    interests: z.array(z.string()),
    locations: z.array(z.string()),
  });
}

export function adPlanSchema(platform: AdPlatform) {
  return z.object({
    summary: z.string().describe("3 to 5 plain sentences for the founder: the strategy, who it reaches, and what to watch."),
    bid_strategy: z.string(),
    test_budget: z.number().describe("Total spend for the test, in the account's currency"),
    test_days: z.number(),
    success_metric: z.string().describe("The result that means it works, with a number, and when to stop"),
    groups: z.array(
      z.object({
        name: z.string(),
        angle: z.string().describe("One sentence: why someone in this group wants the product"),
        targeting: targetingSchema(platform),
        ads: z.array(adSchema(platform)),
      }),
    ),
  });
}

type AnyAdOutput = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** The model's output for one ad, as stored. Empty optional fields are dropped. */
export function toAdCopy(platform: AdPlatform, out: AnyAdOutput): AdCopy {
  const copy: AdCopy =
    platform === "google"
      ? { headlines: list(out.headlines), descriptions: list(out.descriptions), path1: str(out.path1), path2: str(out.path2) }
      : platform === "meta"
        ? { primaryText: str(out.primary_text), headline: str(out.headline), description: str(out.description), callToAction: str(out.call_to_action) }
        : { title: str(out.title), body: str(out.body), callToAction: str(out.call_to_action) };
  for (const [k, v] of Object.entries(copy)) if (v === "") delete copy[k as keyof AdCopy];
  return copy;
}

/** Stored copy in the model's output shape (the inverse of toAdCopy; missing fields are empty). */
export function fromAdCopy(platform: AdPlatform, copy: AdCopy): AnyAdOutput {
  if (platform === "google") return { headlines: copy.headlines ?? [], descriptions: copy.descriptions ?? [], path1: copy.path1 ?? "", path2: copy.path2 ?? "" };
  if (platform === "meta") return { primary_text: copy.primaryText ?? "", headline: copy.headline ?? "", description: copy.description ?? "", call_to_action: copy.callToAction ?? "" };
  return { title: copy.title ?? "", body: copy.body ?? "", call_to_action: copy.callToAction ?? "" };
}

export function toTargeting(platform: AdPlatform, out: AnyAdOutput): AdTargeting {
  const t: AdTargeting = { locations: list(out.locations) };
  if (platform === "google") {
    t.keywords = Array.isArray(out.keywords)
      ? (out.keywords as { text: string; match: "broad" | "phrase" | "exact" }[]).map((k) => ({ text: str(k.text), match: k.match })).filter((k) => k.text)
      : [];
    t.negativeKeywords = list(out.negative_keywords);
  } else if (platform === "meta") {
    t.audience = str(out.audience) || undefined;
    t.interests = list(out.interests);
    t.placements = list(out.placements);
  } else {
    t.communities = list(out.communities).map((c) => c.replace(/^\/?r\//i, ""));
    t.interests = list(out.interests);
  }
  return t;
}

/** One ad's copy as text for a prompt. */
export function adCopyText(copy: AdCopy): string {
  return Object.entries(copy)
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `- ${x}`).join("\n")}` : `${k}: ${v}`))
    .join("\n");
}
