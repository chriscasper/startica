import { z } from "zod";
import { SYNC_DAYS, type MetricRow } from "./types.ts";

/**
 * Umami (ARCHITECTURE.md section 8.2): visits, visitors, sources, pages, tracking links and custom
 * events, as the same metric rows GA4 writes, so every screen reads either. Umami Cloud
 * (https://api.umami.is/v1) and self-hosted Umami v3 (<host>/api), with an API key
 * (Authorization: Bearer; self-hosted from v3.4), or a username and password for older
 * self-hosted installs. Checked against Umami v3.4.0 on 2026-10-13.
 */

export const umamiConfig = z.object({
  /** https://api.umami.is/v1 for Umami Cloud, or https://<your host>/api. */
  baseUrl: z.url(),
  websiteId: z.string().regex(/^[0-9a-f-]{36}$/i, "Umami website IDs look like 4fb7a6c2-…"),
  /** Custom events that count as key events (conversions); empty: every custom event. */
  keyEvents: z.array(z.string()).default([]),
});
export type UmamiConfig = z.infer<typeof umamiConfig>;

export const UMAMI_CLOUD = "https://api.umami.is/v1";

/** What someone types: "cloud", a cloud.umami.is link, or their own Umami's address. */
export function normalizeUmamiUrl(input: string): string {
  const v = input.trim().replace(/\/+$/, "");
  if (!v || /^(umami\s*)?cloud$/i.test(v) || /(^|\/\/)(cloud|api)\.umami\.is(\/|$)/i.test(v)) return UMAMI_CLOUD;
  const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  return url.pathname.replace(/\/+$/, "").endsWith("/api") ? `${url.origin}${url.pathname.replace(/\/+$/, "")}` : `${url.origin}/api`;
}

// Umami Cloud allows 50 calls per 15 seconds per key: stay under it.
const GAP_MS = 320;
const g = globalThis as { __starticaUmamiGap?: number };
export function setUmamiGap(ms: number | null): void {
  g.__starticaUmamiGap = ms ?? undefined;
}

type Client = { get<T>(path: string, params?: Record<string, string | number>): Promise<T> };

