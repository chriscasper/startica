---
title: Prompts and evals
description: Where Startica's prompts live, how they're versioned, and how to check a prompt or model change against an eval set.
layout: doc
---

Startica's output is only as good as its prompts, and a small wording change can quietly make scoring stricter or drafts worse. So prompts are versioned, every AI run records the version it used, and prompts with an eval set are checked before a change is merged. This page covers all three.

## Where prompts live

Prompts sit next to the feature that uses them, in `packages/core/src/`:

| File | Prompt version constants | Used by |
|---|---|---|
| `intel/prompts.ts` | `RESEARCH_PROMPT_VERSION` (`intel-research@1`), `SYNTHESIS_PROMPT_VERSION` (`intel-synthesis@3`) | `intel_build` |
| `distribution/prompts.ts` | `SCORE_PROMPT_VERSION` (`opportunity-score@1`), `DRAFT_PROMPT_VERSION` (`reply-draft@2`) | `opportunity_score`, `draft_generate` |
| `content/prompts.ts` | `VOICE_PROMPT_VERSION` (`voice-guide@1`), `CONTENT_PROMPT_VERSION` (`content-write@2`), `TOPICS_PROMPT_VERSION` (`content-topics@2`) | `voice_profile_build`, `content_generate`, `content_topics` |
| `content/campaign.ts` | `CAMPAIGN_PROMPT_VERSION` (`email-campaign@1`) | `content_generate` (Email campaign format) |
| `growth/roadmap.ts` | `ROADMAP_PROMPT_VERSION` (`roadmap-plan@1`) | `roadmap_plan` |
| `growth/audits.ts` | `AUDIT_PROMPT_VERSION` (`audit@1`) | `audit_run` |
| `jobs/ping.ts` | `ping@1` (inline) | `ping` |

The versions above are the ones at the time of writing; the source is authoritative.

A prompt file typically exports three things: the version string, a function that builds the system prompt from stable context (the product, voice profile, community rules), and the Zod schema for the output. For example, from `distribution/prompts.ts`:

```ts
export const SCORE_PROMPT_VERSION = "opportunity-score@1";

export function scoreSystem(productContext: string): string {
  // …
}

export const scoreOutput = z.object({
  relevance: z.number().describe("0 to 1"),
  intent: z.number().describe("0 to 1"),
  reasoning: z.string(),
  angle: z.string(),
});
```

The job passes all three to `runStructured()`:

```ts
await runStructured(ctx, {
  task: "score",
  promptVersion: SCORE_PROMPT_VERSION,
  system: scoreSystem(product.text),
  messages: [{ role: "user", content: conversationText(row) }],
  schema: scoreOutput,
});
```

### Writing prompts

