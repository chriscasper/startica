import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { noteWrite } from "./events.ts";
import * as schema from "./schema.ts";

export type Db = SqliteRemoteDatabase<typeof schema>;

/**
 * One SQLite connection per process, shared through globalThis: the Next.js
 * server, server actions and the job runner all live in the same process, and
 * separate connections on one thread could deadlock each other.
 *
 * Statements run synchronously (node:sqlite). Transactions take a process-wide
 * lock; statements outside the transaction wait for it, so concurrent async
 * code can never slip a query into someone else's transaction.
 */

type State = {
  raw: DatabaseSync;
  db: Db;
  path: string;
  statements: Map<string, StatementSync>;
  lock: Promise<void>;
};

const GLOBAL_KEY = Symbol.for("startica.db");
const TX_KEY = Symbol.for("startica.db.transaction");
const globalStore = globalThis as unknown as { [GLOBAL_KEY]?: State; [TX_KEY]?: AsyncLocalStorage<true> };
// Shared through globalThis like the connection: Next bundles this module more
// than once, and every copy must agree on whether we're inside a transaction,
// or a transaction started in one copy deadlocks on its own lock in another.
const inTransaction = (globalStore[TX_KEY] ??= new AsyncLocalStorage<true>());

function prepared(state: State, sql: string): StatementSync {
  let stmt = state.statements.get(sql);
  if (!stmt) {
    stmt = state.raw.prepare(sql);
    stmt.setReturnArrays(true);
    if (state.statements.size > 500) state.statements.clear();
    state.statements.set(sql, stmt);
  }
  return stmt;
}

function execute(state: State, sql: string, params: unknown[], method: "run" | "all" | "values" | "get") {
  const stmt = prepared(state, sql);
  const args = params as Parameters<StatementSync["all"]>;
  if (method === "run") {
    stmt.run(...args);
    noteWrite(sql);
    return { rows: [] };
  }
  // Writes with RETURNING come through as "all"/"get".
  if (/^\s*(insert|update|delete)/i.test(sql)) noteWrite(sql);
  if (method === "get") return { rows: (stmt.get(...args) as unknown[] | undefined) ?? [] };
  return { rows: stmt.all(...args) as unknown[] };
}

export function openDatabase(path: string): Db {
  const existing = globalStore[GLOBAL_KEY];
  if (existing) {
    if (existing.path !== path) throw new Error(`Database already open at ${existing.path}`);
    return existing.db;
  }
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec(`
    pragma journal_mode = wal;
    pragma synchronous = normal;
    pragma foreign_keys = on;
    pragma busy_timeout = 5000;
  `);

  const state = { raw, path, statements: new Map(), lock: Promise.resolve() } as unknown as State;
  state.db = drizzle(
    async (sql, params, method) => {
      if (!inTransaction.getStore()) await state.lock;
      return execute(state, sql, params, method);
    },
    { schema },
  );
  globalStore[GLOBAL_KEY] = state;
  return state.db;
}

function current(): State {
  const state = globalStore[GLOBAL_KEY];
  if (!state) throw new Error("Database not open: call openDatabase() at startup");
  return state;
}

/** The open database. Call openDatabase() once at startup first. */
export function getDb(): Db {
  return current().db;
}

/** Runs fn inside a transaction. Keep it to database work: no network calls inside. */
export async function transaction<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const state = current();
  if (inTransaction.getStore()) return fn(state.db); // nested: join the outer transaction

  let release!: () => void;
  const previous = state.lock;
  state.lock = new Promise<void>((resolve) => (release = resolve));
  await previous;
  try {
    state.raw.exec("begin immediate");
    try {
      const result = await inTransaction.run(true, () => fn(state.db));
      state.raw.exec("commit");
      return result;
    } catch (error) {
      state.raw.exec("rollback");
      throw error;
    }
  } finally {
    release();
  }
}

export async function migrateDatabase(migrationsFolder: string): Promise<void> {
  const state = current();
  await migrate(
    state.db,
    async (queries) => {
      await transaction(async () => {
        for (const query of queries) state.raw.exec(query);
      });
    },
    { migrationsFolder },
  );
}

/** For tests and shutdown. */
export function closeDatabase(): void {
  const state = globalStore[GLOBAL_KEY];
  if (!state) return;
  state.raw.close();
  delete globalStore[GLOBAL_KEY];
}

export { schema };
