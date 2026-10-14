import type { SecurityFacts } from "../a11y/scanner.ts";
import type { SecurityRuleId } from "./rules.ts";

/**
 * Security checks as pure functions (ARCHITECTURE.md section 11.2): page checks over the main
 * document's response headers and what the in-page script saw, and site checks over
 * what the probes fetched. Nothing here makes a request.
 */

export type SecurityFindingDraft = { rule: SecurityRuleId; groupKey: string; detail: Record<string, unknown> };

const HSTS_MIN_SECONDS = 15_552_000; // 180 days
const MAX_LISTED = 10;

/** Lowercase header names; Set-Cookie lines joined with "\n" (`pickHeaders` in a11y/scanner.ts). */
export type Headers = Record<string, string>;

export type Cookie = { name: string; secure: boolean; httpOnly: boolean; sameSite: string | null };

export function parseCookies(header: string | undefined): Cookie[] {
  if (!header) return [];
  return header
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pair = "", ...attrs] = line.split(";").map((p) => p.trim());
      const name = pair.split("=")[0]!.trim();
      const attr = (key: string) => attrs.find((a) => a.toLowerCase().split("=")[0]!.trim() === key);
      const sameSite = attr("samesite");
      return { name, secure: !!attr("secure"), httpOnly: !!attr("httponly"), sameSite: sameSite ? (sameSite.split("=")[1]?.trim() ?? "") : null };
    })
    .filter((c) => c.name);
}

/** Directives of a Content-Security-Policy, name → sources. */
export function parseCsp(header: string | undefined): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of (header ?? "").split(/[;,]/)) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !out.has(name.toLowerCase())) out.set(name.toLowerCase(), sources);
  }
  return out;
}

/** Scripts may come from anywhere, or inline scripts run without nonces, hashes or strict-dynamic. */
export function cspWeak(csp: Map<string, string[]>): boolean {
  const scripts = csp.get("script-src") ?? csp.get("default-src");
  if (!scripts) return true; // no script-src or default-src: scripts aren't restricted at all
  const has = (s: string) => scripts.some((x) => x.toLowerCase() === s);
  const keyed = scripts.some((x) => /^'(nonce-|sha(256|384|512)-)/i.test(x)) || has("'strict-dynamic'");
  return (has("'unsafe-inline'") && !keyed) || has("*") || has("http:") || has("https:") || has("data:");
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Findings for one page: its headers, cookies and what the page loads. */
export function pageSecurityFindings(page: { url: string; siteUrl: string }, headers: Headers, facts: SecurityFacts | undefined): SecurityFindingDraft[] {
  const out: SecurityFindingDraft[] = [];
  const add = (rule: SecurityRuleId, detail: Record<string, unknown> = {}, groupKey: string = rule) => out.push({ rule, groupKey, detail });
  const https = page.url.startsWith("https:");

  if (https) {
    const hsts = headers["strict-transport-security"];
    if (!hsts) add("hsts-missing");
    else {
      const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts)?.[1] ?? 0);
      if (maxAge < HSTS_MIN_SECONDS) add("hsts-short", { maxAge });
    }
  }

  const cspHeader = headers["content-security-policy"];
  const csp = parseCsp(cspHeader);
  if (!cspHeader) add("csp-missing");
  else if (cspWeak(csp)) add("csp-weak", { policy: cspHeader.slice(0, 300) });
  const xfo = (headers["x-frame-options"] ?? "").toLowerCase();
  if (!csp.has("frame-ancestors") && !/deny|sameorigin/.test(xfo)) add("frame-protection-missing");
  if ((headers["x-content-type-options"] ?? "").toLowerCase().trim() !== "nosniff") add("nosniff-missing");
  if (!headers["referrer-policy"]) add("referrer-policy-missing");
  if (!headers["permissions-policy"]) add("permissions-policy-missing");
  for (const name of ["server", "x-powered-by"] as const) {
    const value = headers[name];
    if (value && /\d+\.\d+/.test(value)) add("server-version", { header: name, value: value.slice(0, 120) }, `server-version:${name}:${value.slice(0, 120).toLowerCase()}`);
  }

  for (const c of parseCookies(headers["set-cookie"])) {
    if (https && !c.secure) add("cookie-not-secure", { cookie: c.name }, `cookie-not-secure:${c.name}`);
    if (!c.httpOnly) add("cookie-not-httponly", { cookie: c.name }, `cookie-not-httponly:${c.name}`);
    if (c.sameSite === null) add("cookie-no-samesite", { cookie: c.name }, `cookie-no-samesite:${c.name}`);
  }

  if (!facts) return out;
  if (https) {
    if (facts.insecureResources.active.length) add("mixed-content-active", { urls: facts.insecureResources.active.slice(0, MAX_LISTED) });
    if (facts.insecureResources.passive.length) add("mixed-content-passive", { urls: facts.insecureResources.passive.slice(0, MAX_LISTED) });
  }
  const insecureForms = facts.forms.filter((f) => (https && f.action.startsWith("http:")) || (!https && f.hasPassword));
  if (insecureForms.length) add("form-insecure", { actions: insecureForms.map((f) => f.action).slice(0, MAX_LISTED), password: insecureForms.some((f) => f.hasPassword) });
  const site = hostOf(page.siteUrl);
  const unchecked = new Map<string, string[]>();
  for (const s of facts.scripts) {
    const host = hostOf(s.src);
    if (!host || host === site || host.endsWith(`.${site}`) || s.integrity) continue;
    unchecked.set(host, [...(unchecked.get(host) ?? []), s.src]);
  }
  for (const [host, srcs] of unchecked) add("third-party-script-no-sri", { host, scripts: srcs.slice(0, MAX_LISTED) }, `third-party-script-no-sri:${host}`);
  if (facts.generator && /\d/.test(facts.generator)) add("generator-version", { generator: facts.generator.slice(0, 120) }, `generator-version:${facts.generator.slice(0, 120).toLowerCase()}`);
  if (facts.directoryListing) add("directory-listing");
  return out;
}

