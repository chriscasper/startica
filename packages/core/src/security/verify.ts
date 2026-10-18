import { randomBytes } from "node:crypto";
import { getServers, resolveTxt } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { connections, sites } from "@startica/db/schema";
import { isPrivateHost } from "../a11y/urls.ts";
import { probe } from "./probes.ts";

/**
 * Proving a site belongs to the user before any security check runs (ARCHITECTURE.md section
 * 11.2): a DNS TXT record, a file on the site, or the product's Search Console property.
 * Sites on this computer or network count as the user's own.
 */

type Site = typeof sites.$inferSelect;
export type VerifyMethod = "dns" | "file" | "search_console" | "local" | "demo";

export const VERIFY_FILE_PATH = "/.well-known/startica-verification.txt";
export const txtValue = (token: string) => `startica-verification=${token}`;

/** The site's verification token, created on first use. */
export async function ensureVerifyToken(site: Pick<Site, "id" | "securityToken">): Promise<string> {
  if (site.securityToken) return site.securityToken;
  const token = randomBytes(16).toString("hex");
  await getDb().update(sites).set({ securityToken: token }).where(eq(sites.id, site.id));
  return token;
}

/** Host names a TXT record may sit on: the site's host, and the host without "www.". */
export function txtHosts(startUrl: string): string[] {
  const host = new URL(startUrl).hostname.toLowerCase();
  return [...new Set([host, host.replace(/^www\./, "")])];
}

/** Whether a Search Console property covers the site: a domain property for its domain, or a URL-prefix property for its address. */
export function propertyCovers(property: string, startUrl: string): boolean {
  const url = new URL(startUrl);
  const host = url.hostname.toLowerCase();
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length).toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    const prefix = new URL(property);
    return prefix.origin.toLowerCase() === url.origin.toLowerCase() && url.pathname.startsWith(prefix.pathname);
  } catch {
    return false;
  }
}

/** One thing a check looked at, for the details view: what it expected and what it got back. */
export type VerifyDetail = { label: string; value: string };
export type VerifyAttempt = { method: VerifyMethod; ok: boolean; note: string; details: VerifyDetail[] };

const SNIPPET = 500;
const errorCode = (error: unknown) => (error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : String(error));

async function viaDns(startUrl: string, token: string): Promise<VerifyAttempt> {
  const expected = txtValue(token);
  const details: VerifyDetail[] = [
    { label: "Looking for", value: expected },
    { label: "DNS servers", value: getServers().join(", ") || "system default" },
  ];
  let found: string | null = null;
  for (const host of txtHosts(startUrl)) {
    try {
      const records = (await resolveTxt(host)).map((chunks) => chunks.join("").trim());
      details.push({ label: `TXT on ${host}`, value: records.length ? records.join("\n") : "(no TXT records)" });
      if (!found && records.includes(expected)) found = host;
    } catch (error) {
      details.push({ label: `TXT on ${host}`, value: `(lookup failed: ${errorCode(error)})` });
    }
  }
  if (found) return { method: "dns", ok: true, note: `TXT record found on ${found}`, details };
  return { method: "dns", ok: false, note: "No matching TXT record yet (DNS changes can take a while to appear)", details };
}

async function viaFile(startUrl: string, token: string): Promise<VerifyAttempt> {
  const url = new URL(VERIFY_FILE_PATH, startUrl).toString();
  const res = await probe(url, true);
  const details: VerifyDetail[] = [
    { label: "Looking for", value: token },
    { label: "URL", value: url },
  ];
  if (res) {
    const body = res.body.toString("utf8");
    details.push(
      { label: "HTTP status", value: String(res.status) },
      { label: "Content type", value: res.contentType || "(none)" },
      { label: `Body (first ${SNIPPET} characters)`, value: body ? body.slice(0, SNIPPET) : "(empty)" },
    );
  } else details.push({ label: "Response", value: "(no response: the request failed or timed out)" });
  if (res?.status === 200 && res.body.toString("utf8").includes(token)) return { method: "file", ok: true, note: `File found at ${url}`, details };
  return { method: "file", ok: false, note: res ? `${url} answered ${res.status === 200 ? "without the code" : `HTTP ${res.status}`}` : `${url} couldn't be reached`, details };
}

async function viaSearchConsole(productId: string, startUrl: string): Promise<VerifyAttempt> {
  const [conn] = await getDb()
    .select({ status: connections.status, config: connections.config })
    .from(connections)
    .where(and(eq(connections.productId, productId), eq(connections.kind, "search_console")));
  const property = typeof conn?.config.siteUrl === "string" ? conn.config.siteUrl : null;
  const details: VerifyDetail[] = [
    { label: "Site address", value: startUrl },
    { label: "Connection", value: conn ? conn.status : "(not connected)" },
    { label: "Property", value: property ?? "(none)" },
  ];
  if (!conn || !property) return { method: "search_console", ok: false, note: "Search Console isn't connected for this product", details };
  if (conn.status !== "ok") return { method: "search_console", ok: false, note: "Search Console is connected, but its last sync failed", details };
  if (!propertyCovers(property, startUrl)) return { method: "search_console", ok: false, note: `The Search Console property (${property}) doesn't cover this site`, details };
  return { method: "search_console", ok: true, note: `Covered by the Search Console property ${property}`, details };
}

/** Tries every method; the first that works verifies the site. */
export async function verifySite(site: Site): Promise<{ verified: boolean; attempts: VerifyAttempt[] }> {
  const host = new URL(site.startUrl).hostname;
  let attempts: VerifyAttempt[];
  if (isPrivateHost(host)) attempts = [{ method: "local", ok: true, note: "A site on this computer or network", details: [{ label: "Host", value: host }] }];
  else {
    const token = await ensureVerifyToken(site);
    const sc = await viaSearchConsole(site.productId, site.startUrl);
    attempts = sc.ok ? [sc] : [sc, ...(await Promise.all([viaDns(site.startUrl, token), viaFile(site.startUrl, token)]))];
  }
  const ok = attempts.find((a) => a.ok);
  if (ok) await getDb().update(sites).set({ securityVerifiedAt: new Date(), securityVerifiedBy: ok.method }).where(eq(sites.id, site.id));
  return { verified: !!ok, attempts };
}

/** Changing a site's host undoes its verification (the token stays). */
export function verificationReset(before: string, after: string): boolean {
  try {
    return new URL(before).hostname.toLowerCase() !== new URL(after).hostname.toLowerCase();
  } catch {
    return true;
  }
}
