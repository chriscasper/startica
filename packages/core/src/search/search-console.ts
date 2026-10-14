import { z } from "zod";
import type { SearchKind } from "@startica/db/schema";
import { accessToken, searchConsoleUrl, SEARCH_SCOPE, type ServiceAccount } from "./google.ts";

/** Google Search Console's Search Analytics and Sitemaps APIs (ARCHITECTURE.md section 10.2). */

export const searchConsoleConfig = z.object({
  /** The property: `sc-domain:example.com` or a URL prefix such as `https://example.com/`. */
  siteUrl: z.string().min(1),
  /** Read the key from the product's GA4 connection instead of a key of its own. */
  useGa4Key: z.boolean().optional(),
});

/** Search Console keeps 16 months of data. */
export const HISTORY_DAYS = 486;
/** Recent days are re-read on every sync: Google revises them for a few days. */
export const REFRESH_DAYS = 5;
const ROW_LIMIT = 25_000;
/** At most this many rows per dimension and month, so a huge site can't stall the app. */
const MAX_ROWS = 200_000;

export type SearchRow = { day: string; kind: SearchKind; key: string; clicks: number; impressions: number; position: number };

export type Sitemap = { path: string; lastSubmitted: string | null; lastDownloaded: string | null; isPending: boolean; errors: number; warnings: number; submitted: number | null };

/** Turns what the user typed into a property: a bare domain becomes a Domain property. */
export function normalizeProperty(input: string): string {
  const v = input.trim();
  if (/^sc-domain:/i.test(v)) return `sc-domain:${v.slice(10).trim().toLowerCase()}`;
  if (/^https?:\/\//i.test(v)) return v.endsWith("/") ? v : `${v}/`;
  return `sc-domain:${v.replace(/\/.*$/, "").toLowerCase()}`;
}

async function call<T>(key: ServiceAccount, path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = await accessToken(key, SEARCH_SCOPE, init.signal);
  const res = await fetch(`${searchConsoleUrl()}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string } };
  const reason = body.error?.message ?? "";
  if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(`${reason} ${body.error?.status ?? ""}`)) {
    throw new Error(
      `The Google Search Console API isn't turned on for the service account's Google Cloud project. Enable it in Google Cloud Console → APIs & Services → Library → Google Search Console API, then sync again. (${reason})`,
    );
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error(
      `Search Console didn't let the service account read this property (${body.error?.message ?? `HTTP ${res.status}`}). In Search Console, open Settings → Users and permissions and add ${key.client_email}.`,
    );
  }
  if (!res.ok) throw new Error(`Search Console: ${body.error?.message ?? `HTTP ${res.status}`}`);
  return body;
}

const site = (siteUrl: string) => `/sites/${encodeURIComponent(siteUrl)}`;

