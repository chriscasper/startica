import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkReaderConnection, connectionOptions, explainDbError, sslFor, writeRisk } from "../metrics/product-db.ts";
import { generateSetupSql, METRICS_VIEW, randomPassword, readerUrlFrom, savedReaderPassword, setupSpec } from "./product-db-setup.ts";

const PW = "Abc123Abc123Abc123Abc123";
const spec = setupSpec.parse({
  metrics: [
    { name: "signups", schema: "auth", table: "users", timeColumn: "created_at", count: "rows" },
    { name: "active_users", schema: "public", table: "posts", timeColumn: "created_at", count: "distinct", distinctColumn: "author_id" },
  ],
});

describe("product DB setup SQL", () => {
  it("refuses identifiers that could inject SQL", () => {
    const result = setupSpec.safeParse({ metrics: [{ name: "x", schema: "public", table: 'posts"; drop table users; --', timeColumn: "created_at", count: "rows" }] });
    expect(result.success).toBe(false);
    expect(setupSpec.safeParse({ metrics: [{ ...spec.metrics[0]!, name: "Bad Name" }] }).success).toBe(false);
    expect(setupSpec.safeParse({ metrics: [{ ...spec.metrics[1]!, distinctColumn: undefined }] }).success).toBe(false);
  });

  it("generates an aggregate view and a read-only role, and nothing else", () => {
    const sql = generateSetupSql(spec, PW);
    expect(sql).toContain("create or replace view startica.daily_metrics as");
    expect(sql).toContain(`select ("created_at")::date as day, 'signups'::text as metric, count(*)::numeric as value`);
    expect(sql).toContain(`count(distinct "author_id")::numeric`);
    expect(sql).toContain(`from "public"."posts"`);
    expect(sql).toContain(`create role startica_reader login password '${PW}'`);
    expect(sql).toContain("alter role startica_reader set default_transaction_read_only = on;");
    expect(sql).toContain("grant select on startica.daily_metrics to startica_reader;");
    expect(sql).not.toMatch(/grant (?!usage on schema startica|select on startica\.daily_metrics)/);
    expect(() => generateSetupSql(spec, "x'; drop role postgres; --")).toThrow();
    expect(randomPassword()).toMatch(/^[A-Za-z0-9]{32}$/);
  });
});

