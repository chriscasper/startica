---
title: Add a metrics connector
description: Add a new product metrics source to Startica, from the MetricRow contract to sync, secrets, the Settings UI and tests.
layout: doc
---

A metrics connector pulls numbers about a user's product (visits, signups, revenue) into Startica, so the Analytics page and the roadmap can show what's working. Startica ships four: Google Analytics 4 (`ga4`), Umami (`umami`), Stripe (`stripe`) and a product database view (`product_db`). GA4 and Umami are both web analytics and write the same metric rows; screens read the product's one web source through `webSource()` in `packages/core/src/metrics/web.ts`. This page shows how to add another, using Stripe as the model because it's the simplest: one pasted key, no sign-in.

> [!NOTE]
> Connectors are read-only and pull on a schedule. Startica runs on localhost, so webhooks can't reach it. Ask for the narrowest read-only access the source offers, and open a Discussion before adding a connector that needs a hosted service or a paid plan.

## How syncing works

- Each product has at most one connection per kind (`connections` table, unique on product and kind). A connection holds a JSON `config` and a reference to an encrypted secret.
- The `metrics_sync` job (`packages/core/src/metrics/sync.ts`) runs daily at 08:15, when the user clicks **Save and test** in Settings, and on **Sync now**. For each connection in scope it reads the secret, calls the connector, upserts the rows into `metrics_snapshots`, and records `status`, `lastError` and `lastSyncedAt` on the connection.
- `sync.ts` decides the window with `packages/core/src/metrics/history.ts`. Each product keeps `historyDays(productId)` days (90 by default, up to 486, set in Settings → Products). GA4 and Umami read the whole history on a connection's first sync, then only the last `REFRESH_DAYS` (5) days: `syncWindow()` compares the history's first day with `syncedFrom` in the connection's `config`, which `sync.ts` sets after a full read. Saving the connection replaces its config, so the next sync reads everything again; so does a longer history. Stripe and the product database are cheap to read and re-read the whole history every sync.
- Rows are upserted on product, day, source, metric and dimension, so re-syncing is safe and late data gets corrected. After syncing, `pruneMetrics()` drops a product's synced rows older than its history; manual numbers are kept.

## The data contract

From `packages/core/src/metrics/types.ts`:

```ts
export type MetricSource = "ga4" | "umami" | "stripe" | "product_db" | "manual";

/** One value for one day. `dimension` splits a metric, e.g. "source:reddit / community". */
export type MetricRow = {
  day: string; // YYYY-MM-DD
  metric: string;
  dimension?: string;
  value: number;
};

/** Days read when a caller doesn't say (tests); syncs read the product's history (history.ts). */
export const SYNC_DAYS = 30;

/** Long splits (pages, landing pages, countries, browsers) keep this many values per day. */
export const TOP_PER_DAY = 50;

/** What GA4 and Umami both write, per local day. Counts only, never averages or rates. */
export const WEB_METRICS = {
  totals: ["sessions", "users", "new_users", "pageviews", "engaged_sessions", "engagement_seconds", "key_events"],
  sessions: ["source:", "page:", "landing:", "country:", "device:", "browser:", "utm_content:"],
  key_events: ["event:", "utm_content:", "source:", "landing:"],
} as const;

export function isoDay(date: Date): string;
export function daysAgo(n: number, from = new Date()): Date;
```

A connector is a function from its validated config, its secret and a window to rows. GA4 takes the first day to read, the others a number of days:

```ts
fetchGa4Metrics(config, secret, { from, signal })     // from: YYYY-MM-DD
fetchUmamiMetrics(config, secret, { days, signal })
fetchStripeMetrics(config, secret, { days })
fetchProductDbMetrics(config, secret, { days })
```

Default the window to `SYNC_DAYS` when the caller doesn't pass one, so tests stay short; real syncs always pass the product's window.

Naming conventions:

