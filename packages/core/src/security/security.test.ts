import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { products, securityComponents, securityFindings, sites } from "@startica/db/schema";
import { playwrightScanner } from "../a11y/playwright-backend.ts";
import { runPageCheck, runSiteScan } from "../a11y/scan.ts";
import { pickHeaders, setScanner, type ScannerBackend, type SecurityFacts } from "../a11y/scanner.ts";
import { createSite, siteInput, startPageCheck, startSiteScan, updateSite } from "../a11y/sites.ts";
// @ts-expect-error plain JS helper shared with the smoke tests
import { startStandin } from "../a11y/standin/server.mjs";
import {
  cspWeak,
  dmarcRecord,
  emailFindings,
  exposedFile,
  pageSecurityFindings,
  parseCookies,
  parseCsp,
  parseSecurityTxt,
  spfRecord,
  tlsFindings,
} from "./checks.ts";
import { decideFinding, securityScore } from "./findings.ts";
import { buildSecurityReport } from "./report.ts";
import { SECURITY_RULES } from "./rules.ts";
import { propertyCovers, verificationReset, verifySite } from "./verify.ts";

const NOW = Date.parse("2026-10-12T12:00:00Z");
const noFacts: SecurityFacts = { insecureResources: { active: [], passive: [] }, forms: [], scripts: [], generator: null, directoryListing: false };
const rules = (drafts: { rule: string; groupKey: string }[]) => drafts.map((d) => d.groupKey).sort();

describe("page checks", () => {
  const good = {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-abc'; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
  };

  it("a well-configured HTTPS page has no findings", () => {
    expect(pageSecurityFindings({ url: "https://fieldnote.example/", siteUrl: "https://fieldnote.example/" }, good, noFacts)).toEqual([]);
  });

  it("reports every missing header, and HSTS only on HTTPS", () => {
    expect(rules(pageSecurityFindings({ url: "https://fieldnote.example/", siteUrl: "https://fieldnote.example/" }, {}, noFacts))).toEqual(
      ["csp-missing", "frame-protection-missing", "hsts-missing", "nosniff-missing", "permissions-policy-missing", "referrer-policy-missing"].sort(),
    );
    expect(rules(pageSecurityFindings({ url: "http://localhost/", siteUrl: "http://localhost/" }, {}, noFacts))).not.toContain("hsts-missing");
  });

  it("flags a short HSTS, a weak CSP and versions in server headers", () => {
    const found = pageSecurityFindings(
      { url: "https://fieldnote.example/", siteUrl: "https://fieldnote.example/" },
      { ...good, "strict-transport-security": "max-age=3600", "content-security-policy": "script-src 'self' 'unsafe-inline'", server: "nginx/1.25.3", "x-powered-by": "Express" },
      noFacts,
    );
    expect(rules(found)).toEqual(["csp-weak", "frame-protection-missing", "hsts-short", "server-version:server:nginx/1.25.3"].sort());
  });

  it("X-Frame-Options counts as frame protection", () => {
    const found = pageSecurityFindings({ url: "https://fieldnote.example/", siteUrl: "https://fieldnote.example/" }, { ...good, "content-security-policy": "script-src 'self'", "x-frame-options": "SAMEORIGIN" }, noFacts);
    expect(rules(found)).toEqual([]);
  });

  it("checks each cookie's flags", () => {
    const headers = { ...good, "set-cookie": "sid=1; Path=/; HttpOnly; Secure; SameSite=Lax\nprefs=dark; Path=/" };
    expect(rules(pageSecurityFindings({ url: "https://fieldnote.example/", siteUrl: "https://fieldnote.example/" }, headers, noFacts))).toEqual(
      ["cookie-no-samesite:prefs", "cookie-not-httponly:prefs", "cookie-not-secure:prefs"].sort(),
    );
    expect(parseCookies("a=1; secure; samesite=None")).toEqual([{ name: "a", secure: true, httpOnly: false, sameSite: "None" }]);
  });

  it("reads mixed content, insecure forms, unchecked third-party scripts and listings from the page", () => {
    const facts: SecurityFacts = {
      insecureResources: { active: ["http://cdn.example/app.js"], passive: ["http://img.example/a.png"] },
      forms: [{ action: "http://fieldnote.example/login", hasPassword: true }, { action: "https://fieldnote.example/search", hasPassword: false }],
      scripts: [
        { src: "https://fieldnote.example/app.js", integrity: false },
        { src: "https://static.fieldnote.example/x.js", integrity: false },
        { src: "https://cdn.example/lib.js", integrity: false },
        { src: "https://cdn.example/other.js", integrity: false },
        { src: "https://pinned.example/lib.js", integrity: true },
      ],
      generator: "SiteBuilder 6.2",
      directoryListing: true,
    };
    expect(rules(pageSecurityFindings({ url: "https://fieldnote.example/", siteUrl: "https://www.fieldnote.example/" }, good, facts))).toEqual(
      ["directory-listing", "form-insecure", "generator-version:sitebuilder 6.2", "mixed-content-active", "mixed-content-passive", "third-party-script-no-sri:cdn.example"].sort(),
    );
  });

  it("weak CSP: unsafe-inline without nonces, wildcards, or no script restriction", () => {
    expect(cspWeak(parseCsp("default-src 'self'"))).toBe(false);
    expect(cspWeak(parseCsp("script-src 'self' 'unsafe-inline' 'nonce-x'"))).toBe(false);
    expect(cspWeak(parseCsp("script-src 'self' 'unsafe-inline'"))).toBe(true);
    expect(cspWeak(parseCsp("script-src *"))).toBe(true);
    expect(cspWeak(parseCsp("img-src 'self'"))).toBe(true);
  });

  it("keeps only the headers Security reads", () => {
    expect(pickHeaders({ "Set-Cookie": ["a=1", "b=2"], Server: "x", "Content-Type": "text/html" })).toEqual({ "set-cookie": "a=1\nb=2", server: "x" });
  });
});

