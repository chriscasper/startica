---
title: Add a playbook
description: Add a reusable growth strategy that Startica's roadmap planner can draw from.
layout: doc
---

A playbook is a reusable growth strategy, like "Reddit value-first replies" or "Landing page conversion". When Startica plans or re-plans a product's roadmap, the planner sees every playbook and tags each roadmap item with the one it's based on. Playbooks live in code, in `packages/core/src/growth/playbooks.ts`, not in the database, so adding one is a small, reviewable change.

## The shape

From `playbooks.ts`:

```ts
import type { FunnelStage } from "@startica/db/schema";

export type Playbook = { key: string; name: string; stage: FunnelStage; summary: string; steps: string[] };

export const PLAYBOOKS: Playbook[] = [
  // …
];
```

`FunnelStage` comes from `packages/db/src/schema.ts`:

```ts
export const funnelStages = ["acquisition", "activation", "retention", "revenue", "referral"] as const;
export type FunnelStage = (typeof funnelStages)[number];
```

| Field | Rules |
|---|---|
| `key` | Unique, lowercase, hyphenated (`"landing-conversion"`). It's stored on roadmap items and shown as a badge on the Roadmap board, so never rename a key once it has shipped. |
| `name` | Short title in sentence case |
| `stage` | The funnel stage the playbook mainly serves |
| `summary` | One sentence: the goal and the core idea |
| `steps` | 3 to 5 concrete actions, each one a short imperative sentence. Include how to measure the result. |

## How the planner uses it

`playbookText()` turns the list into one line per playbook and the roadmap job (`roadmap_plan`, in `packages/core/src/growth/roadmap.ts`) puts it in the system prompt inside a `<playbooks>` block:

```text
- landing-conversion (acquisition): Landing page conversion. Turn more visitors into signups: a clear promise, proof, and one obvious next step. Steps: Rewrite the headline as the audience's outcome in their words; …
```

The planner returns a `playbook` key for each item, or an empty string. Keys that don't match a playbook are stored as `null`, so a typo in your key silently drops the link.

## Add one

Append an entry to `PLAYBOOKS`:

```ts
{
  key: "comparison-pages",
  name: "Comparison pages",
  stage: "acquisition",
  summary: "Win searches from people choosing between tools with honest, specific comparison pages.",
  steps: [
    "List the 3 competitors your audience compares you with most (Intel → Competitors)",
    "Write one page per competitor: who each tool suits, a feature table, and when to pick the other one",
    "Link each page from the pricing page and the footer",
    "Track sessions and signups per comparison page for 4 weeks",
  ],
},
```

Write it for any product, not one business. Use placeholders such as "your audience" or "the product", and keep steps specific enough to act on this week.

## Bump the roadmap prompt version

The playbook list is part of the roadmap planner's prompt, so adding or editing a playbook changes that prompt. Bump `ROADMAP_PROMPT_VERSION` in `packages/core/src/growth/roadmap.ts` (for example `"roadmap-plan@3"` to `"roadmap-plan@4"`) so runs before and after the change can be told apart in `ai_runs`. See [Prompts and evals](/contributing/prompts-evals).

## Check it

There's no eval set for the planner yet, so check by hand:

1. Run `yarn test` (the roadmap tests in `growth/growth.test.ts` cover how playbook keys are stored).
2. Start an isolated dev copy with demo data (see [Development setup](/contributing/dev-setup)) and an Anthropic or OpenAI key.
3. On the Roadmap page, click **Re-plan** (or **Create the roadmap**) and confirm that items pick up your playbook where it fits, and that it doesn't crowd out better ones.

Mention the result in the pull request. For how users see playbooks, see [Roadmap](/guides/roadmap).