// --- Site checks (the probes' results in, findings out)

export type TlsResult = { protocol: string | null; authorized: boolean; error: string | null; validTo: number | null; issuer: string | null } | null;

export function tlsFindings(tls: TlsResult, now: number): SecurityFindingDraft[] {
  if (!tls) return [];
  const out: SecurityFindingDraft[] = [];
  if (!tls.authorized) out.push({ rule: "cert-invalid", groupKey: "cert-invalid", detail: { error: tls.error } });
  else if (tls.validTo !== null && tls.validTo - now < 21 * 86_400_000)
    out.push({ rule: "cert-expiring", groupKey: "cert-expiring", detail: { validTo: new Date(tls.validTo).toISOString(), days: Math.max(0, Math.floor((tls.validTo - now) / 86_400_000)) } });
  if (tls.protocol && /^TLSv1(\.[01])?$/.test(tls.protocol)) out.push({ rule: "tls-old", groupKey: "tls-old", detail: { protocol: tls.protocol } });
  return out;
}

export type SecurityTxtStatus = { status: "missing" | "invalid" | "present"; contact: string[]; expires: string | null; problems: string[] };

/** RFC 9116: Contact (at least one) and Expires (a date in the future) are required. */
export function parseSecurityTxt(text: string | null, now: number): SecurityTxtStatus {
  if (text === null) return { status: "missing", contact: [], expires: null, problems: [] };
  const fields = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { name: l.slice(0, i).trim().toLowerCase(), value: l.slice(i + 1).trim() } : null;
    })
    .filter((f): f is { name: string; value: string } => !!f);
  const contact = fields.filter((f) => f.name === "contact").map((f) => f.value);
  const expires = fields.find((f) => f.name === "expires")?.value ?? null;
  const problems: string[] = [];
  if (contact.length === 0) problems.push("No Contact: line");
  if (!expires) problems.push("No Expires: date");
  else {
    const t = Date.parse(expires);
    if (Number.isNaN(t)) problems.push("Expires isn't a date");
    else if (t < now) problems.push("Expired");
  }
  return { status: problems.length ? "invalid" : "present", contact, expires, problems };
}

export type EmailStatus = { domain: string; spf: string | null; dmarc: string | null; dmarcPolicy: string | null } | null;

export function emailFindings(email: EmailStatus): SecurityFindingDraft[] {
  if (!email) return [];
  const out: SecurityFindingDraft[] = [];
  if (!email.spf) out.push({ rule: "spf-missing", groupKey: "spf-missing", detail: { domain: email.domain } });
  if (!email.dmarc) out.push({ rule: "dmarc-missing", groupKey: "dmarc-missing", detail: { domain: email.domain } });
  else if (email.dmarcPolicy === "none") out.push({ rule: "dmarc-none", groupKey: "dmarc-none", detail: { domain: email.domain, record: email.dmarc } });
  return out;
}

export function spfRecord(txt: string[]): string | null {
  return txt.find((r) => /^v=spf1(\s|$)/i.test(r.trim())) ?? null;
}

export function dmarcRecord(txt: string[]): { record: string; policy: string | null } | null {
  const record = txt.find((r) => /^v=DMARC1\s*;?/i.test(r.trim()));
  if (!record) return null;
  return { record, policy: /(?:^|;)\s*p\s*=\s*(\w+)/i.exec(record)?.[1]?.toLowerCase() ?? null };
}

/** What an exposed-file probe answered: its status, content type and the first bytes. */
export type ProbeResponse = { status: number; contentType: string; body: Buffer } | null;

const looksLikeHtml = (r: NonNullable<ProbeResponse>) => /html/i.test(r.contentType) || /^\s*</.test(r.body.subarray(0, 200).toString("utf8"));

/** A file is really there (not a catch-all page that answers 200 for every path). */
export function exposedFile(kind: "git" | "env" | "ds_store", r: ProbeResponse): boolean {
  if (!r || r.status !== 200 || r.body.length === 0) return false;
  const text = r.body.subarray(0, 4096).toString("utf8");
  if (kind === "git") return !looksLikeHtml(r) && /^(ref: refs\/|[0-9a-f]{40}\s*$)/.test(text);
  if (kind === "env") return !looksLikeHtml(r) && (text.match(/^[A-Z][A-Z0-9_]*=/gm)?.length ?? 0) >= 2;
  return r.body.subarray(0, 8).equals(Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31])); // "\0\0\0\1Bud1"
}

export const EXPOSED_FILES = [
  { kind: "git", path: "/.git/HEAD", rule: "exposed-git" },
  { kind: "env", path: "/.env", rule: "exposed-env" },
  { kind: "ds_store", path: "/.DS_Store", rule: "exposed-ds-store" },
] as const satisfies readonly { kind: "git" | "env" | "ds_store"; path: string; rule: SecurityRuleId }[];

/**
 * The domain whose email records apply: the site's host without "www.". DMARC falls back
 * to the parent domain (organizational domain) when the host itself has none; the parent
 * is a simple guess (the last two labels), which is wrong for e.g. example.co.uk.
 */
export function emailDomain(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}
export function parentDomain(domain: string): string | null {
  const labels = domain.split(".");
  return labels.length > 2 ? labels.slice(-2).join(".") : null;
}