describe("site checks", () => {
  it("certificates: untrusted, expiring, old TLS", () => {
    expect(tlsFindings({ protocol: "TLSv1.3", authorized: true, error: null, validTo: NOW + 90 * 86_400_000, issuer: "CA" }, NOW)).toEqual([]);
    expect(tlsFindings({ protocol: "TLSv1.3", authorized: false, error: "CERT_HAS_EXPIRED", validTo: NOW - 1, issuer: "CA" }, NOW).map((f) => f.rule)).toEqual(["cert-invalid"]);
    expect(tlsFindings({ protocol: "TLSv1.1", authorized: true, error: null, validTo: NOW + 10 * 86_400_000, issuer: "CA" }, NOW).map((f) => f.rule)).toEqual(["cert-expiring", "tls-old"]);
  });

  it("security.txt needs a Contact and an unexpired Expires", () => {
    expect(parseSecurityTxt(null, NOW).status).toBe("missing");
    expect(parseSecurityTxt("Contact: mailto:security@fieldnote.example\nExpires: 2027-06-01T00:00:00Z\n", NOW)).toMatchObject({ status: "present", contact: ["mailto:security@fieldnote.example"] });
    expect(parseSecurityTxt("# comment\nContact: https://fieldnote.example/report\n", NOW).problems).toEqual(["No Expires: date"]);
    expect(parseSecurityTxt("Contact: x\nExpires: 2026-01-01T00:00:00Z", NOW).problems).toEqual(["Expired"]);
  });

  it("email: SPF and DMARC records", () => {
    expect(spfRecord(["google-site-verification=x", "v=spf1 include:_spf.mail.example ~all"])).toBe("v=spf1 include:_spf.mail.example ~all");
    expect(dmarcRecord(["v=DMARC1; p=none; rua=mailto:d@fieldnote.example"])).toMatchObject({ policy: "none" });
    expect(emailFindings({ domain: "fieldnote.example", spf: null, dmarc: null, dmarcPolicy: null }).map((f) => f.rule)).toEqual(["spf-missing", "dmarc-missing"]);
    expect(emailFindings({ domain: "fieldnote.example", spf: "v=spf1 -all", dmarc: "v=DMARC1; p=none", dmarcPolicy: "none" }).map((f) => f.rule)).toEqual(["dmarc-none"]);
  });

  it("exposed files are recognized by content, not by a 200", () => {
    const res = (body: string | Buffer, contentType = "text/plain") => ({ status: 200, contentType, body: Buffer.isBuffer(body) ? body : Buffer.from(body) });
    expect(exposedFile("git", res("ref: refs/heads/main\n"))).toBe(true);
    expect(exposedFile("git", res("<!doctype html><title>Home</title>", "text/html"))).toBe(false); // a catch-all page
    expect(exposedFile("env", res("DATABASE_URL=postgres://x\nAPI_KEY=abc\n"))).toBe(true);
    expect(exposedFile("env", res("Not found"))).toBe(false);
    expect(exposedFile("ds_store", res(Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31, 9])))).toBe(true);
    expect(exposedFile("git", null)).toBe(false);
  });
});

