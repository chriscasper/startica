import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { communities, competitors, keywords, personas, products, researchDocs } from "@startica/db/schema";
import { runResearch, runStructured, type AiContext } from "../ai/client.ts";
import { crawlSite, type CrawledPage } from "./crawl.ts";
import {
  intelOutput,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_SYSTEM,
  SYNTHESIS_PROMPT_VERSION,
  SYNTHESIS_SYSTEM,
  type IntelOutput,
} from "./prompts.ts";

export const intelBuildPayload = z.object({
  workspaceId: z.guid(),
  productId: z.guid(),
});

type IntelStatus = "crawling" | "researching" | "writing" | "ready" | "failed";

const MAX_SITE_CHARS = 60_000;

type Product = Pick<
  typeof products.$inferSelect,
  "id" | "workspaceId" | "name" | "url" | "oneLiner" | "ownerNotes" | "briefSource"
>;

async function setStatus(productId: string, status: IntelStatus, error: string | null = null) {
  await getDb()
    .update(products)
    .set({ intelStatus: status, intelError: error, intelUpdatedAt: new Date() })
    .where(eq(products.id, productId));
}

function siteText(pages: CrawledPage[]): string {
  let out = "";
  for (const page of pages) {
    const block = `\n\n### ${page.title || page.url}\nURL: ${page.url}\n\n${page.content}`;
    if (out.length + block.length > MAX_SITE_CHARS) break;
    out += block;
  }
  return out.trim();
}