- **Keep the system prompt stable.** Both providers cache it (the AI client marks it for Claude; OpenAI caches automatically), so repeated calls for the same product pay much less. Put anything that changes per call (the thread text, today's date, user guidance) in `messages`.
- **Describe output fields in the schema** with `.describe()`. The schema is sent as a structured output format, and the result is validated before it's returned.
- **Keep examples neutral.** Use placeholders or the fictional demo product, never a real business.
- **Keep promotion honest.** Drafting prompts must keep product mentions honest and disclosed, and lean toward not mentioning the product when a community's rules are strict or unknown.

## Versioning

Version strings look like `<prompt-name>@<n>`. Bump `n` whenever the prompt text, its inputs or its output schema change in a way that could change results. Each run stores the version in `ai_runs.prompt_version`, so you can compare cost, failures and outcomes before and after a change.

Playbooks are part of the roadmap prompt, so changing `growth/playbooks.ts` also bumps `ROADMAP_PROMPT_VERSION`.

Code can also depend on what a prompt promises. `intel-synthesis@3` asks for communities strongest first, and `communitySuggestions()` in `packages/core/src/setup/status.ts` keeps that order (by insertion) to pre-tick the first 5 readable suggestions on Today's Getting started checklist. If you change how intel orders or saves communities, check that step too.

## Eval sets

An eval set is a list of real or hand-written inputs with the expected outcome, run against the current prompt and model. Eval sets live in `packages/core/src/ai/evals/<set>/`. There are three:

| Set | Run with | What it checks |
|---|---|---|
| `score/` | `yarn eval score` | The opportunity scorer, against Inbox decisions and seed cases. Described below. |
| `a11y/` | `yarn eval a11y` | Accessibility's fix suggestions (`packages/core/scripts/eval-a11y.ts`): each case is a planted failure from the stand-in site, and the suggested HTML must pass the same axe rule in Playwright's Chromium. |
| `security/` | `yarn eval security` | Security's explain, import and triage prompts (`packages/core/scripts/eval-security.ts`): 3 explain, 2 import and 3 triage cases with structural checks (what the explanation mentions, finding counts, severities and matched rules, the triage verdict and duplicate, no exploit text, no promise of money). |

All three take the key from your shell and run in a throwaway database, take `--model`, and exit with code 1 if any case fails. The `a11y` and `security` sets route `--model` to the `draft` task. The scorer's set, in `ai/evals/score/`:

- One JSON file per product (`ScoreEvalFile`): the product name, a snapshot of the product text the prompt sees (`productContext`), the product's thresholds, and the cases.
- Each case (`ScoreCase`) has an `id`, a `source` (`"seed"` for hand-written cases, `"owner"` for cases exported from Inbox decisions), the expected outcome (`expect`: `"reply"` or `"skip"`), a `note` explaining the label, and the conversation.
- `cases.ts` holds the types and helpers; `cases.test.ts` tests the labeling and merging rules.

### Run an eval

```bash
yarn eval score
```

This is the root alias for `yarn workspace @startica/core eval score`. It takes the API key from your shell, not from the app's Settings. The provider follows `--model`; without it, the run uses the default Claude scorer:

```bash
ANTHROPIC_API_KEY=sk-ant-… yarn eval score
OPENAI_API_KEY=sk-… yarn eval score --model gpt-6-luna
```

The key is stored only in the eval's throwaway database, which is deleted afterwards. Without the right variable, the script stops with "Set ANTHROPIC_API_KEY in your shell first" (or `OPENAI_API_KEY`). An unknown `--model` prints the known model IDs. Options:

| Option | Effect |
|---|---|
| `--model <id>` | Route the `score` task to another model for this run, e.g. `--model claude-sonnet-5-5` or `--model gpt-6-luna`. Any model from either provider. |
| `--product <name>` | Only run the eval file whose `product` matches (case-insensitive) |

What it does:

1. Creates a throwaway SQLite database in a temp folder and applies the migrations. Your app data and spend history are never touched.
2. Prints the prompt version and the model and effort in use.
3. For each eval file, builds the system prompt from the file's `productContext` and scores every case through the same `runStructured()` path the app uses. The first call runs alone to write the prompt cache; the rest run four at a time.
4. Marks a case `reply` when both relevance and intent meet the file's thresholds, and `skip` otherwise, and compares that with `expect`.

The output lists each case with `✓` or `✗`, the scores, and for misses the case's note and the scorer's reasoning. Each file ends with accuracy, "reply" precision and recall, and the number of exported cases. The last line is the total cost (a full run is a fraction of a cent). The command exits with code 1 if any case was wrong or errored.

### Add cases from real decisions

```bash
yarn eval:export score
```

This turns Inbox decisions into eval cases. It reads the app's database (the default data folder, or `STARTICA_DATA_DIR`) without changing it, and for each product:

- A conversation marked as posted becomes a `reply` case.
- A dismissed conversation becomes a `skip` case, unless it was dismissed as "too old" or "rules forbid", which the scorer isn't responsible for.
- Authors are left out. Case ids are `<channel>:<external id>`, so re-exporting updates existing cases instead of duplicating them. Seed cases are kept and sorted first.
- The product snapshot and thresholds in the file are refreshed.

It writes `packages/core/src/ai/evals/score/<product-name>.json` and prints how many cases were exported.

> [!WARNING]
> Exported files contain your product description and the text of conversations from your Inbox. They're for your own testing. Don't commit an export of your own product to the repo; only the demo product's eval file belongs there.

### Add seed cases

Hand-written cases cover situations that real decisions rarely produce: a keyword match with a different meaning, a thread that's only adjacent to the problem, an obvious request for a recommendation. Add them to the file with `"source": "seed"`, an id like `"seed-13"`, and a `note` saying what the case tests.

## Checking a prompt or model change

1. Run the eval for the prompt on the current code and note the result: `yarn eval score`, `yarn eval a11y` or `yarn eval security`.
2. Make the change. Bump the prompt's version string.
3. Run the eval again. For a model change, try it first without editing anything: `yarn eval score --model <id>`.
4. Look at every case that flipped, not just the accuracy. A change that fixes two misses and breaks two others isn't an improvement.
5. Put the before and after numbers in the commit message, for example `opportunity-score@2: accuracy 11/14 → 13/14, reply precision 80% → 100%`.

For prompts without an eval set (reply drafting, content, the roadmap, audits), test by hand on the demo product in an isolated data folder, compare outputs before and after, and describe what you checked in the pull request. Contributions of new eval sets are welcome; follow the scorer's layout in `ai/evals/<task>/`.

For how users see models and costs, see [How Startica uses AI](/concepts/ai) and [Costs and budget](/concepts/costs).
