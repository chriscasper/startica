import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { products, securityFindings, securityOccurrences, sites } from "@startica/db/schema";
import { playwrightScanner, signInProfileDir } from "../a11y/playwright-backend.ts";
import { runSiteScan } from "../a11y/scan.ts";
import { setScanner, type ScannerBackend } from "../a11y/scanner.ts";
import { createSite, siteInput, startSiteScan } from "../a11y/sites.ts";
// @ts-expect-error plain JS helper shared with the smoke tests
import { SESSION_COOKIE, startStandin } from "../a11y/standin/server.mjs";
import { verifySite } from "./verify.ts";
import { activeNoScanWindow, forgetSignIn, formatNoScanWindows, noScanReason, parseNoScanWindows, runSignedInCheck, saveSignedInSettings, signedInInput } from "./signed-in.ts";

/** S3 (ARCHITECTURE.md section 11.5): signed-in checks, without storing the session, and no-scan windows. */

describe("no-scan windows", () => {
  it("reads days and time ranges, and writes them back the same way", () => {
    const windows = parseNoScanWindows("Mon-Fri 09:00-17:00\nSat,Sun 9:30-10:00\ndaily 22:00-06:00");
    expect(windows).toEqual([
      { days: [1, 2, 3, 4, 5], from: "09:00", to: "17:00" },
      { days: [0, 6], from: "09:30", to: "10:00" },
      { days: [0, 1, 2, 3, 4, 5, 6], from: "22:00", to: "06:00" },
    ]);
    expect(formatNoScanWindows(windows)).toBe("Mon-Fri 09:00-17:00\nSat,Sun 09:30-10:00\ndaily 22:00-06:00");
    expect(parseNoScanWindows("Fri-Mon 01:00-02:00")[0]!.days).toEqual([0, 1, 5, 6]);
    expect(() => parseNoScanWindows("sometimes")).toThrow(/Couldn't read "sometimes"/);
    expect(() => parseNoScanWindows("Funday 09:00-10:00")).toThrow(/days/);
    expect(() => parseNoScanWindows("Mon 25:00-26:00")).toThrow(/time range/);
  });

  it("knows when a window is on, including one that runs past midnight", () => {
    const at = (day: number, time: string) => {
      const d = new Date(2026, 10, 1 + day); // Nov 1, 2026 is a Sunday
      const [h, m] = time.split(":").map(Number);
      d.setHours(h!, m!, 0, 0);
      return d;
    };
    const office = parseNoScanWindows("Mon-Fri 09:00-17:00");
    expect(activeNoScanWindow(office, at(1, "09:00"))).toBeTruthy();
    expect(activeNoScanWindow(office, at(1, "17:00"))).toBeNull();
    expect(activeNoScanWindow(office, at(0, "12:00"))).toBeNull();
    const night = parseNoScanWindows("Fri 22:00-06:00");
    expect(activeNoScanWindow(night, at(5, "23:00"))).toBeTruthy();
    expect(activeNoScanWindow(night, at(6, "05:59"))).toBeTruthy(); // Saturday morning, still Friday's window
    expect(activeNoScanWindow(night, at(6, "06:00"))).toBeNull();
    expect(activeNoScanWindow(night, at(4, "23:00"))).toBeNull();
    expect(noScanReason({ noScanWindows: office }, at(2, "10:00"))).toMatch(/inside a no-scan window .*Mon-Fri 09:00-17:00.*after 17:00/);
  });
});

// --- End to end: a real Chromium, the stand-in's /account behind its /login.

let standin: { url: string; close: () => Promise<void> };
let scanner: ScannerBackend | null = null;
let workspaceId = "";
let siteId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-signed-in-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  standin = await startStandin(0);
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
const openKeys = async () =>
  (await getDb().select().from(securityFindings).where(eq(securityFindings.siteId, siteId)))
    .filter((f) => f.status === "open")
    .map((f) => `${f.groupKey}×${f.pagesCount}`)
    .sort();

/** Everything in the database as text: the session's value must not be anywhere in it. */
async function wholeDatabase(): Promise<string> {
  // The proxy driver answers with rows as arrays.
  const tables = (await getDb().all<unknown[]>(sql`select name from sqlite_master where type = 'table'`)).map((row) => String(row[0]));
  expect(tables).toContain("security_occurrences");
  const out: string[] = [];
  for (const name of tables) out.push(JSON.stringify(await getDb().all(sql.raw(`select * from "${name}"`))));
  return out.join("\n");
}

/** The owner signs in by hand: here, the test plays the owner in the site's own profile. */
async function signInByHand() {
  const pw = await import("playwright");
  const context = await pw.chromium.launchPersistentContext(signInProfileDir(siteId), { headless: true });
  const page = await context.newPage();
  await page.goto(`${standin.url}/login`);
  await page.getByLabel("Email").fill("owner@fieldnote.example");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account$/);
  await context.close();
}

