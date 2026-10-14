---
title: AI visibility
description: "The AI visibility screen in SEO & GEO: ask an AI assistant the questions your customers ask, and see whether it mentions and recommends your product, who it names instead, and which pages it cites."
layout: doc
---

**AI visibility** is the third part of [SEO & GEO](/seo). People increasingly ask an AI assistant "what's a good app for…" instead of searching. AI visibility asks an assistant the questions your customers would ask, with web search on, and reads every answer: does it name your product, does it recommend it, in what place, how does it describe it, which competitors does it name, and does it link to your site.

This page explains what it measures and what it can't, how to write good questions, what a run does and costs, every number on the screen, weekly runs, models, privacy and every message you may see. It uses your own [Anthropic](/credentials/anthropic) or [OpenAI](/credentials/openai) key and counts against your [monthly AI budget](/concepts/costs#the-monthly-budget).

## Find it

Open **SEO & GEO → AI visibility** in the left sidebar. Like the rest of Startica, it shows the product picked in the product switcher in the header. It doesn't need a site or any connection, only an AI key. The SEO & GEO **Overview** also has an **AI visibility** card; see [Overview card](#overview-card).

## What it measures

For each question, Startica gets one fresh answer and checks it:

- **Mentioned:** the answer names your product.
- **Recommended:** the answer presents it as a good choice or one of its suggestions, not just in passing, as a bad fit or as something to avoid.
- **Position:** where your product comes among the products the answer names: 1 is first.
- **How it describes you:** a short quote from the answer, and whether it speaks of you positively, neutrally or negatively.
- **Competitors:** which of the competitors in your [Intel](/getting-started/first-day) the answer names.
- **Your pages cited:** whether the answer links to your own site.

Across a run, these add up to the share of answers that mention and recommend you, your average position, how often your pages are cited, and a **share of voice** against your competitors.

## Limits

Read the results as a trend, not an exact count. The screen says so too: "Answers come from Claude Sonnet 5.5 with web search, through your AI key. What people see in ChatGPT, Claude, Perplexity or Google can differ: those apps personalize answers and use other models and settings. Treat this as a trend, not an exact count."