/** The properties the service account can read, with its permission on each. */
export async function listProperties(key: ServiceAccount, signal?: AbortSignal): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const body = await call<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(key, "/sites", { signal });
  return (body.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

/** The Domain property that covers a URL-prefix property: https://www.example.com/ → sc-domain:example.com. */
export function domainPropertyFor(siteUrl: string): string | null {
  if (!/^https?:\/\//i.test(siteUrl)) return null;
  try {
    return `sc-domain:${new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "")}`;
  } catch {
    return null;
  }
}

/**
 * Checks the key can read the property and returns the property to use: the one asked
 * for, or the site's Domain property when that's what the account can read (it covers
 * every URL prefix of the site). Otherwise an error that says how to fix it.
 */
export async function checkProperty(key: ServiceAccount, siteUrl: string, signal?: AbortSignal): Promise<string> {
  const properties = await listProperties(key, signal);
  if (properties.some((p) => p.siteUrl === siteUrl)) return siteUrl;
  const domain = domainPropertyFor(siteUrl);
  if (domain && properties.some((p) => p.siteUrl === domain)) return domain;
  const others = properties.map((p) => p.siteUrl);
  throw new Error(
    others.length
      ? `The service account can't read ${siteUrl}. It can read: ${others.join(", ")}. Use one of those, or add ${key.client_email} to ${siteUrl} in Search Console.`
      : `The service account can't read any Search Console property yet. In Search Console, open Settings → Users and permissions for ${siteUrl} and add ${key.client_email}.`,
  );
}

type ApiRow = { keys?: string[]; clicks?: number; impressions?: number; position?: number };

/** One dimension (or the totals) by day, from `start` to `end`, page by page. */
async function queryByDay(key: ServiceAccount, siteUrl: string, kind: SearchKind, start: string, end: string, signal?: AbortSignal): Promise<SearchRow[]> {
  const dimensions = kind === "total" ? ["date"] : ["date", kind];
  const out: SearchRow[] = [];
  for (let startRow = 0; startRow < MAX_ROWS; startRow += ROW_LIMIT) {
    const body = await call<{ rows?: ApiRow[] }>(key, `${site(siteUrl)}/searchAnalytics/query`, {
      method: "POST",
      body: { startDate: start, endDate: end, dimensions, type: "web", dataState: "all", rowLimit: ROW_LIMIT, startRow },
      signal,
    });
    const rows = body.rows ?? [];
    for (const r of rows) {
      const [day = "", value = ""] = r.keys ?? [];
      out.push({ day, kind, key: kind === "device" ? value.toLowerCase() : value, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 });
    }
    if (rows.length < ROW_LIMIT) break;
  }
  return out;
}

/** The range in windows of `days` days, newest first, so a row cap never drops the latest days. */
export function windows(start: string, end: string, days = 31): { start: string; end: string }[] {
  const out: { start: string; end: string }[] = [];
  let to = new Date(`${end}T00:00:00Z`);
  const from = new Date(`${start}T00:00:00Z`);
  while (to >= from) {
    const begin = new Date(Math.max(from.getTime(), to.getTime() - (days - 1) * 86400_000));
    out.push({ start: begin.toISOString().slice(0, 10), end: to.toISOString().slice(0, 10) });
    to = new Date(begin.getTime() - 86400_000);
  }
  return out;
}

export async function fetchSearchRows(key: ServiceAccount, siteUrl: string, start: string, end: string, signal?: AbortSignal): Promise<SearchRow[]> {
  const kinds: SearchKind[] = ["total", "query", "page", "country", "device"];
  const out: SearchRow[] = [];
  // One request at a time (Search Console limits queries per site per second), a month at a time.
  for (const w of windows(start, end)) for (const kind of kinds) out.push(...(await queryByDay(key, siteUrl, kind, w.start, w.end, signal)));
  return out;
}

export async function fetchSitemaps(key: ServiceAccount, siteUrl: string, signal?: AbortSignal): Promise<Sitemap[]> {
  type Api = { path: string; lastSubmitted?: string; lastDownloaded?: string; isPending?: boolean; errors?: string; warnings?: string; contents?: { submitted?: string }[] };
  const body = await call<{ sitemap?: Api[] }>(key, `${site(siteUrl)}/sitemaps`, { signal });
  return (body.sitemap ?? []).map((s) => ({
    path: s.path,
    lastSubmitted: s.lastSubmitted ?? null,
    lastDownloaded: s.lastDownloaded ?? null,
    isPending: Boolean(s.isPending),
    errors: Number(s.errors ?? 0),
    warnings: Number(s.warnings ?? 0),
    submitted: s.contents?.length ? s.contents.reduce((n, c) => n + Number(c.submitted ?? 0), 0) : null,
  }));
}

/** The top queries a page was found for, for drafting its title and description. */
export async function fetchPageQueries(key: ServiceAccount, siteUrl: string, page: string, start: string, end: string, signal?: AbortSignal): Promise<{ query: string; clicks: number; impressions: number; position: number }[]> {
  const body = await call<{ rows?: ApiRow[] }>(key, `${site(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    body: {
      startDate: start,
      endDate: end,
      dimensions: ["query"],
      type: "web",
      dataState: "all",
      rowLimit: 15,
      dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: page }] }],
    },
    signal,
  });
  return (body.rows ?? []).map((r) => ({ query: r.keys?.[0] ?? "", clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 })).filter((r) => r.query);
}