describe("signed-in checks (real browser)", () => {
  it("checks the signed-in page with the owner's session, and keeps only cookie names and flags", async (t) => {
    if (!scanner) return t.skip();
    expect((await verifySite(await site())).verified).toBe(true);
    await expect(saveSignedInSettings(await site(), signedInInput.parse({ pages: "https://elsewhere.example/account" }))).rejects.toThrow(/isn't on localhost/);
    await saveSignedInSettings(await site(), signedInInput.parse({ pages: "/account", sign_in_url: "/login" }));
    expect(await site()).toMatchObject({ signedInPages: [`${standin.url}/account`], signInUrl: `${standin.url}/login` });

    // Not signed in yet: the page sends it to /login, which counts as signed out, with no results.
    expect(await runSignedInCheck({ workspaceId }, { workspaceId, siteId })).toEqual({ checked: 0, signedOut: 1, failed: 0 });
    expect((await site()).signedInCheck?.pages[0]).toMatchObject({ status: "signed_out" });
    expect(await getDb().select().from(securityOccurrences)).toEqual([]);

    await signInByHand();
    expect(await runSignedInCheck({ workspaceId }, { workspaceId, siteId })).toEqual({ checked: 1, signedOut: 0, failed: 0 });
    expect(await openKeys()).toEqual([
      `cookie-no-samesite:${SESSION_COOKIE}×1`,
      `cookie-not-httponly:${SESSION_COOKIE}×1`,
      "csp-missing×1",
      "frame-protection-missing×1",
      "nosniff-missing×1",
      "permissions-policy-missing×1",
      "referrer-policy-missing×1",
      "server-version:x-powered-by:standin/1.2×1",
    ]);
    const occurrences = await getDb().select().from(securityOccurrences);
    expect(new Set(occurrences.map((o) => o.signedInUrl))).toEqual(new Set([`${standin.url}/account`]));
    expect(occurrences.every((o) => o.pageId === null)).toBe(true);
    // The session's value is in the browser profile, never in Startica's data.
    expect(await wholeDatabase()).not.toContain("=signed-in");
    expect(JSON.stringify(occurrences)).not.toContain("signed-in\"");
  }, 120_000);

  it("keeps the signed-in results through a full scan, and forgets them with the session", async (t) => {
    if (!scanner) return t.skip();
    const scanId = await startSiteScan({ id: siteId, workspaceId });
    await runSiteScan({ workspaceId }, { workspaceId, scanId });
    // The crawl's own pages add theirs; the signed-in cookie stays (probes don't clear it).
    expect(await openKeys()).toContain(`cookie-not-httponly:${SESSION_COOKIE}×1`);

    await forgetSignIn(await site());
    expect(existsSync(signInProfileDir(siteId))).toBe(false);
    expect((await site()).signedInCheck).toBeNull();
    expect(await openKeys()).not.toContain(`cookie-not-httponly:${SESSION_COOKIE}×1`);
  }, 120_000);

  it("scans nothing inside a no-scan window", async () => {
    const now = new Date();
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][now.getDay()];
    await saveSignedInSettings(await site(), signedInInput.parse({ pages: "/account", no_scan: `${day} 00:00-23:59` }));
    await expect(startSiteScan({ id: siteId, workspaceId })).rejects.toThrow(/no-scan window/);
    expect(await runSignedInCheck({ workspaceId }, { workspaceId, siteId })).toMatchObject({ skipped: expect.stringMatching(/no-scan window/) });
    await saveSignedInSettings(await site(), signedInInput.parse({ pages: "/account" }));
  });
});