describe("verification", () => {
  it("Search Console properties cover their domain or prefix", () => {
    expect(propertyCovers("sc-domain:fieldnote.example", "https://www.fieldnote.example/")).toBe(true);
    expect(propertyCovers("sc-domain:fieldnote.example", "https://fieldnote.example.evil.test/")).toBe(false);
    expect(propertyCovers("https://fieldnote.example/", "https://fieldnote.example/docs")).toBe(true);
    expect(propertyCovers("https://fieldnote.example/docs/", "https://fieldnote.example/")).toBe(false);
    expect(propertyCovers("http://fieldnote.example/", "https://fieldnote.example/")).toBe(false);
  });

  it("a new host needs verifying again; a new path doesn't", () => {
    expect(verificationReset("https://fieldnote.example/", "https://fieldnote.example/app")).toBe(false);
    expect(verificationReset("https://fieldnote.example/", "https://docs.fieldnote.example/")).toBe(true);
  });

  it("every rule says why and how to fix", () => {
    for (const [id, rule] of Object.entries(SECURITY_RULES)) {
      expect(rule.why.length, id).toBeGreaterThan(20);
      expect(rule.fix.length, id).toBeGreaterThan(10);
    }
  });

  it("scores open findings once each, by severity", () => {
    expect(securityScore([])).toBe(100);
    expect(securityScore([{ rule: "exposed-git" }, { rule: "csp-missing" }, { rule: "permissions-policy-missing" }])).toBe(63);
    expect(securityScore(Array.from({ length: 5 }, () => ({ rule: "exposed-env" })))).toBe(0);
  });
});

// --- End to end: a real Chromium scans the stand-in site; Security finds exactly its planted problems.

let standin: { url: string; close: () => Promise<void> };
let scanner: ScannerBackend | null = null;
let workspaceId = "";
let siteId = "";
const fixedHeaders = new Set<string>();

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-security-"));
  process.env.STARTICA_DATA_DIR = dir; // screenshots are written under the data folder
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  // A "fixed" page sets its session cookie properly.
  standin = await startStandin(0, {
    headers: (path: string, planted: Record<string, string>) => (fixedHeaders.has(path) ? { ...planted, "set-cookie": "session=standin; Path=/; HttpOnly; SameSite=Lax" } : planted),
  });
  scanner = await playwrightScanner(58300);
  setScanner(scanner);
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  siteId = await createSite(workspaceId, p!.id, siteInput.parse({ name: "Stand-in", start_url: standin.url, respect_robots: "on" }));
}, 60_000);
afterAll(async () => {
  await scanner?.close?.();
  await standin?.close();
  closeDatabase();
});

const site = async () => (await getDb().select().from(sites).where(eq(sites.id, siteId)))[0]!;
const findings = async () => (await getDb().select().from(securityFindings).where(eq(securityFindings.siteId, siteId))).sort((a, b) => a.groupKey.localeCompare(b.groupKey));
const openKeys = async () => (await findings()).filter((f) => f.status === "open").map((f) => `${f.groupKey}×${f.pagesCount}`);

