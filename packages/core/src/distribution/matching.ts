import { createHash } from "node:crypto";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb, transaction } from "@startica/db/client";
import { competitors, conversations, keywords, opportunities, products, type OpportunityMentions } from "@startica/db/schema";

/**
 * Which listening keywords, and which of the product and its competitors, a conversation
 * names (ARCHITECTURE.md 8.1, listening trends). Plain text matching, no AI: a phrase
 * matches on word boundaries, ignoring case and runs of spaces, with an optional plural
 * "s" on its last word for keywords. Stored on the opportunity when it's saved.
 */

export type Matchers = {
  keywords: string[];
  product: string;
  competitors: { id: string; name: string }[];
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A case-insensitive pattern for a phrase between word boundaries (letters and digits in any script). */
function phrasePattern(phrase: string, plural: boolean): RegExp | null {
  const words = phrase.trim().split(/\s+/).filter(Boolean).map(escape);
  if (!words.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s\\-_]+")}${plural ? "(?:e?s)?" : ""}(?![\\p{L}\\p{N}])`, "iu");
}

const cache = new Map<string, RegExp | null>();
function test(phrase: string, text: string, plural: boolean): boolean {
  const key = `${plural ? "p" : "n"}:${phrase.toLowerCase()}`;
  if (!cache.has(key)) {
    if (cache.size > 2000) cache.clear();
    cache.set(key, phrasePattern(phrase, plural));
  }
  return cache.get(key)?.test(text) ?? false;
}

/** The keywords found in the text, in the order given, without duplicates. */
export function matchKeywords(text: string, list: string[]): string[] {
  const out: string[] = [];
  for (const k of list) if (!out.includes(k) && test(k, text, true)) out.push(k);
  return out;
}

/** Whether the text names the product, and which competitors it names (by id). */
export function findMentions(text: string, m: Pick<Matchers, "product" | "competitors">): OpportunityMentions {
  return {
    product: Boolean(m.product.trim()) && test(m.product, text, false),
    competitorIds: m.competitors.filter((c) => c.name.trim() && test(c.name, text, false)).map((c) => c.id),
  };
}

/** The text a conversation is matched on: its title, the thread's title and its body. */
export const matchText = (c: { title: string | null; threadTitle?: string | null; body: string }) =>
  [c.title, c.threadTitle, c.body].filter(Boolean).join("\n");

export function matchConversation(c: { title: string | null; threadTitle?: string | null; body: string }, m: Matchers) {
  const text = matchText(c);
  return { matchedKeywords: matchKeywords(text, m.keywords), mentions: findMentions(text, m) };
}

export async function loadMatchers(productId: string): Promise<Matchers> {
  const db = getDb();
  const [[product], words, rivals] = await Promise.all([
    db.select({ name: products.name }).from(products).where(eq(products.id, productId)),
    db
      .select({ keyword: keywords.keyword })
      .from(keywords)
      .where(and(eq(keywords.productId, productId), inArray(keywords.useFor, ["listening", "both"]))),
    db.select({ id: competitors.id, name: competitors.name }).from(competitors).where(eq(competitors.productId, productId)),
  ]);
  return { product: product?.name ?? "", keywords: words.map((w) => w.keyword), competitors: rivals };
}

const signature = (m: Matchers) =>
  createHash("sha256")
    .update(JSON.stringify([m.product.toLowerCase(), [...m.keywords].map((k) => k.toLowerCase()).sort(), m.competitors.map((c) => `${c.id}:${c.name.toLowerCase()}`).sort()]))
    .digest("hex")
    .slice(0, 16);

const REFRESH_DAYS = 90;

/**
 * Keeps the stored matches current, cheaply: fills rows that have none (stored before
 * migration 0024), and when the product's name, listening keywords or competitors changed
 * since the last run (a signature in the setting `listening_matchers:<product>`), matches
 * the last 90 days again. Called by listen_scan and before the Trends view reads.
 */
export async function refreshListeningMatches(productId: string): Promise<number> {
  const db = getDb();
  const m = await loadMatchers(productId);
  const sig = signature(m);
  const key = `listening_matchers:${productId}`;
  const changed = (await getSetting<string>(key)) !== sig;
  const since = new Date(Date.now() - REFRESH_DAYS * 86400_000);
  const rows = await db
    .select({ id: opportunities.id, title: conversations.title, threadTitle: conversations.threadTitle, body: conversations.body })
    .from(opportunities)
    .innerJoin(conversations, eq(conversations.id, opportunities.conversationId))
    .where(
      and(
        eq(opportunities.productId, productId),
        changed ? or(gt(opportunities.createdAt, since), isNull(opportunities.matchedKeywords)) : isNull(opportunities.matchedKeywords),
      ),
    );
  if (rows.length) {
    await transaction(async (tx) => {
      for (const r of rows) await tx.update(opportunities).set(matchConversation(r, m)).where(eq(opportunities.id, r.id));
    });
  }
  if (changed) await setSetting(key, sig);
  return rows.length;
}
