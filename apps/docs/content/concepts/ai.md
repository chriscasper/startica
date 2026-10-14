---
title: How Startica uses AI
description: Which AI provider and model handles which task, how to change them, and how Startica makes, checks and logs every AI call.
layout: doc
---

Startica uses an AI model, with your own API key, for everything that needs judgment: understanding your product, scoring conversations, writing drafts, planning the roadmap, auditing your site and checking whether AI assistants recommend your product. It works with two providers: **Claude** (Anthropic) and **OpenAI**. You pick one in the welcome wizard or in **Settings → General → AI**. This page explains how the work is split across models, how calls are made and checked, and where you can see them.

## Providers

| Provider | Key | Where to get it |
| --- | --- | --- |
| Claude (Anthropic) | **Anthropic API key**, starts with `sk-ant-` | [Anthropic API key](/credentials/anthropic) |
| OpenAI | **OpenAI API key**, starts with `sk-` | [OpenAI API key](/credentials/openai) |

You need a key for the provider you use. You can save both. The **AI** card in **Settings → General** says which one is in use ("Using Claude (Anthropic)." or "Using OpenAI.").

Each task is routed to a model, and the model decides which provider the call goes to. So with both keys saved, you can mix them: for example OpenAI for drafting and Claude for strategy. A call to a provider without a saved key fails with "No Anthropic API key: add one in Settings → General → AI (the ping task uses claude-haiku-5-5)" or the same for OpenAI.

### Switching provider

In **Settings → General → AI**, click **Change keys or budget** (or **Add API key**), choose the other provider under **Use**, paste its key if it isn't saved yet, and save. Every task still on the old provider's models moves to the new provider's recommended models (the defaults below). Tasks already on the new provider's models keep their settings, so switching back and forth doesn't lose your edits.

## Tasks and models

Every AI call belongs to a **task**. Each task is routed to a model, an effort level and an output limit. These are the defaults for each provider:

