import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { securityOccurrences, sites, type NoScanWindow, type SignedInCheck } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { reportProgress } from "../jobs/activity.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { getScanner, profileTags, scanRequest } from "../a11y/scanner.ts";
import { NO_SCANNER } from "../a11y/scan.ts";
import { pageSecurityFindings } from "./checks.ts";
import { finishSecurity, isVerified } from "./findings.ts";

/**
 * S3, deeper coverage (ARCHITECTURE.md section 11.5): the same passive page checks on pages
 * behind sign-in, in a browser session the owner signed in to by hand (Startica never types a
 * password or submits a form), plus the safety controls: extra hosts the sign-in may pass
 * through, and no-scan windows. The session lives in the browser profile (Electron's
 * `persist:signin-<site>` partition); Startica's database never holds it: the scanner answers
 * with cookie names and flags only.
 */

type Site = typeof sites.$inferSelect;

export const MAX_SIGNED_IN_PAGES = 20;
export const MAX_EXTRA_HOSTS = 5;
export const MAX_NO_SCAN_WINDOWS = 7;
/** One signed-in page a second at most, like the crawl. */
const GAP_MS = 1000;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

// --- No-scan windows -------------------------------------------------------------------------

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

/**
 * Parses one window per line: days, then a time range, e.g. "Mon-Fri 09:00-17:00",
 * "Sat,Sun 00:00-23:59", "daily 22:00-06:00" (past midnight). Throws with the line it can't read.
 */
export function parseNoScanWindows(text: string): NoScanWindow[] {
  const out: NoScanWindow[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    const m = /^(.+?)\s+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(line);
    if (!m || !HHMM.test(m[2]!) || !HHMM.test(m[3]!)) throw new Error(`Couldn't read "${raw.trim()}": write days and a time range, like "Mon-Fri 09:00-17:00"`);
    const days = new Set<number>();
    for (const part of m[1]!.split(/\s*,\s*/)) {
      if (part === "daily" || part === "every day") [0, 1, 2, 3, 4, 5, 6].forEach((d) => days.add(d));
      else if (part === "weekdays") [1, 2, 3, 4, 5].forEach((d) => days.add(d));
      else if (part === "weekends") [0, 6].forEach((d) => days.add(d));
      else {
        const [a, b] = part.split(/\s*-\s*/).map((d) => DAY_NAMES.indexOf(d.slice(0, 3)));
        if (a === undefined || a < 0 || (b !== undefined && b < 0)) throw new Error(`Couldn't read the days in "${raw.trim()}": use Mon, Tue… or daily, weekdays, weekends`);
        for (let d = a; ; d = (d + 1) % 7) {
          days.add(d);
          if (b === undefined || d === b) break;
        }
      }
    }
    const pad = (t: string) => t.padStart(5, "0");
    out.push({ days: [...days].sort(), from: pad(m[2]!), to: pad(m[3]!) });
  }
  if (out.length > MAX_NO_SCAN_WINDOWS) throw new Error(`At most ${MAX_NO_SCAN_WINDOWS} windows`);
  return out;
}

/** The windows as the owner would write them. */
export function formatNoScanWindows(windows: NoScanWindow[]): string {
  const days = (d: number[]) => {
    const key = d.join(",");
    if (key === "0,1,2,3,4,5,6") return "daily";
    if (key === "1,2,3,4,5") return "Mon-Fri";
    if (key === "0,6") return "Sat,Sun";
    return d.map((x) => DAY_LABELS[x]).join(",");
  };
  return windows.map((w) => `${days(w.days)} ${w.from}-${w.to}`).join("\n");
}

/** The window `now` (local time) falls in, if any. A window whose end is before its start runs past midnight into the next day. */
export function activeNoScanWindow(windows: NoScanWindow[], now = new Date()): NoScanWindow | null {
  const day = now.getDay();
  const t = now.getHours() * 60 + now.getMinutes();
  for (const w of windows) {
    const [from, to] = [minutes(w.from), minutes(w.to)];
    if (from <= to ? w.days.includes(day) && t >= from && t < to : (w.days.includes(day) && t >= from) || (w.days.includes((day + 6) % 7) && t < to)) return w;
  }
  return null;
}

