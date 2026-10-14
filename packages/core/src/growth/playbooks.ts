import type { FunnelStage } from "@startica/db/schema";

/**
 * Reusable growth strategies the roadmap draws from (ARCHITECTURE.md Phase 5). Kept in
 * code for now; an editable table can come later.
 */
export type Playbook = { key: string; name: string; stage: FunnelStage; summary: string; steps: string[] };

export const PLAYBOOKS: Playbook[] = [
  {
    key: "community-cold-start",
    name: "Community cold start",
    stage: "activation",
    summary: "For products with a community or shared space: make it feel alive early so new users stay: seed content, personal welcomes, a narrow first focus.",
    steps: [
      "Pick one niche to seed first and make the product the best place for it",
      "Add seed content yourself on a schedule and invite 10–20 people from that niche personally",
      "Welcome every new user personally within 24 hours and suggest one first thing to do",
      "Run a recurring theme or prompt so there's always a reason to come back",
      "Feature good user contributions (changelog, newsletter, social) so taking part feels rewarded",
    ],
  },
  {
    key: "reddit-value-first",
    name: "Reddit value-first replies",
    stage: "acquisition",
    summary: "Become a known helpful voice in the right subreddits; mention the product only where it truly helps.",
    steps: [
      "Watch 3–5 subreddits where the audience asks questions",
      "Reply helpfully to 3–5 threads a day from the Inbox, product mentions under ~20% per subreddit",
      "Disclose you run the product whenever you mention it",
      "Track which subreddits and reply angles bring visits (UTM) and double down",
    ],
  },
  {
    key: "landing-conversion",
    name: "Landing page conversion",
    stage: "acquisition",
    summary: "Turn more visitors into signups: a clear promise, proof, and one obvious next step.",
    steps: [
      "Rewrite the headline as the audience's outcome in their words",
      "Show the product doing its job (a screenshot, example or short demo) above the fold",
      "One primary call to action; remove competing links",
      "Add social proof: user numbers, testimonials, logos or case studies",
      "Measure signups per visit before and after",
    ],
  },
  {
    key: "onboarding-activation",
    name: "Onboarding to first value",
    stage: "activation",
    summary: "Get each new user to the product's first meaningful action (the activation moment) in the first session.",
    steps: [
      "Define the activation moment (the first action that predicts a user sticks, e.g. within 24 hours)",
      "Cut signup and setup steps to the minimum",
      "Suggest the first action right after signup, with a template, example or default to start from",
      "Measure activation rate weekly",
    ],
  },
  {
    key: "re-engagement-email",
    name: "Re-engagement email",
    stage: "retention",
    summary: "Bring back users who signed up but went quiet, with a reason to return.",
    steps: [
      "Segment users with no meaningful activity in 14 days",
      "Send a short personal email with what's new or what they left unfinished",
      "Offer one concrete thing to do next",
      "Track return rate per email",
    ],
  },
  {
    key: "seo-geo",
    name: "SEO and AI-search visibility",
    stage: "acquisition",
    summary: "Be findable in search engines and in AI assistants' answers for the audience's questions.",
    steps: [
      "Fix technical basics: titles, descriptions, sitemap, structured data",
      "Publish pages that answer the audience's real questions (comparisons, how-tos)",
      "Get mentioned on pages AI assistants cite (lists, forums, reviews)",
      "Re-check AI-search visibility monthly",
    ],
  },
  {
    key: "accessibility-fixes",
    name: "Accessibility fixes",
    stage: "activation",
    summary: "Fix what Startica's accessibility checks find, most important first, so everyone can sign up and use the product.",
    steps: [
      "Fix critical and serious issues on the busiest pages first (signup, pricing, home)",
      "Fix shared template issues once for every page",
      "Decide the Needs review items by hand",
      "Rescan and keep the score at or above the target",
    ],
  },
  {
    key: "security-fixes",
    name: "Security fixes",
    stage: "retention",
    summary: "Fix what Startica's security checks find on the product's sites, most serious first, so customers' data and trust are safe.",
    steps: [
      "Fix critical and high findings first (exposed files, HTTPS problems)",
      "Add the missing security headers once, at the server or CDN, for every page",
      "Publish security.txt so people can report problems to you",
      "Recheck after each fix and keep the score up with regular scans",
    ],
  },
  {
    key: "paid-conversion",
    name: "Free-to-paid conversion",
    stage: "revenue",
    summary: "Turn engaged users into paying customers with a plan that's clearly worth it.",
    steps: [
      "Find what engaged users hit limits on (usage, features, seats)",
      "Make the paid plan's value visible at that moment",
      "Offer a trial or early-customer price",
      "Track conversion from active user to paying customer",
    ],
  },
  {
    key: "referral-loop",
    name: "User referrals",
    stage: "referral",
    summary: "Give users a reason and an easy way to bring the people they work or play with.",
    steps: [
      "Make sharing something made in the product one click, with a good preview",
      "Invite links where the product is used together",
      "Reward invites that turn into active users",
    ],
  },
];

export function playbookText(): string {
  return PLAYBOOKS.map((p) => `- ${p.key} (${p.stage}): ${p.name}. ${p.summary} Steps: ${p.steps.join("; ")}`).join("\n");
}
