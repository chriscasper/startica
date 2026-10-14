import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { seoOpportunities, sitePages, sites, type OpportunityDraft } from "@startica/db/schema";
import { runStructured, taskModel, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";
import { llmsTxtValid, readStructuredData } from "../seo/checks.ts";
import { topQueriesForPage } from "../search/sync.ts";
import { collectOpportunities, pageFacts } from "./collect.ts";

/**
 * AI fix drafts for opportunities (ARCHITECTURE.md section 10.2): titles and descriptions,
 * JSON-LD, llms.txt and FAQ answers. Copy-only: Startica never changes the site. Every
 * draft is checked before it's shown, and what didn't pass is listed with it.
 */

export const DRAFT_PROMPT_VERSION = "opportunity-draft@1";

const SYSTEM = `You draft fixes that help a product's website get found in search results and cited in AI answers. The founder reviews and copies them; nothing is published automatically.

Rules:
- Follow Google's search guidelines: write for people first, describe the page accurately, no keyword stuffing, no hidden text, no claims the product description doesn't support (prices, numbers, awards, features).
- Plain, specific language in the product's own terms. No hype, no superlatives you can't prove.
- Respect every length limit exactly.`;

export const draftPayload = z.object({ workspaceId: z.guid(), productId: z.guid(), key: z.string().min(1).max(600) });

const metaOutput = z.object({
  pages: z.array(z.object({ url: z.string(), title: z.string().describe("30 to 60 characters"), description: z.string().describe("120 to 160 characters") })),
});
const jsonldOutput = z.object({ json_ld: z.string().describe("One JSON-LD object (or an @graph) as JSON text, with @context https://schema.org") });
const llmsOutput = z.object({ text: z.string().describe("The whole llms.txt file in Markdown") });
const faqOutput = z.object({
  question: z.string(),
  answer: z.string().describe("40 to 120 words"),
  where: z.string().describe("Which page of the site it belongs on, and why, in one sentence"),
});

/** Checks a meta draft against the length guidance (Site health uses the same numbers). */
export function metaProblems(pages: { url: string; title: string; description: string }[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    if (p.title.length > 60) out.push(`${p.url}: title is ${p.title.length} characters (over 60)`);
    if (p.title.length < 30) out.push(`${p.url}: title is short (${p.title.length} characters; aim for 30 to 60)`);
    if (p.description.length > 160) out.push(`${p.url}: description is ${p.description.length} characters (over 160)`);
    if (p.description.length < 120) out.push(`${p.url}: description is short (${p.description.length} characters; aim for 120 to 160)`);
  }
  const titles = pages.map((p) => p.title.trim().toLowerCase());
  if (new Set(titles).size < titles.length) out.push("Two pages got the same title");
  return out;
}

/** Parses and checks a JSON-LD draft with Site health's own structured-data checks. */
export function jsonldProblems(text: string): { problems: string[]; pretty: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { problems: ["It isn't valid JSON"], pretty: text };
  }
  const problems: string[] = [];
  const context = (parsed as { "@context"?: unknown })["@context"];
  if (typeof context !== "string" || !/^https?:\/\/schema\.org\/?$/.test(context)) problems.push('@context should be "https://schema.org"');
  const read = readStructuredData([text]);
  if (read.types.length === 0) problems.push("No schema.org @type");
  for (const i of read.incomplete) problems.push(`${i.type} is missing ${i.missing.join(", ")}`);
  return { problems, pretty: JSON.stringify(parsed, null, 2) };
}

const script = (json: string) => `<script type="application/ld+json">\n${json}\n</script>`;

/** The FAQPage JSON-LD for one question, built in code (not by the model) so it's always valid. */
export function faqJsonLd(question: string, answer: string): string {
  return JSON.stringify(
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } }] },
    null,
    2,
  );
}

async function sitePageList(productId: string) {
  return getDb()
    .select({ url: sitePages.url, title: sitePages.title })
    .from(sitePages)
    .innerJoin(sites, eq(sites.id, sitePages.siteId))
    .where(and(eq(sites.productId, productId), isNull(sitePages.goneAt), eq(sitePages.state, "done")))
    .orderBy(asc(sitePages.depth), asc(sitePages.url))
    .limit(40);
}

