import { z } from "zod";
import { channels } from "@startica/db/schema";

// Prompt versions are logged with every Claude call (ai_runs.prompt_version).
export const RESEARCH_PROMPT_VERSION = "intel-research@1";
export const SYNTHESIS_PROMPT_VERSION = "intel-synthesis@3"; // @3: communities ranked strongest first

export const RESEARCH_SYSTEM = `You are the market researcher inside Startica, an AI marketing co-founder for small founders.
You research one product so a strategist can plan organic growth for it (community replies, content, SEO), not paid ads.

Use web search and web fetch to find, for the product described by the user:
1. Direct and indirect competitors: products the same audience uses instead. For each: name, URL, how they position themselves, what users praise and complain about (look for real user discussions, reviews, Reddit threads).
2. Communities where the target audience discusses the problem: subreddits (check that each subreddit exists, roughly how active it is, and what its self-promotion rules say), Hacker News if relevant, notable forums, Facebook groups or Discord servers.
3. The words the audience uses for the problem and for solutions: search phrases, complaints, "is there an app that…" style questions.

Report what you found as concise markdown notes with a short section per topic. Cite the URL for each factual claim. Say plainly when something is uncertain or when you could not verify it. Don't pad: no introductions or conclusions.`;

export const SYNTHESIS_SYSTEM = `You are the strategist inside Startica, an AI marketing co-founder for small founders.
From the material provided (the owner's notes, crawled pages from the product's site, and research notes with sources), write the product intel that the rest of Startica builds on: Reddit listening, reply drafting, content, and the growth roadmap.

Rules:
- The owner's notes are the most authoritative source. Then the product's own pages. Then the research notes.
- Be specific to this product. Generic marketing language ("innovative platform", "seamless experience") is useless here.
- Don't invent facts, numbers, features, or prices. If something matters but is unknown, put it in brief.open_questions.
- Personas: 2 to 4 distinct people who would actually join or pay, described in their own terms, with the places they spend time online.
- Competitors: the 4 to 8 alternatives this audience realistically uses today, including big generic ones when relevant. Only include a URL you saw in the material.
- Keywords: 15 to 30 phrases real people type or say. "problem" = describes the pain, "solution" = describes what they'd look for, "competitor" = competitor names or comparisons, "brand" = the product's own name. use_for: "listening" for phrases to watch in community posts, "seo" for search terms, or "both".
- Communities: 8 to 15 places worth watching, strongest first (the first few are pre-selected for the owner). For Reddit use channel "reddit" and the subreddit name without "r/". For Mastodon use channel "mastodon" and a hashtag on a server, written "#tag@server" (e.g. "#photography@mastodon.social"). For a Discourse forum use channel "discourse", the forum's name, and its address as the url (e.g. "https://forum.example.com"). Bluesky is searched by keyword, so it needs no communities. Prefer active communities where the audience asks questions. Summarize each community's self-promotion rules in promo_rules (say "unknown" if you didn't see them). Startica only posts replies that are genuinely helpful and mentions the product only where it fits.
- Items the owner already added are listed separately. Don't repeat them.`;

const text = (description: string) => z.string().describe(description);
const list = (description: string) => z.array(z.string()).describe(description);

export const intelOutput = z.object({
  brief: z.object({
    summary: text("Two or three sentences: what the product is, for whom, and why it matters."),
    category: text("The product category in a few words, as the audience would say it."),
    audience: text("Who it is for, specifically."),
    problem: text("The problem or desire it addresses, in the audience's words."),
    value_props: list("The main benefits, one short sentence each."),
    differentiators: list("What makes it different from the competitors, one short sentence each."),
    positioning: text("One positioning statement: For [audience] who [need], [product] is a [category] that [benefit]. Unlike [alternative], it [differentiator]."),
    pricing_notes: text("What is known about pricing and plans, or 'unknown'."),
    open_questions: list("Important unknowns the owner should answer."),
  }),
  personas: z.array(
    z.object({
      name: text("A short descriptive label, e.g. 'Weekend gear enthusiast'."),
      summary: text("Two sentences about who they are."),
      pains: list("Frustrations relevant to the product."),
      goals: list("What they want to achieve."),
      hangouts: list("Specific places they spend time online."),
    }),
  ),
  competitors: z.array(
    z.object({
      name: z.string(),
      url: text("Homepage URL seen in the material, or an empty string."),
      positioning: text("How they present themselves, one or two sentences."),
      strengths: list("What users like about them."),
      weaknesses: list("What users complain about or what they lack."),
    }),
  ),
  keywords: z.array(
    z.object({
      keyword: z.string(),
      intent: z.enum(["problem", "solution", "competitor", "brand"]),
      use_for: z.enum(["listening", "seo", "both"]),
    }),
  ),
  communities: z.array(
    z.object({
      channel: z.enum(channels),
      name: text("Subreddit name without 'r/', '#tag@server' for Mastodon, or the community's name."),
      url: text("Community URL (required for a Discourse forum: its address), or an empty string."),
      why: text("Why this community matters for this product, one sentence."),
      promo_rules: text("Summary of its self-promotion rules, or 'unknown'."),
    }),
  ),
});

export type IntelOutput = z.infer<typeof intelOutput>;
export type Brief = IntelOutput["brief"];
