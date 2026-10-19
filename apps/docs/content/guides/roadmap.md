---
title: Roadmap
description: A short list of growth bets across the funnel, planned by the AI from your intel and results, re-planned every week, with your own items left alone.
layout: doc
---

The Roadmap is a short, prioritized list of growth bets for your product. Each item is an experiment: a hypothesis, a success metric, and one concrete next step. The AI drafts and re-plans the list every week from your intel, your numbers and what you've tried. You can add and edit items yourself, and re-plans never change yours.

The Roadmap is planned from your product's intel. If you haven't built intel yet, the page asks you to do that first on the **Intel** page.

## The funnel stages

Items are grouped into five columns, one per funnel stage:

| Stage | Covers |
| --- | --- |
| Acquisition | Getting the right people to visit |
| Activation | Getting new users to their first meaningful action |
| Retention | Bringing them back |
| Revenue | Turning users into paying customers |
| Referral | Users bringing other users |

Only open items (to do and in progress) appear in the columns. Items in progress sit at the top of their column, marked **In progress**; the rest are sorted by priority.

## What an item contains

| Part | Meaning |
| --- | --- |
| Title | The bet, in a few words. |
| Priority | **P1** (this week) to **P5** (someday). |
| Source | **AI** (written by the AI) or **You** (yours). |
| Playbook | The built-in playbook it draws on, if any, shown by its key (for example `reddit-value-first`). |
| Why | The hypothesis, citing evidence where the AI has it. |
| Success | The success metric, with a number where possible. |
| Next | The single concrete action to take now. It also shows up on [Today](/guides/today). |
| Result | What happened, once you mark it done (or the AI's reason, if it dropped the item). |

Today takes the next steps of up to 3 open items: in-progress items first, then by priority.

## Create the roadmap

Click **Create the roadmap**. The AI reads:

- your product context (brief, personas, your notes);
- your numbers from the last 30 days (Google Analytics or Umami, Stripe, the product database, and numbers you entered): totals for counts such as visits and signups, and the latest value for levels (MRR, active subscriptions, trials, active users);
- the headline and summary of the latest [weekly analytics summary](/guides/analytics#weekly-ai-summary), if there is one;
- what Startica has done in the last 30 days: conversations found by status, replies posted, Content Studio pieces posted per channel, and the replies they got;
- why you dismissed conversations;
- the communities you watch;
- the latest audits and their high-severity findings;
- the built-in playbooks;
- the current roadmap and the last plan's summary.

It then proposes items. The instructions tell it to keep at most 8 open items, fit the stage of your product, avoid paid ads, never invent numbers, and say when data is missing (often by making "connect analytics" the next step).

Planning uses the `strategy` model task, which is Claude Opus or GPT-6.1 Sol by default, and takes a minute or two. See [AI models](/concepts/ai).

## AI items and your items

| | AI items | Your items |
| --- | --- | --- |
| Created by | A plan or re-plan | **Add item**, editing an AI item, adding an audit finding, or **Roadmap** on an [SEO & GEO opportunity](/seo/opportunities#add-to-the-roadmap) |
| Badge | AI | You |
| Re-plans can update or drop them | Yes, unless done | Never |

Click **Add item** to add your own. The dialog asks for a title, funnel stage, priority, why, success metric and next step.

Click the pencil icon to edit any item. Editing an AI item makes it yours: re-plans won't change or drop it after that.

Re-plans never touch items marked done, whoever created them.

## Work through items

Each item has buttons for its status:

| Button | Effect |
| --- | --- |
| **Start** | Marks it in progress. |
| **Done** | Opens **What happened?**. Write a line about the result (optional), then **Mark done**. |
| **Drop** | Moves it out of the columns. |
| **Reopen** | On a done or dropped item: moves it back to to do. |

Done and dropped items are listed under **Done and dropped** below the columns.

> [!TIP]
> Always write a result when you mark something done, even a short one: "12 replies posted, 2 signups from r/fieldwork". The next re-plan reads results to decide what to do more of, or less of.

## Experiments

Treat each item as an experiment. The **Why** is the hypothesis and **Success** is how you'll know it worked. For example, for Fieldnote:

| Part | Example |
| --- | --- |
| Title | Answer offline-sync questions in two research subreddits |
| Why | Researchers regularly ask how to take notes without signal; these threads get steady replies. |
| Success | 10 visits from tracked links in two weeks |
| Next | Reply to the two newest offline-notes threads from the Inbox |

When you finish, record what happened. The next plan reads your result and the numbers, and keeps, changes or drops related AI items.

## Weekly re-plan

Startica re-plans automatically **every Monday at 07:00**, in your computer's local time, for every product that has intel. Scheduled jobs only run while Startica is open. If the app is closed at that time, that week's scheduled re-plan does not run; click **Re-plan** instead. See [Background jobs](/guides/background).

To re-plan at any time, click **Re-plan**. The button shows **Planning…** while it runs.

On each re-plan, the AI may:

- **keep** an item as it is;
- **update** one of its own items (title, why, metric, next step, priority, stage);
- **add** a new item;
- **drop** one of its own items, with a reason, which is saved as the item's result.

### Change summary

The top card shows **Latest plan** with its date, a 3–5 sentence summary of what changed and why, and a list of every item that was added, updated or dropped, with a one-line reason. Items that were kept aren't listed. The latest summary also appears on [Today](/guides/today).

## Built-in playbooks

The AI can base items on these ten playbooks. They're built into the app and not editable yet.

| Key | Name | Stage | Summary |
| --- | --- | --- | --- |
| `community-cold-start` | Community cold start | Activation | For products with a community or shared space: make it feel alive early so new users stay: seed content, personal welcomes, a narrow first focus. |
| `reddit-value-first` | Reddit value-first replies | Acquisition | Become a known helpful voice in the right subreddits; mention the product only where it truly helps. |
| `landing-conversion` | Landing page conversion | Acquisition | Turn more visitors into signups: a clear promise, proof, and one obvious next step. |
| `onboarding-activation` | Onboarding to first value | Activation | Get each new user to the product's first meaningful action (the activation moment) in the first session. |
| `re-engagement-email` | Re-engagement email | Retention | Bring back users who signed up but went quiet, with a reason to return. |
| `seo-geo` | SEO and AI-search visibility | Acquisition | Be findable in search engines and in AI assistants' answers for the audience's questions. |
| `accessibility-fixes` | Accessibility fixes | Activation | Fix what Startica's accessibility checks find, most important first, so everyone can sign up and use the product. |
| `security-fixes` | Security fixes | Retention | Fix what Startica's security checks find on the product's sites, most serious first, so customers' data and trust are safe. |
| `paid-conversion` | Free-to-paid conversion | Revenue | Turn engaged users into paying customers with a plan that's clearly worth it. |
| `referral-loop` | User referrals | Referral | Give users a reason and an easy way to bring the people they work or play with. |

## Audits

The **Audits** card below the board runs the AI's reviews of your **Landing page** and **Onboarding**, and each finding can become a roadmap item. The **SEO** and **AI search** audits moved to **SEO & GEO → Opportunities**, under **AI audits**. The re-plan still reads the latest of all four. See [Audits](/guides/audits).

## Costs

Each plan or re-plan is one AI call on the `strategy` task. With the weekly schedule, that is at least one call per product per week while the app is open. Re-plans are never retried automatically when they fail; click the button again. See [Costs](/concepts/costs).
