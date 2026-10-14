import { EventEmitter } from "node:events";

/**
 * In-process change feed (replaces Supabase Realtime). The database layer calls
 * noteWrite() for every insert/update/delete; listeners (the /api/events SSE
 * stream) receive one debounced event per changed table.
 */
export type ChangeEvent = { table: string; at: number };

const KEY = Symbol.for("startica.events");
type Store = { emitter: EventEmitter; pending: Set<string>; timer: NodeJS.Timeout | null };
const g = globalThis as unknown as { [KEY]?: Store };

function store(): Store {
  if (!g[KEY]) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    g[KEY] = { emitter, pending: new Set(), timer: null };
  }
  return g[KEY]!;
}

const WRITE_TABLE = /^\s*(?:insert\s+(?:or\s+\w+\s+)?into|update(?:\s+or\s+\w+)?|delete\s+from)\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/i;

/** Extracts the table a write statement touches, or null for reads and other statements. */
export function writtenTable(sql: string): string | null {
  return WRITE_TABLE.exec(sql)?.[1] ?? null;
}

export function noteWrite(sql: string): void {
  const table = writtenTable(sql);
  if (!table || table === "secrets" || table.startsWith("__")) return;
  const s = store();
  s.pending.add(table);
  s.timer ??= setTimeout(() => {
    const tables = [...s.pending];
    s.pending.clear();
    s.timer = null;
    const at = Date.now();
    for (const t of tables) s.emitter.emit("change", { table: t, at } satisfies ChangeEvent);
  }, 50);
}

export function onChange(listener: (event: ChangeEvent) => void): () => void {
  const s = store();
  s.emitter.on("change", listener);
  return () => s.emitter.off("change", listener);
}
