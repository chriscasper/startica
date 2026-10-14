import { createHash } from "node:crypto";
import { resolve4, resolve6, resolveCname, resolveNs } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, transaction } from "@startica/db/client";
import { dataDir } from "@startica/db/paths";
import { enqueue } from "@startica/db/queue";
import { securityAssets, securityComponents, securityFindings, securityOccurrences, sitePages, sites, type securitySeverities } from "@startica/db/schema";
import type { AiContext } from "../ai/client.ts";
import { isPrivateHost } from "../a11y/urls.ts";
import { jobByPayload } from "../jobs/cancel.ts";
import { parentDomain } from "./checks.ts";
import { queueTrackerSync } from "../trackers/trackers.ts";
import { isVerified, rescore } from "./findings.ts";

/**
 * Exposure monitoring (ARCHITECTURE.md section 11.4, S2), for verified sites, daily and after each
 * full scan:
 * - subdomains and certificates from certificate transparency logs (crt.sh),
 * - dangling CNAMEs (takeover risk) and look-alike domains, through DNS lookups only,
 * - third-party scripts the pages load without integrity checks: a content hash per run,
 * - libraries the pages load, matched against OSV.dev and ranked by EPSS and CISA KEV.
 * The four data services are free and public (approved 2026-10-12). Nothing is sent to
 * them but library names and versions, CVE ids and the site's domain.
 */

type Severity = (typeof securitySeverities)[number];
type Site = typeof sites.$inferSelect;

/** Where each service lives; STARTICA_SECURITY_API_BASE points all of them at a stand-in (tests, smoke). */
export function apis() {
  const base = process.env.STARTICA_SECURITY_API_BASE;
  return base
    ? { crtsh: `${base}/crtsh`, osv: `${base}/osv`, epss: `${base}/epss`, kev: `${base}/kev.json` }
    : { crtsh: "https://crt.sh", osv: "https://api.osv.dev", epss: "https://api.first.org/data/v1/epss", kev: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json" };
}

const UA = "Startica/0.1 (+https://mystartica.com; security monitoring for the owner's own site)";
const RESERVED = /\.(example|test|invalid)$/i;
const MAX_SUBDOMAINS = 100;
const MAX_LOOKALIKES = 60;
const MAX_SCRIPTS = 30;
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;

async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
  return (await res.json()) as T;
}

// --- DNS (injectable for tests)

export type DnsState = "exists" | "nxdomain" | "error";
export type Resolver = { cname(host: string): Promise<string[]>; state(host: string): Promise<DnsState> };

const nodeResolver: Resolver = {
  async cname(host) {
    try {
      return await resolveCname(host);
    } catch {
      return [];
    }
  },
  async state(host) {
    const codes: string[] = [];
    for (const lookup of [resolve4, resolve6, resolveNs]) {
      try {
        if ((await lookup(host)).length) return "exists";
      } catch (e) {
        codes.push((e as { code?: string }).code ?? "");
      }
    }
    return codes.every((c) => c === "ENOTFOUND") ? "nxdomain" : codes.some((c) => c === "ENODATA") ? "exists" : "error";
  },
};
let resolver: Resolver = nodeResolver;
export const setResolver = (r: Resolver | null) => void (resolver = r ?? nodeResolver);

// --- Certificate transparency

type CtEntry = { id: number; issuer_name: string; name_value: string; not_before: string; not_after: string; entry_timestamp: string };

/** The domain to watch: the site's host without "www.", or its parent when it's a subdomain (a two-label guess). */
export const watchedDomain = (host: string) => {
  const h = host.toLowerCase().replace(/^www\./, "");
  return parentDomain(h) ?? h;
};

export async function ctEntries(domain: string): Promise<CtEntry[]> {
  const rows = await getJson<CtEntry[]>(`${apis().crtsh}/?q=${encodeURIComponent(`%.${domain}`)}&output=json`, {}, 60_000);
  return rows.slice(0, 5000);
}

export function subdomainsFrom(entries: CtEntry[], domain: string): string[] {
  const names = new Set<string>();
  for (const e of entries) {
    for (const raw of e.name_value.split(/\s+/)) {
      const n = raw.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
      if ((n === domain || n.endsWith(`.${domain}`)) && /^[a-z0-9.-]+$/.test(n)) names.add(n);
    }
  }
  return [...names].sort().slice(0, MAX_SUBDOMAINS);
}

