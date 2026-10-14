---
title: OpenAI API key
description: Create an OpenAI API key on the OpenAI platform, cap spending on both sides, add it to Startica and check that it works.
layout: doc
---

If you pick OpenAI as your AI provider, every AI feature in Startica calls the OpenAI API with your own key. Usage is billed to your OpenAI account at OpenAI's API rates. This page covers creating the key, setting a budget on OpenAI's side, entering the key with a monthly budget in Startica, testing it and rotating it. (To use Claude instead, see [Anthropic API key](/credentials/anthropic).)

> [!NOTE]
> A ChatGPT subscription (Plus, Pro, Team) is separate from the OpenAI API and doesn't cover API usage. You need an OpenAI platform account with billing set up or prepaid credits.

## Create the key

1. Go to the OpenAI platform at [platform.openai.com](https://platform.openai.com) and sign in or create an account.
2. Set up billing: add a payment method or buy credits in the billing settings.
3. Open [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and click **Create new secret key**. Give it a name you'll recognize, such as `Startica on my laptop`. If you use projects, pick the one you want this usage billed under.
4. Copy the key. It starts with `sk-` (project keys start with `sk-proj-`). The platform shows the full key only once.

> [!TIP]
> Create a separate key, or a separate project, for Startica rather than reusing one from another app. Then you can see Startica's usage on its own and revoke it without breaking anything else.

## Set a spend limit on the platform

Startica has its own monthly budget (below), but it's enforced by the app, using Startica's own cost estimates. A limit on OpenAI's side is a second, independent cap that holds even if something goes wrong in the app.

In the platform settings, open **Limits** for your organization or for Startica's project and set a monthly budget at or above your Startica budget. Read what the page says about the budget: depending on the account and project, it can stop requests or only send you an email alert.

When a limit or your credit balance runs out, the API rejects requests. In Startica those jobs fail with the API's error message, which you can see on the **System** page.

## Add the key to Startica

On a fresh install, the welcome wizard asks for it first: on the **Connect AI** step, pick **OpenAI**, paste the key into **OpenAI API key**, set **Monthly budget (USD)** and click **Save and continue**. See [First run](/getting-started/first-run).

If you skipped that step, or to change the key later:

1. Open **Settings**. In the **AI** card, click **Add API key**. If a key is already saved, the button reads **Change keys or budget**.
2. In the **AI provider** dialog, set **Use** to **OpenAI**.
3. Paste the key into **OpenAI API key**. It must start with `sk-`. An Anthropic key (`sk-ant-`) is refused here.
4. Set **Monthly budget (USD)**. The default is $50. Any value from $1 to $10,000 is accepted.
5. Save.

The **AI** card now reads "Using OpenAI." and "OpenAI API key: saved." If you were using Claude before, every task on Claude's models moves to OpenAI's recommended models: GPT-6.1 Sol for strategy, research and drafting, GPT-6 Luna for scoring and the health check. See [How Startica uses AI](/concepts/ai#tasks-and-models).

The key is encrypted with your OS keychain and stored on your computer; see [how credentials are stored](/credentials/#how-credentials-are-stored). It's only ever sent to the OpenAI API (`api.openai.com`). Startica asks OpenAI not to store its responses.

When you change only the budget, leave the key fields blank to keep the saved keys.

### Only for ad pictures

[Ad creatives](/ads/creatives) draw their pictures with OpenAI's image models, whichever provider you use for everything else. To use Claude for the text and OpenAI only for pictures, open the **AI provider** dialog, keep **Use** on Claude, paste the key into **OpenAI API key** (optional for the provider not in use) and save. Your tasks stay on Claude; only the `image` task calls OpenAI. Without an OpenAI key you can still upload your own pictures. See [The image task](/concepts/ai#the-image-task).

### What the budget does

Before every AI call, Startica adds up the estimated cost of this calendar month's calls (local time), to both providers. If that total has reached your budget, it doesn't make the call. The job fails with "Monthly AI budget reached ($X of $Y)", and a `blocked` entry is logged. Nothing is downgraded to a cheaper model. Calls simply stop until the next month or until you raise the budget.

The check runs before each call, so one call that's already running can push the total slightly over. See [Costs](/concepts/costs) for prices and typical amounts.

## Check that it works

The **System** page has a health check that runs one real call through the whole pipeline: queue, background worker, OpenAI, cost log.

1. Open **System** (bottom of the sidebar). The **OpenAI API key** card should say **Configured**.
2. Click **Run test job**.
3. Within a few seconds, a `ping` row appears under **Job runs** with status `succeeded`. Its result contains the model's one-sentence reply.
4. Under **AI calls**, a `ping` row on GPT-6 Luna shows the tokens used and a cost of a fraction of a cent. OpenAI reports a dated model ID, such as `gpt-6-luna-2026-09-01`.

If the job fails, the error is in the **Result / error** column. Common causes:

| Error | Fix |
| --- | --- |
| No OpenAI API key: add one in Settings → General → AI | Save the key in Settings → General → AI. |
| Incorrect API key provided | The key was revoked or mistyped. Create a new one and save it. |
| You exceeded your current quota | Your credit balance or a platform budget is used up. Check billing and limits on the platform. |
| Monthly AI budget reached | Startica's own cap. Raise **Monthly budget (USD)** or wait for next month. |

See [Troubleshooting](/troubleshooting/) for more.

## Rotate the key

1. On the platform, create a new key (same steps as above).
2. In Startica, open **Settings → General → AI → Change keys or budget**, paste the new key into **OpenAI API key**, and save. The next job uses it; no restart needed.
3. Click **Run test job** on the **System** page to confirm.
4. Back on the platform, delete the old key.

Do this if you think the key leaked, for example after pasting it somewhere public or sharing a copy of your data folder.

## Remove the key

When Claude is in use and an OpenAI key is saved, the **AI** card shows **Remove OpenAI key**. It deletes the saved key. Tasks you routed to OpenAI models stop working until you add a key again. While OpenAI is the provider in use, replace the key instead, or switch to Claude first.

## When you run from source

Development uses the same Settings as the installed app. There's no environment variable for the key or the budget. The only exception is `yarn eval`, which takes `OPENAI_API_KEY` from your shell when you run it with an OpenAI model; see [Prompts and evals](/contributing/prompts-evals#run-an-eval).
