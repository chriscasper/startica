import { bluesky } from "./bluesky.ts";
import { discourse, parseTopicUrl } from "./discourse.ts";
import { hackerNews } from "./hackernews.ts";
import { mastodon, parseStatusUrl } from "./mastodon.ts";
import { reddit } from "./reddit.ts";
import { x } from "./x.ts";
import type { Channel, ChannelAdapter } from "./types.ts";

// Channels with automatic discovery and link reading, all through public feeds and
// APIs without an account (ARCHITECTURE.md section 8.1).
export const adapters: Partial<Record<Channel, ChannelAdapter>> = {
  hackernews: hackerNews,
  reddit,
  bluesky,
  mastodon,
  discourse,
  // Only with the user's own X API token (Settings → Channels → X API); otherwise X stays paste-only.
  x,
};

export function channelFromUrl(url: string): Channel {
  try {
    const host = new URL(url).hostname.replace(/^www\.|^old\.|^m\./, "");
    if (host === "reddit.com" || host === "redd.it") return "reddit";
    if (host === "news.ycombinator.com") return "hackernews";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host === "linkedin.com") return "linkedin";
    if (host === "facebook.com" || host === "fb.com") return "facebook";
    if (host === "bsky.app") return "bluesky";
    // Mastodon and Discourse run on any domain; their link shapes give them away.
    if (parseStatusUrl(url)) return "mastodon";
    if (parseTopicUrl(url)) return "discourse";
  } catch {
    // fall through
  }
  return "other";
}

/** Reddit thread URLs carry the subreddit; used to match pasted links to watched communities. */
export function redditCommunity(url: string): string | null {
  const match = /reddit\.com\/r\/([A-Za-z0-9_]+)/i.exec(url);
  return match?.[1] ?? null;
}