- Metric names are `snake_case` (`sessions`, `key_events`, `active_subscriptions`, `mrr`, `new_subscriptions`, `cancellations`). Reuse an existing name when it means the same thing. A new web analytics source writes the names in `WEB_METRICS`, so every screen works with it.
- Store counts, never averages or rates, so any range adds up. Screens divide (pages per visit, engaged share) after summing. `users` is per day, so a range's sum overcounts returning people; screens show it as a daily average.
- Leave `dimension` empty for totals. Splits use `prefix:value`, like `source:<source> / <medium>`, `landing:/pricing`, `country:US`, `utm_content:<draft id>` or `event:<name>`. Long splits keep the top `TOP_PER_DAY` values per day (`topPerDay()` in `ga4.ts`).
- Levels (like `mrr` and `active_subscriptions`) get one row per day for the whole window, rebuilt from history where the source allows it; screens read the last value in a period. Counts get one row per day, including zero days.
- Undimensioned metrics are automatically included in the numbers the roadmap planner sees.

## Step 1: Write the connector

Create `packages/core/src/metrics/<kind>.ts`. Export a Zod schema for the config, a pure summarizing function you can test, and the fetch function. The shape of `stripe.ts`:

```ts
import { z } from "zod";
import { daysAgo, isoDay, SYNC_DAYS, type MetricRow } from "./types.ts";

export const stripeConfig = z.object({});

/** Pure: per day over the last `days` days, active subscriptions, trials and MRR rebuilt from each
 *  subscription's start and end, plus new subscriptions, cancellations, MRR gained and lost, and revenue. */
export function summarizeSubscriptions(subs: SubscriptionLike[], now = new Date(), days = SYNC_DAYS + 1, invoices: InvoiceLike[] = []): MetricRow[] {
  // …
}

export async function fetchStripeMetrics(_config: z.infer<typeof stripeConfig>, secret: string, opts: { days?: number } = {}): Promise<MetricRow[]> {
  if (!/^(rk|sk)_(live|test)_/.test(secret)) throw new Error("That doesn't look like a Stripe key (rk_live_… or rk_test_…)");
  const days = opts.days ?? SYNC_DAYS + 1;
  // page through subscriptions and paid invoices, collect, then:
  return summarizeSubscriptions(subs, new Date(), days, invoices);
}
```

Guidelines:

- Validate the secret's format early and throw an `Error` with a message the user can act on. The message is shown on the connection in Settings.
- Never log the secret or include it in an error message.
- Keep config non-secret (ids, view names). Anything that grants access goes in the secret.
- Don't write to the database from the connector; return rows and let `sync.ts` save them.
- Read the whole window you're given. Don't keep state of your own about what was read before: `sync.ts` and `history.ts` decide that.
- If an optional permission is missing, skip that part and return the rest, the way Stripe carries on without invoice access.

## Step 2: Register the kind

The kind appears in a few type lists that must agree:

- `packages/db/src/schema.ts`: the `kind` enum on `connections` and the `source` enum on `metricsSnapshots`.
- `packages/core/src/metrics/types.ts`: `MetricSource`.
- `packages/core/src/metrics/sync.ts`: the `Kind` type and the `connectors` map.

```ts
type Kind = "ga4" | "umami" | "stripe" | "product_db" | "pageviews";

type Window = { from: string; days: number; signal?: AbortSignal };

const connectors: Record<Kind, (config: unknown, secret: string, window: Window) => Promise<MetricRow[]>> = {
  ga4: (config, secret, w) => fetchGa4Metrics(ga4Config.parse(config), secret, { from: w.from, signal: w.signal }),
  umami: (config, secret, w) => fetchUmamiMetrics(umamiConfig.parse(config), secret, { days: w.days, signal: w.signal }),
  stripe: (config, secret, w) => fetchStripeMetrics(stripeConfig.parse(config), secret, { days: w.days }),
  product_db: (config, secret, w) => fetchProductDbMetrics(productDbConfig.parse(config), secret, { days: w.days }),
  pageviews: (config, secret, w) => fetchPageviewsMetrics(pageviewsConfig.parse(config), secret, { days: w.days }),
};
// Web analytics reads its history once, then the last few days (history.ts); the others re-read it all.
const incremental = new Set<Kind>(["ga4", "umami"]);
```