/** An Umami API error with its HTTP status, so optional breakdowns can be skipped on old versions. */
export class UmamiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A client for one key: API keys go as a Bearer token; "username:password" logs in first (older self-hosted). */
export async function umamiClient(baseUrl: string, secret: string, signal?: AbortSignal): Promise<Client> {
  let token = secret.trim();
  let last = 0;
  const call = async (path: string, init: RequestInit = {}) => {
    const wait = last + (g.__starticaUmamiGap ?? GAP_MS) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { accept: "application/json", ...(init.headers ?? {}) }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
    const body = (await res.json().catch(() => null)) as unknown;
    if (res.status === 401 || res.status === 403) throw new UmamiError("Umami refused the credentials: create a new API key in Umami (Settings → API keys), or check the username and password.", res.status);
    if (res.status === 404) throw new UmamiError(/^\/websites\/[^/]+$/.test(path.split("?")[0]!) ? "Umami has no website with that ID for these credentials (or the server address isn't your Umami). Copy the Website ID from Umami: Settings → Websites → Edit; a view-only user only sees websites that belong to a team it's in." : `Umami didn't find ${path.split("?")[0]}: check the server address, or update Umami.`, 404);
    if (res.status === 429) throw new UmamiError("Umami is limiting requests right now; Startica tries again on the next sync.", 429);
    if (!res.ok) {
      // Umami answers errors as {"error": {"code", "message"}} (older versions: {"error": "…"} or {"message": "…"}).
      const b = body as { message?: string; error?: string | { message?: string } } | null;
      const message = (typeof b?.error === "object" ? b.error?.message : b?.error) ?? b?.message ?? `HTTP ${res.status}`;
      throw new UmamiError(`Umami: ${message}`, res.status);
    }
    if (body === null) throw new UmamiError("That address didn't answer like Umami's API: check the server address (Startica adds /api to your own Umami's address).", 0);
    return body;
  };
  if (!/^umami_/.test(token) && token.includes(":") && baseUrl !== UMAMI_CLOUD) {
    const i = token.indexOf(":");
    const login = (await call("/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: token.slice(0, i), password: token.slice(i + 1) }) })) as { token?: string; requiresTwoFactor?: boolean };
    if (login?.requiresTwoFactor) throw new UmamiError("This Umami user signs in with two-factor authentication, which Startica can't do. Use an API key (Umami 3.4 or later), or a separate view-only user without two-factor.", 401);
    if (!login?.token) throw new UmamiError("Umami didn't accept the username and password.", 401);
    token = login.token;
  }
  return {
    get: async <T>(path: string, params: Record<string, string | number> = {}) => {
      const q = new URLSearchParams(Object.entries(params).map(([k, v]): [string, string] => [k, String(v)]));
      return (await call(`${path}${q.size ? `?${q}` : ""}`, { headers: { authorization: `Bearer ${token}` } })) as T;
    },
  };
}

/** Checks the credentials can read the website; returns its name. */
export async function checkUmami(config: UmamiConfig, secret: string, signal?: AbortSignal): Promise<string> {
  const client = await umamiClient(config.baseUrl, secret, signal);
  const site = await client.get<{ id?: string; name?: string; domain?: string }>(`/websites/${config.websiteId}`);
  if (site?.id !== config.websiteId) throw new UmamiError("That address didn't answer like Umami's API: check the server address.", 0);
  return site.name || site.domain || config.websiteId;
}

// Search engines' referrer domains count as organic search, like GA4's "organic" medium.
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|yahoo\.co\.jp|ecosia\.org|yandex\.[a-z.]+|baidu\.com|search\.brave\.com|startpage\.com|qwant\.com|kagi\.com|naver\.com)$/i;

/** GA4-style "source / medium" from an Umami referrer domain. */
export function sourceDimension(referrer: string): string {
  const host = referrer.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return "source:(direct) / (none)";
  const search = SEARCH.exec(host);
  // The engine's name: google.co.uk → google, search.yahoo.com → yahoo, search.brave.com → brave.
  if (search) return `source:${search[2]!.split(".").find((label) => label !== "search")} / organic`;
  return `source:${host} / referral`;
}

const num = (v: unknown) => Number(typeof v === "object" && v !== null && "value" in v ? (v as { value: unknown }).value : v) || 0;
const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Expanded = { name?: string | null; visits?: unknown; visitors?: unknown }[];

/** The last SYNC_DAYS days, one local day at a time (Umami can't group breakdowns by day). */
export async function fetchUmamiMetrics(config: UmamiConfig, secret: string, opts: { now?: Date; signal?: AbortSignal; days?: number } = {}): Promise<MetricRow[]> {
  const client = await umamiClient(config.baseUrl, secret, opts.signal);
  const site = `/websites/${config.websiteId}`;
  const now = opts.now ?? new Date();
  const days = opts.days ?? SYNC_DAYS;
  const tz = timezone();
  const out: MetricRow[] = [];
  const optional = async <T>(path: string, params: Record<string, string | number>): Promise<T | null> => {
    try {
      return await client.get<T>(path, params);
    } catch (err) {
      // Breakdowns an older Umami doesn't have (utm types before v3.1, attribution) answer 400 or 404 and are skipped;
      // credentials, rate limits and server errors stop the sync.
      if (err instanceof UmamiError && (err.status === 400 || err.status === 404)) return null;
      throw err;
    }
  };

  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const window = { startAt: start.getTime(), endAt: end.getTime() - 1, timezone: tz };
    const day = isoLocal(start);
    const stats = await client.get<Record<string, unknown>>(`${site}/stats`, window);
    const visits = num(stats.visits);
    out.push({ day, metric: "sessions", value: visits }, { day, metric: "users", value: num(stats.visitors) }, { day, metric: "pageviews", value: num(stats.pageviews) });
    if (visits === 0) continue; // nothing to break down
    const expanded = async (type: string, dimension: (name: string) => string | null) => {
      const rows = await optional<Expanded>(`${site}/metrics/expanded`, { ...window, type, limit: 500 });
      let total = 0;
      for (const r of rows ?? []) {
        const d = dimension(String(r.name ?? ""));
        if (d) out.push({ day, metric: "sessions", dimension: d, value: num(r.visits) });
        total += num(r.visits);
      }
      return rows ? total : null;
    };
    // Umami's referrer breakdown leaves out visits without a referrer: those are direct.
    const referred = await expanded("referrer", sourceDimension);
    if (referred !== null && visits > referred) out.push({ day, metric: "sessions", dimension: "source:(direct) / (none)", value: visits - referred });
    await expanded("path", (p) => (p ? `page:${p.split(/[?#]/)[0] || "/"}` : null));
    await expanded("utmContent", (c) => (c ? `utm_content:${c}` : null));
  }

  // Custom events by name per day, in one call; key events are the chosen ones (or all).
  const startAll = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  const series = (await optional<{ x: string; t: string; y: unknown }[]>(`${site}/events/series`, { startAt: startAll.getTime(), endAt: now.getTime(), unit: "day", timezone: tz })) ?? [];
  const keys = new Set(config.keyEvents);
  const keyByDay = new Map<string, number>();
  for (const e of series) {
    const day = String(e.t).slice(0, 10);
    const count = num(e.y);
    out.push({ day, metric: "key_events", dimension: `event:${e.x}`, value: count });
    if (keys.size === 0 || keys.has(e.x)) keyByDay.set(day, (keyByDay.get(day) ?? 0) + count);
  }
  // Every day gets a total, zero included, so changing the key events replaces old totals.
  for (let i = days - 1; i >= 0; i--) {
    const day = isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i));
    out.push({ day, metric: "key_events", value: keyByDay.get(day) ?? 0 });
  }

  // Key events per tracking link (first click), only for chosen key events and days with tagged visits.
  if (keys.size) {
    const tagged = [...new Set(out.filter((r) => r.dimension?.startsWith("utm_content:")).map((r) => r.day))];
    for (const day of tagged) {
      const [y, m, d] = day.split("-").map(Number) as [number, number, number];
      const start = new Date(y, m - 1, d);
      const window = { startAt: start.getTime(), endAt: new Date(y, m - 1, d + 1).getTime() - 1, timezone: tz };
      const byContent = new Map<string, number>();
      for (const event of keys) {
        const a = await optional<{ utm_content?: { name: string; value: unknown }[] }>(`${site}/attribution`, { ...window, model: "first-click", type: "event", step: event });
        for (const r of a?.utm_content ?? []) byContent.set(r.name, (byContent.get(r.name) ?? 0) + num(r.value));
      }
      for (const [content, value] of byContent) out.push({ day, metric: "key_events", dimension: `utm_content:${content}`, value });
    }
  }
  return out;
}