/** Why nothing may scan the site now, or null. */
export function noScanReason(site: Pick<Site, "noScanWindows">, now = new Date()): string | null {
  const w = activeNoScanWindow(site.noScanWindows ?? [], now);
  return w ? `It's inside a no-scan window for this site (${formatNoScanWindows([w])}); try again after ${w.to}, or change the window in Security → Signed-in checks and safety` : null;
}

// --- Settings ---------------------------------------------------------------------------------

const lines = (text: string | undefined) =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export const signedInInput = z.object({
  pages: z.string().max(10_000).default(""),
  sign_in_url: z.string().trim().max(2000).default(""),
  extra_hosts: z.string().max(2000).default(""),
  no_scan: z.string().max(2000).default(""),
});

/** Saves the signed-in pages, the sign-in page, the extra hosts and the no-scan windows, after checking each. */
export async function saveSignedInSettings(site: Site, input: z.infer<typeof signedInInput>): Promise<void> {
  const host = hostOf(site.startUrl);
  const origin = new URL(site.startUrl).origin;
  const absolute = (value: string) => {
    try {
      return new URL(value, origin).toString();
    } catch {
      throw new Error(`"${value}" isn't a page address`);
    }
  };
  const pages = [...new Set(lines(input.pages).map(absolute))];
  if (pages.length > MAX_SIGNED_IN_PAGES) throw new Error(`At most ${MAX_SIGNED_IN_PAGES} signed-in pages`);
  for (const p of pages) if (hostOf(p) !== host) throw new Error(`${p} isn't on ${host}: signed-in checks only read the site's own pages`);
  const extraHosts = [...new Set(lines(input.extra_hosts).map((h) => h.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "")))];
  if (extraHosts.length > MAX_EXTRA_HOSTS) throw new Error(`At most ${MAX_EXTRA_HOSTS} extra hosts`);
  for (const h of extraHosts) if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) throw new Error(`"${h}" isn't a host name (like login.example.com)`);
  const signInUrl = input.sign_in_url ? absolute(input.sign_in_url) : null;
  if (signInUrl && hostOf(signInUrl) !== host && !extraHosts.includes(hostOf(signInUrl))) throw new Error(`The sign-in page must be on ${host} or one of the extra hosts`);
  await getDb()
    .update(sites)
    .set({ signedInPages: pages, extraHosts, signInUrl, noScanWindows: parseNoScanWindows(input.no_scan) })
    .where(eq(sites.id, site.id));
}

// --- Sign in, forget ----------------------------------------------------------------------------

/** Opens the visible sign-in window (desktop) or browser (dev mode) on the site's own session. */
export async function openSignIn(site: Site): Promise<void> {
  if (!isVerified(site)) throw new Error("Verify the site first: signed-in checks run only on verified sites");
  const scanner = getScanner();
  if (!scanner?.signIn) throw new Error(scanner ? "Signing in works in the desktop app" : NO_SCANNER);
  await scanner.signIn({ siteId: site.id, url: site.signInUrl ?? site.startUrl, siteUrl: site.startUrl, extraHosts: site.extraHosts });
}

/** Clears the site's sign-in session, and the results that came from it. */
export async function forgetSignIn(site: Site): Promise<void> {
  await getScanner()?.forgetSignIn?.(site.id);
  await getDb().delete(securityOccurrences).where(and(eq(securityOccurrences.siteId, site.id), isNotNull(securityOccurrences.signedInUrl)));
  await getDb().update(sites).set({ signedInCheck: null }).where(eq(sites.id, site.id));
  await finishSecurity(site, { scanId: null, probes: false });
}

// --- The check ----------------------------------------------------------------------------------

/** Whether the page ended up somewhere other than the address asked for (a trailing slash aside). */
export function redirectedAway(asked: string, landed: string): boolean {
  try {
    const [a, b] = [new URL(asked), new URL(landed)];
    const path = (u: URL) => u.pathname.replace(/\/+$/, "") || "/";
    return hostOf(asked) !== hostOf(landed) || path(a) !== path(b);
  } catch {
    return true;
  }
}

