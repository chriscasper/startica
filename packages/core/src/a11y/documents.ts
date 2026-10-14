import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { siteDocuments, siteLinks, sitePages, sites, type DocumentChecks } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { SCAN_USER_AGENT } from "./discovery.ts";
import { reportProgress } from "../jobs/activity.ts";
import { sameSite } from "./urls.ts";

/**
 * Documents and links (ARCHITECTURE.md section 9.6, A5), after each full scan: the PDFs a site
 * links to, checked with pdf.js for the basics a screen reader needs, and the site's
 * links to other sites, checked for errors. Plain GETs (HEAD first for links), at most
 * one request a second per host. Not full PDF/UA validation.
 */

type Site = typeof sites.$inferSelect;

export const MAX_DOCUMENTS = 200;
export const MAX_EXTERNAL_LINKS = 500;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const LINK_CACHE_DAYS = 7;
const TIMEOUT_MS = 15_000;
// Reserved names that never resolve, and the documentation domains of RFC 2606: never requested.
const RESERVED = /(\.(example|test|invalid)|(^|\.)example\.(com|net|org))$/i;

export const DOCUMENT_RULES = {
  "pdf-untagged": { title: "Not tagged", severity: "serious", why: "Without tags, screen readers can't tell headings, lists, tables and reading order apart: they read a jumble of text, or nothing.", fix: "Export it again as a tagged PDF (\"Create tagged PDF\" or \"Document structure tags for accessibility\" in Word, InDesign or Google Docs), or fix the tags in Acrobat." },
  "pdf-no-text": { title: "No real text (a scanned image)", severity: "critical", why: "The pages are pictures of text, so screen readers, search and copy can't read them.", fix: "Run OCR (text recognition) on it in Acrobat or another PDF tool, then check and tag the result; better, export it again from the original document." },
  "pdf-no-title": { title: "No document title", severity: "moderate", why: "Screen readers and browser tabs announce the file name instead of what the document is.", fix: "Set the title in the document properties, and choose to show the document title instead of the file name." },
  "pdf-title-hidden": { title: "Shows the file name instead of the title", severity: "minor", why: "The title is set, but viewers are told to show the file name.", fix: "In the document properties (Initial View in Acrobat), show the document title." },
  "pdf-no-lang": { title: "No document language", severity: "moderate", why: "Screen readers don't know which language to read it in, and may mispronounce everything.", fix: "Set the document's language in its properties (Advanced → Reading options in Acrobat)." },
  "pdf-figure-no-alt": { title: "Figures without alternative text", severity: "serious", why: "People who can't see the images miss what they show.", fix: "Add alternative text to each figure (in the source document before export, or with Acrobat's Reading Order tool)." },
  "pdf-no-headings": { title: "No headings", severity: "moderate", why: "In a document of several pages, headings let screen reader users skim and jump to sections.", fix: "Use real heading styles in the source document so they export as heading tags." },
  "pdf-no-bookmarks": { title: "No bookmarks in a long document", severity: "minor", why: "Bookmarks let everyone, and especially keyboard and screen reader users, move around a long document.", fix: "Export bookmarks from the headings (an option in most export dialogs)." },
  "pdf-unlabeled-fields": { title: "Form fields without labels", severity: "serious", why: "Screen readers can't say what a field is for.", fix: "Give each form field a tooltip (its accessible name) in Acrobat's form editor." },
} as const;
export type DocumentRule = keyof typeof DOCUMENT_RULES;

type StructNode = { role?: string; alt?: string; children?: StructNode[] };

function walk(node: StructNode | null | undefined, visit: (n: StructNode) => void) {
  if (!node) return;
  visit(node);
  for (const c of node.children ?? []) walk(c, visit);
}

/** What pdf.js can tell about a PDF's accessibility basics. Reads at most the first 50 pages' text and structure. */
export async function analyzePdf(data: Uint8Array): Promise<DocumentChecks> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
  const doc = await task.promise;
  try {
    const [meta, mark, outline, prefs, fields] = await Promise.all([
      doc.getMetadata().catch(() => null),
      doc.getMarkInfo().catch(() => null),
      doc.getOutline().catch(() => null),
      doc.getViewerPreferences().catch(() => null),
      doc.getFieldObjects().catch(() => null),
    ]);
    const info = (meta?.info ?? {}) as { Title?: string; Language?: string };
    let hasText = false;
    let tagged = Boolean(mark?.Marked);
    let figures = 0;
    let figuresWithoutAlt = 0;
    let headings = 0;
    for (let p = 1; p <= Math.min(doc.numPages, 50); p++) {
      const page = await doc.getPage(p);
      if (!hasText) hasText = (await page.getTextContent()).items.some((i) => "str" in i && i.str.trim().length > 0);
      const tree = (await page.getStructTree().catch(() => null)) as StructNode | null;
      if (tree?.children?.length) tagged = true;
      walk(tree, (n) => {
        if (n.role === "Figure") {
          figures++;
          if (!n.alt?.trim()) figuresWithoutAlt++;
        }
        if (n.role && /^H[1-6]?$/.test(n.role)) headings++;
      });
      page.cleanup();
    }
    const fieldList = Object.values(fields ?? {}).flat() as { alternativeText?: string; type?: string; name?: string }[];
    const inputs = fieldList.filter((f) => f.type !== "button" || f.name);
    return {
      pages: doc.numPages,
      tagged,
      title: info.Title?.trim() || null,
      showsTitle: Boolean((prefs as { DisplayDocTitle?: boolean } | null)?.DisplayDocTitle),
      lang: info.Language?.trim() || null,
      hasText,
      figures,
      figuresWithoutAlt,
      headings,
      bookmarks: outline?.length ?? 0,
      fields: inputs.length,
      unlabeledFields: inputs.filter((f) => !f.alternativeText?.trim()).length,
    };
  } finally {
    await task.destroy();
  }
}

