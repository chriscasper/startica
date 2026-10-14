import { randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * Connecting the product's database (ARCHITECTURE.md section 8.2) without ever holding a login
 * that can write. Startica writes the SQL; the owner runs it in their own SQL editor
 * (Supabase → SQL Editor, or psql). It creates:
 *   - schema `startica` with one aggregate-only view `startica.daily_metrics(day, metric, value)`
 *   - login role `startica_reader`: read-only, may SELECT that view and nothing else
 * The view runs with its owner's rights, so the reader sees daily totals only. Then the
 * owner pastes their project's connection string; Startica keeps only its host, port,
 * database and project, and signs in as `startica_reader` with the password in the SQL.
 * SQL is only ever generated here from a validated spec, never taken from the client.
 */

export const READER_ROLE = "startica_reader";
export const METRICS_VIEW = "startica.daily_metrics";
const HISTORY_DAYS = 400;

const ident = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/, "Use a plain table or column name (letters, numbers and _)");

export const metricSpec = z
  .object({
    name: z.string().trim().regex(/^[a-z][a-z0-9_]{0,40}$/, "Metric names use lowercase letters, numbers and _"),
    schema: ident,
    table: ident,
    timeColumn: ident,
    count: z.enum(["rows", "distinct"]),
    distinctColumn: ident.optional(),
  })
  .refine((m) => m.count === "rows" || Boolean(m.distinctColumn), {
    message: "Name the column to count distinct values of",
    path: ["distinctColumn"],
  });

export const setupSpec = z.object({
  metrics: z
    .array(metricSpec)
    .min(1, "Add at least one metric")
    .max(12)
    .refine((ms) => new Set(ms.map((m) => m.name)).size === ms.length, "Metric names must be unique"),
});

export type MetricSpec = z.infer<typeof metricSpec>;
export type SetupSpec = z.infer<typeof setupSpec>;

/** Every Supabase app has auth.users, so signups is a sensible first metric. */
export const SUGGESTED_METRICS: MetricSpec[] = [{ name: "signups", schema: "auth", table: "users", timeColumn: "created_at", count: "rows" }];

/** Random password from an unambiguous alphabet; safe inside SQL string literals and URLs. */
export function randomPassword(length = 32): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(length), (b) => alphabet[b % alphabet.length]).join("");
}

const SAFE_PASSWORD = /^[A-Za-z0-9]{24,64}$/;

export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

function metricSelect(m: MetricSpec): string {
  const time = quoteIdent(m.timeColumn);
  const value = m.count === "rows" ? "count(*)" : `count(distinct ${quoteIdent(m.distinctColumn!)})`;
  return [
    `  select (${time})::date as day, '${m.name}'::text as metric, ${value}::numeric as value`,
    `  from ${quoteIdent(m.schema)}.${quoteIdent(m.table)}`,
    `  where ${time} >= now() - interval '${HISTORY_DAYS} days'`,
    `  group by 1`,
  ].join("\n");
}

/** The setup script the owner runs. Running it again changes the view and keeps working. */
export function generateSetupSql(spec: SetupSpec, password: string): string {
  if (!SAFE_PASSWORD.test(password)) throw new Error("Unsafe password");
  return `-- Created by Startica. Run it once in your database's SQL editor (Supabase: SQL Editor).
-- It gives Startica a read-only login that can see daily totals and nothing else.
create schema if not exists startica;

create or replace view ${METRICS_VIEW} as
${spec.metrics.map(metricSelect).join("\n  union all\n")};

do $$
begin
  if not exists (select 1 from pg_roles where rolname = '${READER_ROLE}') then
    create role ${READER_ROLE} login password '${password}';
  else
    alter role ${READER_ROLE} with login password '${password}';
  end if;
end
$$;

alter role ${READER_ROLE} set default_transaction_read_only = on;
revoke all on schema public from ${READER_ROLE};
grant usage on schema startica to ${READER_ROLE};
grant select on ${METRICS_VIEW} to ${READER_ROLE};

-- The last days of totals, so you can see it works:
select * from ${METRICS_VIEW} order by day desc limit 10;
`;
}

export type ReaderTarget = { url: string; host: string; projectRef: string | null };

/**
 * The reader's connection URL from the connection string the owner pasted (any user and
 * password in it are ignored and never stored). Supabase's pooler wants the user as
 * `startica_reader.<project ref>`; its direct host (db.<ref>.supabase.co) wants plain
 * `startica_reader`. Supabase always gets SSL.
 */
export function readerUrlFrom(pasted: string, password: string): ReaderTarget {
  if (!SAFE_PASSWORD.test(password)) throw new Error("Unsafe password");
  let url: URL;
  try {
    url = new URL(pasted.trim().replace(/^postgres:\/\//, "postgresql://"));
  } catch {
    throw new Error("Paste the connection string: it starts with postgresql://");
  }
  if (url.protocol !== "postgresql:") throw new Error("Paste the connection string: it starts with postgresql://");
  if (!url.hostname) throw new Error("The connection string has no host");
  const host = url.hostname.toLowerCase();
  const pooler = host.endsWith(".pooler.supabase.com");
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(host);
  let projectRef = direct?.[1] ?? null;
  if (pooler) {
    projectRef = /\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username))?.[1] ?? null;
    if (!projectRef) throw new Error("Paste the pooler connection string exactly as Supabase shows it: its user (postgres.<project>) says which project to use");
  }
  url.username = encodeURIComponent(pooler ? `${READER_ROLE}.${projectRef}` : READER_ROLE);
  url.password = password;
  if (!url.pathname || url.pathname === "/") url.pathname = "/postgres";
  if (pooler || direct) url.searchParams.set("sslmode", "require");
  return { url: url.toString(), host, projectRef };
}

/**
 * The reader's password from the connection URL saved earlier, so writing the SQL again
 * (e.g. to add a metric) keeps it: Supabase's pooler can keep using the old password for
 * a while after a change, and the first sync would fail with "password authentication failed".
 */
export function savedReaderPassword(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const user = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    return (user === READER_ROLE || user.startsWith(`${READER_ROLE}.`)) && SAFE_PASSWORD.test(password) ? password : null;
  } catch {
    return null;
  }
}
