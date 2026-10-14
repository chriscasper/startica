---
title: Add a background job
description: Add a job to Startica's SQLite queue, with a validated payload, leases and retries, a schedule, live updates and logged AI runs.
layout: doc
---

Anything slow, anything that calls the network, and every AI call runs as a background job, never inside a page request or server action. This page shows how to add one: write the handler, register it, enqueue it from the UI, optionally schedule it, and show its result live. No migration is needed.

## How the queue works

- **Queue:** the `jobs` table, managed by `packages/db/src/queue.ts`. `enqueue()` inserts a `queued` row; `claim()` atomically takes the oldest ready job on a queue and marks it `running` with a lease; `complete()` deletes it; `fail()` either schedules a retry or marks it `failed` for good.
- **Runner:** `startRunner()` in `packages/core/src/jobs/runner.ts`, started once per server process. It runs one loop per registered queue, so jobs on different queues run in parallel and jobs on the same queue run one at a time. An idle loop checks again every 1.5 seconds.
- **Registry:** `packages/core/src/jobs/registry.ts` maps each queue name to its payload schema, handler, lease and attempt limit. The runner only processes queues listed there.
- **History:** every attempt writes a `job_runs` row (queue, attempt, payload, status, result or error). The System page lists them live.

Jobs run only while the app is open. If the app quits mid-job, the job's lease expires and it's claimed again on the next launch.

## Step 1: Write the handler

Put the handler next to the feature it belongs to in `packages/core/src/<area>/`. A job is a Zod payload schema plus an async function that takes an `AiContext` and the parsed payload. This example suggests listening keywords for a product:

```ts
import { z } from "zod";
import { transaction } from "@startica/db/client";
import { keywords } from "@startica/db/schema";
import { runStructured, type AiContext } from "../ai/client.ts";
import { loadProductContext } from "../distribution/context.ts";

export const KEYWORD_IDEAS_PROMPT_VERSION = "keyword-ideas@1";

export const keywordIdeasPayload = z.object({
  workspaceId: z.guid(),
  productId: z.guid(),
});

const keywordIdeasOutput = z.object({
  keywords: z.array(z.string()).describe("Short phrases people use when they have the problem"),
});

export async function runKeywordIdeas(ctx: AiContext, payload: z.infer<typeof keywordIdeasPayload>) {
  const product = await loadProductContext(payload.productId);

  // The AI call happens outside any transaction.
  const result = await runStructured(ctx, {
    task: "strategy",
    promptVersion: KEYWORD_IDEAS_PROMPT_VERSION,
    system: `Suggest listening keywords for this product.\n\n<product>\n${product.text}\n</product>`,
    messages: [{ role: "user", content: "Suggest up to 10 keywords." }],
    schema: keywordIdeasOutput,
  });

  await transaction(async (db) => {
    for (const keyword of result.keywords.slice(0, 10)) {
      await db
        .insert(keywords)
        .values({ workspaceId: payload.workspaceId, productId: payload.productId, keyword, useFor: "listening", source: "ai" })
        .onConflictDoNothing();
    }
  });

  // Whatever you return is stored as the job run's result.
  return { suggested: result.keywords.length };
}
```

### Payload rules

- **Every payload has `workspaceId`.** `enqueue()` adds it for you, but declare it in the schema (`z.guid()`).
- The runner validates the stored payload with your schema before calling the handler. A payload that fails validation fails the attempt like any other error.
- **Scheduled jobs are enqueued with an empty payload** (only `workspaceId`). If your job runs on a schedule, make the other fields optional and treat "missing" as "every product", as `listenScanPayload` does with `productId: z.guid().optional()`.
- Keep payloads small: ids, not rows. Read the current data in the handler.
- Use `.default()` for optional flags so the handler always gets a value.

### AI calls and logging

Call the AI only through `runStructured()` or `runResearch()` from `packages/core/src/ai/client.ts`, and pass the `ctx` the runner gave you. The context carries `workspaceId` and `jobRunId`, so every call is logged to `ai_runs` (task, model, tokens, cost, latency, prompt version, status) and linked to this job run. The client also enforces the monthly budget: when the cap is reached it logs a `blocked` run and throws an `AiError` with kind `"blocked"`.

Pick the `task` that matches the work (on Claude, `strategy` and `research` route to Opus, `draft`, `vision` and `answer` to Sonnet, `score` and `ping` to Haiku by default; on OpenAI, `score` and `ping` route to GPT-6 Luna and the rest to GPT-6.1 Sol; `image` always uses an OpenAI image model). Users can switch provider and re-route tasks in Settings. Adding a new `AiTask` means updating the `AiTask` union and both providers' `DEFAULT_MODELS` in `packages/core/src/ai/models.ts` and `DEFAULT_AI_MODELS` in `packages/db/src/bootstrap.ts`; existing workspaces fall back to `DEFAULT_MODELS` until they have a row.