/** The problems a document's checks show. */
export function documentProblems(c: DocumentChecks): DocumentRule[] {
  const out: DocumentRule[] = [];
  if (!c.hasText) out.push("pdf-no-text");
  if (!c.tagged) out.push("pdf-untagged");
  if (!c.title) out.push("pdf-no-title");
  else if (!c.showsTitle) out.push("pdf-title-hidden");
  if (!c.lang) out.push("pdf-no-lang");
  if (c.figuresWithoutAlt > 0) out.push("pdf-figure-no-alt");
  if (c.tagged && c.pages >= 3 && c.headings === 0) out.push("pdf-no-headings");
  if (c.pages >= 20 && c.bookmarks === 0) out.push("pdf-no-bookmarks");
  if (c.unlabeledFields > 0) out.push("pdf-unlabeled-fields");
  return out;
}

// --- The run

/** Waits so each host gets at most one request a second. */
function pacer() {
  const last = new Map<string, number>();
  return async (url: string) => {
    const host = new URL(url).host;
    const wait = (last.get(host) ?? 0) + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last.set(host, Date.now());
  };
}

/** PDFs and other-site links on the site's live pages, each with the pages that link to it. */
async function linkTargets(site: Site) {
  const pages = await getDb()
    .select({ url: sitePages.url, links: sitePages.links })
    .from(sitePages)
    .where(and(eq(sitePages.siteId, site.id), isNull(sitePages.goneAt)));
  const docs = new Map<string, string[]>();
  const external = new Map<string, string[]>();
  for (const p of pages) {
    for (const link of p.links) {
      let u: URL;
      try {
        u = new URL(link);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || RESERVED.test(u.hostname)) continue;
      const map = sameSite(link, site.startUrl) ? (/\.pdf$/i.test(u.pathname) ? docs : null) : external;
      if (!map) continue;
      map.set(link, [...(map.get(link) ?? []), p.url]);
    }
  }
  return { docs: [...docs].slice(0, MAX_DOCUMENTS), external: [...external].slice(0, MAX_EXTERNAL_LINKS) };
}