// --- Look-alike domains

const SWAPS: [string, string][] = [
  ["o", "0"],
  ["l", "1"],
  ["i", "1"],
  ["e", "3"],
  ["m", "rn"],
  ["w", "vv"],
  ["s", "5"],
];
const TLDS = ["com", "net", "org", "co", "io", "app"];

/** Common typo and confusable variations of a domain (omissions, doubles, swaps, look-alike characters, other TLDs), capped. */
export function lookalikes(domain: string): string[] {
  const [label, ...rest] = domain.split(".");
  if (!label || rest.length === 0) return [];
  const tld = rest.join(".");
  const out = new Set<string>();
  const add = (l: string, t = tld) => {
    if (l && l !== label && /^[a-z0-9-]+$/.test(l) && !l.startsWith("-") && !l.endsWith("-")) out.add(`${l}.${t}`);
  };
  for (const t of TLDS) if (t !== tld) out.add(`${label}.${t}`); // the same name on other common TLDs first: the likeliest look-alikes
  for (let i = 0; i < label.length; i++) {
    add(label.slice(0, i) + label.slice(i + 1)); // omission
    add(label.slice(0, i) + label[i] + label.slice(i)); // double letter
    if (i < label.length - 1) add(label.slice(0, i) + label[i + 1] + label[i] + label.slice(i + 2)); // swap
    if (i > 0) add(`${label.slice(0, i)}-${label.slice(i)}`); // hyphen
  }
  for (const [a, b] of SWAPS) {
    if (label.includes(a)) add(label.replace(a, b));
    if (label.includes(b)) add(label.replace(b, a));
  }
  out.delete(domain);
  return [...out].slice(0, MAX_LOOKALIKES);
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// --- Vulnerable libraries (OSV, EPSS, KEV)

type OsvVuln = { id: string; summary?: string; aliases?: string[]; database_specific?: { severity?: string }; affected?: { ranges?: { events?: { fixed?: string }[] }[] }[] };
export type LibraryVuln = { id: string; cve: string | null; summary: string; severity: Severity; fixed: string[]; epss: number | null; percentile: number | null; kev: boolean };

const SEVERITY_FROM_DB: Record<string, Severity> = { CRITICAL: "critical", HIGH: "high", MODERATE: "medium", MEDIUM: "medium", LOW: "low" };
const ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
const worst = (list: Severity[]): Severity => ORDER.find((s) => list.includes(s)) ?? "medium";

/** CISA's known-exploited list, cached for a day in the data folder. */
export async function kevSet(now = Date.now()): Promise<Set<string>> {
  const dir = join(dataDir(), "security");
  const file = join(dir, "kev.json");
  try {
    if (existsSync(file)) {
      const cached = JSON.parse(readFileSync(file, "utf8")) as { fetchedAt: number; source: string; cves: string[] };
      if (now - cached.fetchedAt < 86_400_000 && cached.source === apis().kev) return new Set(cached.cves);
    }
  } catch {
    // refetch
  }
  const feed = await getJson<{ vulnerabilities: { cveID: string }[] }>(apis().kev, {}, 60_000);
  const cves = feed.vulnerabilities.map((v) => v.cveID);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ fetchedAt: now, source: apis().kev, cves }));
  return new Set(cves);
}

export async function epssScores(cves: string[]): Promise<Map<string, { epss: number; percentile: number }>> {
  const out = new Map<string, { epss: number; percentile: number }>();
  for (let i = 0; i < cves.length; i += 100) {
    const batch = cves.slice(i, i + 100);
    const res = await getJson<{ data: { cve: string; epss: string; percentile: string }[] }>(`${apis().epss}?cve=${batch.join(",")}`);
    for (const d of res.data) out.set(d.cve, { epss: Number(d.epss), percentile: Number(d.percentile) });
  }
  return out;
}

