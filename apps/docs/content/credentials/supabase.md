---
title: Product database (Supabase or Postgres)
description: Give Startica read-only access to daily totals from your product's database by running one SQL script Startica writes, on Supabase or any Postgres.
layout: doc
---

Startica can track numbers that only your product's own database knows: signups per day, active users per day, and anything else you can count. It never reads raw rows. You run a short SQL script in your own database. It creates one view that returns daily totals and a read-only login that can see that view and nothing else. Startica connects with that login.

This page covers why the access is read-only, what the script does line by line, the steps for Supabase and for any other Postgres database, how to choose metrics, what Startica stores, how to change or remove the setup, and every error message you might see.

## Why read-only only

Your product database holds your users' data. Startica only needs a handful of numbers per day, so that's all it gets:

- **You run the SQL, not Startica.** Startica writes the script and shows it to you. You run it in your database's SQL editor (Supabase) or with `psql`. Startica never holds a login that can create, change or delete anything.
- **Totals, not rows.** The view returns `(day, metric, value)`: for example, 4 signups on 2026-10-08. No emails, names or IDs leave your database.
- **One view, nothing else.** The login can `SELECT` from `startica.daily_metrics` only. It has no access to your tables.
- **Read-only twice.** The login's sessions are read-only by default, and every Startica query also runs in a read-only transaction.
- **Checked before saving.** Before Startica saves a connection, it signs in and checks what the login is allowed to do. It refuses a superuser, a login that can create roles, a login that bypasses row-level security, and a login with `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` on any table, including grants it gets through other roles or `PUBLIC`. The one exception is pg_cron's run log (`cron.job_run_details`): pg_cron lets every login delete from it, but its row-level security only reaches that login's own jobs, and `startica_reader` has none. A read-only session setting alone isn't enough, because a client can switch it off.

There's no Supabase sign-in, no OAuth app and no Management API access to set up.

> [!NOTE]
> Older versions of Startica had a **Connect with Supabase** sign-in that ran the setup SQL for you. It needed Supabase's Database write permission, so it was removed. Updating Startica deletes the saved sign-in tokens and OAuth client. A product database connection made that way keeps working: it already uses the read-only `startica_reader` login. You can delete the OAuth app in your Supabase organization settings.

## Before you start

