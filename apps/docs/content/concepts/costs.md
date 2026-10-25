---
title: Costs
description: What Startica's AI usage costs on your own Anthropic or OpenAI account, how the monthly budget cap works, and where to see your spend.
layout: doc
---

Startica itself is free and open source. The main running cost is the AI provider you pick, Claude (Anthropic) or OpenAI, billed to your own account. The only other paid service is the optional [X API](/credentials/x-api), billed by X if you add your own token. Reddit, Hacker News, Bluesky, Mastodon and Discourse are read for free, and Google Analytics, Google Search Console, Bing Webmaster Tools, Supabase and Stripe access don't cost anything extra through Startica; they use your existing accounts' normal quotas. Search Console and Bing Webmaster Tools, and their APIs, are free. The [agent readiness](/seo/agents) checks and [off-site presence](/seo/off-site) use no AI and cost nothing.

This page lists the prices Startica uses to estimate cost, gives rough figures for common actions, and explains the monthly budget cap.

## Prices Startica uses

Startica estimates the cost of every call from the token counts the API returns and the price table in `packages/core/src/ai/models.ts`. Prices are in USD per million tokens, each provider's first-party API rates as checked when the code was written.

| Model | Input | Output | Cache write | Cache read (cached input) |
| --- | --- | --- | --- | --- |
| Claude Fable 5.1 (`claude-fable-5-1`) | $10.00 | $50.00 | $12.50 | $0.25 |
| Claude Opus 5.5 (`claude-opus-5-5`) | $4.00 | $20.00 | $5.00 | $0.20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2.00 | $10.00 | $2.50 | $0.20 |
| Claude Haiku 5.5 (`claude-haiku-5-5`) | $0.10 | $0.50 | $0.125 | $0.01 |
| GPT-6 Astra (`gpt-6-astra`) | $10.00 | $50.00 | $12.50 | $1.00 |
| GPT-6.1 Sol (`gpt-6.1-sol`) | $2.00 | $10.00 | $2.50 | $0.10 |
| GPT-6 Luna (`gpt-6-luna`) | $0.10 | $0.50 | $0.125 | $0.01 |
| GPT Image 2.5 Flare (`gpt-image-2.5-flare`) | $5.00 | $30.00 | $6.25 | $1.25 |
| GPT Image 2.5 Sunburst (`gpt-image-2.5-sunburst`) | $5.00 | $30.00 | $6.25 | $1.25 |

