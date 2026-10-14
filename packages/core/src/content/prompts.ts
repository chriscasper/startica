import { z } from "zod";

export const VOICE_PROMPT_VERSION = "voice-guide@1";
export const CONTENT_PROMPT_VERSION = "content-write@2"; // @2: norms for Bluesky, Mastodon, Discourse
export const TOPICS_PROMPT_VERSION = "content-topics@2";

export const VOICE_SYSTEM = `You analyze writing samples and distill the author's voice into a practical style guide another writer can follow. Describe what is distinctive and repeatable: tone, sentence length and rhythm, how posts open and close, structure, recurring words or phrasings, humor, how they handle opinions and self-promotion. Be concrete and quote short fragments as examples. Don't copy whole sentences into example_openers; write new openers in the same style. Ignore topics; capture style.`;

export const voiceGuideOutput = z.object({
  summary: z.string().describe("Two or three sentences capturing the voice."),
  tone: z.array(z.string()),
  structure: z.array(z.string()),
  vocabulary: z.array(z.string()).describe("Characteristic words, phrasings, formatting habits"),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
  example_openers: z.array(z.string()).describe("3 to 5 new opening lines in this voice"),
});

/** How each channel's content should look; the writer follows these strictly. */
export const CHANNEL_NORMS: Record<string, string> = {
  reddit:
    "Reddit post: a specific, non-clickbait title and a body that gives real value (experience, a guide, a question that sparks discussion). Read like a community member, not a brand. No links unless they're essential; if you mention the product, say you made it.",
  x: "X: each tweet at most 280 characters. For a thread, separate tweets with a blank line and number them (1/, 2/…). Strong first tweet; no hashtag spam (at most one).",
  linkedin: "LinkedIn: a first line that earns the 'see more' click, short paragraphs (1–2 sentences), concrete story or lesson, 600–1300 characters, a question or takeaway at the end, at most 3 hashtags.",
  hackernews:
    "Hacker News: plain, factual, no marketing language or superlatives. For Show HN: what it is, why you built it, what's interesting technically, what you'd like feedback on.",
  blog: "Blog article: a title, a short intro that states the reader's problem, 3–6 sections with ## headings, practical specifics, 700–1200 words, a closing with one clear next step. Markdown.",
  newsletter: "Newsletter: a subject line as the title, a warm personal opening, one main story or lesson, 300–600 words, one call to action. Markdown.",
  email: "Email: a subject line as the title and a short, personal email (80–250 words) with one call to action. Markdown.",
  bluesky: "Bluesky: one post of at most 300 characters including any link (a hard limit). Conversational, specific, no hashtag spam (at most one or two). For a thread, separate posts with a blank line and number them (1/, 2/…), each under 300 characters.",
  mastodon: "Mastodon: one post of at most 500 characters including any link. Friendly, community-minded and plain; people there dislike marketing tone. Use 1–3 relevant hashtags in CamelCase at the end (they drive discovery). For a thread, separate posts with a blank line, each under 500 characters.",
  discourse:
    "Discourse forum topic: a specific, descriptive title and a body that starts a genuine discussion or shares something useful (a guide, findings, a question with context), 150–600 words, Markdown with short paragraphs. Read like a forum member, not a vendor; mention the product only if it's on-topic, saying you made it.",
  other: "Write for the channel described in the topic, matching its norms.",
};

export function contentSystem(productContext: string): string {
  return `You write marketing content for a small founder's product: content that's genuinely worth reading on its own, which also builds awareness of the product.

<product>
${productContext}
</product>

Rules:
- Follow the channel norms exactly.
- If a voice guide is given, write in that voice (style only: never copy its source's opinions or claims).
- Lead with value for the reader. Mention the product only where it fits naturally; when you mention it, the author is its founder, so say so plainly. Use the product link exactly as given in <link>, at most once, and only if the format allows links.
- Never invent facts, numbers, features, testimonials or personal experiences that aren't in the product information or the owner's guidance.
- Output only the content, ready to post.`;
}

export const contentOutput = z.object({
  title: z.string().describe("Title, subject line or first line; empty string if the format has none."),
  body: z.string(),
  mentions_product: z.boolean(),
  rationale: z.string().describe("One sentence for the owner: the angle and why it suits this channel."),
});

export const TOPICS_SYSTEM = `You suggest content ideas for a small founder's product: topics the target audience actively cares about, drawn from the product brief, personas and the real conversations the founder's audience is having. Each idea should be specific (not "tips for photographers"), and useful even to people who never use the product.`;

export const topicsOutput = z.object({
  topics: z.array(
    z.object({
      topic: z.string().describe("The idea in one sentence"),
      channel: z.enum(["reddit", "x", "linkedin", "hackernews", "bluesky", "mastodon", "discourse", "blog", "newsletter", "email"]),
      why: z.string().describe("Why this audience would care, one sentence"),
    }),
  ),
});