export async function runOpportunityDraft(ctx: AiContext, payload: z.infer<typeof draftPayload>) {
  const db = getDb();
  const where = and(eq(seoOpportunities.productId, payload.productId), eq(seoOpportunities.key, payload.key));
  try {
    // Recompute: the draft follows the opportunity as it is now, not what a page sent.
    const opp = (await collectOpportunities(payload.productId)).find((o) => o.key === payload.key);
    if (!opp?.draft) throw new Error("This opportunity is gone or has nothing to draft (the data changed since the page loaded)");
    const product = await loadProductContext(payload.productId);
    const model = (await taskModel(ctx, "draft")).model;
    const ask = <S extends z.ZodType>(content: string, schema: S) =>
      runStructured(ctx, { task: "draft", promptVersion: DRAFT_PROMPT_VERSION, system: SYSTEM, messages: [{ role: "user", content: `<product>\n${product.text}\n</product>\n\n${content}` }], schema });
    let draft: OpportunityDraft;

    if (opp.draft.kind === "meta") {
      const facts = await pageFacts(payload.productId, opp.draft.pages ?? []);
      const blocks = await Promise.all(
        facts.map(async (f) => {
          const queries = await topQueriesForPage(payload.productId, f.url, ctx.signal);
          return [
            `<page url="${f.url}">`,
            `Current title: ${f.title ?? "(none)"}`,
            `Current description: ${f.seo?.description ?? "(none)"}`,
            `Main heading: ${f.seo?.h1.join(" | ") || "(none)"}`,
            queries.length ? `Google searches it's found for:\n${queries.map((q) => `- ${q}`).join("\n")}` : "Google searches: not available",
            `</page>`,
          ].join("\n");
        }),
      );
      const out = await ask(`Write a new title and meta description for each page. Each title says what the page is and includes the main thing people search for; each description says what the page offers and why to click.\n\n${blocks.join("\n\n")}`, metaOutput);
      const pages = out.pages.map((p) => ({ url: p.url, title: p.title.trim(), description: p.description.trim() }));
      draft = {
        kind: "meta",
        pages,
        text: pages.map((p) => `${p.url}\n<title>${p.title}</title>\n<meta name="description" content="${p.description.replace(/"/g, "&quot;")}">`).join("\n\n"),
        problems: metaProblems(pages),
        model,
        createdAt: new Date().toISOString(),
      };
    } else if (opp.draft.kind === "jsonld") {
      const [f] = await pageFacts(payload.productId, opp.draft.pages?.length ? opp.draft.pages : product.url ? [product.url] : []);
      const out = await ask(
        `Write the JSON-LD for this page: on the home page, an @graph with Organization (name, url, logo if known) and the product as SoftwareApplication or Product (name, description, offers from the pricing notes when there are any; otherwise leave offers out and say nothing about price). On other pages, the type that fits the page (Article, FAQPage, BreadcrumbList…).\n\n<page url="${f?.url ?? product.url ?? ""}">\nTitle: ${f?.title ?? ""}\nDescription: ${f?.seo?.description ?? ""}\nMain heading: ${f?.seo?.h1.join(" | ") ?? ""}\nStructured data now: ${f?.seo?.structuredTypes.join(", ") || "none"}\n</page>`,
        jsonldOutput,
      );
      const checked = jsonldProblems(out.json_ld.trim());
      draft = { kind: "jsonld", text: script(checked.pretty), problems: checked.problems, model, createdAt: new Date().toISOString() };
    } else if (opp.draft.kind === "llms_txt") {
      const pages = await sitePageList(payload.productId);
      const out = await ask(
        `Write the site's /llms.txt: a "# ${product.name}" title, a one-paragraph summary as a "> " blockquote, a few short notes, then "## " sections listing the most useful pages as Markdown links with a short description each. Only use these pages:\n${pages.map((p) => `- ${p.url} ${p.title ?? ""}`).join("\n")}`,
        llmsOutput,
      );
      const text = out.text.trim();
      const known = new Set(pages.map((p) => p.url));
      const links = [...text.matchAll(/\]\((https?:[^)\s]+)\)/g)].map((m) => m[1]!);
      const problems = [
        ...(llmsTxtValid(text) ? [] : ["It should start with a Markdown # title"]),
        ...(links.length === 0 ? ["It links to no pages"] : []),
        ...links.filter((l) => !known.has(l)).map((l) => `Links to a page the scan didn't find: ${l}`),
      ];
      draft = { kind: "llms_txt", text, problems, model, createdAt: new Date().toISOString() };
    } else {
      const out = await ask(
        `People ask AI assistants this question, and the answers name competitors but not ${product.name}:\n<question>${opp.draft.question}</question>\n\nWrite an FAQ entry for ${product.name}'s site that answers it honestly and helpfully, says when ${product.name} is a good fit (and when it isn't), in 40 to 120 words, so assistants that search the web can find and cite it. Rephrase the question as a heading if it reads better.`,
        faqOutput,
      );
      const words = out.answer.trim().split(/\s+/).length;
      const json = faqJsonLd(out.question.trim(), out.answer.trim());
      draft = {
        kind: "faq",
        text: `### ${out.question.trim()}\n\n${out.answer.trim()}\n\n<!-- ${out.where.trim()} -->\n\n${script(json)}`,
        problems: words > 140 ? [`The answer is ${words} words; aim for 120 or fewer`] : [],
        model,
        createdAt: new Date().toISOString(),
      };
    }
    await db.update(seoOpportunities).set({ draft, draftStatus: "ready", draftError: null }).where(where);
    return { kind: draft.kind, problems: draft.problems.length };
  } catch (err) {
    await db
      .update(seoOpportunities)
      .set({ draftStatus: "failed", draftError: ctx.signal?.aborted ? "Stopped by you" : err instanceof Error ? err.message : String(err) })
      .where(where);
    throw err;
  }
}
