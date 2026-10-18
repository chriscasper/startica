import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { products, sites } from "@startica/db/schema";

// DNS and the file request are stood in for, so the test makes no outside calls.
const net = vi.hoisted(() => ({
  txt: {} as Record<string, string[][]>,
  file: null as { status: number; contentType: string; body: Buffer } | null,
}));
vi.mock("node:dns/promises", async (original) => ({
  ...(await original<typeof import("node:dns/promises")>()),
  getServers: () => ["192.0.2.53"],
  resolveTxt: async (host: string) => {
    if (net.txt[host]) return net.txt[host];
    throw Object.assign(new Error("no data"), { code: "ENODATA" });
  },
}));
vi.mock("./probes.ts", () => ({ probe: async () => net.file }));

const { ensureVerifyToken, txtValue, VERIFY_FILE_PATH, verifySite } = await import("./verify.ts");

let siteId = "";
const site = async () => (await getDb().select().from(sites).where(eq(sites.id, siteId)))[0]!;
const detail = (attempt: { details: { label: string; value: string }[] } | undefined, label: string) => attempt?.details.find((d) => d.label === label)?.value;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-verify-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  const workspaceId = (await ensureWorkspace()).id;
  const [p] = await getDb().insert(products).values({ workspaceId, name: "Fieldnote" }).returning();
  const [s] = await getDb()
    .insert(sites)
    .values({ workspaceId, productId: p!.id, name: "Fieldnote", startUrl: "https://www.fieldnote.example/", ownershipConfirmedAt: new Date() })
    .returning();
  siteId = s!.id;
  await ensureVerifyToken(s!);
});
afterAll(() => closeDatabase());
beforeEach(async () => {
  net.txt = {};
  net.file = null;
  await getDb().update(sites).set({ securityVerifiedAt: null, securityVerifiedBy: null }).where(eq(sites.id, siteId));
});

describe("verifySite", () => {
  it("with nothing set up, every method fails and says what it saw", async () => {
    net.txt["fieldnote.example"] = [["v=spf1 -all"]];
    net.file = { status: 404, contentType: "text/html", body: Buffer.from("Not found") };
    const result = await verifySite(await site());
    expect(result.verified).toBe(false);
    expect(result.attempts.map((a) => [a.method, a.ok])).toEqual([["search_console", false], ["dns", false], ["file", false]]);
    expect((await site()).securityVerifiedAt).toBeNull();

    const [sc, dns, file] = result.attempts;
    expect(detail(sc, "Connection")).toBe("(not connected)");
    expect(detail(dns, "DNS servers")).toBe("192.0.2.53");
    expect(detail(dns, "TXT on www.fieldnote.example")).toBe("(lookup failed: ENODATA)");
    expect(detail(dns, "TXT on fieldnote.example")).toBe("v=spf1 -all");
    expect(detail(file, "URL")).toBe(`https://www.fieldnote.example${VERIFY_FILE_PATH}`);
    expect(detail(file, "HTTP status")).toBe("404");
    expect(file?.note).toContain("HTTP 404");
  });

  it("a TXT record with the token on the bare domain verifies by DNS", async () => {
    const token = (await site()).securityToken!;
    net.txt["fieldnote.example"] = [["v=spf1 -all"], [txtValue(token)]];
    const result = await verifySite(await site());
    expect(result.verified).toBe(true);
    expect(result.attempts.find((a) => a.method === "dns")).toMatchObject({ ok: true, note: "TXT record found on fieldnote.example" });
    expect((await site()).securityVerifiedBy).toBe("dns");
  });

  it("the file verifies only when it holds the token", async () => {
    const token = (await site()).securityToken!;
    net.file = { status: 200, contentType: "text/plain", body: Buffer.from("something else") };
    const wrong = await verifySite(await site());
    expect(wrong.verified).toBe(false);
    expect(wrong.attempts.find((a) => a.method === "file")?.note).toContain("without the code");

    net.file = { status: 200, contentType: "text/plain", body: Buffer.from(`${token}\n`) };
    const right = await verifySite(await site());
    expect(right.verified).toBe(true);
    expect((await site()).securityVerifiedBy).toBe("file");
  });

  it("a local site verifies without any lookups", async () => {
    await getDb().update(sites).set({ startUrl: "http://localhost:3000/" }).where(eq(sites.id, siteId));
    const result = await verifySite(await site());
    expect(result).toMatchObject({ verified: true, attempts: [{ method: "local", ok: true, details: [{ label: "Host", value: "localhost" }] }] });
    await getDb().update(sites).set({ startUrl: "https://www.fieldnote.example/" }).where(eq(sites.id, siteId));
  });
});