/** Each library version's advisories from OSV, with EPSS and KEV for their CVEs. */
export async function libraryVulns(libs: { name: string; version: string }[]): Promise<Map<string, LibraryVuln[]>> {
  const out = new Map<string, LibraryVuln[]>();
  if (libs.length === 0) return out;
  const batch = await getJson<{ results: { vulns?: { id: string }[] }[] }>(`${apis().osv}/v1/querybatch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries: libs.map((l) => ({ package: { ecosystem: "npm", name: l.name }, version: l.version })) }),
  });
  const ids = [...new Set(batch.results.flatMap((r) => (r.vulns ?? []).map((v) => v.id)))].slice(0, 200);
  const details = new Map<string, OsvVuln>();
  await inBatches(ids, 8, async (id) => details.set(id, await getJson<OsvVuln>(`${apis().osv}/v1/vulns/${encodeURIComponent(id)}`)));
  const cves = [...new Set([...details.values()].flatMap((d) => (d.aliases ?? []).filter((a) => a.startsWith("CVE-")).concat(d.id.startsWith("CVE-") ? [d.id] : [])))];
  const [epss, kev] = await Promise.all([cves.length ? epssScores(cves) : new Map(), cves.length ? kevSet() : Promise.resolve(new Set<string>())]);
  libs.forEach((lib, i) => {
    const vulns = (batch.results[i]?.vulns ?? []).flatMap((v) => {
      const d = details.get(v.id);
      if (!d) return [];
      const cve = d.id.startsWith("CVE-") ? d.id : ((d.aliases ?? []).find((a) => a.startsWith("CVE-")) ?? null);
      const score = cve ? epss.get(cve) : undefined;
      const fixed = [...new Set((d.affected ?? []).flatMap((a) => (a.ranges ?? []).flatMap((r) => (r.events ?? []).flatMap((e) => (e.fixed ? [e.fixed] : [])))))];
      return [{ id: d.id, cve, summary: (d.summary ?? "").slice(0, 300), severity: SEVERITY_FROM_DB[(d.database_specific?.severity ?? "").toUpperCase()] ?? "medium", fixed, epss: score?.epss ?? null, percentile: score?.percentile ?? null, kev: cve ? kev.has(cve) : false }];
    });
    if (vulns.length) out.set(`${lib.name}@${lib.version}`, vulns.sort((a, b) => Number(b.kev) - Number(a.kev) || (b.epss ?? 0) - (a.epss ?? 0)));
  });
  return out;
}

/** A library's finding severity: its worst advisory, at least high when one is known to be exploited (KEV). */
export function librarySeverity(vulns: LibraryVuln[]): Severity {
  const s = worst(vulns.map((v) => v.severity));
  return vulns.some((v) => v.kev) && ORDER.indexOf(s) > ORDER.indexOf("high") ? "high" : s;
}

// --- The run

export type MonitorDraft = { rule: "vulnerable-library" | "subdomain-takeover" | "lookalike-domain" | "third-party-script-changed"; groupKey: string; severity: Severity; detail: Record<string, unknown> };

async function upsertAsset(site: Site, kind: (typeof securityAssets.$inferInsert)["kind"], name: string, detail: Record<string, unknown>, now: Date, changed = false) {
  await getDb()
    .insert(securityAssets)
    .values({ workspaceId: site.workspaceId, siteId: site.id, kind, name, detail, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [securityAssets.siteId, securityAssets.kind, securityAssets.name], set: { detail, lastSeenAt: now, ...(changed ? { changedAt: now } : {}) } });
}

/** Hosts, certificates, dangling CNAMEs and look-alikes for the site's domain. */
async function watchDomain(site: Site, now: Date): Promise<MonitorDraft[]> {
  const host = new URL(site.startUrl).hostname;
  if (isPrivateHost(host) || RESERVED.test(host)) return [];
  const domain = watchedDomain(host);
  const drafts: MonitorDraft[] = [];

  const entries = await ctEntries(domain);
  for (const e of [...entries].sort((a, b) => b.entry_timestamp.localeCompare(a.entry_timestamp)).slice(0, 50)) {
    await upsertAsset(site, "certificate", String(e.id), { issuer: e.issuer_name.match(/O=([^,]+)/)?.[1] ?? e.issuer_name.slice(0, 120), names: e.name_value.split(/\s+/).slice(0, 10), notBefore: e.not_before, notAfter: e.not_after, logged: e.entry_timestamp }, now);
  }
  const subs = subdomainsFrom(entries, domain);
  await inBatches(subs, 8, async (sub) => {
    const cname = (await resolver.cname(sub))[0] ?? null;
    const state = await resolver.state(cname ?? sub);
    const dangling = Boolean(cname) && state === "nxdomain";
    await upsertAsset(site, "subdomain", sub, { cname, resolves: state === "exists", dangling }, now);
    if (dangling) drafts.push({ rule: "subdomain-takeover", groupKey: `takeover:${sub}`, severity: "high", detail: { host: sub, cname } });
  });
  await inBatches(lookalikes(domain), 8, async (name) => {
    if ((await resolver.state(name)) !== "exists") return;
    await upsertAsset(site, "lookalike", name, {}, now);
    drafts.push({ rule: "lookalike-domain", groupKey: `lookalike:${name}`, severity: "low", detail: { domain: name } });
  });
  return drafts;
}

/** Hashes the third-party scripts the pages load without an integrity check; a changed hash is a finding to review. */
async function watchScripts(site: Site, now: Date): Promise<MonitorDraft[]> {
  const rows = await getDb()
    .select({ detail: securityOccurrences.detail })
    .from(securityOccurrences)
    .innerJoin(sitePages, eq(sitePages.id, securityOccurrences.pageId))
    .where(and(eq(securityOccurrences.siteId, site.id), eq(securityOccurrences.rule, "third-party-script-no-sri"), isNull(sitePages.goneAt)));
  const urls = [...new Set(rows.flatMap((r) => (Array.isArray(r.detail.scripts) ? (r.detail.scripts as string[]) : [])))].filter((u) => /^https?:\/\//.test(u) && !RESERVED.test(new URL(u).hostname)).slice(0, MAX_SCRIPTS);
  const known = new Map((await getDb().select().from(securityAssets).where(and(eq(securityAssets.siteId, site.id), eq(securityAssets.kind, "script")))).map((a) => [a.name, a]));
  const drafts: MonitorDraft[] = [];
  await inBatches(urls, 6, async (url) => {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return;
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > MAX_SCRIPT_BYTES) return;
      const sha256 = createHash("sha256").update(body).digest("base64");
      const before = known.get(url)?.detail.sha256 as string | undefined;
      const changed = Boolean(before) && before !== sha256;
      await upsertAsset(site, "script", url, { sha256, bytes: body.length, previous: changed ? before : (known.get(url)?.detail.previous ?? null) }, now, changed);
      if (changed) drafts.push({ rule: "third-party-script-changed", groupKey: `script-changed:${url}`, severity: "medium", detail: { url, sha256, previous: before } });
    } catch {
      // unreachable this time: try again next run
    }
  });
  return drafts;
}

async function watchLibraries(site: Site): Promise<MonitorDraft[]> {
  const rows = await getDb()
    .select({ name: securityComponents.name, version: securityComponents.version, url: sitePages.url })
    .from(securityComponents)
    .innerJoin(sitePages, eq(sitePages.id, securityComponents.pageId))
    .where(and(eq(securityComponents.siteId, site.id), isNull(sitePages.goneAt)));
  const libs = new Map<string, { name: string; version: string; pages: Set<string> }>();
  for (const r of rows) {
    const key = `${r.name}@${r.version}`;
    const entry = libs.get(key) ?? { name: r.name, version: r.version, pages: new Set<string>() };
    entry.pages.add(r.url);
    libs.set(key, entry);
  }
  const vulns = await libraryVulns([...libs.values()]);
  return [...vulns].map(([key, list]) => {
    const lib = libs.get(key)!;
    return {
      rule: "vulnerable-library" as const,
      groupKey: `vuln:${key}`,
      severity: librarySeverity(list),
      detail: { library: lib.name, version: lib.version, pages: [...lib.pages].slice(0, 10), vulns: list.slice(0, 20), kev: list.some((v) => v.kev), epss: Math.max(0, ...list.map((v) => v.epss ?? 0)) },
    };
  });
}

/**
 * Folds the monitor's drafts into findings (source "monitor"): new ones open, seen ones
 * reopen if fixed; ones no longer seen are fixed, except a changed script, which stays
 * until the owner reviews it. Only kinds whose check ran this time are touched.
 */
export async function foldMonitorFindings(site: Site, drafts: MonitorDraft[], ran: Set<MonitorDraft["rule"]>, now = new Date()): Promise<void> {
  const existing = await getDb().select().from(securityFindings).where(and(eq(securityFindings.siteId, site.id), eq(securityFindings.source, "monitor")));
  const known = new Map(existing.map((f) => [f.groupKey, f]));
  const seen = new Set(drafts.map((d) => d.groupKey));
  await transaction(async (tx) => {
    for (const d of drafts) {
      const f = known.get(d.groupKey);
      if (!f) {
        await tx.insert(securityFindings).values({ workspaceId: site.workspaceId, siteId: site.id, groupKey: d.groupKey, rule: d.rule, severity: d.severity, source: "monitor", status: "open", detail: d.detail, firstSeenAt: now, lastSeenAt: now });
      } else {
        await tx
          .update(securityFindings)
          .set({ severity: d.severity, detail: d.detail, lastSeenAt: now, ...(f.status === "fixed" ? { status: "open" as const, fixedAt: null } : {}) })
          .where(eq(securityFindings.id, f.id));
      }
    }
    const gone = existing.filter((f) => f.status === "open" && !seen.has(f.groupKey) && f.rule !== "third-party-script-changed" && ran.has(f.rule as MonitorDraft["rule"])).map((f) => f.id);
    if (gone.length) await tx.update(securityFindings).set({ status: "fixed", fixedAt: now }).where(inArray(securityFindings.id, gone));
  });
  await rescore(site.id);
}

export const monitorPayload = z.object({ workspaceId: z.guid(), siteId: z.guid().optional() });

/** Runs every monitor for one verified site (or, from the daily schedule, for each one). A failing service doesn't stop the others. */
export async function runMonitor(_ctx: AiContext, payload: z.infer<typeof monitorPayload>): Promise<Record<string, { findings: number; errors: string[] }>> {
  if (process.env.STARTICA_DEMO === "1") return {}; // nothing runs against real services in the demo
  const list = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.workspaceId, payload.workspaceId), isNotNull(sites.securityVerifiedAt), payload.siteId ? eq(sites.id, payload.siteId) : undefined));
  const results: Record<string, { findings: number; errors: string[] }> = {};
  for (const site of list.filter(isVerified)) {
    const now = new Date();
    const errors: string[] = [];
    const drafts: MonitorDraft[] = [];
    const ran = new Set<MonitorDraft["rule"]>();
    const step = async (rules: MonitorDraft["rule"][], label: string, fn: () => Promise<MonitorDraft[]>) => {
      try {
        drafts.push(...(await fn()));
        for (const r of rules) ran.add(r);
      } catch (error) {
        errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    await step(["subdomain-takeover", "lookalike-domain"], "Certificate logs and DNS", () => watchDomain(site, now));
    await step(["third-party-script-changed"], "Third-party scripts", () => watchScripts(site, now));
    await step(["vulnerable-library"], "Vulnerability databases", () => watchLibraries(site));
    await foldMonitorFindings(site, drafts, ran, now);
    await getDb().update(sites).set({ securityMonitor: { checkedAt: now.getTime(), errors } }).where(eq(sites.id, site.id));
    results[site.id] = { findings: drafts.length, errors };
    // Open or close repo issues for what the monitor found, if the product's tracker does that.
    await queueTrackerSync(site);
  }
  return results;
}

/** Queues a monitor run for a verified site (after a full scan, or Run now), unless one is waiting. */
export async function queueMonitor(site: Pick<Site, "id" | "workspaceId" | "securityVerifiedAt" | "startUrl">): Promise<boolean> {
  if (!isVerified(site) || process.env.STARTICA_DEMO === "1" || RESERVED.test(new URL(site.startUrl).hostname)) return false;
  if (await jobByPayload(site.workspaceId, ["security_monitor"], "siteId", site.id)) return false;
  await enqueue(site.workspaceId, "security_monitor", { siteId: site.id });
  return true;
}
