import { z } from "zod";
import { parseSecurityTxt } from "./checks.ts";

/**
 * The disclosure kit (ARCHITECTURE.md section 11.6): a security.txt (RFC 9116) and a
 * vulnerability disclosure policy to publish on the site, built from a form. No AI:
 * the same input always gives the same text, and the security.txt is checked with the
 * parser the site checks use.
 */

export const securityTxtInput = z.object({
  contact: z
    .string()
    .trim()
    .min(3, "Give an email address or a web form's address")
    .transform((v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : v))
    .refine((v) => /^(mailto:|https:\/\/)/i.test(v), "Use an email address or an https:// address"),
  expires_months: z.coerce.number().int().min(1).max(12).default(12),
  policy: z.string().trim().default(""),
  languages: z.string().trim().default("en"),
});

/** The file, with an Expires date at most a year out (the RFC recommends less than a year). */
export function buildSecurityTxt(site: string, input: z.infer<typeof securityTxtInput>, now = new Date()): string {
  const origin = new URL(site).origin;
  const expires = new Date(now);
  expires.setUTCMonth(expires.getUTCMonth() + input.expires_months);
  // Keep it under a year even when the month has fewer days.
  if (expires.getTime() - now.getTime() > 365 * 86_400_000) expires.setTime(now.getTime() + 365 * 86_400_000);
  const lines = [
    `Contact: ${input.contact}`,
    `Expires: ${expires.toISOString().replace(/\.\d{3}Z$/, ".000Z")}`,
    ...(input.policy ? [`Policy: ${input.policy}`] : []),
    `Preferred-Languages: ${input.languages || "en"}`,
    `Canonical: ${origin}/.well-known/security.txt`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Problems with a generated file (there shouldn't be any; this guards the generator). */
export function securityTxtProblems(text: string, now = new Date()): string[] {
  return parseSecurityTxt(text, now.getTime()).problems;
}

export const policyInput = z.object({
  contact: z.string().trim().min(3, "Give an email address or a web form's address"),
  response_days: z.coerce.number().int().min(1).max(30).default(5),
});

/**
 * A vulnerability disclosure policy in Markdown, with safe-harbor wording to edit. It's a
 * starting point the owner adapts; the docs say to have it read by whoever handles legal.
 */
export function buildDisclosurePolicy(product: string, hosts: string[], input: z.infer<typeof policyInput>): string {
  const scope = hosts.length ? hosts.map((h) => `- ${h}`).join("\n") : "- (list the sites you want reports about)";
  return `# Reporting a security problem in ${product}

We want ${product} to be safe for everyone who uses it. If you think you've found a security problem, please tell us. We'll work with you to understand it and fix it.

## How to report

Send the details to ${input.contact}. Please include:

- The address or part of ${product} that's affected
- What the problem is and what someone could do with it
- The steps you took to find it, so we can see it too

We'll reply within ${input.response_days} working days to say we've received it, and keep you updated as we look into it.

## In scope

${scope}

## Please don't

- Access, change or delete data that isn't yours. Stop as soon as you've shown the problem exists.
- Degrade the service for others (no denial-of-service or load testing).
- Use social engineering, phishing or physical attacks against our team or users.
- Share the problem with others until we've fixed it, or until we agree on a date.

## Our promise

If you follow this policy, we'll consider your research authorized, we won't take legal action against you for it, and we'll work with you in good faith. If something is unclear, ask us before going further.

We don't currently run a paid bug bounty. We're happy to thank you publicly once the problem is fixed, if you'd like.
`;
}