describe("the reader's connection URL", () => {
  it("swaps in the read-only login and drops whatever user and password were pasted", () => {
    const pooler = readerUrlFrom("postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres", PW);
    expect(pooler).toEqual({
      url: `postgresql://startica_reader.abcdefghijklmnopqrst:${PW}@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
      host: "aws-0-us-east-1.pooler.supabase.com",
      projectRef: "abcdefghijklmnopqrst",
    });
    const direct = readerUrlFrom("postgres://postgres:hunter2@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", PW);
    expect(direct.url).toBe(`postgresql://startica_reader:${PW}@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require`);
    expect(direct.url).not.toContain("hunter2");
    const other = readerUrlFrom("postgresql://admin:secret@db.fieldnote.example:5432/app?sslmode=verify-full", PW);
    expect(other.url).toBe(`postgresql://startica_reader:${PW}@db.fieldnote.example:5432/app?sslmode=verify-full`);
    expect(other.projectRef).toBeNull();
  });

  it("explains a pasted string it can't use", () => {
    expect(() => readerUrlFrom("not a url", PW)).toThrow(/starts with postgresql/);
    expect(() => readerUrlFrom("https://example.com", PW)).toThrow(/starts with postgresql/);
    expect(() => readerUrlFrom("postgresql://postgres:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres", PW)).toThrow(/postgres.<project>/);
  });

  it("keeps the saved reader password when the SQL is written again", () => {
    expect(savedReaderPassword(`postgresql://startica_reader.abcdefghijklmnopqrst:${PW}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`)).toBe(PW);
    expect(savedReaderPassword(`postgresql://startica_reader:${PW}@db.fieldnote.example/app`)).toBe(PW);
    expect(savedReaderPassword("postgresql://someone:secret@db.fieldnote.example/app")).toBeNull();
    expect(savedReaderPassword(null)).toBeNull();
  });
});

describe("read-only only", () => {
  it("refuses logins that could change anything", () => {
    const safe = { rolsuper: false, rolcreaterole: false, rolbypassrls: false, can_write: false };
    expect(writeRisk(safe)).toBeNull();
    expect(writeRisk({ ...safe, rolsuper: true })).toMatch(/superuser/);
    expect(writeRisk({ ...safe, rolcreaterole: true })).toMatch(/create roles/);
    expect(writeRisk({ ...safe, can_write: true })).toMatch(/change data/);
    expect(writeRisk({ ...safe, can_write: true, writable: ["public.notes"] })).toMatch(/in public\.notes/);
  });

  it("explains the errors people hit while setting up", () => {
    expect(explainDbError({ code: "28P01", message: "password authentication failed" }, METRICS_VIEW)).toMatch(/wait 2–3 minutes/);
    expect(explainDbError({ message: "Tenant or user not found" }, METRICS_VIEW)).toMatch(/doesn't exist yet/);
    expect(explainDbError({ code: "42P01", message: 'relation "startica.daily_metrics" does not exist' }, METRICS_VIEW)).toMatch(/startica.daily_metrics doesn't exist yet/);
    expect(explainDbError({ message: "getaddrinfo ENOTFOUND db.nope.example" }, METRICS_VIEW)).toMatch(/Couldn't find that database host/);
    expect(explainDbError({ message: "connect EHOSTUNREACH 2001:db8::1:5432 - Local (:::53076)" }, METRICS_VIEW)).toMatch(/Transaction pooler/);
    expect(explainDbError({ message: "connect EHOSTUNREACH 192.0.2.1:5432" }, METRICS_VIEW)).toMatch(/Couldn't reach the database/);
  });
});

describe("product database SSL", () => {
  it("requires SSL for hosted databases unless the URL says otherwise, and not for local ones", () => {
    expect(sslFor("postgresql://startica_reader.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe("require");
    expect(sslFor("postgresql://u:pw@db.fieldnote.example:5432/app?sslmode=disable")).toBeUndefined(); // the URL decides
    expect(sslFor("postgresql://u:pw@localhost:5432/app")).toBe(false);
    expect(sslFor("postgresql://u:pw@192.168.1.20:5432/app")).toBe(false);
  });

  it("connects to Supabase's pooler with SSL, whether the URL says so or not (postgres.js's own reading)", async () => {
    for (const url of [
      "postgresql://startica_reader.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
      "postgresql://startica_reader.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
    ]) {
      const sql = postgres(url, connectionOptions(url)); // no query is sent: nothing connects
      expect(sql.options.ssl).toBe("require");
      await sql.end({ timeout: 0 });
    }
  });
});

// --- Against a real Postgres: the SQL runs as written, and the login can only read --------

function postgresBin(): string | null {
  for (const dir of ["/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql", "/Library/PostgreSQL"]) {
    if (!existsSync(dir)) continue;
    if (existsSync(join(dir, "initdb"))) return dir;
    for (const version of readdirSync(dir).sort().reverse()) if (existsSync(join(dir, version, "bin", "initdb"))) return join(dir, version, "bin");
  }
  return null;
}

const bin = postgresBin();
const PORT = 58394;
let server: ChildProcess | null = null;
let dataDir = "";

describe.skipIf(!bin)("with a real Postgres", () => {
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "startica-pg-"));
    execFileSync(join(bin!, "initdb"), ["-D", dataDir, "-U", "owner", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });
    server = spawn(join(bin!, "postgres"), ["-D", dataDir, "-p", String(PORT), "-k", dataDir, "-c", "listen_addresses=127.0.0.1"], { stdio: "ignore" });
    const owner = postgres(`postgresql://owner@127.0.0.1:${PORT}/postgres`, { onnotice: () => {} });
    for (let i = 0; i < 50; i++) {
      try {
        await owner`select 1`;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    // A Supabase-like database: auth.users and an app table.
    await owner.unsafe(`
      create schema auth;
      create table auth.users (id serial primary key, created_at timestamptz not null default now());
      create table public.posts (id serial primary key, author_id int, created_at timestamptz not null default now());
      insert into auth.users (created_at) select now() - (n || ' days')::interval from generate_series(0, 4) n;
      insert into public.posts (author_id) values (1), (1), (2);
      create role writer login password '${PW}';
      grant insert on public.posts to writer;
    `);
    // What the owner pastes into their SQL editor.
    await owner.unsafe(generateSetupSql(spec, PW));
    await owner.end();
  }, 60_000);

  afterAll(async () => {
    server?.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 500));
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("connects as the read-only login and reads only the daily totals", async () => {
    const { url } = readerUrlFrom(`postgresql://owner:ignored@127.0.0.1:${PORT}/postgres`, PW);
    const result = await checkReaderConnection(url, METRICS_VIEW);
    expect(result.metrics.sort()).toEqual(["active_users", "signups"]);

    const reader = postgres(url, { onnotice: () => {} });
    try {
      await expect(reader`select * from public.posts`).rejects.toThrow(/permission denied/);
      await expect(reader`insert into startica.daily_metrics values (current_date, 'x', 1)`).rejects.toThrow();
    } finally {
      await reader.end();
    }
  });

  it("running the SQL again keeps the login working", async () => {
    const owner = postgres(`postgresql://owner@127.0.0.1:${PORT}/postgres`, { onnotice: () => {} });
    await owner.unsafe(generateSetupSql(setupSpec.parse({ metrics: [spec.metrics[0]!] }), PW));
    await owner.end();
    const { url } = readerUrlFrom(`postgresql://x@127.0.0.1:${PORT}/postgres`, PW);
    expect((await checkReaderConnection(url, METRICS_VIEW)).metrics).toEqual(["signups"]);
  });

  it("refuses logins that can write, and explains a missing setup", async () => {
    await expect(checkReaderConnection(`postgresql://owner@127.0.0.1:${PORT}/postgres`, METRICS_VIEW)).rejects.toThrow(/superuser.*read-only login/);
    await expect(checkReaderConnection(`postgresql://writer:${PW}@127.0.0.1:${PORT}/postgres`, METRICS_VIEW)).rejects.toThrow(/can change data/);
    const wrong = readerUrlFrom(`postgresql://x@127.0.0.1:${PORT}/postgres`, "Zzz999Zzz999Zzz999Zzz999");
    // Trust auth on this test server accepts any password, so check the view instead.
    await expect(checkReaderConnection(wrong.url, "startica.missing_view")).rejects.toThrow(/doesn't exist yet/);
  });
});
