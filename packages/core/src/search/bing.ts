import { z } from "zod";
import type { SearchRow } from "./search-console.ts";

/**
 * Bing Webmaster Tools (ARCHITECTURE.md section 10.2), with the user's API key. Daily clicks and
 * impressions for the site (Bing search and Copilot together; Bing doesn't split them),
 * and top queries and pages, which Bing updates weekly. Checked 2026-10-12: only the JSON
 * API remains (SOAP and POX were retired on 2026-08-31).
 */

export const bingConfig = z.object({ siteUrl: z.url() });

const g = globalThis as { __starticaBingBase?: string };
export function setBingApiBase(base: string | null): void {
  g.__starticaBingBase = base ?? undefined;
}
// Never in the installed app: the API key only ever goes to Bing.
const testBase = () => (process.env.STARTICA_PACKAGED === "1" ? undefined : process.env.STARTICA_BING_API_BASE);
const base = () => g.__starticaBingBase ?? testBase() ?? "https://ssl.bing.com/webmaster/api.svc/json";

/** Bing writes dates as /Date(1316156400000-0700)/: milliseconds since the epoch, then an offset. */
export function bingDay(value: string): string | null {
  const ms = /\/Date\((-?\d+)/.exec(value)?.[1];
  return ms ? new Date(Number(ms)).toISOString().slice(0, 10) : null;
}

const ERRORS: Record<number, string> = {
  3: "Bing refused the API key. Generate a new one in Bing Webmaster Tools → Settings → API access.",
  4: "Bing is limiting requests from this key right now. Startica tries again on the next sync.",
  5: "Bing is limiting requests for this site right now. Startica tries again on the next sync.",
  14: "This Bing account can't read that site. Add and verify the site in Bing Webmaster Tools with the account the key belongs to.",
};

async function call<T>(method: string, apiKey: string, params: Record<string, string>, signal?: AbortSignal): Promise<T[]> {
  const url = new URL(`${base()}/${method}`);
  url.searchParams.set("apikey", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal });
  const body = (await res.json().catch(() => ({}))) as { d?: T[]; ErrorCode?: number; Message?: string };
  if (!res.ok || body.ErrorCode) throw new Error(ERRORS[body.ErrorCode ?? 0] ?? `Bing Webmaster Tools: ${body.Message ?? `HTTP ${res.status}`}`);
  return body.d ?? [];
}

type Stats = { Date: string; Clicks: number; Impressions: number; Query?: string; AvgImpressionPosition?: number };

/** The verified sites the key can read. */
export async function bingSites(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const sites = await call<{ Url: string; IsVerified: boolean }>("GetUserSites", apiKey, {}, signal);
  return sites.filter((s) => s.IsVerified).map((s) => s.Url);
}

/** Checks the key can read the site, with an error that says how to fix it. */
export async function checkBingSite(apiKey: string, siteUrl: string, signal?: AbortSignal): Promise<void> {
  const sites = await bingSites(apiKey, signal);
  const same = (a: string) => a.replace(/\/$/, "").toLowerCase() === siteUrl.replace(/\/$/, "").toLowerCase();
  if (!sites.some(same)) {
    throw new Error(
      sites.length
        ? `The Bing key can't read ${siteUrl}. Its verified sites: ${sites.join(", ")}.`
        : "The Bing key has no verified sites. Add and verify the site in Bing Webmaster Tools first.",
    );
  }
}

export async function fetchBingRows(apiKey: string, siteUrl: string, since: string, signal?: AbortSignal): Promise<SearchRow[]> {
  await checkBingSite(apiKey, siteUrl, signal);
  const out: SearchRow[] = [];
  const add = (kind: SearchRow["kind"], rows: Stats[]) => {
    for (const r of rows) {
      const day = bingDay(r.Date);
      if (!day || day < since) continue;
      const position = r.AvgImpressionPosition && r.AvgImpressionPosition > 0 ? r.AvgImpressionPosition : 0;
      out.push({ day, kind, key: kind === "total" ? "" : (r.Query ?? ""), clicks: r.Clicks ?? 0, impressions: r.Impressions ?? 0, position });
    }
  };
  add("total", await call<Stats>("GetRankAndTrafficStats", apiKey, { siteUrl }, signal));
  add("query", await call<Stats>("GetQueryStats", apiKey, { siteUrl }, signal));
  add("page", await call<Stats>("GetPageStats", apiKey, { siteUrl }, signal));
  return out;
}