async function ownerItems(productId: string): Promise<string> {
  const db = getDb();
  const [ownPersonas, ownCompetitors, ownKeywords, triaged] = await Promise.all([
    db.select({ name: personas.name }).from(personas).where(and(eq(personas.productId, productId), eq(personas.source, "owner"))),
    db
      .select({ name: competitors.name })
      .from(competitors)
      .where(and(eq(competitors.productId, productId), eq(competitors.source, "owner"))),
    db.select({ keyword: keywords.keyword }).from(keywords).where(and(eq(keywords.productId, productId), eq(keywords.source, "owner"))),
    db
      .select({ channel: communities.channel, name: communities.name })
      .from(communities)
      .where(and(eq(communities.productId, productId), or(eq(communities.source, "owner"), ne(communities.status, "suggested")))),
  ]);
  const lines = [
    ownPersonas.length && `Personas: ${ownPersonas.map((p) => p.name).join("; ")}`,
    ownCompetitors.length && `Competitors: ${ownCompetitors.map((c) => c.name).join("; ")}`,
    ownKeywords.length && `Keywords: ${ownKeywords.map((k) => k.keyword).join("; ")}`,
    triaged.length && `Communities: ${triaged.map((c) => `${c.channel}:${c.name}`).join("; ")}`,
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "None yet.";
}

async function saveIntel(product: Product, intel: IntelOutput) {
  const workspaceId = product.workspaceId;
  const productId = product.id;
  await transaction(async (db) => {
    // Replace AI-written rows; keep anything the owner wrote or triaged.
    await db.delete(personas).where(and(eq(personas.productId, productId), eq(personas.source, "ai")));
    await db.delete(competitors).where(and(eq(competitors.productId, productId), eq(competitors.source, "ai")));
    await db.delete(keywords).where(and(eq(keywords.productId, productId), eq(keywords.source, "ai")));
    await db
      .delete(communities)
      .where(and(eq(communities.productId, productId), eq(communities.source, "ai"), eq(communities.status, "suggested")));

    if (product.briefSource !== "owner") {
      await db
        .update(products)
        .set({ brief: intel.brief, briefSource: "ai", briefUpdatedAt: new Date() })
        .where(eq(products.id, productId));
    }
    const base = { workspaceId, productId, source: "ai" as const };
    if (intel.personas.length) await db.insert(personas).values(intel.personas.map((p) => ({ ...base, ...p })));
    if (intel.competitors.length) {
      await db.insert(competitors).values(intel.competitors.map((c) => ({ ...base, ...c, url: c.url || null })));
    }
    if (intel.keywords.length) {
      await db
        .insert(keywords)
        .values(intel.keywords.map((k) => ({ ...base, keyword: k.keyword.trim().toLowerCase(), intent: k.intent, useFor: k.use_for })))
        .onConflictDoNothing();
    }
    if (intel.communities.length) {
      await db
        .insert(communities)
        .values(
          intel.communities.map((c) => ({
            ...base,
            channel: c.channel,
            name: c.channel === "reddit" ? c.name.replace(/^\/?r\//i, "").trim() : c.name.trim(),
            url: c.url || null,
            why: c.why,
            promoRules: c.promo_rules,
          })),
        )
        .onConflictDoNothing();
    }
  });
}

/**
 * Crawl the product site, research the market with web search, then write the
 * brief, personas, competitors, keywords and communities.
 */
export async function runIntelBuild(ctx: AiContext, payload: z.infer<typeof intelBuildPayload>) {
  const [product] = await getDb()
    .select({
      id: products.id,
      workspaceId: products.workspaceId,
      name: products.name,
      url: products.url,
      oneLiner: products.oneLiner,
      ownerNotes: products.ownerNotes,
      briefSource: products.briefSource,
    })
    .from(products)
    .where(and(eq(products.id, payload.productId), eq(products.workspaceId, payload.workspaceId)));
  if (!product) throw new Error(`Product ${payload.productId} not found`);

  try {
    // 1. Crawl
    await setStatus(product.id, "crawling");
    const pages = product.url ? await crawlSite(product.url) : [];
    await transaction(async (db) => {
      await db.delete(researchDocs).where(and(eq(researchDocs.productId, product.id), eq(researchDocs.kind, "product_page")));
      if (pages.length) {
        await db.insert(researchDocs).values(
          pages.map((page) => ({
            workspaceId: product.workspaceId,
            productId: product.id,
            kind: "product_page" as const,
            url: page.url,
            title: page.title,
            content: page.content,
          })),
        );
      }
    });
    const site = siteText(pages);

    const about = [
      `Product: ${product.name}`,
      product.url && `URL: ${product.url}`,
      product.oneLiner && `One-liner: ${product.oneLiner}`,
      `Owner's notes: ${product.ownerNotes?.trim() || "(none)"}`,
    ]
      .filter(Boolean)
      .join("\n");

    // 2. Research
    await setStatus(product.id, "researching");
    const notes = await runResearch(ctx, {
      task: "research",
      promptVersion: RESEARCH_PROMPT_VERSION,
      system: RESEARCH_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${about}\n\nWhat the product's own site says (crawled, may be partial):\n${site.slice(0, 15_000) || "(nothing could be crawled)"}`,
        },
      ],
    });
    await transaction(async (db) => {
      await db.delete(researchDocs).where(and(eq(researchDocs.productId, product.id), eq(researchDocs.kind, "research_notes")));
      await db.insert(researchDocs).values({
        workspaceId: product.workspaceId,
        productId: product.id,
        kind: "research_notes",
        title: "Market research notes",
        content: notes,
      });
    });

    // 3. Write the intel
    await setStatus(product.id, "writing");
    const intel = await runStructured(ctx, {
      task: "strategy",
      promptVersion: SYNTHESIS_PROMPT_VERSION,
      system: SYNTHESIS_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `<product>\n${about}\n</product>`,
            `<owner_added_items>\n${await ownerItems(product.id)}\n</owner_added_items>`,
            `<site_pages>\n${site || "(nothing could be crawled)"}\n</site_pages>`,
            `<research_notes>\n${notes}\n</research_notes>`,
          ].join("\n\n"),
        },
      ],
      schema: intelOutput,
    });

    await saveIntel(product, intel);
    await setStatus(product.id, "ready");
    return {
      pages: pages.length,
      personas: intel.personas.length,
      competitors: intel.competitors.length,
      keywords: intel.keywords.length,
      communities: intel.communities.length,
    };
  } catch (error) {
    await setStatus(product.id, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