| Task | Claude default | OpenAI default | Effort | Used for |
| --- | --- | --- | --- | --- |
| `strategy` | Claude Opus 5.5 (`claude-opus-5-5`) | GPT-6.1 Sol (`gpt-6.1-sol`) | high | The Intel brief (synthesis), voice profiles, the roadmap and weekly replan, audit findings, [ad campaign](/ads) plans |
| `research` | Claude Opus 5.5 | GPT-6.1 Sol | high | Web research for the Intel brief and the GEO audit, using the provider's web search |
| `draft` | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | GPT-6.1 Sol | medium | Reply drafts, Content Studio pieces, topic suggestions, ad rewrites, suggested [AI visibility](/seo/ai-visibility) questions, fix drafts on [Opportunities](/seo/opportunities#drafts), accessibility [fix suggestions and summaries](/accessibility/ai-help), and Security's explain and fix, report import and triage of reported problems |
| `answer` | Claude Sonnet 5.5 | GPT-6.1 Sol | low | [AI visibility](/seo/ai-visibility): answering your questions with web search, as an assistant would |
| `vision` | Claude Sonnet 5.5 | GPT-6.1 Sol | medium | Reading images: the accessibility [alt text review](/accessibility/ai-help#alt-text-review), and **Ask AI** on [Needs review](/accessibility/ai-help#needs-review) items, which reads the page screenshot |
| `score` | Claude Haiku 5.5 (`claude-haiku-5-5`) | GPT-6 Luna (`gpt-6-luna`) | low | Scoring each conversation for relevance and intent; reading each AI visibility answer |
| `ping` | Claude Haiku 5.5 | GPT-6 Luna | low | The **Run test job** health check on the System page |
| `image` | GPT Image 2.5 Flare (`gpt-image-2.5-flare`) | GPT Image 2.5 Flare | medium (the image quality) | Drawing the pictures for [ad creatives](/ads/creatives). OpenAI only. |

Max output tokens default to 16,000 for `strategy` and `research`, 4,000 for `draft`, `vision` and `answer`, 1,024 for `score` and 256 for `ping` on Claude. OpenAI's defaults are higher (32,000, 8,000, 2,048 and 1,024), because OpenAI counts reasoning tokens inside the output limit. The `image` task's row shows 4,096, but the image call doesn't use it: the picture's size and quality set how many tokens it takes.

Why this split:

- **The strongest default model for strategy and research.** These calls are rare (a brief per product, a weekly replan, an occasional audit) and benefit most from careful reasoning over a lot of context: a whole site crawl, months of metrics. Effort is set to `high` explicitly.
- **A mid-priced model for writing.** Drafts and content are frequent and need good writing in a specific voice. Sonnet and GPT-6.1 Sol write well at half Opus's price.
- **The cheapest model for scoring.** Scoring runs on every new conversation found, up to 60 per product from each source per hourly scan. It needs to be cheap and fast, and it returns just two scores and a short reason. AI visibility uses the same model to read each answer.
- **A mid-priced model, at low effort, for answers.** AI visibility's `answer` task stands in for an AI assistant answering a customer's question. A mid-priced model with web search is close to what assistants use, and the answer only needs to be a good everyday answer, not deep reasoning. This model also decides which provider's assistant you're measuring; see [Models](/seo/ai-visibility#models).

### The image task

The `image` task draws the pictures for [ad creatives](/ads/creatives), and only OpenAI's image models can do it. It's the same whichever provider you use for everything else:

- **It needs an OpenAI API key, even when Claude is your provider.** Without one, the **Draw it with AI** option on a creative is disabled ("needs an OpenAI key in Settings"); you can still upload your own pictures. See [OpenAI API key](/credentials/openai). If you only want pictures from OpenAI, save both keys and keep **Use** on Claude.
- **Switching provider doesn't move it.** It stays on its OpenAI image model.
- **Effort is the image quality.** The dialog calls it **Quality**: `low`, `medium` (the default), `high`, `xhigh` or `max`. Higher quality costs more; see [Costs](/concepts/costs#ad-pictures).
- **Two models:** GPT Image 2.5 Flare (`gpt-image-2.5-flare`, the default) and GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`). They cost the same per token; Sunburst renders more carefully and so uses more output tokens per picture. The image task's model list shows only these two, and the other tasks' lists leave them out.

Every picture is one call, logged like any other with its cost, and counts against the [monthly budget](/concepts/costs#the-monthly-budget). The words, logo and button on an ad are added afterwards by a template on your computer, not by the AI.

The `image` task was added with ad creatives. Workspaces created before it get it on first start after updating.

The `answer` task was added with AI visibility. Workspaces created before it get it on first start after updating, on the provider their `draft` task uses.

Each provider also offers a top model that isn't a default: Claude Fable 5.1 (`claude-fable-5-1`) and GPT-6 Astra (`gpt-6-astra`). Both cost 2.5 times as much as Opus. Try one for `strategy` only if the default plans seem weak to you.

See [Costs](/concepts/costs) for prices.

## Changing models

1. Open **Settings**. The **AI** card lists each task with its model, effort and max tokens.
2. Click the pencil icon on a row. The dialog is titled **Model for "*task*"**.
3. Choose **Model** (the list has every text model from both providers, with each one's price per million tokens; for the `image` task, the image models), **Effort** (`low`, `medium`, `high`, `xhigh`, `max`; called **Quality** for the `image` task) and **Max output tokens** (256 to 64,000).
4. Save. The change applies to the next job that runs this task. Nothing restarts.

Saving a model needs a key for that model's provider. Without one, the dialog says "Add an Anthropic API key first (Change keys or budget)" or the same for OpenAI.

Higher effort and a stronger model mean better output, more tokens and higher cost. If you see "Output hit max_tokens" errors on the System page, raise that task's **Max output tokens**.

> [!TIP]
> If you change the `score` model, compare the result against your own decisions first. Contributors can run the scorer's evaluation set with `yarn eval score --model <id>`; see [Prompts and evals](/contributing/prompts-evals).

## How calls are made

### Only background jobs call the AI

Pages in the app never call the AI directly. A button that asks for AI work, such as building a brief, drafting a reply or running an audit, adds a [job](/reference/jobs) to Startica's local queue, and a background worker inside the app runs it. Scheduled jobs (hourly listening, the weekly replan) work the same way.

That means:

- A slow AI call never freezes the window. Pages update live as jobs finish.
- AI work only happens while Startica is running. Close the window and it keeps running in the tray or menu bar; quit it and nothing runs.
- Expensive AI jobs run once and aren't retried automatically. If one fails, you rerun it from the page. Scoring is retried once; the test ping up to three times.

### Structured outputs

Anything that goes into the database (scores, briefs, drafts, roadmap items, audit findings) is requested with **structured outputs**: the request includes a JSON schema, and the model's reply must match it. Startica then validates it again against the same schema. If it doesn't match, the call fails with "Response did not match the expected schema" instead of saving something half-parsed.

Research calls are the exception. They return prose notes, which then feed a structured `strategy` call. They're streamed to avoid timeouts. If Claude pauses mid-research (a server-side tool-loop limit), Startica sends the turn back to continue, up to five times. AI visibility answers work the same way: the answer is kept as written, and a structured `score` call then reads it.

### Web search

The `research` and `answer` tasks let the model search the web. The provider runs these searches, not your computer, and bills them per search on top of tokens.

- **Claude** gets two server-side tools: web search (up to 8 searches per call) and web fetch (up to 8 pages for the Intel brief, 4 for the GEO audit).
- **OpenAI** gets its built-in web search tool, which opens pages itself, so there's no separate fetch tool. The same limits apply to its tool calls in total (up to 16 for the Intel brief, 12 for the GEO audit).
- **AI visibility answers** get web search only, up to 3 searches per answer (3 tool calls on OpenAI), and no fetch tool. Startica keeps the pages the answer cites and the searches it ran.

### Prompt caching

The stable part of each prompt (the system prompt with instructions, the product brief and similar context) comes first, so both providers can **cache** it. When the same prefix is sent again within a few minutes, such as when scoring a batch of conversations for one product, it's read from cache at a fraction of the normal input price. Volatile content, like the thread being scored, comes after the cached part. Claude caches the parts Startica marks; OpenAI caches automatically. Cache reads and writes are tracked separately in the cost log.

### Refusals and cut-off answers

- On Claude Opus, Sonnet and Fable, Startica enables Anthropic's server-side refusal fallback. Haiku doesn't support it.
- If the model still declines, the call is logged as `refused`, and the job fails with "Claude declined the request" or "OpenAI declined the request", with the reason when the provider gives one.
- If an answer hits the max output tokens, the call fails with "Output hit max_tokens" rather than saving a truncated result.

### Batch APIs

Startica doesn't use either provider's batch API in the current version. All calls are regular API calls, made as jobs run.

## Every call is logged

Each call, including failed and blocked ones, is written to the `ai_runs` table with:

| Field | Example |
| --- | --- |
| Task and model | `draft`, `claude-sonnet-5-5` |
| Prompt version | `reply-draft@2` |
| Status | `ok`, `error`, `refused`, `blocked` |
| Tokens | input, output, cache read, cache write |
| Estimated cost | in USD, from Startica's price table |
| Latency | milliseconds |
| Error | the message, if any |

OpenAI reports a dated model ID (such as `gpt-6-luna-2026-09-01`), which is logged as is and priced like its model.

The **System** page shows the latest 20 under **AI calls**, plus this month's total under **AI spend this month**. The same table drives the [monthly budget](/concepts/costs#the-monthly-budget), which covers both providers together.

## Prompt versions

Prompts live in the code next to the feature that uses them. Each has a version string that's logged with every call, so when a prompt changes you can tell old output from new.

| Prompt version | Feature |
| --- | --- |
| `intel-research@2`, `intel-synthesis@4` | Intel brief (since `intel-synthesis@3` it lists suggested communities strongest first, so the [Getting started checklist](/getting-started/first-day#the-getting-started-checklist) can pre-tick the top ones) |
| `opportunity-score@1` | Scoring conversations |
| `reply-draft@2` | Reply drafts |
| `voice-guide@1` | Voice profiles |
| `content-write@2`, `email-campaign@1`, `content-topics@2` | Content Studio |
| `roadmap-plan@3` | Roadmap and replan |
| `ad-plan@1`, `ad-copy@1` | [Ads](/ads): campaign plans and ad rewrites |
| `ad-creative-ideas@1`, `ad-image@1` | [Ad creatives](/ads/creatives): suggested ideas and the pictures |
| `visibility-answer@1`, `visibility-analysis@1`, `visibility-questions@1` | [AI visibility](/seo/ai-visibility): answering a question, reading the answer, suggesting questions |
| `opportunity-draft@1` | [Opportunities](/seo/opportunities#drafts): fix drafts (titles and descriptions, JSON-LD, `llms.txt`, FAQ answers) |
| `audit@3:<kind>`, `audit@3:geo-research` | Audits |
| `ping@1` | Health check |

These are the versions at the time of writing; the **AI calls** table shows the ones your copy uses. To change or add prompts, see [Prompts and evals](/contributing/prompts-evals).