describe("security on the shared crawl (real browser)", () => {
  it("an unverified site gets no security checks", async (t) => {
    if (!scanner) return t.skip();
    const scanId = await startSiteScan({ id: siteId, workspaceId });
    await runSiteScan({ workspaceId }, { workspaceId, scanId });
    expect(await findings()).toEqual([]);
    expect((await site()).securityScore).toBeNull();
  }, 120_000);

  it("after verifying, a scan finds exactly the planted problems", async (t) => {
    if (!scanner) return t.skip();
    const result = await verifySite(await site());
    expect(result).toMatchObject({ verified: true, attempts: [{ method: "local", ok: true }] });

    const scanId = await startSiteScan({ id: siteId, workspaceId });
    await runSiteScan({ workspaceId }, { workspaceId, scanId });
    // Five pages without security headers (clean.html sends them all), one cookie, one script host, the Git folder, no security.txt.
    expect(await openKeys()).toEqual(
      [
        "cookie-no-samesite:session×1",
        "cookie-not-httponly:session×1",
        "csp-missing×5",
        "exposed-git×0",
        "frame-protection-missing×5",
        "nosniff-missing×5",
        "permissions-policy-missing×5",
        "referrer-policy-missing×5",
        "security-txt-missing×0",
        "server-version:x-powered-by:standin/1.2×5",
        "third-party-script-no-sri:cdn.fieldnote.example×1",
      ].sort(),
    );
    const s = await site();
    expect(s.securityScore).toBe(100 - 30 - 7 * 2 - 2 * 7); // critical .git; medium CSP and framing; seven lows
    expect(s.security).toMatchObject({ https: false, securityTxt: { status: "missing" } });
    // S2: the scan detected the library the about page loads, for the vulnerability monitor.
    const libs = await getDb().select({ name: securityComponents.name, version: securityComponents.version, via: securityComponents.via }).from(securityComponents).where(eq(securityComponents.siteId, siteId));
    expect(libs).toEqual([{ name: "jquery", version: "1.12.4", via: "url" }]);
  }, 120_000);

  it("rechecking a fixed page marks its findings fixed; decisions survive scans", async (t) => {
    if (!scanner) return t.skip();
    const powered = (await findings()).find((f) => f.rule === "server-version")!;
    await decideFinding(workspaceId, powered.id, { status: "accepted", reason: "The stand-in's version is public anyway" });
    await expect(decideFinding(workspaceId, powered.id, { status: "false_positive", reason: "" })).rejects.toThrow(/why/);

    fixedHeaders.add("/signup.html");
    const url = `${standin.url}/signup.html`;
    const scanId = await startPageCheck({ id: siteId, workspaceId }, [url]);
    await runPageCheck({ workspaceId }, { workspaceId, scanId, urls: [url] });

    const after = await findings();
    expect(after.filter((f) => f.groupKey.startsWith("cookie-")).map((f) => [f.status, f.fixedScanId])).toEqual([
      ["fixed", scanId],
      ["fixed", scanId],
    ]);
    expect(after.find((f) => f.id === powered.id)).toMatchObject({ status: "accepted", reason: "The stand-in's version is public anyway" });
    expect((await site()).securityScore).toBe(100 - 30 - 7 * 2 - 2 * 4); // the two cookie findings fixed, the server version accepted

    const report = await buildSecurityReport(await site());
    expect(report).toContain("The site's Git folder is public");
    expect(report).toContain("A05:2021 Security Misconfiguration");
    expect(report).not.toMatch(/\b(compliant|certified|pentested)\b/i);
  }, 120_000);

  it("changing the site's host undoes its verification", async () => {
    await updateSite(siteId, siteInput.parse({ name: "Stand-in", start_url: "https://other.fieldnote.example/" }));
    expect((await site()).securityVerifiedAt).toBeNull();
  });
});
