import type { Channel } from "../channels/types.ts";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Tags a product link so GA4 can attribute visits to the exact reply
 * (ARCHITECTURE.md section 8.2). utm_content carries the draft id.
 */
export function utmUrl(
  productUrl: string,
  opts: { channel: Channel | (string & {}); community: string | null; draftId: string; date?: Date; medium?: string },
): string {
  const url = new URL(productUrl);
  const day = (opts.date ?? new Date()).toISOString().slice(0, 10);
  const place = opts.channel === "reddit" && opts.community ? `r-${opts.community}` : opts.community || opts.channel;
  url.searchParams.set("utm_source", opts.channel);
  url.searchParams.set("utm_medium", opts.medium ?? "community");
  url.searchParams.set("utm_campaign", `${slug(place)}-${day}`);
  url.searchParams.set("utm_content", opts.draftId);
  return url.toString();
}

/** The id utmUrl put in utm_content, or null (GA4 reports visits per utm_content). */
export function utmContentOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get("utm_content");
  } catch {
    return null;
  }
}
