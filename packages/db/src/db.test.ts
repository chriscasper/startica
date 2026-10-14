import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace, getSetting, setSetting } from "./bootstrap.ts";
import { closeDatabase, getDb, migrateDatabase, openDatabase, transaction } from "./client.ts";
import { onChange, writtenTable } from "./events.ts";
import { claim, complete, enqueue, fail } from "./queue.ts";
import { aiModels, jobs, products } from "./schema.ts";
import { deleteSecret, fileKeyCipher, putSecret, readSecret, setCipher } from "./secrets.ts";

const dir = mkdtempSync(join(tmpdir(), "startica-db-"));
let workspaceId = "";

beforeAll(async () => {
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(new URL("../migrations", import.meta.url).pathname);
  setCipher(fileKeyCipher(join(dir, "key")));
  workspaceId = (await ensureWorkspace()).id;
});
afterAll(() => closeDatabase());

describe("bootstrap", () => {
  it("creates one workspace with default AI routing, and reuses it", async () => {
    expect((await ensureWorkspace()).id).toBe(workspaceId);
    const models = await getDb().select().from(aiModels);
    expect(models.map((m) => m.task).sort()).toEqual(["answer", "draft", "image", "ping", "research", "score", "strategy", "vision"]);
  });

  it("stores settings as JSON", async () => {
    await setSetting("budget", { usd: 30 });
    await setSetting("budget", { usd: 40 });
    expect(await getSetting("budget")).toEqual({ usd: 40 });
    expect(await getSetting("missing")).toBeNull();
  });
});

describe("schema round trip", () => {
  it("keeps JSON columns, booleans and timestamps typed", async () => {
    const [p] = await getDb()
      .insert(products)
      .values({ workspaceId, name: "Fieldnote", goalLadder: [{ key: "members", label: "Members", metric: "signups" }] })
      .returning();
    expect(p!.goalLadder[0]!.label).toBe("Members");
    expect(p!.createdAt).toBeInstanceOf(Date);
    expect(p!.intelStatus).toBe("none");
  });
});

describe("transactions", () => {
  it("rolls back on error", async () => {
    await expect(
      transaction(async (db) => {
        await db.insert(products).values({ workspaceId, name: "rolled back" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await getDb().select().from(products).where(eq(products.name, "rolled back"))).toHaveLength(0);
  });

  it("keeps concurrent writes out of an open transaction", async () => {
    let outsideRanAt = 0;
    let commitAt = 0;
    const tx = transaction(async (db) => {
      await db.insert(products).values({ workspaceId, name: "in tx" });
      await new Promise((r) => setTimeout(r, 50));
      commitAt = Date.now();
    });
    const outside = (async () => {
      await new Promise((r) => setTimeout(r, 10));
      await getDb().insert(products).values({ workspaceId, name: "outside" });
      outsideRanAt = Date.now();
    })();
    await Promise.all([tx, outside]);
    expect(outsideRanAt).toBeGreaterThanOrEqual(commitAt);
  });
});

describe("queue", () => {
  it("claims each job once, retries, and finishes", async () => {
    const id = await enqueue(workspaceId, "ping", { message: "hi" });
    const first = await claim("ping", 60);
    expect(first?.id).toBe(id);
    expect(first?.payload).toEqual({ message: "hi", workspaceId });
    expect(first?.attempts).toBe(1);
    expect(await claim("ping", 60)).toBeNull(); // leased

    await fail(id, 0);
    const second = await claim("ping", 60);
    expect(second?.attempts).toBe(2);

    await complete(id);
    expect(await getDb().select().from(jobs)).toHaveLength(0);
  });

  it("reclaims a job whose lease expired", async () => {
    const id = await enqueue(workspaceId, "slow", {});
    await claim("slow", -1); // lease already expired
    expect((await claim("slow", 60))?.id).toBe(id);
    await complete(id);
  });
});

describe("secrets", () => {
  it("encrypts at rest and decrypts on read", async () => {
    const id = await putSecret("anthropic", "sk-ant-test-123");
    expect(await readSecret(id)).toBe("sk-ant-test-123");
    const rows = await getDb().all(sql`select ciphertext from secrets where id = ${id}`);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("sk-ant-test-123");
    await deleteSecret(id);
    expect(await readSecret(id)).toBeNull();
  });
});

describe("change events", () => {
  it("parses written tables", () => {
    expect(writtenTable('insert into "products" ("id") values (?)')).toBe("products");
    expect(writtenTable('update "opportunities" set "status" = ?')).toBe("opportunities");
    expect(writtenTable('delete from "jobs" where "id" = ?')).toBe("jobs");
    expect(writtenTable('select * from "products"')).toBeNull();
  });

  it("emits one debounced event per changed table", async () => {
    await new Promise((r) => setTimeout(r, 100)); // let earlier tests' events flush
    const seen: string[] = [];
    const off = onChange((e) => seen.push(e.table));
    await getDb().insert(products).values({ workspaceId, name: "evented" });
    await getDb().update(products).set({ oneLiner: "x" }).where(eq(products.name, "evented"));
    await new Promise((r) => setTimeout(r, 100));
    off();
    expect(seen).toEqual(["products"]);
  });
});

describe("module loaded twice (as Next bundles it)", () => {
  it("a transaction started from a second copy doesn't deadlock on its own lock", async () => {
    // A second, separate instance of the client module, sharing globalThis.
    // (A variable specifier: TypeScript can't resolve the query suffix, Vite can.)
    const specifier = "./client.ts?second-copy";
    const copy = (await import(specifier)) as typeof import("./client.ts");
    const result = await Promise.race([
      copy.transaction(async (db) => (await db.select().from(products)).length),
      new Promise((_, reject) => setTimeout(() => reject(new Error("deadlocked")), 2000)),
    ]);
    expect(typeof result).toBe("number");
  });
});
