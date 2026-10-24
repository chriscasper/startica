import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { communities as communitiesTable, competitors, offsitePages, products } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { allowedPublicUrl, allowLocalPublicFetch, publicGet, resolvesPublicHost } from "../net/public-fetch.ts";
export { privateAddress } from "../net/address.ts";
import { visibleText } from "../agents/checks.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { parseRobots, robotsAllows } from "../seo/robots.ts";
import { namesProduct, productNames } from "../visibility/analysis.ts";
import { citedDomains, domainOf } from "./domains.ts";

/**
 * Reads the pages AI answers cite to see whether the product and its competitors appear on
 * them (ARCHITECTURE.md section 10.4). These are other people's sites, reached from URLs an AI
 * wrote, so: public http(s) on the standard ports only, robots.txt respected, one page at
 * a time with a pause per site, a few pages per site, nothing re-read within a week.
 */

export const OFFSITE_USER_AGENT = "StarticaOffsiteCheck/0.1 (+https://mystartica.com; reads pages AI answers cite, for the product's owner)";
const ROBOTS_TOKEN = "StarticaOffsiteCheck";
const MAX_PAGES = 30;
const PER_DOMAIN = 3;
const FRESH_DAYS = 7;
const MAX_BYTES = 1_000_000;

/** Tests read pages from a server on 127.0.0.1, and only from it (the shared public fetch's test mode). */
export const allowLocalOffsite = allowLocalPublicFetch;
/** Whether Startica may request this URL at all: public http(s), standard port, a real name. */
export const allowedOffsite = allowedPublicUrl;

const get = async (url: string, signal?: AbortSignal) =>
  publicGet(url, { userAgent: OFFSITE_USER_AGENT, accept: "text/html,text/plain;q=0.9,*/*;q=0.5", maxBytes: MAX_BYTES, signal });

export const offsiteCheckPayload = z.object({ workspaceId: z.guid(), productId: z.guid() });

export async function runOffsiteCheck(ctx: AiContext, payload: z.infer<typeof offsiteCheckPayload>, opts: { pauseMs?: number } = {}) {
  const db = getDb();
  const [product] = await db.select({ name: products.name, url: products.url, workspaceId: products.workspaceId }).from(products).where(eq(products.id, payload.productId));
  if (!product) return { skipped: "product deleted" };
  const names = productNames(product.name, product.url);
  const comps = (await db.select({ name: competitors.name }).from(competitors).where(eq(competitors.productId, payload.productId))).map((c) => c.name);
  const { domains } = await citedDomains(payload.productId);
  const freshSince = Date.now() - FRESH_DAYS * 86400_000;

  // The most useful pages first: domains in their ranked order, their most-cited pages.
  // Read and robots-blocked pages rest for a week; failed ones are tried again on the next run.
  const due = (p: (typeof domains)[number]["pages"][number]) => allowedOffsite(p.url) && !(p.read && p.read.status !== "failed" && p.read.checkedAt.getTime() > freshSince);
  const todo = domains
    .filter((d) => d.kind !== "own")
    .flatMap((d) => d.pages.filter(due).slice(0, PER_DOMAIN))
    .slice(0, MAX_PAGES);

  const robots = new Map<string, ReturnType<typeof parseRobots> | "unreachable">();
  const lastHit = new Map<string, number>();
  let read = 0;
  for (const page of todo) {
    ctx.signal?.throwIfAborted();
    const u = new URL(page.url);
    const domain = domainOf(page.url)!;
    // The name itself first: a page on a name that resolves to a private address is never read (not even its robots.txt).
    if (!(await resolvesPublicHost(u.hostname))) {
      await save({ workspaceId: product.workspaceId, productId: payload.productId, url: page.url, domain, checkedAt: new Date(), status: "failed", title: page.title, httpStatus: null, mentionsProduct: false, competitors: [], error: "Startica doesn't read this address (its name points to a private or reserved address)" });
      continue;
    }
    if (!robots.has(u.origin)) {
      // RFC 9309: a missing robots.txt (4xx) allows everything; one that can't be reached (5xx, network) allows nothing.
      const r = await get(`${u.origin}/robots.txt`, ctx.signal);
      robots.set(u.origin, r && r.status === 200 ? parseRobots(r.text) : r && r.status >= 400 && r.status < 500 ? [] : "unreachable");
    }
    const groups = robots.get(u.origin)!;
    const values = { workspaceId: product.workspaceId, productId: payload.productId, url: page.url, domain, checkedAt: new Date() };
    if (groups === "unreachable" || !robotsAllows(groups, ROBOTS_TOKEN, `${u.pathname}${u.search}`)) {
      await save({ ...values, status: "blocked_by_robots", title: page.title, httpStatus: null, mentionsProduct: false, competitors: [], error: groups === "unreachable" ? "Its robots.txt couldn't be read" : null });
      continue;
    }
    const wait = (lastHit.get(u.origin) ?? 0) + (opts.pauseMs ?? 1500) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastHit.set(u.origin, Date.now());
    const res = await get(page.url, ctx.signal);
    if (!res || res.status >= 400) {
      await save({ ...values, status: "failed", title: page.title, httpStatus: res?.status ?? null, mentionsProduct: false, competitors: [], error: res ? `HTTP ${res.status}` : "Couldn't load the page" });
      continue;
    }
    const text = visibleText(res.text);
    const title = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(res.text)?.[1]?.trim() || page.title;
    await save({
      ...values,
      status: "read",
      title,
      httpStatus: res.status,
      mentionsProduct: namesProduct(text, names),
      competitors: comps.filter((c) => namesProduct(text, [c])),
      error: null,
    });
    read++;
  }
  return { read, checked: todo.length };
}

async function save(values: typeof offsitePages.$inferInsert) {
  await getDb()
    .insert(offsitePages)
    .values(values)
    .onConflictDoUpdate({
      target: [offsitePages.productId, offsitePages.url],
      set: {
        status: values.status,
        title: values.title,
        httpStatus: values.httpStatus,
        mentionsProduct: values.mentionsProduct,
        competitors: values.competitors,
        error: values.error,
        checkedAt: values.checkedAt,
      },
    });
}

/** Queues a read of the cited pages unless one is waiting: after an AI visibility run, and on Check now. */
export async function queueOffsiteCheck(workspaceId: string, productId: string): Promise<void> {
  if (await jobByPayload(workspaceId, ["offsite_check"], "productId", productId)) return;
  await enqueue(workspaceId, "offsite_check", { productId });
}

/** Adds a subreddit to the Inbox's watched communities (the owner clicked Watch). */
export async function watchSubreddit(scope: { workspaceId: string; productId: string }, name: string, why: string): Promise<void> {
  const clean = name.replace(/^\/?r\//i, "");
  if (!/^[A-Za-z0-9_]{2,21}$/.test(clean)) throw new Error("Not a subreddit name");
  const db = getDb();
  const [existing] = await db
    .select()
    .from(communitiesTable)
    .where(and(eq(communitiesTable.productId, scope.productId), eq(communitiesTable.channel, "reddit"), eq(communitiesTable.name, clean)));
  if (existing) await db.update(communitiesTable).set({ status: "watching" }).where(eq(communitiesTable.id, existing.id));
  else await db.insert(communitiesTable).values({ ...scope, channel: "reddit", name: clean, url: `https://www.reddit.com/r/${clean}/`, why, status: "watching", source: "owner" });
}

