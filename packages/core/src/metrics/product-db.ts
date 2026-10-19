import postgres from "postgres";
import { isPrivateHost } from "../a11y/urls.ts";
import { z } from "zod";
import { SYNC_DAYS, type MetricRow } from "./types.ts";

/**
 * Reads product metrics from the product's own database through a read-only
 * role and an aggregate-only view (ARCHITECTURE.md section 8.2). The view's contract:
 *
 *   <view>(day date, metric text, value numeric)
 *
 * e.g. ('2026-10-08', 'signups', 4), ('2026-10-08', 'active_users', 31).
 */
export const productDbConfig = z.object({
  view: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/, "Use schema.view, e.g. startica.daily_metrics")
    .default("startica.daily_metrics"),
});

/**
 * SSL for the connection: whatever the URL's `sslmode` says; otherwise required for any
 * database that isn't on this computer or the local network (hosted Postgres, Supabase's
 * pooler, expects it, and the data crosses the internet).
 */
export function sslFor(url: string): "require" | false | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.searchParams.has("sslmode")) return undefined; // postgres.js reads it from the URL
  return isPrivateHost(parsed.hostname) ? false : "require";
}

/** Options for a product database connection. */
export function connectionOptions(url: string): postgres.Options<Record<string, never>> {
  // Only set `ssl` when deciding it here: postgres.js treats a present `ssl` key, even
  // undefined, as overriding the URL's sslmode (that turned SSL off for Supabase's pooler).
  const ssl = sslFor(url);
  return { max: 1, connect_timeout: 15, idle_timeout: 5, onnotice: () => {}, ...(ssl === undefined ? {} : { ssl }) };
}

export async function fetchProductDbMetrics(config: z.infer<typeof productDbConfig>, secret: string, opts: { days?: number } = {}): Promise<MetricRow[]> {
  if (!/^postgres(ql)?:\/\//.test(secret)) throw new Error("The product database URL should start with postgresql://");
  const sql = postgres(secret, connectionOptions(secret));
  try {
    return await fetchWith(sql, config, opts.days);
  } catch (error) {
    throw new Error(explainDbError(error, config.view));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function fetchWith(sql: postgres.Sql, config: z.infer<typeof productDbConfig>, days = SYNC_DAYS): Promise<MetricRow[]> {
  // Belt and braces: the role should already be read-only.
  return sql.begin("read only", async (tx) => {
    const [schema, view] = config.view.split(".") as [string, string];
    const rows = await tx<{ day: string; metric: string; value: string }[]>`
      select day::text as day, metric::text as metric, value::numeric as value
      from ${tx(schema)}.${tx(view)}
      where day >= current_date - ${days}::int
      order by day
    `;
    return rows.map((r) => ({ day: r.day, metric: r.metric, value: Number(r.value) }));
  });
}

/** Why a login is refused, or null when it can only read. */
// A read-only default alone isn't enough: a client can switch it off per transaction.
// What counts is what the login is allowed to do.
export function writeRisk(role: { rolsuper: boolean; rolcreaterole: boolean; rolbypassrls: boolean; can_write: boolean }): string | null {
  if (role.rolsuper) return "This login is a superuser";
  if (role.rolcreaterole) return "This login can create roles";
  if (role.rolbypassrls) return "This login bypasses row-level security";
  if (role.can_write) return "This login can change data";
  return null;
}

/**
 * Connects as the product database login and proves two things before anything is saved:
 * it can't write (Startica refuses logins that can), and it can read the view.
 * Errors say what to do next.
 */
export async function checkReaderConnection(url: string, view: string): Promise<{ rows: number; metrics: string[] }> {
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("The connection URL should start with postgresql://");
  const config = productDbConfig.parse({ view });
  const sql = postgres(url, connectionOptions(url));
  try {
    // has_table_privilege counts grants through other roles and PUBLIC too.
    const [role] = await sql<{ rolsuper: boolean; rolcreaterole: boolean; rolbypassrls: boolean; can_write: boolean }[]>`
      select r.rolsuper, r.rolcreaterole, r.rolbypassrls,
             exists (
               select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema')
                 and (has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'UPDATE')
                      or has_table_privilege(c.oid, 'DELETE') or has_table_privilege(c.oid, 'TRUNCATE'))
             ) as can_write
      from pg_roles r where r.rolname = current_user
    `;
    const risk = role ? writeRisk(role) : "Couldn't read this login's permissions";
    if (risk) throw new Error(`${risk}. Startica only connects with a read-only login: run the setup SQL and connect as startica_reader, or use a login that can only read.`);
    const rows = await fetchWith(sql, config);
    return { rows: rows.length, metrics: [...new Set(rows.map((r) => r.metric))] };
  } catch (error) {
    throw new Error(explainDbError(error, config.view));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Plain-language versions of the errors people hit while setting up. */
export function explainDbError(error: unknown, view: string): string {
  const e = error as { code?: string; message?: string };
  const message = e?.message ?? String(error);
  if (/only connects with a read-only login|Couldn't read this login/.test(message)) return message;
  if (e?.code === "28P01" || /password authentication failed/i.test(message))
    return "The read-only login's password doesn't match. Run the SQL again (it sets the password), wait a minute for Supabase to pick it up, then test again.";
  if (/Tenant or user not found/i.test(message) || (e?.code === "28000" && /role .* does not exist/i.test(message)))
    return "The read-only login doesn't exist yet. Run the setup SQL in your SQL editor first, then test again.";
  if (e?.code === "42P01" || /relation .* does not exist/i.test(message)) return `${view} doesn't exist yet. Run the setup SQL in your SQL editor first, then test again.`;
  if (e?.code === "42501" || /permission denied/i.test(message)) return `The read-only login can't read ${view}. Run the setup SQL again: it grants that.`;
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return "Couldn't find that database host. Copy the connection string again from your database provider.";
  if (/ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|timeout/i.test(message)) return "Couldn't reach the database. Check the host and port, and that this computer can reach it.";
  return message;
}