Give the prompt a version string and bump it whenever you change the prompt. See [Prompts and evals](/contributing/prompts-evals).

### Transactions

Keep network and AI calls outside `transaction()`. The transaction holds a process-wide lock, and every other query in the app waits while it's open. Fetch first, then write in one short transaction.

## Step 2: Register it

Add an entry to `jobs` in `packages/core/src/jobs/registry.ts`:

```ts
import { keywordIdeasPayload, runKeywordIdeas } from "../intel/keyword-ideas.ts";

export const jobs = {
  // …existing jobs…
  keyword_ideas: defineJob({
    payload: keywordIdeasPayload,
    run: runKeywordIdeas,
    visibilityTimeoutSeconds: 300,
    maxAttempts: 1,
  }),
} satisfies Record<string, Job>;
```

The key (`keyword_ideas`) is the queue name, and it becomes part of the `QueueName` type. The runner starts a loop for it on the next server start.

- **`visibilityTimeoutSeconds`** is the lease. It must be longer than the job can ever run: once a lease expires, the job counts as abandoned and can be claimed and run again. Slow, rate-limited work gets long leases: `listen_scan` and `engagement_sync` use 2400 seconds because Reddit allows about one request per minute.
- **`maxAttempts`** is the total number of tries. Failed attempts are retried after 1, 4, 9… minutes (attempts squared). Use **1** for anything that calls an expensive model or costs real money, so a failure shows in the UI with a button to retry instead of silently spending more. Cheap, idempotent jobs can retry (`ping` uses 3, `opportunity_score` uses 2).

## Step 3: Enqueue it from a server action

Pages and server actions never do the work themselves. They enqueue and return:

```ts
"use server";

import { enqueue } from "@startica/db/queue";
import type { ActionResult } from "@/components/app/form-dialog";
import { mutate, productScope } from "@/lib/actions";

export async function requestKeywordIdeas(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await enqueue(scope.workspaceId, "keyword_ideas", { productId: scope.productId });
  });
}
```

`enqueue(workspaceId, queue, payload, opts?)` takes the queue name as a plain string, so a typo isn't caught by the compiler and the job would wait forever. Double-check the name against the registry. To delay a job, pass `{ runAfter: date }`.

Jobs can enqueue other jobs the same way: `listen_scan` enqueues `opportunity_score` in batches of 20.

## Step 4: Schedule it (optional)

Recurring jobs are listed in `SCHEDULES` in `runner.ts`. Cron expressions use [croner](https://github.com/Hexagon/croner) syntax in the computer's local time:

```ts
export const SCHEDULES: { name: string; cron: string; queue: QueueName }[] = [
  { name: "listen", cron: "7 * * * *", queue: "listen_scan" }, // hourly
  { name: "engagement", cron: "17 */6 * * *", queue: "engagement_sync" }, // every 6 hours
  { name: "metrics", cron: "15 8 * * *", queue: "metrics_sync" }, // daily, 08:15
  { name: "replan", cron: "0 7 * * 1", queue: "roadmap_plan" }, // weekly, Monday 07:00
];
```

Pick an odd minute so jobs don't all start on the hour. Remember that a schedule only fires while the app is running, and that its payload is empty apart from `workspaceId`.

## Step 5: Show progress and results live

When a job writes to a table, the database layer emits a change event and `/api/events` streams it to the window. Add the tables your page reads to its `LiveRefresh`:

```tsx
<LiveRefresh tables={["keywords", "jobs"]} />
```

`LiveRefresh` takes a fixed list of table names (the `Table` type in `src/components/app/live-refresh.tsx`); add your table there if it's new.

To show that a job is queued or running, either keep a status column on the row the job works on (`products.intelStatus` is set to `"queued"` when an Intel build is requested and updated by the job), or query the `jobs` table for the queue, as the Roadmap page does for `roadmap_plan`. Show failures with the error and a retry button rather than retrying automatically.

## Step 6: Test it

`packages/core/src/jobs/runner.test.ts` shows the pattern: open a real SQLite database in a temp folder, run migrations, enqueue, start the runner, wait for the `job_runs` row, stop the runner. Tests must not call an AI provider or the network, so test your handler's pure parts directly, and use the runner test only for jobs that can run without AI (or with no work to do).

```bash
yarn test
yarn typecheck && yarn lint && yarn smoke:desktop
```

To try it in the app, run an isolated dev copy (see [Development setup](/contributing/dev-setup)), trigger the job, and watch it on the System page. `STARTICA_DISABLE_JOBS=1` starts the server without the runner, which lets you inspect queued payloads before they run.

Finally, add the job to the [jobs reference](/reference/jobs).