(`pageviews` stands in for your new kind.) Add it to `incremental` only if reading the whole history every day would be slow or hit rate limits, and the source can correct recent days. These enums are TypeScript-only in SQLite, so no migration is needed; run `yarn db:generate` to confirm it reports no changes.

## Step 3: Secrets

You don't handle encryption yourself. When the user saves the form, `saveConnection()` in `apps/desktop-web/src/app/(app)/settings/actions.ts`:

1. Validates the form with the kind's schema in `connectionInput`.
2. Splits off the `secret` field and stores everything else as the connection's `config`.
3. Saves the secret encrypted with `putSecret("connection-<connection id>", secret)` (OS keychain in the desktop app), or replaces it with `updateSecret()`. A blank secret keeps the saved one.
4. Enqueues `metrics_sync` for that connection, so the result shows up as the connection's status.

At sync time, `connectionSecret()` in `sync.ts` decrypts it with `readSecret()`. Secrets are only ever decrypted inside the server process.

Add your kind to `connectionInput`. Field names must match the form's field names, and the credential must be called `secret`:

```ts
const connectionInput = {
  // …ga4, umami, search_console, bing_webmaster, stripe, product_db…
  pageviews: z.object({
    siteId: z.string().trim().min(1, "Enter the site's domain, e.g. fieldnote.example"),
    secret: z.string().trim(),
  }),
} as const;
```

Startica has no OAuth sign-ins. The Google and Supabase sign-ins were removed: each one needed every user to register their own OAuth app, and Supabase's needed write access to the database. Prefer a read-only key or token the user pastes, and refuse a credential that can write when you can check for it, the way `checkReaderConnection()` in `packages/core/src/metrics/product-db.ts` does for the product database. If a source only offers OAuth, open an issue to discuss it first.

## Step 4: Settings UI

Connections are rendered in `apps/desktop-web/src/app/(app)/settings/connections.tsx`. Copy the `Stripe` component: a `Row` with a title, a one-line description of what it pulls, and a `FormDialog` whose action calls `saveConnection(productId, "<kind>", fd)`. Spell out how to create a read-only credential, step by step, in the dialog's description, and link to the provider's page for it. Then add it to `Connections`:

```tsx
<Ga4 productId={productId} conn={find("ga4")} />
<Umami productId={productId} conn={find("umami")} />
<SearchConsole productId={productId} conn={find("search_console")} ga4={find("ga4")} />
<Bing productId={productId} conn={find("bing_webmaster")} />
<Stripe productId={productId} conn={find("stripe")} />
<ProductDb productId={productId} conn={find("product_db")} />
<Pageviews productId={productId} conn={find("pageviews")} />
```

The Settings page already watches `connections` with `LiveRefresh`, so the status updates when the test sync finishes.

## Step 5: Show the numbers

`loadAnalyticsReport()` in `packages/core/src/metrics/report.ts` reads `metrics_snapshots` for the selected period and the one before it, and builds everything the Analytics page shows: `total()` for counts, `level()` for the last value in a period, `series()` for a chart with the period before, and the splits. It only compares with the period before when the source's stored rows cover it. Add your numbers to the report there, then a tile or chart in `apps/desktop-web/src/app/(app)/analytics/tabs.tsx`, following the chart rules in [Working rules](/contributing/working-rules#charts). A web analytics source that writes `WEB_METRICS` needs no changes here.

## Step 6: Test

Test the pure functions, not the network. `packages/core/src/metrics/metrics.test.ts` builds fake Stripe subscriptions and checks `monthlyRevenue()` and `summarizeSubscriptions()` with a fixed `now`, and `analytics.test.ts` covers the report, the sync window and the channel groups. Do the same for your summarizer: fixed dates, a few representative API objects, and the exact rows you expect, including zero days.

```bash
yarn test
yarn typecheck && yarn lint && yarn smoke:desktop
```

To try it end to end, run an isolated dev copy, add a product, connect your source with a test account, and check the connection's status in Settings and the run on the System page.

## Step 7: Document it

Add a credentials guide for the new source, linked from [Bring your own credentials](/credentials), list the network destination in [Privacy and security](/concepts/privacy-security), and describe the new numbers in [Analytics](/guides/analytics).
