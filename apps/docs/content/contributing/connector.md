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
- Connectors return the last 30 days (`SYNC_DAYS`) every time. Rows are upserted on product, day, source, metric and dimension, so re-syncing is safe and late data gets corrected.

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

export const SYNC_DAYS = 30;

export function isoDay(date: Date): string;
export function daysAgo(n: number, from = new Date()): Date;
```

A connector is a function from its validated config and its secret to rows:

```ts
(config: z.infer<typeof yourConfig>, secret: string) => Promise<MetricRow[]>
```

Naming conventions:

- Metric names are `snake_case` (`sessions`, `key_events`, `active_subscriptions`, `mrr`, `new_subscriptions`, `cancellations`). Reuse an existing name when it means the same thing.
- Leave `dimension` empty for totals. Splits use `key:value`, like `source:<source> / <medium>`, `utm_content:<draft id>` or `event:<name>`.
- Point-in-time values (like `mrr`) get one row for today. Counts get one row per day, including zero days.
- Undimensioned metrics are automatically included in the numbers the roadmap planner sees.

## Step 1: Write the connector

Create `packages/core/src/metrics/<kind>.ts`. Export a Zod schema for the config, a pure summarizing function you can test, and the fetch function. The shape of `stripe.ts`:

```ts
import { z } from "zod";
import { daysAgo, isoDay, SYNC_DAYS, type MetricRow } from "./types.ts";

export const stripeConfig = z.object({});

/** Pure: today's MRR and active count, plus daily new subscriptions and cancellations. */
export function summarizeSubscriptions(subs: SubscriptionLike[], now = new Date()): MetricRow[] {
  // …
}

export async function fetchStripeMetrics(_config: z.infer<typeof stripeConfig>, secret: string): Promise<MetricRow[]> {
  if (!/^(rk|sk)_(live|test)_/.test(secret)) throw new Error("That doesn't look like a Stripe key (rk_live_… or rk_test_…)");
  // page through the API, collect, then:
  return summarizeSubscriptions(subs);
}
```

Guidelines:

- Validate the secret's format early and throw an `Error` with a message the user can act on. The message is shown on the connection in Settings.
- Never log the secret or include it in an error message.
- Keep config non-secret (ids, view names). Anything that grants access goes in the secret.
- Don't write to the database from the connector; return rows and let `sync.ts` save them.

## Step 2: Register the kind

The kind appears in a few type lists that must agree:

- `packages/db/src/schema.ts`: the `kind` enum on `connections` and the `source` enum on `metricsSnapshots`.
- `packages/core/src/metrics/types.ts`: `MetricSource`.
- `packages/core/src/metrics/sync.ts`: the `Kind` type and the `connectors` map.

```ts
type Kind = "ga4" | "umami" | "stripe" | "product_db" | "pageviews";

const connectors: Record<Kind, (config: unknown, secret: string) => Promise<MetricRow[]>> = {
  ga4: (config, secret) => fetchGa4Metrics(ga4Config.parse(config), secret),
  umami: (config, secret) => fetchUmamiMetrics(umamiConfig.parse(config), secret),
  stripe: (config, secret) => fetchStripeMetrics(stripeConfig.parse(config), secret),
  product_db: (config, secret) => fetchProductDbMetrics(productDbConfig.parse(config), secret),
  pageviews: (config, secret) => fetchPageviewsMetrics(pageviewsConfig.parse(config), secret),
};
```

(`pageviews` stands in for your new kind.) These enums are TypeScript-only in SQLite, so no migration is needed; run `yarn db:generate` to confirm it reports no changes.

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

`apps/desktop-web/src/app/(app)/analytics/page.tsx` reads `metrics_snapshots` and picks series with `pick(source, metric, dimension)`. Add a tile or chart for your metrics there, following the chart rules in [Working rules](/contributing/working-rules#charts).

## Step 6: Test

Test the pure functions, not the network. `packages/core/src/metrics/metrics.test.ts` builds fake Stripe subscriptions and checks `monthlyRevenue()` and `summarizeSubscriptions()` with a fixed `now`. Do the same for your summarizer: fixed dates, a few representative API objects, and the exact rows you expect, including zero days.

```bash
yarn test
yarn typecheck && yarn lint && yarn smoke:desktop
```

To try it end to end, run an isolated dev copy, add a product, connect your source with a test account, and check the connection's status in Settings and the run on the System page.

## Step 7: Document it

Add a credentials guide for the new source, linked from [Bring your own credentials](/credentials), list the network destination in [Privacy and security](/concepts/privacy-security), and describe the new numbers in [Analytics](/guides/analytics).