export const signedInCheckPayload = z.object({ workspaceId: z.guid(), siteId: z.guid() });

/** Queues a signed-in check unless one is waiting or running; false when the site has no signed-in pages or isn't verified. */
export async function queueSignedInCheck(site: Pick<Site, "id" | "workspaceId" | "securityVerifiedAt" | "signedInPages">): Promise<boolean> {
  if (!isVerified(site) || site.signedInPages.length === 0 || process.env.STARTICA_DEMO === "1") return false;
  if (await jobByPayload(site.workspaceId, ["security_signed_in_check"], "siteId", site.id)) return false;
  await enqueue(site.workspaceId, "security_signed_in_check", { siteId: site.id });
  return true;
}

/**
 * Loads each signed-in page in the site's sign-in session and runs the page checks on it,
 * including the session cookies' flags. A page that lands on another host or answers 401 or 403
 * means the session ended: it's marked signed out and keeps no results. Results replace the last
 * check's, then fold into the findings like a scan's.
 */
export async function runSignedInCheck(ctx: AiContext, payload: z.infer<typeof signedInCheckPayload>) {
  const db = getDb();
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, payload.siteId), eq(sites.workspaceId, payload.workspaceId)));
  if (!site || !isVerified(site) || site.signedInPages.length === 0) return { skipped: "no signed-in pages on a verified site" };
  const blocked = noScanReason(site);
  if (blocked) return { skipped: blocked };
  const scanner = getScanner();
  if (!scanner) throw new Error(NO_SCANNER);
  const tags = profileTags(site);
  const pages: SignedInCheck["pages"] = [];
  const found: (typeof securityOccurrences.$inferInsert)[] = [];

  for (const [i, url] of site.signedInPages.entries()) {
    ctx.signal?.throwIfAborted();
    // A no-scan window that starts mid-check stops it.
    if (noScanReason(site)) break;
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    await reportProgress(ctx.jobRunId, { pagesDone: i, pagesTotal: site.signedInPages.length });
    try {
      const response = await scanner.scan({ ...scanRequest(url, tags), screenshot: false, signIn: { siteId: site.id, extraHosts: site.extraHosts } });
      // Sent elsewhere (the sign-in page, another host) or refused: the session ended.
      if (redirectedAway(url, response.finalUrl) || response.httpStatus === 401 || response.httpStatus === 403) {
        pages.push({ url, status: "signed_out", error: `Landed on ${response.finalUrl}${response.httpStatus ? ` (HTTP ${response.httpStatus})` : ""}: sign in again` });
        continue;
      }
      if (response.httpStatus !== null && response.httpStatus >= 400) {
        pages.push({ url, status: "failed", error: `The page answered HTTP ${response.httpStatus}` });
        continue;
      }
      const drafts = pageSecurityFindings({ url: response.finalUrl || url, siteUrl: site.startUrl }, response.headers ?? {}, response.result.security, response.cookies ?? []);
      for (const d of drafts) found.push({ workspaceId: site.workspaceId, siteId: site.id, pageId: null, signedInUrl: url, rule: d.rule, groupKey: d.groupKey, detail: d.detail });
      pages.push({ url, status: "checked" });
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      pages.push({ url, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Replace the last check's results with this one's (pages that weren't checked keep none).
  await transaction(async (tx) => {
    await tx.delete(securityOccurrences).where(and(eq(securityOccurrences.siteId, site.id), isNotNull(securityOccurrences.signedInUrl)));
    if (found.length) await tx.insert(securityOccurrences).values(found);
    await tx.update(sites).set({ signedInCheck: { at: new Date().toISOString(), pages } }).where(eq(sites.id, site.id));
  });
  await finishSecurity(site, { scanId: null, probes: false });
  return { checked: pages.filter((p) => p.status === "checked").length, signedOut: pages.filter((p) => p.status === "signed_out").length, failed: pages.filter((p) => p.status === "failed").length };
}
