import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { products, securityAssets, securityComponents, securityFindings, securityOccurrences, sitePages, sites } from "@startica/db/schema";
// @ts-expect-error plain JS helper shared with the smoke test
import { startSecurityStandin } from "./standin.mjs";
import { librarySeverity, lookalikes, runMonitor, setResolver, subdomainsFrom, watchedDomain, type DnsState } from "./monitor.ts";

/** Exposure monitoring (S2) against stand-ins for crt.sh, OSV, EPSS and KEV, with DNS answers made up per name. */

let standin: { url: string; close: () => Promise<void>; setScript: (t: string) => void; requests: string[] };
let workspaceId = "";
let site: typeof sites.$inferSelect;
const DOMAIN = "fieldnote.dev";
// Made-up DNS: old-shop points at a deleted app; one look-alike is registered.
const dns: Record<string, { cname?: string; state: DnsState }> = {
  [`www.${DOMAIN}`]: { state: "exists" },
  [`app.${DOMAIN}`]: { cname: "fieldnote-app.hosting.example", state: "exists" },
  "fieldnote-app.hosting.example": { state: "exists" },
  [`old-shop.${DOMAIN}`]: { cname: "fieldnote-shop.oldhost.example", state: "exists" },
  "fieldnote-shop.oldhost.example": { state: "nxdomain" },
  "fieldnote.com": { state: "exists" },
};

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-monitor-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  standin = await startSecurityStandin(0);
  process.env.STARTICA_SECURITY_API_BASE = standin.url;
  setResolver({ cname: async (h) => (dns[h]?.cname ? [dns[h]!.cname!] : []), state: async (h) => dns[h]?.state ?? "nxdomain" });
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  site = (
    await getDb()
      .insert(sites)
      .values({ workspaceId, productId: p!.id, name: DOMAIN, startUrl: `https://${DOMAIN}/`, ownershipConfirmedAt: new Date(), securityVerifiedAt: new Date(), securityVerifiedBy: "dns" })
      .returning()
  )[0]!;
  // What a scan would have stored: jQuery 1.12.4 on one page, and a third-party script without SRI.
  const [page] = await getDb().insert(sitePages).values({ workspaceId, siteId: site!.id, url: `https://${DOMAIN}/about`, state: "done" }).returning();
  await getDb().insert(securityComponents).values({ workspaceId, siteId: site!.id, pageId: page!.id, name: "jquery", version: "1.12.4", via: "url" });
  await getDb().insert(securityOccurrences).values({ workspaceId, siteId: site!.id, pageId: page!.id, rule: "third-party-script-no-sri", groupKey: "third-party-script-no-sri:127.0.0.1", detail: { host: "127.0.0.1", scripts: [`${standin.url}/widget.js`] } });
});
afterAll(async () => {
  setResolver(null);
  delete process.env.STARTICA_SECURITY_API_BASE;
  await standin?.close();
  closeDatabase();
});

const open = async () =>
  (await getDb().select().from(securityFindings).where(and(eq(securityFindings.siteId, site.id), eq(securityFindings.status, "open"))))
    .map((f) => `${f.groupKey}:${f.severity}`)
    .sort();

describe("pieces", () => {
  it("reads subdomains from certificate logs and watches the parent domain", () => {
    expect(watchedDomain("app.fieldnote.dev")).toBe("fieldnote.dev");
    expect(subdomainsFrom([{ id: 1, issuer_name: "", name_value: "*.fieldnote.dev\napp.fieldnote.dev\nother.example", not_before: "", not_after: "", entry_timestamp: "" }], "fieldnote.dev")).toEqual(["app.fieldnote.dev", "fieldnote.dev"]);
  });

  it("makes typo and other-TLD look-alikes, other TLDs first", () => {
    const list = lookalikes("fieldnote.dev");
    expect(list.slice(0, 2)).toEqual(["fieldnote.com", "fieldnote.net"]);
    expect(list).toContain("feildnote.dev"); // swapped letters
    expect(list).toContain("fie1dnote.dev"); // l → 1
    expect(list).not.toContain("fieldnote.dev");
    expect(list.length).toBeLessThanOrEqual(60);
  });

  it("raises a library to high when an advisory is being exploited", () => {
    const v = { id: "x", cve: "CVE-1", summary: "", fixed: [], epss: 0.1, percentile: 0.9 };
    expect(librarySeverity([{ ...v, severity: "medium", kev: false }])).toBe("medium");
    expect(librarySeverity([{ ...v, severity: "medium", kev: true }])).toBe("high");
    expect(librarySeverity([{ ...v, severity: "critical", kev: false }])).toBe("critical");
  });
});