- **Cache write** is 1.25 times the input price at both providers. **Cache read** is what repeated prompt prefixes cost; see [prompt caching](/concepts/ai#prompt-caching).
- **Web search**, used by research calls and AI visibility answers, adds $10 per 1,000 searches ($0.01 each) on top of tokens, at both providers. Claude's web fetch costs only the tokens of the fetched page.
- Thinking (reasoning) tokens count as output tokens. Higher **Effort** settings usually mean more of them.
- **Image models** are billed per token too: the input is the prompt's text, the output is the picture. See [Ad pictures](#ad-pictures).

The providers' actual prices are on the [Claude API pricing page](https://platform.claude.com/docs/en/about-claude/pricing) and the [OpenAI API pricing page](https://developers.openai.com/api/docs/pricing). If they change and the code hasn't been updated yet, Startica's estimates drift from your real bill. Your provider's invoice is always the authority.

## Rough cost of common actions

These are estimates worked out from the default models, typical prompt sizes in the code and assumed output lengths. They aren't measurements. Your numbers depend on your product brief, thread lengths, effort settings and how much gets cached. Check the **AI calls** table on the **System** page for real figures.

| Action | Task and default model | Rough cost |
| --- | --- | --- |
| Test job (**Run test job**) | `ping`, Haiku or Luna | Well under $0.001 |
| Score one conversation | `score`, Haiku or Luna | About $0.0005 |
| Score one source's full share of a scan (60 new conversations, the per-source cap) | `score`, Haiku or Luna | About $0.03 |
| Draft one reply | `draft`, Sonnet or Sol | $0.01 to $0.03 |
| Write one Content Studio piece | `draft`, Sonnet or Sol | $0.01 to $0.05 |
| Build a voice profile | `strategy`, Opus or Sol | $0.10 to $0.25 |
| Build an Intel brief (research plus synthesis) | `research` + `strategy`, Opus or Sol | $0.40 to $1.00 |
| [Research one competitor in depth](/guides/competitor-watch) | `research` + `draft`, Opus + Sonnet or Sol | $0.30 to $0.80 |
| One [competitor brief](/guides/competitor-watch#briefs) (a day, week, month or year) | `draft`, Sonnet or Sol | $0.01 to $0.05 |
| One followed link's or person's brief | `draft`, Sonnet or Sol | About $0.01 |
| One LinkedIn or X link's brief (web search, at most weekly) | `research` + `draft`, Opus + Sonnet or Sol | $0.05 to $0.15 |
| Rating 25 new competitor posts for relevance | `score`, Haiku or Luna | Under $0.01 |
| Plan or replan the roadmap | `strategy`, Opus or Sol | $0.10 to $0.30 |
| Plan an ad campaign | `strategy`, Opus or Sol | $0.10 to $0.30 |
| Rewrite one ad | `draft`, Sonnet or Sol | $0.01 to $0.03 |
| Suggest three [ad creative](/ads/creatives) ideas | `draft`, Sonnet or Sol | $0.01 to $0.03 |
| Draw one ad picture | `image`, GPT Image 2.5 Flare at medium quality | About $0.05 |
| Landing, onboarding or SEO audit | `strategy`, Opus or Sol | $0.10 to $0.25 |
| GEO audit (includes web research) | `research` + `strategy`, Opus or Sol | $0.30 to $0.70 |
| Suggest AI visibility questions | `draft`, Sonnet or Sol | $0.01 to $0.05 |
| Draft one fix on [Opportunities](/seo/opportunities#costs) (titles and descriptions, JSON-LD, `llms.txt` or an FAQ answer) | `draft`, Sonnet or Sol | $0.01 to $0.03 |
| **Write it in Content Studio** on Opportunities (one blog article) | `draft`, Sonnet or Sol | $0.01 to $0.05 |
| Ask one AI visibility question (answer with up to 3 searches, then read it) | `answer` + `score`, Sonnet + Haiku or Sol + Luna | About $0.06 |
| An AI visibility run of 20 questions | `answer` + `score` | About $1.30, capped at $2 by default |
| [Accessibility](/accessibility/ai-help): suggest a fix for one issue, Ask AI on one Needs review item, or summarize a site | `draft` or `vision`, Sonnet or Sol | About $0.01 each |
| [Accessibility](/accessibility/ai-help#alt-text-review): review the alt text of 50 images | `vision`, Sonnet or Sol | About $0.25 (about $0.005 an image) |
| [Security](/security/findings): explain and fix one finding, or [triage](/security/disclosure#reported-problems) one reported problem | `draft`, Sonnet or Sol | About $0.02 each |
| [Security](/security/findings#findings-from-other-reports): import another tool's report | `draft`, Sonnet or Sol | About $0.10 for a long report |

These figures are worked out for Claude's defaults. OpenAI's defaults use the same prices for scoring and drafting and a cheaper model (GPT-6.1 Sol) for strategy and research, so those actions usually cost less on OpenAI.

### A rough month

As an illustration only: one product, around 300 conversations scored a day, 5 drafts a day, a weekly replan and a couple of audits comes to roughly **$10 to $20 a month** with the default models. The default budget of $50 leaves room for that plus rebuilding briefs and writing content.

What moves the total most:

- **Scoring volume.** Startica scans every hour and scores up to 60 new conversations per product from each source per scan (X at most 50). Broad keywords or many watched subreddits mean more scoring. Each one is cheap, but they add up.
- **Auto-drafting.** Every conversation that clears your relevance and intent thresholds gets a draft automatically. Raising the thresholds means fewer, better drafts. See [Finding conversations](/guides/finding-conversations).
- **AI visibility runs.** About $0.06 a question, so weekly runs of 20 questions add about $5 to $6 a month. They're off until you turn them on, and each run has its own cap. See [AI visibility](#ai-visibility).
- **Model choices.** Switching `score` to Sonnet or GPT-6.1 Sol multiplies scoring cost by about 20. Switching `strategy` from Opus to Fable or GPT-6 Astra multiplies it by 2.5.

## AI visibility

[AI visibility](/seo/ai-visibility) asks an AI model your customers' questions with web search on, so it costs more per call than most features: the search results arrive as input tokens, and each search costs $0.01.

Before each run, the **Run now** dialog shows an estimate: the number of active questions times the estimated cost of one question. One question is assumed to be an answer of 12,000 input and 900 output tokens on the `answer` model, 3 web searches, and a reading of 2,500 input and 250 output tokens on the `score` model. On the default models (Sonnet and Haiku, or GPT-6.1 Sol and GPT-6 Luna), that's about $0.063 a question:

| Questions | Estimate |
| --- | --- |
| 12 | About $0.76 |
| 20 | About $1.27 |
| 100 | About $6.34, more than the default cap |

Every run has a **cost cap** per product: $2 by default, from $0.10 to $50, set in **Settings** on the AI visibility screen. Before each question, Startica adds what the run has spent so far to the estimate for one more question, and stops the run if that would pass the cap, keeping the answers it has. A question that costs more than its estimate can take the run a few cents over. The monthly budget applies on top: when it's reached, the run stops and fails.

Weekly runs are off by default. With them on, each product with active questions runs every Monday, each run under its cap. Suggesting questions is a single `draft` call of a few cents. See [What a run costs](/seo/ai-visibility#what-a-run-costs).

After each run, [Off-site presence](/seo/off-site) reads some of the pages the answers cited. That read uses no AI and costs nothing.

## Ad pictures

[Ad creatives](/ads/creatives) can have their picture drawn by OpenAI's image model, on the `image` task. It needs an OpenAI API key even when Claude is your provider; see [The image task](/concepts/ai#the-image-task). Uploading your own picture, or using no picture, costs nothing, and so does rendering the sizes: that happens on your computer.

Each picture is drawn once, at 2048×2048, and every size the platform takes is cropped from it, so one picture costs the same whichever platform it's for. Before you draw, the creative shows an estimate, for example "about $0.05 at medium quality". It assumes 400 input tokens of prompt and, for the output, OpenAI's per-image token counts scaled to 2048×2048 (4 megapixels):

| Quality | Output tokens | Estimate |
| --- | --- | --- |
| `low` | 784 | About $0.03 |
| `medium` (default) | 1,756 | About $0.05 |
| `high` | 7,024 | About $0.21 |
| `xhigh` | 12,488 | About $0.38 |
| `max` | 28,096 | About $0.84 |

For GPT Image 2.5 Sunburst the estimate is 1.5 times Flare's, because Sunburst uses more output tokens for the same picture. After drawing, the real cost from the API's token counts is added to the creative (shown on its card) and to the campaign's total on the **Creatives** tab, and logged under **AI calls**. Every picture counts against the monthly budget. **Draw again** costs another picture, and Startica asks you to confirm first. **Suggest ideas** doesn't draw anything: the ideas wait until you click **Draw it**.

## X API (optional)

If you add an [X API bearer token](/credentials/x-api), X bills your X developer account for every post the API returns. Startica estimates about $0.005 per post read.

| Setting | Default | Cost at the default |
| --- | --- | --- |
| **Most post reads per day** | 100 | About $0.50 a day, at most about $15 a month |
| **Scan X at most every … hours** | 6 | Up to 4 searches a day, each reading at most 50 posts, all within the daily cap |

Searches, pasted X links and engagement checks on your X posts all count toward the daily cap, which resets at midnight UTC. The X cost isn't part of the monthly AI budget below and isn't shown on the System page; the **X API (optional, paid)** card in **Settings → Channels** shows today's reads. X posts that Startica finds are scored and drafted by the AI like any other conversation, which costs AI budget as usual.

Without a token, X costs nothing: you paste X posts yourself.

## The monthly budget

Startica enforces its own monthly cap on AI spend, separate from any limit you set with your provider. It covers both providers together.

| Setting | Detail |
| --- | --- |
| Where | **Settings → General → AI → Add API key** or **Change keys or budget**, field **Monthly budget (USD)**; also the welcome wizard's **Connect AI** step |
| Default | $50 |
| Allowed range | $1 to $10,000 |
| Period | The calendar month, in your computer's local time |

### What happens at the cap

Before every AI call, to either provider, Startica adds up the estimated cost of all calls this month from its own log (`ai_runs`). If the total has reached the budget:

1. The call isn't made. No tokens are spent.
2. A `blocked` entry is logged under **AI calls**, with "Monthly AI budget reached ($X of $Y)".
3. The job fails with the same message. You see it under **Job runs** on the System page, and on the page that started the job.

Startica doesn't switch to a cheaper model when you're near the cap. It runs normally until the cap, then blocks every AI call until the 1st of next month or until you raise the budget. Non-AI work keeps running: scanning feeds, syncing metrics, checking engagement on your posts. The monthly budget doesn't limit X API reads; those have their own daily cap. New conversations still arrive, but scoring them fails while the cap is in effect.

The check happens before each call, so a call that's already running when the cap is reached finishes normally. Spend can end up slightly over the budget.

> [!TIP]
> Also set a spend limit with your provider: in the Claude Console (**Settings → Billing → Spend limits**) or on the OpenAI platform. It's enforced by the provider against your real bill, so it still holds if Startica's estimate is off. See [Anthropic API key](/credentials/anthropic#set-a-spend-limit-in-the-console) and [OpenAI API key](/credentials/openai#set-a-spend-limit-on-the-platform).

## Where to see spend

| Where | What it shows |
| --- | --- |
| **System → AI spend this month** | This month's estimated total and your budget, for example `$3.2140 of $50`. It counts only Startica's calls. Links under it open the usage page of each provider you've saved a key for (platform.claude.com, platform.openai.com), which shows your account's actual usage and bill, including other apps. |
| **System → AI calls** | The latest 20 calls: task, model, status, tokens in and out, estimated cost, latency |
| **Settings → General → AI** | The provider in use, whether each provider's key is saved, and your budget |
| The [Claude Console](https://platform.claude.com) or [OpenAI platform](https://platform.openai.com) usage and billing pages | What your provider actually charged, across everything that uses your key |

To dig further, the full history is in the `ai_runs` table of the local database. See [Data folder](/reference/data-folder).

Runs of `yarn eval` (for contributors) use a throwaway database. Their cost is printed in the terminal and doesn't count toward the app's monthly total, though your provider still bills it.