- **API answers, not the consumer apps.** Startica asks through the provider's API, the way a developer would, not through the ChatGPT, Claude, Perplexity or Gemini apps. The apps use their own system prompts, models, memory, location and personalization, so the same question there can get a different answer. Startica never signs in to those apps or scrapes them.
- **One provider per run.** Every question in a run goes to the model of the `answer` task: Claude Sonnet 5.5 by default, or GPT-6.1 Sol if you use OpenAI. A run shows what that one model says, not what every assistant says. See [Models](#models).
- **One answer per question.** AI answers vary from one asking to the next. A single question flipping from mentioned to not mentioned may be chance. Look at many questions and several runs.
- **The assistant isn't told about you.** Startica's instructions to the answering model don't mention your product. It's told to answer well and concisely, to search the web when it helps, and to name specific products when the question asks for tools or alternatives. That's the point: to see what it says on its own. It also means answers are shaped by Startica's short instructions rather than an app's.
- **Not Google's AI Overviews or AI Mode.** Those have no API. They're counted inside Google's search totals; see [Search performance: Limits](/seo/search#limits).

## Questions

Questions are the heart of it. A run asks every active question, so the results are only as good as the questions.

### Write good questions

Write each question the way a customer would type it to an assistant when they have the problem your product solves. Plain, specific, sometimes long. For Fieldnote, an offline field notebook:

| Question | Stage |
| --- | --- |
| What's the best app for taking field notes when there's no phone signal? | discover |
| How do ecology grad students organize field data from transects? | discover |
| Good alternatives to TerraJot for a small research team | compare |
| TerraJot vs Quadrat for archaeology field schools | compare |
| Logbook Pro is too expensive for students, what else is there? | compare |
| Which note app should my lab use to share site observations? | decide |

Some rules of thumb:

- **Don't name your product.** "Is Fieldnote good?" will always mention Fieldnote and tells you nothing. Naming competitors is fine and useful: "alternatives to TerraJot" is a real buying question.
- **Mix the stages.** Each question has a stage:

  | Stage | The person is… |
  | --- | --- |
  | **discover** | learning about the problem or the options |
  | **compare** | weighing options |
  | **decide** | ready to choose or switch |

- **Group them by topic.** A topic is a word or two, such as `offline notes` or `alternatives`, so similar questions sit together.
- **Start with about 20.** Enough to see a pattern without spending much. You can have up to 100 per product.
- **Keep them stable.** Changing many questions between runs makes the trend harder to read. Add new ones rather than rewriting old ones.

### Suggest questions

**Suggest questions** asks the AI to write questions from your Intel: the product's brief and personas, its keywords and its competitors. It writes about 20, mixing "what's the best…", "how do I…", "X vs Y", "alternatives to…" and questions that describe a situation, each with a topic and a stage. The toast says "Writing questions from your Intel…" and the questions appear in the table when they're ready.

Startica then drops any suggestion that:

- repeats a question you already have (ignoring upper and lower case), or
- contains your product's name, or the first part of its website address (`fieldnote` for `https://fieldnote.example`).

So you may get fewer than 20. It never adds more than the room left under 100. Clicking again while a suggestion is still being written does nothing. Suggestions use the `draft` task (Claude Sonnet 5.5 or GPT-6.1 Sol by default) and cost a few cents. Read them and delete or edit any that don't sound like your customers.

With no questions yet, the **Questions** card says "Start with about 20 questions. Startica can write them from your Intel (personas, keywords and competitors), or add your own." with a **Suggest questions** button. Build the [Intel brief](/getting-started/first-day) first for better suggestions.

### Add, edit, pause and delete

- **Add a question** opens a form: **Question** ("Ask it the way a customer would, without your product's name."), **Topic (optional)** and **Stage** (**Discover**, **Compare** or **Decide**). A question needs at least 5 characters ("Write the question as someone would ask it") and at most 500; a topic at most 40.
- The pencil on a row opens **Edit question** with the same fields.
- The pause button leaves a question out of runs ("Pause: leave it out of runs"); the play button brings it back ("Resume: ask it in runs"). Paused questions are dimmed, marked **paused** and still count toward the 100.
- The bin deletes a question after "Delete this question? It stops being asked; past runs keep counting its answers in their totals." It disappears from the list, but the runs that asked it keep its answers in their totals.

The card's description counts them, for example "18 asked on each run, 2 paused. At most 100." Active questions come first, then by topic. With 100 questions, adding another says "At most 100 questions: remove some first".

## Run it

Click **Run now**. It's disabled when there are no active questions, while a run is going ("A run is already going"), in the demo ("AI is off in the demo") and without an AI key ("Add an AI key in Settings first"); hover it to see why.

### The Run dialog

The dialog, titled for example **Ask 20 questions**, says: "Each question goes to Claude Sonnet 5.5 with web search, as a person would ask it, without mentioning your product. Then a smaller model reads each answer." Below it:

| Line | What it says |
| --- | --- |
| **Likely cost** | "about $1.27 (up to 3 web searches a question, $0.01 each)". See [What a run costs](#what-a-run-costs). |
| **Cap** | "$2: the run stops before it would go over". When the estimate is over the cap, it adds ", so it may not ask every question". |
| **Time** | About 25 seconds a question, for example "about 8 min" for 20 questions. |

"Billed to your AI key and counted against your monthly AI budget. You can stop it any time and keep the answers so far." Click **Run**. The toast says "Running. Answers appear as they come in."

### What happens in a run

The run is a background job (`ai_visibility_run`), so you can leave the page. For each active question, oldest first:

1. **Check the cap.** Startica adds what this run has spent so far to the estimated cost of one question. If that would go over the run's cap, the run stops here and keeps what it has.
2. **Ask.** The question goes to the `answer` task's model as the user's message, with web search allowed (up to 3 searches) and no page fetching. The model's instructions don't mention your product. Startica keeps the answer's text, the pages it cited (up to 40) and the searches it ran.
3. **Read the answer.** A cheaper model, the `score` task's (Claude Haiku 5.5 or GPT-6 Luna by default), reads the answer with your product's names and website and your competitor list. It reports, literally from the answer: every product named, in order; whether yours is mentioned and recommended; a short quote about it (at most 25 words); the sentiment; and which of your competitors appear.
4. **Check what can be checked exactly.** Startica doesn't rely on the model for the facts it can check itself. See [How each answer is judged](#how-each-answer-is-judged).
5. **Save** the answer and what was found, and move on to the next question.

When the run ends, if it answered at least one question (stopped and capped runs included), Startica queues a read of the pages its answers cited, for [Off-site presence](/seo/off-site#how-pages-are-read). That read is free and uses no AI.

While it runs, a bar shows "Asking question 4 of 20…" with **Stop**. When every question is done, Startica works out the run's totals and the screen updates.

### How each answer is judged

| Result | How it's decided |
| --- | --- |
| **Mentioned** | Startica searches the answer's text for your product's names: the product's name from **Settings → Products**, and the first part of its website address without `www.` (for `https://fieldnote.example`, `fieldnote`; it's skipped when it's the same as the name). A name has to appear as whole words, written with or without spaces between them; case and punctuation don't matter, and names shorter than 3 characters are ignored. So "Field Note" and "field-note" count for Fieldnote, but "field notes" doesn't. If the name is in the text, it's mentioned, whatever the reading model said. If it isn't, it's mentioned only when the model also lists it among the products named. |
| **Recommended** | The reading model's judgment, and only if the answer mentions you. |
| **Position** | Your place in the list of products the answer names, in the order they first appear: the first one that matches your names. Only when mentioned. |
| **How it describes you** and sentiment | From the reading model, only when mentioned. |
| **Competitors** | The reading model's list, kept only where it matches a competitor in your Intel (case and punctuation aside). Other products the answer names are kept in the answer's **Products named** list but aren't counted as competitors. |
| **Your pages cited** | Startica checks each cited address: a page on your website's domain, or any subdomain of it (`docs.fieldnote.example` counts for `fieldnote.example`), is one of yours. Needs the product's website in **Settings → Products**. |

### What a run costs

The estimate in the dialog is the number of active questions times the estimated cost of one question, which assumes:

| Part | Assumed size | On the Claude defaults |
| --- | --- | --- |
| The answer (`answer` task) | 12,000 input tokens (search results arrive as input) and 900 output tokens | Sonnet 5.5: about $0.033 |
| Web searches | 3, at $0.01 each | $0.03 |
| Reading the answer (`score` task) | 2,500 input tokens and 250 output tokens | Haiku 5.5: under $0.001 |
| **One question** | | **about $0.063** |

So 20 questions come to about $1.27, and 100 questions about $6.34. OpenAI's defaults (GPT-6.1 Sol and GPT-6 Luna) cost the same per token, so the estimate is the same. A stronger `answer` model costs more: Opus 5.5 roughly doubles the answer's part.

This is an estimate. Real answers can search less, read longer pages or write more. The real cost of each run is logged with every AI call (see the **AI calls** table on the **System** page) and shown under the tiles after the run. See [Costs](/concepts/costs) for prices.

### The cap

Each product has a **cost cap per run**: $2 by default, from $0.10 to $50, set in **Settings** on the AI visibility screen. Before each question, Startica adds what the run has spent so far (from its own log of AI calls) to the estimated cost of one question. If that's over the cap, it stops and keeps every answer so far. The run then counts as finished, with a note such as "Stopped at the $2.00 cap after 31 of 60 questions."

With the default $2 cap, a run asks about 30 questions at most on the default models. Raise the cap if you have more questions and want them all asked.

The cap is taken when the run starts, so changing it during a run applies to the next one. A question that costs more than the estimate can take a run a few cents over the cap. The [monthly AI budget](/concepts/costs#the-monthly-budget) applies as well: when it's reached, the run stops with an error.

### Stop a run

Click **Stop** on the progress bar (the toast says "Stopping…"), or stop the job from **System → Running and waiting**. The question being asked is cut off and you pay only for what it used. Every answer before it is kept and counted, and the note says "Stopped by you after 6 of 20 questions." A run stopped before it started closes with "Stopped by you before it finished." A run that was going when Startica quit isn't lost: it picks up where it left off the next time Startica is open.

### How long it takes

About 25 seconds a question, so 20 questions take about 8 minutes, and 100 about 40. Startica must stay open; closing the window keeps it running in the tray or menu bar. See [Running in the background](/guides/background).

## Read the results

The tiles, share of voice and chart come from the latest finished run that answered at least one question. A run that was stopped or capped still counts if it answered some questions. Percentages are of the questions **answered** in that run: failed questions are left out.

Under the tiles a line says which run it is and what it cost, for example "From the run 2 days ago (weekly, $0.80), compared with the one on Oct 5." Runs you start say "run by you".

When the newest run has a note, it's shown above the tiles, for example "Last run (yesterday): Stopped at the $2.00 cap after 31 of 60 questions." It's red when the run failed.

### The tiles

| Tile | What it means | Change shown |
| --- | --- | --- |
| **Mentioned** | The share of answers that name your product, with "in 6 of 12 answers" below. | Yes |
| **Recommended** | The share of answers that suggest your product, with "3 answers suggest it". | Yes |
| **Average position** | Your average place among the products an answer names, over the answers that mention you, rounded to one decimal, for example "#2". Lower is better. A dash when no answer mentions you. | No |
| **Your pages cited** | The share of answers that cite at least one page on your site, with "4 answers link to your site". | Yes |

The change compares with the run before (the previous one that answered at least one question), in percentage points: "+8 pts" in green, "-8 pts" in red, or "no change". It appears from the second run on. Because the percentages are of answered questions, adding or pausing questions between runs changes what's being compared; keep the set stable when you want a clean trend.

### Share of voice

"How many answers name each product: yours and the competitors in Intel." One row for your product and one for each competitor in your Intel, with a bar, the number of answers that name it and its share of the answered questions, most named first. Your product is in bold and its bar in the module's color. A competitor named in no answer shows 0.

Only competitors in your Intel are counted here. If answers keep naming a product that isn't on your list (see **Others named** below), add it as a competitor in Intel to track it.

### Mentioned over time

"The share of answers that name _product_, run by run." A chart of the **Mentioned** percentage for each run that answered at least one question, up to the last 26 runs, by the day each started. Hover a point to see its value. It appears after the second run; until then the card says "The trend shows after the second run. Turn on weekly runs in Settings to build it up."

### The questions table

Each row is a question, with its topic and stage badges, and:

| Column | What it shows |
| --- | --- |
| **Last run** | The question's result in the latest run: **Recommended · #1** (with its position), **Mentioned · #3**, **Not mentioned**, **Failed** (in red) or **Not asked yet** for a question added or resumed since, or one the run didn't reach. When the result changed since the run before, it says "new since last run" or "dropped since last run". |
| **Others named** | Up to 5 other products the answer named, in order. Useful for finding competitors you didn't know about. |

The last column has edit, pause or resume, and delete.

### Read the answer

**Read the answer** under a question opens the full answer from the latest run:

- **The answer's text**, as the model wrote it. For a failed question, the error instead.
- **How it describes you**: the short quote, with the sentiment in brackets, for example "“an offline-first field notebook; notes carry location, time and photos” (positive)".
- **Products named, in order**.
- **Sources it cited**: every page the answer cited, as links. Your own pages are in bold with a ★.
- **Searched for**: the web searches the model ran.

Reading the sources is often the most useful part: they're the pages the assistant trusted for this question. Being on them (a review, a comparison, a forum thread) is how products get named in answers.

[Opportunities](/seo/opportunities#ai-answers-opportunities) does some of this reading for you, from the latest run: it lists the questions where the answer named competitors but not you, with an FAQ answer the AI can draft, and the comparison and "best of" pages cited at least twice in answers that didn't mention you. [Off-site presence](/seo/off-site) groups the sources of the last 4 runs by site, reads the cited pages to see whether you and your competitors are on them, and suggests what to do about each.

## Weekly runs

In **Settings** on the AI visibility screen, turn on **Run every week (Monday morning, while Startica is open)**. Every Monday at 09:30 local time, Startica starts a run for each product that has it on, has active questions and has no run going, with that product's cap. Weekly runs are off by default, because each one costs money.

Like every schedule, it only runs while Startica is open: if it's closed at 09:30 on Monday, that week is skipped. Weekly runs are skipped without an AI key. See [Background jobs](/reference/jobs#schedules).

The settings are per product. The cap must be from $0.10 ("Set a cap of at least $0.10") to $50 ("At most $50 a run").

## Models

Two tasks do the work, and you can change either in **Settings → General → AI → Advanced: the model for each task**:

| Task | Description in Settings | Claude default | OpenAI default |
| --- | --- | --- | --- |
| `answer` | "AI visibility: answering your questions with web search, as an assistant would" | Claude Sonnet 5.5, effort low | GPT-6.1 Sol, effort low |
| `score` | "Scoring conversations for relevance, and reading AI visibility answers" | Claude Haiku 5.5, effort low | GPT-6 Luna, effort low |

The `answer` model decides which provider's assistant you're measuring. To see what OpenAI's model says instead of Claude's, save an OpenAI key and set `answer` to GPT-6.1 Sol (or the reverse). Each run records the model it used. Mixing models across runs makes the trend less meaningful, so change it rarely, and expect a jump in the chart when you do.

`score` is shared with conversation scoring in the Inbox, so changing it affects both. See [How Startica uses AI](/concepts/ai#tasks-and-models).

## Privacy

- **The questions go to your AI provider.** Each question is sent to the provider of the `answer` model, and its web searches are run by the provider's servers, not your computer. Then the answer, the question, your product's names and website, and your competitor names go to the provider of the `score` model to be read. **Suggest questions** sends your product's brief, personas, keywords, competitors and existing questions.
- **Nothing goes to the consumer apps.** Startica doesn't use ChatGPT, Claude, Perplexity or Gemini accounts, and doesn't sign in anywhere.
- **Cited pages are read from your computer.** After each run, [Off-site presence](/seo/off-site#privacy) requests some of the cited pages from your computer, as `StarticaOffsiteCheck`, following each site's `robots.txt`.
- **Questions and answers stay on this computer.** Questions, runs and every answer with its citations and searches are stored in your local database (`ai_prompts`, `ai_visibility_runs`, `ai_visibility_answers`), along with the settings.

See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

## Overview card

The SEO & GEO **Overview** has an **AI visibility** card. After a run, it shows the **Mentioned** percentage from the latest run that answered at least one question, with "of AI answers mention Fieldnote, 3 recommend it (2 h ago)". Before the first run, it shows a dash and "See whether AI assistants recommend you". Either opens **AI visibility**. Like the other Overview cards, it's there once the product has a site.

## Troubleshooting

| Message | What it means and what to do |
| --- | --- |
| "Add some questions first" | The product has no active questions. Add or resume some, or click **Suggest questions**. |
| "A run is already going" | A run for this product is in progress. Wait for it, or stop it. |
| "AI is off in the demo, like every other outside call." | In the [demo](/guides/demo-mode), **Run now** and **Suggest questions** are off. Leave the demo to run your own product. |
| "Add an AI key in Settings → General → AI first." | There's no Anthropic or OpenAI key. See [Anthropic API key](/credentials/anthropic) or [OpenAI API key](/credentials/openai). |
| "Stopped at the $2.00 cap after 31 of 60 questions." | The run reached its cost cap. The answers so far count. Raise the cap in **Settings** on the screen, or pause some questions. |
| "Stopped by you after 6 of 20 questions." | You stopped the run. The answers so far count. |
| "Stopped by you before it finished." | You stopped a run that hadn't started yet. A run that was going when Startica quit picks up where it left off the next time Startica is open: it keeps the answers it has, asks only the rest, and the cost cap covers both parts. |
| "Monthly AI budget reached ($50.00 of $50.00)" | The [monthly AI budget](/concepts/costs#the-monthly-budget) ran out. The run ends as failed (the note is red), keeping any answers it got. Raise the budget or wait for the 1st. |
| "No Anthropic API key: add one in Settings → General → AI (the answer task uses claude-sonnet-5-5)" | The `answer` or `score` task's model is on a provider with no saved key. The run ends as failed. Add the key, or change the task's model. "Unknown model …" also ends the run. |
| **Failed** on a question | Any other error (a timeout, a refusal, an answer that hit the output limit) fails that one question; the run carries on with the next. **Read the answer** shows the error. Failed questions aren't counted in the percentages. If every question fails, the run fails with the first error as its note. |
| **Not asked yet** on a question | The question was added or resumed after the latest run, or the run stopped before reaching it. |
| No tiles after a run | The run answered no questions (it was stopped, or failed on the first one). The tiles stay on the last run that answered something. |

Runs also appear as `ai_visibility_run` ("Asking AI assistants") on the **System** page, and every call in **AI calls**.

## In the demo

In [demo mode](/guides/demo-mode), AI visibility shows Fieldnote with 12 sample questions across six topics and all three stages, and four runs a week apart (the first run by you, the rest weekly), in which Fieldnote is mentioned in a few more answers each week: 3 of 12 in the first run, 6 of 12 in the latest. The latest run shows 50% mentioned (+8 pts), 25% recommended, an average position of #2 and 33% of answers citing `fieldnote.example`, with share of voice against TerraJot, Quadrat and Logbook Pro and a four-point trend. Weekly runs are off, with the $2 cap, so the sample never runs on its own.

AI is off in the demo, so **Run now** and **Suggest questions** are disabled. You can add, edit, pause and delete questions.

## Related

- [SEO & GEO](/seo)
- [Search performance](/seo/search): visits that arrive from AI assistants' links
- [AI crawlers and llms.txt](/seo/ai-crawlers): whether AI crawlers can read your site
- [Opportunities](/seo/opportunities): what to do about the questions where you're missing
- [Off-site presence](/seo/off-site): the sites the answers cite, and whether you're on them
- [How Startica uses AI](/concepts/ai)
- [Costs](/concepts/costs#ai-visibility)