- Startica is open and the right product is active in the header.
- You can run SQL as the owner of the tables you want to count. On Supabase, the SQL Editor runs as `postgres`, which works.
- You know which tables and columns hold what you want to count. See [Choose your metrics](#choose-your-metrics).

It takes about 5 minutes.

## Set up on Supabase

### 1. Pick what to count

1. Open **Settings → Products**. In **Connections for …**, find **Product database** and click **Set up**.
2. The dialog **Connect the product database** opens at **1. Pick what to count**. It starts with one metric, `signups`, counting rows in `auth.users` per day of `created_at`. Every Supabase project has that table.
3. Change it or click **Add metric** for more (up to 12). Each metric has:

   | Field | What to enter |
   | --- | --- |
   | **Metric name** | Lowercase letters, numbers and `_`, starting with a letter, for example `signups`. Each name only once. |
   | **Table** | `schema.table`, for example `auth.users` or `public.events`. Without a schema, Startica uses `public`. |
   | **Date column** | The column that dates each row, for example `created_at`. Each row counts toward that day. |
   | **Count per day** | **Rows** counts every row. **Distinct…** counts different values of a column you name, for example `user_id`. |

   The trash icon removes a metric.

4. Click **Write the SQL**.

Startica checks the names (letters, numbers and `_` only) and writes the script. It doesn't look at your database yet, so a misspelled table shows up when you run the script.

### 2. Run the SQL

1. Under **2. Run this SQL in your database**, click **Copy**.
2. Open your project's **SQL Editor** in the Supabase dashboard. The **SQL Editor** link in the dialog opens a new query. On a first setup Startica doesn't know your project yet, so Supabase may ask you to pick it.
3. Paste the script and click **Run**.

The last statement shows up to 10 rows of daily totals, so you can see it works. If a table or column name is wrong, Postgres says which (for example `relation "public.event" does not exist`). Fix it in step 1, click **Write the SQL** again, copy and run the new script.

> [!WARNING]
> The script contains the read-only login's password. Don't save it in a shared snippet or commit it anywhere. If it leaks, run [the removal SQL](#remove-access) or set up again to get a new password.

### 3. Paste the connection string

1. In the Supabase dashboard, click **Connect** at the top of your project and choose **Transaction pooler**. Copy the connection string. It looks like this:

   ```text
   postgresql://postgres.abcdefghijklmnopqrst:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```

2. Paste it into **3. Paste your connection string** in Startica. Leave `[YOUR-PASSWORD]` as it is. Startica doesn't need your database password and never stores it.
3. Click **I ran it: test and save**.

Startica builds the read-only login's connection from the string you pasted:

- It keeps the host, port, database and options, and drops the user and password you pasted.
- On Supabase's pooler, it signs in as `startica_reader.<project ref>`. The pooler needs the project ref in the user name, so paste the pooler string exactly as Supabase shows it.
- On Supabase's direct host (`db.<project ref>.supabase.co`), it signs in as plain `startica_reader`.
- It always uses SSL for Supabase (`sslmode=require`).

Then it tests the login (see [Why read-only only](#why-read-only-only)) and reads the view. When both pass, it saves the connection, shows "Connected with the read-only login. Syncing now." and syncs right away. The **Product database** row shows **Connected** and "Tracking: _metric names_ · _host_".

> [!TIP]
> If the test says the password doesn't match right after you ran the SQL, wait 2–3 minutes and click **I ran it: test and save** again. Supabase's pooler can take a few minutes to pick up a new password. Don't click **Write the SQL** in between: before the first save, it makes a new password each time.

## Set up on any other Postgres

The steps are the same as for Supabase, with your own tools:

1. In **Settings → Products → Connections for … → Product database**, click **Set up**, define your metrics and click **Write the SQL**.
2. Click **Copy** and run the script as the owner of the tables, for example with `psql`:

   ```bash
   psql "postgresql://owner@db.fieldnote.example:5432/fieldnote" -f startica-setup.sql
   ```

   Save the copied script as `startica-setup.sql` first, and delete the file when you're done: it contains the password. You can also paste it into any SQL client.

3. Paste a connection string for the database, for example `postgresql://owner@db.fieldnote.example:5432/fieldnote`. Startica replaces the user with `startica_reader` and the password with the one from the script, and keeps the host, port, database and options. If there's no database name, it uses `postgres`.
4. Click **I ran it: test and save**.

Startica uses SSL for any database that isn't on this computer or your local network, unless the connection string says otherwise. If your server doesn't support SSL, add `?sslmode=disable` to the string you paste, but only on a network you trust. To require certificate checks, use `?sslmode=verify-full`.

The database must be reachable from your computer: check firewalls and allow-lists.

## The SQL line by line

This is the script for the Fieldnote demo product with two metrics: `signups` from `auth.users`, and `active_users` as distinct `user_id` per day from `public.events`. The password here is a placeholder; yours is 32 random letters and digits.

```sql
-- Created by Startica. Run it once in your database's SQL editor (Supabase: SQL Editor).
-- It gives Startica a read-only login that can see daily totals and nothing else.
create schema if not exists startica;

create or replace view startica.daily_metrics as
  select ("created_at")::date as day, 'signups'::text as metric, count(*)::numeric as value
  from "auth"."users"
  where "created_at" >= now() - interval '400 days'
  group by 1
  union all
  select ("created_at")::date as day, 'active_users'::text as metric, count(distinct "user_id")::numeric as value
  from "public"."events"
  where "created_at" >= now() - interval '400 days'
  group by 1;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'startica_reader') then
    create role startica_reader login password 'PASSWORD';
  else
    alter role startica_reader with login password 'PASSWORD';
  end if;
end
$$;

alter role startica_reader set default_transaction_read_only = on;
revoke all on schema public from startica_reader;
grant usage on schema startica to startica_reader;
grant select on startica.daily_metrics to startica_reader;

-- The last days of totals, so you can see it works:
select * from startica.daily_metrics order by day desc limit 10;
```

What each part does:

| Statement | What it does |
| --- | --- |
| `create schema if not exists startica` | A schema of its own for Startica's view, separate from your app's tables. Supabase's Data API doesn't expose it unless you add it. |
| `create or replace view startica.daily_metrics as …` | The view Startica reads. Each metric is one `select` that groups rows by day; the selects are joined with `union all`. It returns three columns: `day` (date), `metric` (text) and `value` (numeric). |
| `("created_at")::date as day` | Turns the date column into a calendar day. Timestamps are cut at midnight in the database's time zone (UTC on Supabase). |
| `count(*)` or `count(distinct "user_id")` | **Rows** or **Distinct…** from the form. |
| `where … >= now() - interval '400 days'` | Only the last 400 days, so the view stays fast on big tables. |
| `group by 1` | One row per day. Days with nothing to count are left out. |
| Names in double quotes | Every table and column name is quoted, and Startica only accepts plain names (letters, numbers and `_`), so a name can't change the SQL. |
| `do $$ … $$` | Creates the `startica_reader` login with the password, or sets the password if the login already exists. That's why running the script again is safe. |
| `alter role … set default_transaction_read_only = on` | Every session of the login starts read-only. |
| `revoke all on schema public from startica_reader` | Removes any rights given to the login directly on the `public` schema. |
| `grant usage on schema startica` | Lets the login see the `startica` schema. |
| `grant select on startica.daily_metrics` | Lets the login read the view. This is the only thing it can read. |
| `select * from startica.daily_metrics …` | Shows the latest totals so you can check the numbers. It changes nothing. |

The view runs with its owner's rights (the user who ran the script). That's how the read-only login gets daily totals without any access to the tables underneath.

Each sync opens a read-only transaction as `startica_reader` and runs:

```sql
select day::text as day, metric::text as metric, value::numeric as value
from startica.daily_metrics
where day >= current_date - 90
order by day
```

`90` is the product's [analytics history](/guides/analytics#history) in days: 90 by default, more if you chose a longer history under **Keep analytics history for**. Every sync reads the whole history again, so a corrected day in your database is corrected in Startica on the next sync.

Syncs run every day at 08:15 local time while Startica is open, and when you click **Sync now**.

### Check it yourself

To confirm the login sees totals and nothing else, run this as the owner (replace `public.events` with one of your tables):

```sql
set role startica_reader;
select * from startica.daily_metrics order by day desc limit 5;  -- works
select * from public.events limit 1;                             -- permission denied
reset role;
```

If the second query works, the table is readable by `PUBLIC` or by a role `startica_reader` belongs to. Revoke that grant.

## Choose your metrics

The **Analytics** page charts two metric names: `signups` and `active_users`. Any other metric is listed under **Conversions** → **Other product numbers**, summed over the period, and the weekly roadmap re-plan reads them all.

| Metric | Table | Date column | Count per day |
| --- | --- | --- | --- |
| `signups` | `auth.users` (Supabase Auth), or your own users table such as `public.accounts` | `created_at` | **Rows** |
| `active_users` | A table with one row per action or visit, such as `public.events` or `public.sessions` | `created_at` | **Distinct…** `user_id` |
| `notes_created` | The table of the thing people make in your product, such as `public.notes` | `created_at` | **Rows** |
| `paying_signups` | A subscriptions table, such as `public.subscriptions` | `started_at` | **Rows** |

Tips:

- **Active users** need a table that gets a row each time someone does something. If you have no events table, use the table of what people create (for example distinct `author_id` in `public.notes`), and the number means "people who created something that day".
- **Pick an indexed date column** on big tables. The view filters and groups by it.
- **One table per metric.** A metric that needs a join or a filter (for example only verified users) can't be made in the form. Write your own view and use [a URL instead](#use-a-url-instead).
- Older setups may use `active_posters`. The Analytics page still reads it as active users.

## What Startica stores

| What | Where | Encrypted |
| --- | --- | --- |
| The read-only login's connection URL (host, port, database, `startica_reader` user and its password) | `secrets` table | Yes |
| The view name, your metric definitions, the host and the Supabase project ref | `connections` table | No |
| The daily totals for the product's analytics history (90 days by default), refreshed on each sync | `metrics_snapshots` table | No |

Startica never stores the user or password from the connection string you pasted. Everything stays in the [data folder](/reference/data-folder) on your computer. See [Privacy and security](/concepts/privacy-security).

## Change your metrics later

1. On the **Product database** row, click **Change setup**. Your saved metrics are filled in.
2. Change, add or remove metrics, then click **Write the SQL**.
3. Copy and run the new script, the same way as the first time.
4. Leave the connection string empty to keep the saved database ("Leave empty to keep the saved database"), and click **I ran it: test and save**.

The new script replaces the view. It keeps the same password, because Startica reads it from the saved connection, so the login keeps working even before you run it. New metrics appear after the sync.

To move to a different database or project, paste its connection string in step 4 instead.

## Use a URL instead

If you already have your own view and read-only login, or need SQL the form can't make, click **Use a URL instead** on the **Product database** row. The dialog **Connect with a connection URL** has two fields:

| Field | What to enter |
| --- | --- |
| **View** | `schema.view` in lowercase. Default `startica.daily_metrics`. |
| **Connection URL of a read-only login** | A full `postgresql://` URL with the login's user and password. Leave it empty to keep the saved one. |

The view must return `day` (`date`), `metric` (`text`) and `value` (`numeric`), one row per day and metric, for example:

| `day` | `metric` | `value` |
| --- | --- | --- |
| `2026-10-08` | `signups` | `4` |
| `2026-10-08` | `active_users` | `31` |

Click **Test and save**. Startica runs the same check as the guided setup: it refuses a login that can change data, and it reads the view. Then it saves the URL encrypted and syncs.

For Supabase's pooler, the user is `startica_reader.<project ref>`. For example:

```text
postgresql://startica_reader.abcdefghijklmnopqrst:PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require
```

For another database, for example `postgresql://startica_reader:PASSWORD@db.fieldnote.example:5432/fieldnote?sslmode=require`.

## Remove access

The trash icon on the **Product database** row asks "Remove the Product database connection for this product?" and then deletes the saved connection and its URL from Startica. It doesn't touch your database.

To remove Startica's view and login from your database, run this as the owner (in Supabase's SQL Editor, or with `psql`):

```sql
drop view if exists startica.daily_metrics;
drop schema if exists startica;
drop role if exists startica_reader;
```

`drop schema` without `cascade` only works when the schema is empty, so it won't remove anything you added there yourself. If `drop role` says other objects depend on it, a grant is left somewhere: run `drop owned by startica_reader;` first. In the current database, that drops the objects the role owns (none from this script) and revokes its grants.

Removing the login stops syncing straight away, even if you leave the connection in Startica.

## Troubleshooting

The test runs when you click **I ran it: test and save** or **Test and save**, and errors show as a message in Startica. Errors during a daily sync show in red on the **Product database** row.

### Refused logins

Startica refuses to save a login that can do more than read. Each message ends with "Startica only connects with a read-only login: run the setup SQL and connect as startica_reader, or use a login that can only read."

| Message starts with | Cause and fix |
| --- | --- |
| "This login is a superuser." | You pasted an admin URL into **Use a URL instead**. Use the guided setup, or the `startica_reader` URL. |
| "This login can create roles." | The login has `CREATEROLE`. Use `startica_reader`, or run `alter role <name> nocreaterole;`. |
| "This login bypasses row-level security." | The login has `BYPASSRLS`. Use `startica_reader`, or run `alter role <name> nobypassrls;`. |
| "This login can change data." | The login has `INSERT`, `UPDATE`, `DELETE` or `TRUNCATE` on at least one table, directly, through another role, or through `PUBLIC`. Find and revoke the grant, for example `revoke insert, update, delete, truncate on all tables in schema public from public;` if it comes from `PUBLIC`. |
| "Couldn't read this login's permissions." | Startica couldn't find the login in `pg_roles`. Check the URL's user name. |

### Connection and setup errors

| Message | Cause and fix |
| --- | --- |
| "The read-only login's password doesn't match. Run the SQL shown in the setup (it sets the password), wait 2–3 minutes for Supabase to pick it up, then test again without writing the SQL again." | The password in the database isn't the one Startica has. Usually the script wasn't run yet, or an older script was run after a newer one. Run the script shown in the dialog. |
| "The read-only login doesn't exist yet. Run the setup SQL in your SQL editor first, then test again." | `startica_reader` isn't in the database (on Supabase's pooler: "Tenant or user not found"). Run the script, or check that you pasted the connection string of the same project. |
| "startica.daily_metrics doesn't exist yet. Run the setup SQL in your SQL editor first, then test again." | The view is missing. The script didn't run, or stopped at an error before the view was made. With **Use a URL instead**, the message names your view. |
| "The read-only login can't read startica.daily_metrics. Run the setup SQL again: it grants that." | The `grant` statements didn't run, or the view was replaced by someone else. Running the script again fixes it. |
| "Couldn't find that database host. Copy the connection string again from your database provider." | The host name doesn't resolve. Copy the string again; check for typos. |
| "Couldn't reach the database. Check the host and port, and that this computer can reach it." | A firewall, allow-list or wrong port blocks the connection, or the database is paused. On Supabase, use the **Transaction pooler** string; the direct connection may need IPv6. |
| "Paste the connection string: it starts with postgresql://" | What you pasted isn't a `postgresql://` or `postgres://` URL. |
| "The connection string has no host" | The URL is missing its host. Copy it again. |
| "Paste the pooler connection string exactly as Supabase shows it: its user (postgres.<project>) says which project to use" | You pasted a Supabase pooler string whose user isn't `postgres.<project ref>`. Copy it again from **Connect → Transaction pooler** without editing the user. |
| "Paste your database's connection string" | **I ran it: test and save** on a first setup with an empty connection string. |
| "The connection URL should start with postgresql://" | **Use a URL instead** with a URL that isn't `postgresql://` or `postgres://`. |
| "The product database URL should start with postgresql://" | A daily sync found a saved URL in the wrong format. Save it again with **Use a URL instead**. |
| "Use schema.view, e.g. startica.daily_metrics" | The **View** field isn't a lowercase `schema.view` name. |
| "Metric names use lowercase letters, numbers and _" | Fix the **Metric name**. |
| "Use a plain table or column name (letters, numbers and _)" | A table, date or distinct column has a space, dash or other character. |
| "Name the column to count distinct values of" | **Distinct…** is picked with no column. |
| "Metric names must be unique" / "Add at least one metric" | Each metric needs its own name, and you need at least one. |

Postgres's own errors when you run the script, such as `relation "public.event" does not exist` or `column "created" does not exist`, mean a table or column name in step 1 is wrong. Fix it and write the SQL again.

In [demo mode](/guides/demo-mode), Startica skips the connection test.