describe("a monitor run", () => {
  it("raises each monitor's finding from fixture data, with EPSS and KEV on the library", async () => {
    const result = await runMonitor({ workspaceId }, { workspaceId, siteId: site.id });
    expect(result[site.id]!.errors).toEqual([]);
    expect(await open()).toEqual(["lookalike:fieldnote.com:low", `takeover:old-shop.${DOMAIN}:high`, "vuln:jquery@1.12.4:high"]);

    const [lib] = await getDb().select().from(securityFindings).where(eq(securityFindings.groupKey, "vuln:jquery@1.12.4"));
    const vulns = lib!.detail.vulns as { cve: string; kev: boolean; epss: number; fixed: string[] }[];
    // Ranked: the KEV one first, then by EPSS.
    expect(vulns.map((v) => [v.cve, v.kev, v.epss])).toEqual([
      ["CVE-2020-11023", true, 0.11743],
      ["CVE-2020-11022", false, 0.02251],
    ]);
    expect(vulns[0]!.fixed).toEqual(["3.5.0"]);
    expect(lib!.detail).toMatchObject({ kev: true, epss: 0.11743, library: "jquery", version: "1.12.4" });

    const assets = await getDb().select().from(securityAssets).where(eq(securityAssets.siteId, site.id));
    const of = (kind: string) => assets.filter((a) => a.kind === kind).map((a) => a.name).sort();
    expect(of("subdomain")).toEqual([`app.${DOMAIN}`, DOMAIN, `old-shop.${DOMAIN}`, `www.${DOMAIN}`].sort());
    expect(of("certificate")).toEqual(["1001", "1002", "1003"]);
    expect(of("script")).toEqual([`${standin.url}/widget.js`]);
    expect((await getDb().select().from(sites).where(eq(sites.id, site.id)))[0]!.securityScore).toBe(100 - 15 - 15 - 2);
  });

  it("flags a changed third-party script once, keeps it until reviewed, and fixes what's gone", async () => {
    standin.setScript("console.log('widget v2');");
    dns[`old-shop.${DOMAIN}`] = { state: "nxdomain" }; // the record was deleted
    await runMonitor({ workspaceId }, { workspaceId, siteId: site.id });
    expect(await open()).toEqual(["lookalike:fieldnote.com:low", `script-changed:${standin.url}/widget.js:medium`, "vuln:jquery@1.12.4:high"]);
    const [takeover] = await getDb().select().from(securityFindings).where(eq(securityFindings.groupKey, `takeover:old-shop.${DOMAIN}`));
    expect(takeover!.status).toBe("fixed");

    // Same content again: the change finding stays open until the owner reviews it.
    await runMonitor({ workspaceId }, { workspaceId, siteId: site.id });
    expect(await open()).toContain(`script-changed:${standin.url}/widget.js:medium`);
  });

  it("keeps findings when a service fails, and says which", async () => {
    process.env.STARTICA_SECURITY_API_BASE = "http://127.0.0.1:9";
    try {
      const result = await runMonitor({ workspaceId }, { workspaceId, siteId: site.id });
      expect(result[site.id]!.errors.map((e) => e.split(":")[0])).toEqual(["Certificate logs and DNS", "Vulnerability databases"]);
      expect(await open()).toContain("vuln:jquery@1.12.4:high"); // not marked fixed because the check didn't run
    } finally {
      process.env.STARTICA_SECURITY_API_BASE = standin.url;
    }
  });
});
