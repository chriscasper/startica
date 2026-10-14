import { z } from "zod";

/**
 * Email campaigns (Content Studio, channel "email", format "campaign"): a short
 * sequence of emails. Claude returns them structured; they're stored in the
 * piece's body as plain sections, so editing, copying and rewriting work like any
 * other piece, and the Library shows each email with its own copy buttons.
 * Startica never sends email: the user pastes them into their email tool.
 */

export const CAMPAIGN_PROMPT_VERSION = "email-campaign@1";

export const CAMPAIGN_NORMS =
  "Email campaign: a sequence of 3 to 5 emails toward one goal (welcome, launch, re-engagement, onboarding…), unless the topic asks for a different number. Each email: a subject under 50 characters that is specific, not clickbait; preview text under 90 characters that adds to the subject; a body of 80–250 words in plain, personal language, one idea per email and one clear call to action; send_day = days after the first email (the first is 0). The sequence should build: value first, the ask later. No spam words, no fake urgency, no ALL CAPS. Markdown is fine in bodies; no images.";

export const campaignOutput = z.object({
  title: z.string().describe("A short internal name for the campaign."),
  emails: z
    .array(
      z.object({
        subject: z.string(),
        preview: z.string().describe("Preview text shown after the subject in the inbox."),
        send_day: z.number().describe("Days after the first email; the first is 0."),
        body: z.string(),
      }),
    )
    .min(1),
  mentions_product: z.boolean(),
  rationale: z.string().describe("One sentence for the owner: the sequence's arc and why it fits the goal."),
});

export type CampaignEmail = { subject: string; preview: string; sendDay: number; body: string };

/** The campaign as text sections: "## Email 1 · Day 0", then Subject:, Preview:, a blank line and the body. */
export function formatCampaign(emails: { subject: string; preview: string; send_day: number; body: string }[]): string {
  return emails
    .map((e, i) => `## Email ${i + 1} · Day ${Math.max(0, Math.round(e.send_day))}\nSubject: ${e.subject.trim()}\nPreview: ${e.preview.trim()}\n\n${e.body.trim()}`)
    .join("\n\n");
}

/** Reads the sections back (also after the user edited them); null if the text isn't in that shape. */
export function parseCampaign(text: string): CampaignEmail[] | null {
  const parts = text.split(/^## Email \d+\s*·\s*Day\s*/m).slice(1);
  if (parts.length === 0) return null;
  const emails: CampaignEmail[] = [];
  for (const part of parts) {
    const m = /^(\d+)\s*\n(?:Subject:[ \t]*(.*)\n)?(?:Preview:[ \t]*(.*)\n)?\n?([\s\S]*)$/.exec(part.trimEnd());
    if (!m) return null;
    emails.push({ sendDay: Number(m[1]), subject: (m[2] ?? "").trim(), preview: (m[3] ?? "").trim(), body: (m[4] ?? "").trim() });
  }
  return emails;
}
