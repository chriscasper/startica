/**
 * AI crawlers and agents that identify themselves, by what they're for (ARCHITECTURE.md section
 * 10.3). Checked 2026-10-10 against the operators' published lists; names change, so
 * keep the date current when editing.
 */
export const AI_CRAWLERS_CHECKED = "2026-10-10";

export type CrawlerPurpose = "training" | "search" | "user";

export const AI_CRAWLERS: { token: string; operator: string; purpose: CrawlerPurpose }[] = [
  { token: "GPTBot", operator: "OpenAI", purpose: "training" },
  { token: "OAI-SearchBot", operator: "OpenAI", purpose: "search" },
  { token: "ChatGPT-User", operator: "OpenAI", purpose: "user" },
  { token: "ClaudeBot", operator: "Anthropic", purpose: "training" },
  { token: "Claude-SearchBot", operator: "Anthropic", purpose: "search" },
  { token: "Claude-User", operator: "Anthropic", purpose: "user" },
  { token: "PerplexityBot", operator: "Perplexity", purpose: "search" },
  { token: "Perplexity-User", operator: "Perplexity", purpose: "user" },
  // Robots tokens only (no separate crawler): Google and Apple fetch with their search bots.
  { token: "Google-Extended", operator: "Google", purpose: "training" },
  { token: "Applebot-Extended", operator: "Apple", purpose: "training" },
];

export const PURPOSE_LABEL: Record<CrawlerPurpose, string> = {
  training: "Model training",
  search: "AI search index (citations in answers)",
  user: "Fetching a page someone asked about",
};
