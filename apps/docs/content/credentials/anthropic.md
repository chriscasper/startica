---
title: Anthropic API key
description: Create a Claude API key in the Claude Console, cap spending on both sides, add it to Startica and check that it works.
layout: doc
---

If you pick Claude as your AI provider, every AI feature in Startica calls the Claude API with your own key. Usage is billed to your Anthropic account at Anthropic's API rates. (To use OpenAI instead, see [OpenAI API key](/credentials/openai).) This page covers creating the key, setting a spend limit on Anthropic's side, entering the key with a monthly budget in Startica, testing it and rotating it.

> [!NOTE]
> A Claude.ai subscription (Pro, Max, Team) is separate from the Claude API and doesn't cover API usage. You need a Claude Console account with API credits or billing set up.

## Create the key

1. Go to the Claude Console at [platform.claude.com](https://platform.claude.com) and sign in or create an account. Older links to `console.anthropic.com` redirect there.
2. Set up billing: add credits or a payment method under **Settings → Billing**.
3. Open **Settings → API keys** and create a key. Give it a name you'll recognize, such as `Startica on my laptop`. If you use workspaces, pick the one you want this usage billed under.
4. Copy the key. It starts with `sk-ant-`. The Console shows the full key only once.

> [!TIP]
> Create a separate key for Startica rather than reusing one from another project. Then you can see Startica's usage on its own and revoke it without breaking anything else.

## Set a spend limit in the Console

Startica has its own monthly budget (below), but it's enforced by the app, using Startica's own cost estimates. A limit on Anthropic's side is a second, independent cap that holds even if something goes wrong in the app.

1. In the Claude Console, go to **Settings → Billing**.
2. In **Spend limits**, click **Set limit** (or **Adjust limit** if one is already set).
3. Enter a monthly amount at or above your Startica budget.

When you hit a Console limit, the API rejects requests until the limit resets or you raise it. In Startica those jobs fail with the API's error message, which you can see on the **System** page.

If you created a separate workspace for Startica's key, you can also give that workspace its own spend limit. The Default workspace can't have its own limit.

## Add the key to Startica

On a fresh install, the welcome wizard asks for it first: on the **Connect AI** step, pick **Claude (Anthropic)**, paste the key into **Anthropic API key**, set **Monthly budget (USD)** and click **Save and continue**. See [First run](/getting-started/first-run).

If you skipped that step, or to change the key later:

1. Open **Settings**. In the **AI** card, click **Add API key**. If a key is already saved, the button reads **Change keys or budget**.
2. In the **AI provider** dialog, set **Use** to **Claude (Anthropic)**.
3. Paste the key into **Anthropic API key**. It must start with `sk-ant-`.
4. Set **Monthly budget (USD)**. The default is $50. Any value from $1 to $10,000 is accepted.
5. Save.

The **AI** card now reads "Using Claude (Anthropic)." and "Anthropic API key: saved." If you were using OpenAI before, every task on OpenAI's models moves to Claude's recommended models. The key is encrypted with your OS keychain; see [how credentials are stored](/credentials/#how-credentials-are-stored).

When you change only the budget, leave the key fields blank to keep the saved keys.

You can also save an Anthropic key while OpenAI is in use, and route single tasks to Claude models with the pencil on their row. See [How Startica uses AI](/concepts/ai#providers).

### What the budget does

Before every AI call, Startica adds up the estimated cost of this calendar month's calls (local time). If that total has reached your budget, it doesn't make the call. The job fails with "Monthly AI budget reached ($X of $Y)", and a `blocked` entry is logged. Nothing is downgraded to a cheaper model. Calls simply stop until the next month or until you raise the budget.

The check runs before each call, so one call that's already running can push the total slightly over. See [Costs](/concepts/costs) for prices and typical amounts.

## Check that it works

The **System** page has a health check that runs one real AI call through the whole pipeline: queue, background worker, Claude, cost log.

1. Open **System** (bottom of the sidebar). The **Anthropic API key** card should say **Configured**.
2. Click **Run test job**.
3. Within a few seconds, a `ping` row appears under **Job runs** with status `succeeded`. Its result contains Claude's one-sentence reply.
4. Under **AI calls**, a `ping` row on `claude-haiku-5-5` shows the tokens used and a cost of a fraction of a cent.

If the job fails, the error is in the **Result / error** column. Common causes:

| Error | Fix |
| --- | --- |
| No Anthropic API key: add one in Settings → General → AI (the ping task uses claude-haiku-5-5) | Save the key in Settings. |
| `authentication_error` / invalid x-api-key | The key was revoked or mistyped. Create a new one and save it. |
| Spend or usage limit message from the API | Your Console spend limit or credit balance is exhausted. Check **Settings → Billing** in the Console. |
| Monthly AI budget reached | Startica's own cap. Raise **Monthly budget (USD)** or wait for next month. |

See [Troubleshooting](/troubleshooting/) for more.

## Rotate the key

1. In the Claude Console, create a new key (same steps as above).
2. In Startica, open **Settings → General → AI → Change keys or budget**, paste the new key into **Anthropic API key**, and save. The next job uses it; no restart needed.
3. Click **Run test job** on the **System** page to confirm.
4. Back in the Console, delete or disable the old key.

Do this if you think the key leaked, for example after pasting it somewhere public or sharing a copy of your data folder.

## Remove the key

When OpenAI is in use and an Anthropic key is saved, the **AI** card shows **Remove Claude (Anthropic) key**. It deletes the saved key. Tasks you routed to Claude models stop working until you add a key again. While Claude is the provider in use, replace the key instead, or switch to OpenAI first.

## When you run from source

Development uses the same Settings as the installed app. There's no environment variable for the key or the budget. The only exception is `yarn eval`, which takes `ANTHROPIC_API_KEY` from your shell; see [Prompts and evals](/contributing/prompts-evals#run-an-eval).
