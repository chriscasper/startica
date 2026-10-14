import { resolveTxt } from "node:dns/promises";
import { connect } from "node:tls";
import type { SiteSecurity } from "@startica/db/schema";
import { SCAN_USER_AGENT } from "../a11y/discovery.ts";
import { isPrivateHost } from "../a11y/urls.ts";
import {
  dmarcRecord,
  emailDomain,
  emailFindings,
  EXPOSED_FILES,
  exposedFile,
  parentDomain,
  parseSecurityTxt,
  spfRecord,
  tlsFindings,
  type EmailStatus,
  type ProbeResponse,
  type SecurityFindingDraft,
  type TlsResult,
} from "./checks.ts";

/**
 * Site-level security probes (ARCHITECTURE.md section 11.2): one TLS handshake, the http://
 * address, security.txt, three well-known files and two DNS lookups. Every request is
 * a plain GET or a handshake; nothing is sent that could change the site. Runs only for
 * verified sites, after the shared crawl.
 */

const TIMEOUT_MS = 10_000;
const MAX_BODY = 64 * 1024;

// Reserved names that never resolve (the demo's fieldnote.example): no request is made for them.
const RESERVED = /\.(example|test|invalid)$/i;

export type SiteSecurityFacts = SiteSecurity;

export function tlsProbe(host: string, port = 443): Promise<TlsResult> {
  return new Promise((resolve) => {
    // rejectUnauthorized: false so an untrusted certificate is reported, not thrown; nothing is sent over the connection.
    const socket = connect({ host, port, servername: host, rejectUnauthorized: false, ALPNProtocols: ["http/1.1"] }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      const error = socket.authorizationError;
      resolve({
        protocol: socket.getProtocol() ?? null,
        authorized: socket.authorized,
        error: error ? String(error) : null,
        validTo: Number.isNaN(validTo) ? null : validTo,
        issuer: (cert?.issuer?.O ?? cert?.issuer?.CN ?? null) as string | null,
      });
      socket.end();
    });
    socket.setTimeout(TIMEOUT_MS, () => {
      socket.destroy();
      resolve(null);
    });
    socket.on("error", () => resolve(null));
  });
}

/** A GET that keeps at most the first 64 KB. Redirects aren't followed unless asked: a redirected file isn't exposed. */
export async function probe(url: string, follow = false): Promise<ProbeResponse> {
  try {
    const res = await fetch(url, { headers: { "user-agent": SCAN_USER_AGENT }, redirect: follow ? "follow" : "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const chunks: Buffer[] = [];
    let size = 0;
    const reader = res.body?.getReader();
    while (reader && size < MAX_BODY) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      size += value.length;
    }
    await reader?.cancel().catch(() => {});
    return { status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks).subarray(0, MAX_BODY) };
  } catch {
    return null;
  }
}

async function httpRedirect(host: string): Promise<SiteSecurityFacts["httpRedirect"]> {
  try {
    const res = await fetch(`http://${host}/`, { headers: { "user-agent": SCAN_USER_AGENT }, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    const location = res.headers.get("location") ?? "";
    return res.status >= 300 && res.status < 400 && /^https:\/\//i.test(new URL(location, `http://${host}/`).toString()) ? "redirects" : "no-redirect";
  } catch {
    return "unreachable"; // nothing listens on port 80: nothing to redirect
  }
}

async function txt(name: string): Promise<string[]> {
  try {
    return (await resolveTxt(name)).map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

export async function emailProbe(host: string): Promise<EmailStatus> {
  const domain = emailDomain(host);
  const spf = spfRecord(await txt(domain));
  let dmarc = dmarcRecord(await txt(`_dmarc.${domain}`));
  const parent = parentDomain(domain);
  if (!dmarc && parent) dmarc = dmarcRecord(await txt(`_dmarc.${parent}`));
  return { domain, spf, dmarc: dmarc?.record ?? null, dmarcPolicy: dmarc?.policy ?? null };
}

/** Runs every site-level probe and returns the findings plus what was seen (shown on the Overview). */
export async function siteSecurityProbes(startUrl: string, now = Date.now()): Promise<{ drafts: SecurityFindingDraft[]; facts: SiteSecurityFacts }> {
  const url = new URL(startUrl);
  const host = url.hostname.toLowerCase();
  const https = url.protocol === "https:";
  const facts: SiteSecurityFacts = { checkedAt: now, https, tls: null, httpRedirect: null, securityTxt: null, email: null };
  if (RESERVED.test(host)) return { drafts: [], facts };
  const local = isPrivateHost(host);
  const drafts: SecurityFindingDraft[] = [];

  if (!local) {
    if (!https) drafts.push({ rule: "https-missing", groupKey: "https-missing", detail: {} });
    const [tls, redirect, email] = await Promise.all([https ? tlsProbe(host, Number(url.port || 443)) : Promise.resolve(null), https ? httpRedirect(host) : Promise.resolve(null), emailProbe(host)]);
    facts.tls = tls;
    facts.httpRedirect = redirect;
    facts.email = email;
    drafts.push(...tlsFindings(tls, now));
    if (redirect === "no-redirect") drafts.push({ rule: "http-no-redirect", groupKey: "http-no-redirect", detail: {} });
    drafts.push(...emailFindings(email));
  }

  const txtResponse = await probe(new URL("/.well-known/security.txt", url.origin).toString(), true);
  const txtText = txtResponse && txtResponse.status === 200 && !/html/i.test(txtResponse.contentType) ? txtResponse.body.toString("utf8") : null;
  facts.securityTxt = parseSecurityTxt(txtText, now);
  if (facts.securityTxt.status === "missing") drafts.push({ rule: "security-txt-missing", groupKey: "security-txt-missing", detail: {} });
  else if (facts.securityTxt.status === "invalid") drafts.push({ rule: "security-txt-invalid", groupKey: "security-txt-invalid", detail: { problems: facts.securityTxt.problems } });

  for (const file of EXPOSED_FILES) {
    const target = new URL(file.path, url.origin).toString();
    if (exposedFile(file.kind, await probe(target))) drafts.push({ rule: file.rule, groupKey: file.rule, detail: { url: target } });
  }
  return { drafts, facts };
}
