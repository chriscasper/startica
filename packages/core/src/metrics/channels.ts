import { aiAssistantOf } from "../search/ai-referrals.ts";

/**
 * Channel groups for traffic sources (ARCHITECTURE.md section 8.2): GA4-style "source / medium"
 * pairs, from GA4 or from Umami's referrers, grouped the way a founder thinks about them.
 * Startica's own tracking links set the medium (`community`, `content`, `email`, `paid`), so
 * those land in the right group whatever the site.
 */
export const CHANNEL_GROUPS = ["Organic search", "AI assistants", "Communities", "Social", "Email", "Paid", "Referral", "Direct", "Other"] as const;
export type ChannelGroup = (typeof CHANNEL_GROUPS)[number];

const host = (source: string) => source.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^(www|old|m|l|lm|out)\./, "");

const COMMUNITIES = /(^|\.)(reddit\.com|news\.ycombinator\.com|lobste\.rs|producthunt\.com|indiehackers\.com|dev\.to|hashnode\.com|stackoverflow\.com|stackexchange\.com|discord\.com|discourse\.org)$|^(reddit|hackernews|hn|discourse|lobsters|producthunt)$/;
const SOCIAL =
  /(^|\.)(x\.com|twitter\.com|t\.co|facebook\.com|fb\.com|instagram\.com|linkedin\.com|lnkd\.in|bsky\.app|threads\.net|youtube\.com|youtu\.be|tiktok\.com|pinterest\.com|mastodon\.social|mastodon\.online|substack\.com)$|^(x|twitter|facebook|linkedin|bluesky|mastodon|instagram|youtube|threads)$/;
const MAIL = /(^|\.)(mail\.google\.com|outlook\.live\.com|mail\.yahoo\.com)$|^(newsletter|email)$/;

/** The group a "source / medium" pair belongs to. */
export function channelGroup(source: string, medium: string): ChannelGroup {
  const s = host(source);
  const m = medium.toLowerCase();
  if (aiAssistantOf(source) || m === "ai-assistant") return "AI assistants";
  if (/^(cpc|ppc|paid|paidsearch|paid_social|paid-social|display|cpm|banner)$/.test(m) || /^paid/.test(m)) return "Paid";
  if (m === "organic") return "Organic search";
  if (m === "email" || m === "newsletter" || MAIL.test(s)) return "Email";
  if (m === "community" || COMMUNITIES.test(s)) return "Communities";
  if (m === "social" || m === "social-network" || m === "sm" || SOCIAL.test(s)) return "Social";
  if (s === "(direct)" || !s) return "Direct";
  if (m === "referral" || m === "content") return "Referral";
  return "Other";
}