async function checkDocument(site: Site, url: string, from: string[], pace: (u: string) => Promise<void>) {
  await pace(url);
  const now = new Date();
  const base = { workspaceId: site.workspaceId, siteId: site.id, url, linkedFrom: [...new Set(from)].slice(0, 10), checkedAt: now };
  let row: typeof siteDocuments.$inferInsert;
  try {
    const res = await fetch(url, { headers: { "user-agent": SCAN_USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw Object.assign(new Error(`The document answered HTTP ${res.status}`), { status: res.status });
    const data = new Uint8Array(await res.arrayBuffer());
    if (data.length > MAX_PDF_BYTES) throw new Error("Over 30 MB: check it by hand");
    const checks = await analyzePdf(data);
    row = { ...base, status: "ok", httpStatus: res.status, bytes: data.length, checks, problems: documentProblems(checks), error: null };
  } catch (error) {
    row = { ...base, status: "failed", httpStatus: (error as { status?: number }).status ?? null, bytes: null, checks: null, problems: [], error: error instanceof Error ? error.message : String(error) };
  }
  await getDb()
    .insert(siteDocuments)
    .values(row)
    .onConflictDoUpdate({ target: [siteDocuments.siteId, siteDocuments.url], set: { ...row, workspaceId: undefined, siteId: undefined, url: undefined } });
}

/** HEAD, then GET when a server doesn't answer HEAD properly. A status of 400+ or no answer is broken. */
export async function checkLink(url: string): Promise<{ status: number | null; error: string | null }> {
  const attempt = async (method: "HEAD" | "GET") => {
    const res = await fetch(url, { method, redirect: "follow", headers: { "user-agent": SCAN_USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel().catch(() => {});
    return res.status;
  };
  try {
    const head = await attempt("HEAD");
    if (head < 400 || head === 404 || head === 410) return { status: head, error: null };
    return { status: await attempt("GET"), error: null };
  } catch (error) {
    try {
      return { status: await attempt("GET"), error: null };
    } catch {
      return { status: null, error: error instanceof Error && error.name === "TimeoutError" ? "No answer within 15 seconds" : "Couldn't connect" };
    }
  }
}

export const contentPayload = z.object({ workspaceId: z.guid(), siteId: z.guid() });

/** After a full scan, or Check now: the site's PDFs and external links. */
export async function runContentCheck(ctx: AiContext, payload: z.infer<typeof contentPayload>) {
  const db = getDb();
  const [site] = await db.select().from(sites).where(and(eq(sites.id, payload.siteId), eq(sites.workspaceId, payload.workspaceId)));
  if (!site) return { skipped: "site removed" };
  const { docs, external } = await linkTargets(site);
  const pace = pacer();
  let done = 0;
  const total = docs.length + external.length;
  for (const [url, from] of docs) {
    ctx.signal?.throwIfAborted();
    await checkDocument(site, url, from, pace);
    await reportProgress(ctx.jobRunId, { siteId: site.id, pagesDone: ++done, pagesTotal: total, url });
  }
  // Documents no longer linked from any page.
  const keepDocs = new Set(docs.map(([u]) => u));
  const staleDocs = (await db.select({ id: siteDocuments.id, url: siteDocuments.url }).from(siteDocuments).where(eq(siteDocuments.siteId, site.id))).filter((d) => !keepDocs.has(d.url));
  if (staleDocs.length) await db.delete(siteDocuments).where(inArray(siteDocuments.id, staleDocs.map((d) => d.id)));

  // External links, checked again after a week; hosts in parallel, one request a second each.
  const fresh = new Date(Date.now() - LINK_CACHE_DAYS * 86_400_000);
  const cached = new Map((await db.select().from(siteLinks).where(eq(siteLinks.siteId, site.id))).map((l) => [l.url, l]));
  const byHost = new Map<string, [string, string[]][]>();
  for (const entry of external) byHost.set(new URL(entry[0]).host, [...(byHost.get(new URL(entry[0]).host) ?? []), entry]);
  const hosts = [...byHost.values()];
  const work = async (list: [string, string[]][]) => {
    for (const [url, from] of list) {
      ctx.signal?.throwIfAborted();
      const known = cached.get(url);
      const linkedFrom = [...new Set(from)].slice(0, 10);
      if (known && known.checkedAt > fresh) {
        await db.update(siteLinks).set({ linkedFrom }).where(eq(siteLinks.id, known.id));
      } else {
        await pace(url);
        const result = await checkLink(url);
        await db
          .insert(siteLinks)
          .values({ workspaceId: site.workspaceId, siteId: site.id, url, httpStatus: result.status, error: result.error, linkedFrom, checkedAt: new Date() })
          .onConflictDoUpdate({ target: [siteLinks.siteId, siteLinks.url], set: { httpStatus: result.status, error: result.error, linkedFrom, checkedAt: new Date() } });
      }
      await reportProgress(ctx.jobRunId, { siteId: site.id, pagesDone: ++done, pagesTotal: total, url });
    }
  };
  for (let i = 0; i < hosts.length; i += 4) await Promise.all(hosts.slice(i, i + 4).map(work));
  const keepLinks = new Set(external.map(([u]) => u));
  const staleLinks = (await db.select({ id: siteLinks.id, url: siteLinks.url }).from(siteLinks).where(eq(siteLinks.siteId, site.id))).filter((l) => !keepLinks.has(l.url));
  if (staleLinks.length) await db.delete(siteLinks).where(inArray(siteLinks.id, staleLinks.map((l) => l.id)));
  // Old cache rows go too (the cache is only for links still on the site).
  await db.delete(siteLinks).where(and(eq(siteLinks.siteId, site.id), lt(siteLinks.checkedAt, new Date(Date.now() - 30 * 86_400_000))));
  await db.update(sites).set({ contentCheckedAt: new Date() }).where(eq(sites.id, site.id));
  return { documents: docs.length, links: external.length };
}

export async function queueContentCheck(site: Pick<Site, "id" | "workspaceId" | "startUrl">): Promise<boolean> {
  if (process.env.STARTICA_DEMO === "1" || RESERVED.test(new URL(site.startUrl).hostname)) return false;
  if (await jobByPayload(site.workspaceId, ["site_content_check"], "siteId", site.id)) return false;
  await enqueue(site.workspaceId, "site_content_check", { siteId: site.id });
  return true;
}

/** Broken external links: an error, or a status of 400 or more. 401/403/429 are listed as "couldn't check" (the site refused the robot). */
export const isBroken = (l: { httpStatus: number | null; error: string | null }) => l.error !== null || (l.httpStatus !== null && l.httpStatus >= 400 && ![401, 403, 429].includes(l.httpStatus));
export const isRefused = (l: { httpStatus: number | null }) => l.httpStatus !== null && [401, 403, 429].includes(l.httpStatus);
