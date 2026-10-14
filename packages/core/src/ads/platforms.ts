import type { AdCopy, AdPlatform } from "@startica/db/schema";

/**
 * What each ad platform takes (ARCHITECTURE.md section 8.6): the copy fields, their limits, and
 * the calls to action. Platforms change these; keep CHECKED current when editing, and
 * re-check against their help pages.
 */
export const AD_SPECS_CHECKED = "2026-10-10";

export type FieldSpec = {
  key: keyof AdCopy;
  label: string;
  /** Hard limit: the platform rejects longer text. */
  max: number;
  /** Recommended: longer text gets cut off in some placements. */
  recommended?: number;
  /** For list fields (Google headlines and descriptions): how many the platform takes. */
  count?: { min: number; max: number };
  optional?: boolean;
};

export type PlatformSpec = {
  name: string;
  /** The ad format Startica writes. */
  format: string;
  fields: FieldSpec[];
  callsToAction?: string[];
  /** What a campaign is optimized for, for the plan prompt. */
  targeting: string;
};

export const AD_PLATFORMS: Record<AdPlatform, PlatformSpec> = {
  google: {
    name: "Google Ads",
    format: "Search campaign with responsive search ads",
    fields: [
      { key: "headlines", label: "Headlines", max: 30, count: { min: 3, max: 15 } },
      { key: "descriptions", label: "Descriptions", max: 90, count: { min: 2, max: 4 } },
      { key: "path1", label: "Path 1", max: 15, optional: true },
      { key: "path2", label: "Path 2", max: 15, optional: true },
    ],
    targeting: "keywords with match types, negative keywords, locations",
  },
  meta: {
    name: "Meta (Facebook and Instagram)",
    format: "Single-image ad",
    fields: [
      { key: "primaryText", label: "Primary text", max: 2200, recommended: 125 },
      { key: "headline", label: "Headline", max: 255, recommended: 40 },
      { key: "description", label: "Description", max: 255, recommended: 30, optional: true },
    ],
    callsToAction: ["LEARN_MORE", "SIGN_UP", "GET_STARTED", "DOWNLOAD", "SUBSCRIBE", "CONTACT_US", "APPLY_NOW", "GET_OFFER", "SHOP_NOW", "BOOK_NOW"],
    targeting: "interests, demographics and placements (Advantage+ audience is often best to start)",
  },
  reddit: {
    name: "Reddit Ads",
    format: "Promoted post (image or text)",
    fields: [
      { key: "title", label: "Headline", max: 300, recommended: 100 },
      { key: "body", label: "Body text", max: 500, optional: true },
    ],
    callsToAction: ["Learn More", "Sign Up", "Get Started", "Download", "Install", "Shop Now", "View More", "Contact Us", "Apply Now", "See Menu"],
    targeting: "communities (subreddits), interests and keywords",
  },
};

export const CTA_LABEL = (cta: string) =>
  cta
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
