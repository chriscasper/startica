import { z } from "zod";
import type { AnswerCitation, VisibilityMetrics } from "@startica/db/schema";
import { priceOf, type ModelConfig } from "../ai/models.ts";

/**
 * AI visibility (ARCHITECTURE.md section 10.2): what an answer says about the product, and the
 * totals for a run. The model reads each answer for what needs judgment (recommended?
 * how described?); what can be checked exactly (the product's name, its own pages among
 * the citations) is checked in code.
 */

export const ANSWER_PROMPT_VERSION = "visibility-answer@1";
export const ANALYSIS_PROMPT_VERSION = "visibility-analysis@1";
export const SUGGEST_PROMPT_VERSION = "visibility-questions@1";

/** Searches each answer may run: about what assistants do for a buying question. */
export const MAX_SEARCHES = 3;
export const DEFAULT_CAP_USD = 2;
export const MAX_PROMPTS = 100;

/**
 * The assistant the questions are asked of. It's never told about the product: the
 * point is to see what it says on its own.
 */
export function answerSystem(today: string): string {
  return `You are a helpful AI assistant. Answer the user's question well and concisely, searching the web when it helps. When the question asks for tools, products, services or alternatives, name specific ones and say briefly why each fits. Today is ${today}.`;
}

export const ANALYSIS_SYSTEM = `You read an AI assistant's answer and report what it says about one product and its competitors. Be literal: report what the answer says, not what you know.

- products_named: every product, tool or service the answer names as an option, in the order they first appear, as written in the answer. Leave out the companies behind them unless the company itself is the option.
- mentioned: the answer names the product (any spelling or casing of its names).
- recommended: the answer presents the product as a good choice or one of its suggestions, not only in passing, as a bad fit or as something to avoid.
- description: the answer's own words about the product, a short quote (at most 25 words), or an empty string if it isn't mentioned.
- sentiment: how the answer speaks of the product: positive, neutral or negative; "none" if it isn't mentioned.
- competitors: the names from the competitor list that the answer names, spelled as in the list.`;

export const analysisOutput = z.object({
  products_named: z.array(z.string()),
  mentioned: z.boolean(),
  recommended: z.boolean(),
  description: z.string(),
  sentiment: z.enum(["positive", "neutral", "negative", "none"]),
  competitors: z.array(z.string()),
});
export type AnalysisOutput = z.infer<typeof analysisOutput>;

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The names an answer might use for the product: its name, and its domain's first label. */
export function productNames(name: string, url: string | null): string[] {
  const names = [name];
  if (url) {
    try {
      const label = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
      if (label && squash(label) !== squash(name)) names.push(label);
    } catch {
      // not a URL: the name alone
    }
  }
  return names;
}

/** Whether a text names the product, as a whole word, with or without spaces ("Field Note" or "Fieldnote"). */
export function namesProduct(text: string, names: string[]): boolean {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const needles = names.map(squash).filter((n) => n.length >= 3);
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < words.length && joined.length < 40; j++) {
      joined += words[j];
      if (needles.includes(joined)) return true;
    }
  }
  return false;
}

/** The product's own pages among the citations: same domain or a subdomain of it. */
export function ownCitations(citations: AnswerCitation[], productUrl: string | null): string[] {
  if (!productUrl) return [];
  let domain: string;
  try {
    domain = new URL(productUrl).hostname.replace(/^www\./, "");
  } catch {
    return [];
  }
  return citations
    .map((c) => c.url)
    .filter((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        return host === domain || host.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    });
}

/** The product's position among the products the answer names (1 = first), or null. */
export function positionOf(productsNamed: string[], names: string[]): number | null {
  const i = productsNamed.findIndex((p) => namesProduct(p, names));
  return i >= 0 ? i + 1 : null;
}

export type AnalyzedAnswer = {
  mentioned: boolean;
  recommended: boolean;
  position: number | null;
  productsNamed: string[];
  competitors: string[];
  ownCitations: string[];
  description: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
};

/** Combines the model's reading with the exact checks. */
export function analyzed(out: AnalysisOutput, answer: { text: string; citations: AnswerCitation[] }, product: { names: string[]; url: string | null }, competitors: string[]): AnalyzedAnswer {
  const named = out.products_named.map((p) => p.trim()).filter(Boolean);
  // The name in the text settles it either way the model read it.
  const mentioned = namesProduct(answer.text, product.names) || (out.mentioned && named.some((p) => namesProduct(p, product.names)));
  const known = new Map(competitors.map((c) => [squash(c), c]));
  return {
    mentioned,
    recommended: mentioned && out.recommended,
    position: mentioned ? positionOf(named, product.names) : null,
    productsNamed: named.slice(0, 30),
    competitors: [...new Set(out.competitors.map((c) => known.get(squash(c))).filter((c): c is string => Boolean(c)))],
    ownCitations: ownCitations(answer.citations, product.url),
    description: mentioned && out.description.trim() ? out.description.trim().slice(0, 300) : null,
    sentiment: mentioned && out.sentiment !== "none" ? out.sentiment : null,
  };
}

/** The run's totals from its answers. */
export function runMetrics(answers: (AnalyzedAnswer & { error?: string | null })[], productName: string, competitors: string[]): VisibilityMetrics {
  const ok = answers.filter((a) => !a.error);
  const positions = ok.map((a) => a.position).filter((p): p is number => p != null);
  return {
    answered: ok.length,
    mentioned: ok.filter((a) => a.mentioned).length,
    recommended: ok.filter((a) => a.recommended).length,
    cited: ok.filter((a) => a.ownCitations.length > 0).length,
    avgPosition: positions.length ? Math.round((positions.reduce((n, p) => n + p, 0) / positions.length) * 10) / 10 : null,
    brands: [
      { name: productName, answers: ok.filter((a) => a.mentioned).length, own: true },
      ...competitors.map((c) => ({ name: c, answers: ok.filter((a) => a.competitors.includes(c)).length, own: false })),
    ].sort((a, b) => b.answers - a.answers || Number(b.own) - Number(a.own)),
  };
}

// Rough sizes of one question, for the estimate: search results arrive as input tokens.
const ANSWER_TOKENS = { input: 12_000, output: 900 };
const ANALYSIS_TOKENS = { input: 2_500, output: 250 };
const SEARCH_USD = 10 / 1000;

/** What one question is likely to cost with these models, searches included. */
export function estimatePerQuestion(answer: ModelConfig, analysis: ModelConfig): number {
  const cost = (model: string, t: { input: number; output: number }) => {
    const p = priceOf(model);
    return p ? (t.input * p.input + t.output * p.output) / 1_000_000 : 0;
  };
  return cost(answer.model, ANSWER_TOKENS) + MAX_SEARCHES * SEARCH_USD + cost(analysis.model, ANALYSIS_TOKENS);
}
