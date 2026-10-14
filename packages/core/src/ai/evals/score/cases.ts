import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ConversationRow } from "../../../distribution/jobs.ts";

/**
 * Eval set for the opportunity scorer (ARCHITECTURE.md section 5). One JSON file per
 * product in this folder. Cases come from the owner's Inbox decisions
 * (`yarn eval:export score`) plus hand-written seed cases; `yarn eval score`
 * runs the current prompt and model routing against them.
 */

export type Expectation = "reply" | "skip";

export type ScoreCase = {
  /** "<channel>:<external id>" for exported cases, "seed-<n>" for hand-written ones. */
  id: string;
  source: "owner" | "seed";
  expect: Expectation;
  /** Why this label (the dismiss reason, or what a seed case tests). */
  note: string;
  conversation: Omit<ConversationRow, "author"> & { url?: string };
};

export type ScoreEvalFile = {
  product: string;
  /** Snapshot of the product text the prompt sees, refreshed on each export. */
  productContext: string;
  thresholds: { relevance: number; intent: number };
  cases: ScoreCase[];
};

export const evalDir = import.meta.dirname;
export const evalPath = (product: string) => join(evalDir, `${product.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);

export function readEvalFile(path: string): ScoreEvalFile | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ScoreEvalFile;
  } catch {
    return null;
  }
}

export function writeEvalFile(path: string, file: ScoreEvalFile): void {
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

/**
 * What an Inbox decision says the scorer should have done. Posting means it was
 * worth replying to. Dismissing as off topic, wrong audience, already answered or
 * other means it wasn't. "Too old" and "rules forbid" are left out: the scorer
 * doesn't judge age or community rules. Anything undecided isn't a label.
 */
export function labelFromDecision(status: string, dismissReason: string | null): Expectation | null {
  if (status === "posted") return "reply";
  if (status !== "dismissed") return null;
  if (dismissReason === "too_old" || dismissReason === "rules_forbid") return null;
  return "skip";
}

/** Adds or updates owner cases by id; keeps seed cases and owner cases that are no longer in the database. */
export function mergeCases(existing: ScoreCase[], incoming: ScoreCase[]): ScoreCase[] {
  const byId = new Map(existing.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()].sort((a, b) => (a.source === b.source ? a.id.localeCompare(b.id) : a.source === "seed" ? -1 : 1));
}
