---
title: Ads
description: Plan a paid campaign for Google Ads, Meta or Reddit, get the targeting, ads and images made and checked, hand it off to launch yourself, and see what to do next from the results.
layout: doc
---

**Ads** plans paid campaigns for **Google Ads** (search), **Meta** (Facebook and Instagram) and **Reddit**. You give it a platform, a goal, a landing page and a budget. Startica plans a small test, splits it into ad groups with their targeting, writes the ads, checks every line against the platform's limits and common reasons for rejection, and gives you files and steps to set it up in the platform's own ad manager. It can make the ad images, and once the campaign runs, it shows what each ad brought and suggests which to scale, keep, rewrite or stop.

This page covers what Ads does, creating and editing a campaign, the checks and the tracking links. [Creatives](/ads/creatives) covers the ad images. [Hand-off](/ads/hand-off) explains the files and the steps for each platform. [Results and what to do next](/ads/results) covers the numbers per ad and the suggestions. [Limits and checks](/ads/limits) lists every field, limit, call to action and check.

> [!WARNING]
> You launch and you pay. Startica never creates a campaign, spends money or publishes an ad in your ad account. It can't see your ad account at all. Everything it produces is a draft for you to review, import or paste, and launch yourself, in the platform's own tool.

## What it does

- **Plans a test.** Each plan is a first test: a test budget over a number of days (usually 14 to 30), one success metric with a number, and what result means stop or keep going.
- **Splits it into ad groups.** One to three groups, each one angle: a distinct reason someone would want the product.
- **Writes the targeting.** Keywords with match types and negative keywords for Google, an audience with interests and placements for Meta, communities and interests for Reddit, plus locations.
- **Writes the ads.** In the platform's format, within its character limits.
- **Checks every ad.** Limits, required fields, and wording that platforms often reject. See [Checks](#checks).
- **Tags every link.** So Google Analytics can tell which ad brought a visit. See [Tracking links](#tracking-links).
- **Makes the images.** A picture drawn by AI or uploaded, with your words, logo and button added by a template, in every size the platform takes. See [Creatives](/ads/creatives).
- **Hands it off.** A Google Ads Editor file, a Meta bulk import file, a Markdown brief, and the steps for each platform. See [Hand-off](/ads/hand-off).
- **Reads the results.** Visits and key events per ad from GA4 or Umami, with the spend you enter, and a suggestion per ad. See [Results and what to do next](/ads/results).

## What it doesn't do

- **It doesn't launch, pause or edit campaigns.** It doesn't connect to Google Ads, Meta Ads Manager or Reddit Ads, and doesn't open them in a window for you.
- **It doesn't spend money.** The import files are paused, so importing alone never spends anything.
- **It doesn't upload images.** You download the [creatives](/ads/creatives) and add them to the ads in the ad manager. The import files carry no images.
- **It doesn't read your spend.** You copy spend from the ad manager into the [Results](/ads/results) tab. Suggestions to stop or scale are for you to carry out in the ad manager.
- **It doesn't give legal or policy advice.** The checks catch common problems. Each platform's own review decides what runs.

## Requirements

- **A product.** Ads works on the product picked in the product switcher. Without one, the page says to add a product in **Settings** first.
- **An AI key.** Planning and rewriting call the AI with your own key. Without a key, **New campaign** is disabled and the page says "Add an AI key in Settings to plan campaigns." See [How Startica uses AI](/concepts/ai).
- **Intel helps.** The plan is written from what Startica knows about the product: the brief, personas, the alternatives people use, and your notes on the product. It also gets Intel's keywords (with their intent) and the communities you watch, and starts the targeting from them: Reddit campaigns from the subreddits you watch, Meta campaigns use every watched community as a hint for interests. Competitor keywords are used for targeting only, never in the ad copy. [Build intel](/getting-started/first-run) first for a better plan. Competitor names from Intel are also used by the checks.
- **Startica must be running.** Plans and rewrites run as [background jobs](/reference/jobs), so they only run while the app is open.

These AI tasks are used:

| Work | Task | Default model |
| --- | --- | --- |
| Planning a campaign (the `ad_plan` job) | `strategy` | Claude Opus 5.5 or GPT-6.1 Sol |
| Rewriting one ad (the `ad_copy` job) | `draft` | Claude Sonnet 5.5 or GPT-6.1 Sol |
| Suggesting creative ideas (the `ad_creative_ideas` job) | `draft` | Claude Sonnet 5.5 or GPT-6.1 Sol |
| Drawing a creative's picture (the `ad_creative_image` job) | `image` | GPT Image 2.5 Flare, on OpenAI only |

You can change the model for each task in **Settings → General → AI**. All of them count against your [monthly budget](/concepts/costs#the-monthly-budget). Drawing pictures needs an OpenAI API key even when Claude is your provider; uploading your own pictures needs no AI. See [The image task](/concepts/ai#the-image-task). Rendering the images and the results need no AI.

## Find it in the sidebar

**Ads** is in the **Marketing** section of the sidebar, after **Content Studio**. It lists the product's campaigns, newest first:

| Column | What it shows |
| --- | --- |
| **Campaign** | The name, linked to the campaign, with its goal below. |
| **Platform** | Google Ads, Meta or Reddit. |
| **Status** | See [Statuses](#statuses). |
| **Ads** | How many ads the campaign has. |
| **Monthly budget** | The monthly budget from the brief. |

## Create a campaign

1. Open **Ads** and click **New campaign**.
2. Fill in the **New ad campaign** dialog (below).
3. Click **Plan it**.

Startica opens the campaign and plans it in the background. A campaign has three tabs: **Plan and ads** (this page), [Creatives](/ads/creatives) and [Results](/ads/results). The status shows **Planning**, and the page says "Planning the campaign: the targeting, the test and the ads. This takes a minute or two." The page updates by itself when the plan is ready, and the status becomes **Draft**.

| Field | What to enter |
| --- | --- |
| **Platform** | **Google Ads** (search ads for people looking for a solution), **Meta** (Facebook and Instagram ads by audience) or **Reddit** (promoted posts in communities). Google Ads is selected by default. You can't change the platform later. |
| **Campaign name** | Required, up to 120 characters. For example "Search: field notes app". The name also sets the `utm_campaign` tag; see [Tracking links](#tracking-links). |
| **Goal** | Required, up to 500 characters. What the campaign is for, for example "Trial signups from small field teams". |
| **Landing page** | Required. The page the ads link to. It starts with the product's website. If you leave out `https://`, it's added. |
| **Monthly budget you can spend** | In your ad account's currency. Defaults to 300. The plan starts with a smaller test. |
| **Notes for the plan (optional)** | Up to 2,000 characters: audiences to try or avoid, offers, countries. |

> [!TIP]
> Make the goal specific and measurable. "Free signups from grad students searching for a field notes app" gives a sharper plan than "more users".

## What the plan contains

The campaign page shows the plan in **The plan** card and one card per ad group.

**The plan** card:

| Part | What it is |
| --- | --- |
| Summary | Three to five sentences: the strategy, who it reaches, and what to watch. |
| **Test** | The test budget and how many days it runs, for example "210 over 21 days", and about how much that is a day. |
| **Works if** | The success metric, with a number and when to stop. For example "Cost per signup under $12 by day 21. Stop early if 100 clicks bring no signups." |
| **Bidding** | The bid strategy to start with, and why. |

Each **ad group** card has the group's name, its angle (one sentence on why someone in this group wants the product), its targeting and its ads.

What the AI is asked to write depends on the platform:

| Platform | Format | Targeting | Ads |
| --- | --- | --- | --- |
| Google Ads | Search campaign with responsive search ads | 5 to 15 keywords per group, mostly phrase and exact match (broad only with a reason); negative keywords that exclude jobs, free-only, tutorials and unrelated meanings; locations. Bidding: Maximize clicks with a max CPC limit for a first test without conversion data, or Maximize conversions once conversion tracking works. | One responsive search ad per group: 10 to 15 headlines that each stand alone (the main keyword in 2 or 3, the product name in 1), 4 descriptions, and two optional display path parts. |
| Meta | Single-image ad, in a Sales, Leads or Traffic campaign | An audience described in plain words, interests to try, placements (usually Advantage+ placements), locations. Advantage+ audience with a few interest suggestions is often best at small budgets. | 2 or 3 per group, each with a different hook: primary text whose first 125 characters stand on their own, a headline, an optional description and a call to action. |
| Reddit | Promoted post (image or text) | 3 to 10 communities (subreddits) per group, interests, locations. | 2 or 3 per group: a headline written like a good post title in those communities, an optional body, and a call to action. |

For every platform, the AI is told to write plainly, like the product's own site: no superlatives it can't prove, no guarantees, no fake urgency, no clickbait, no ALL CAPS, never a competitor's name in the copy, and no invented facts (prices, user numbers, awards or features that aren't in the product's description). Meta ads must not assert or imply the reader's personal attributes. Even so, read every ad: the [checks](#checks) catch some slips, not all.

If planning fails, the status becomes **Planning failed** and the page says "Planning didn't finish: _the error_. Plan again to retry."

## Edit the plan

Everything the plan wrote can be changed.

### Groups and targeting

Click the pencil icon on an ad group card. The **Ad group** dialog has **Name**, **Angle** and the targeting for the platform:

| Platform | Fields |
| --- | --- |
| Google Ads | **Keywords** (one per line), **Negative keywords** (one per line), **Locations** (comma-separated) |
| Meta | **Audience**, **Interests** (comma-separated), **Placements** (comma-separated), **Locations** (comma-separated) |
| Reddit | **Communities** (comma-separated, without `r/`), **Interests** (comma-separated), **Locations** (comma-separated) |

Google keywords use Google Ads Editor's notation for match types:

| You type | Match type |
| --- | --- |
| `[field notes app]` | Exact |
| `"field notes app"` | Phrase |
| `field notes app` | Broad |

Negative keywords are plain text, one per line, and are exported as negative broad match. For Reddit, a leading `r/` is removed if you type one.

### Ads

Each ad shows its fields with a character count, its call to action (Meta and Reddit) and the link it points to. A badge says who wrote it last: **AI** or **You**.

- **Edit:** click the pencil icon on the ad. Google headlines and descriptions are one per line. Saving marks the ad **You**.
- **Rewrite:** click **Rewrite**, optionally add **Guidance** (for example "Lead with the offline mode; less formal"), and click **Rewrite**. The AI rewrites the ad, keeping what works, following your guidance and fixing any problems the checks flagged. It sees the product, the campaign's goal and landing page, the group's angle and the group's other ads. With no guidance, it makes the ad sharper and more specific. Your edits to that ad are replaced, and it's marked **AI**. Your earlier copy stays under **Versions**. While it runs, the ad shows a spinner and can't be edited. If it fails, the ad shows **Rewrite failed** with the error and keeps its old copy.
- **Refine:** click **Refine** to chat about the ad: why someone would click it, a different audience, or the problems the checks found. A revised ad appears under the AI's reply with **Apply**, and the checks run on it first: any problems are listed under the reply. See [Refining AI suggestions](/guides/refine).
- **Versions:** once an ad has two or more versions (a rewrite, your edit, a revision from a chat), **Versions** lists them and **Restore** brings one back.
- **Add an ad:** click **Add an ad** under a group's ads. The new ad is a copy of the group's first ad, marked **You**, for you to edit into a new variant.
- **Delete:** click the trash icon on the ad and confirm.

### Edit the brief

Click **Edit brief** to change the campaign's name, goal, landing page, monthly budget or notes. The platform can't be changed. The plan and ads aren't rewritten; the brief is used the next time you plan again. Some changes do apply right away:

- The **Landing page** changes every ad's link, on the page and in the files.
- The **Campaign name** changes the campaign's name in the files and the file names, but not the `utm_campaign` tag, which is fixed when the campaign is created.
- The **Goal** picks the campaign objective in the Meta file. See [Meta](/ads/hand-off#meta).

## Plan again

**Plan again** writes a new plan from the current brief. It replaces the whole plan: the summary, the test, every ad group and every ad, **including your edits**. Unless the last plan failed, Startica asks you to confirm first.

If you only want new wording, use **Rewrite** on single ads instead.

> [!WARNING]
> New ads get new ids, so their tracking links change, and [spend](/ads/results#enter-spend) you entered for the old ads is kept for the whole campaign, no longer per ad. Creatives made for an old ad are kept, as **Whole campaign**. Don't plan a campaign again once it's running.

If the new plan fails, the old groups and ads stay as they were and the status becomes **Planning failed**.

## Stop

While a plan is being written, **Plan again** becomes **Stop**. Stopping cancels the job; the status becomes **Planning failed** with "Stopped by you". Click **Plan again** to start over.

A rewrite can be stopped from **System → Running and waiting**.

## Statuses

| Status | Meaning |
| --- | --- |
| **Planning** | The AI is writing the plan. |
| **Draft** | The plan is ready for you to review and edit. |
| **Planning failed** | The plan didn't finish, or you stopped it. The error is shown on the campaign. |
| **Handed off** | You imported or set it up in the ad manager. |
| **Running** | It's live in the ad account. |
| **Ended** | You stopped it in the ad account. |

Startica sets **Planning**, **Draft** and **Planning failed**. You set **Draft**, **Handed off**, **Running** and **Ended** yourself, with the status menu on the campaign page, because Startica can't see your ad account. The menu is hidden while a plan is being written. Changing the status changes nothing on the platform.

## Delete a campaign

Click the trash icon on the campaign page and confirm. This deletes Startica's copy: the plan, groups and ads, the creatives and their image files, and the spend you entered. Anything you launched keeps running in the ad account; stop it there. A plan still being written is stopped first.

## Checks

Every ad is checked each time the campaign page loads, against the platform's limits and common reasons ads are rejected or perform badly. Problems show under the line they're about:

- **Errors** (red) are things the platform rejects: text over the limit, a missing required field, too few or too many headlines, an exclamation mark in a Google headline, or two Google headlines that are the same.
- **Warnings** (amber) are advice: text over the recommended length that's cut off in some placements, unproven superlatives, guarantees, clickbait, personal attributes on Meta, more than one exclamation mark in a Google description, ALL CAPS words on Google, and competitor names.

The **Hand off** card counts them: "Fix 2 problems marked in red first: the platform will reject them." for errors, or "3 warnings: worth a look, but they won't block the import." when there are only warnings.

> [!NOTE]
> Nothing is blocked in Startica: you can download the files with errors in them. The platform will reject those ads, so fix them first. Warnings are advice; the platforms' own review has the last word either way.

Every check, with its level and the exact rule, is listed in [Limits and checks](/ads/limits#checks).

## Tracking links

Every ad links to the campaign's landing page with four UTM tags added:

| Parameter | Value |
| --- | --- |
| `utm_source` | The platform: `google`, `meta` or `reddit` |
| `utm_medium` | Always `paid` |
| `utm_campaign` | The campaign name when it was created, in lowercase with anything other than letters and digits turned into `-`, at most 60 characters. "Search: offline field notes" becomes `search-offline-field-notes`. |
| `utm_content` | The ad's id |

For example:

```text
https://fieldnote.example/?utm_source=google&utm_medium=paid&utm_campaign=search-offline-field-notes&utm_content=7b1e4c2a-...
```

The tagged link is shown under each ad and is in every file. Keep it as written when you set the ad up. `utm_campaign` doesn't change when you rename the campaign, so earlier visits and new ones stay together. Each ad keeps its id, so its `utm_content` stays the same when you edit or rewrite it; a new ad (from **Add an ad** or **Plan again**) gets a new id.

### Results in Analytics

With [GA4 connected](/credentials/google), the daily sync reads sessions by source and medium, and sessions and key events per `utm_content`. So:

- Visits from your ads show under the **Paid** channel and in **Sources** on [Analytics](/guides/analytics) → **Traffic**, as `google / paid`, `meta / paid` or `reddit / paid`, and each campaign's spend, visits, key events and cost per key event under **What Startica did** → **Ads**.
- Visits and key events per ad are recorded by their `utm_content`, from GA4 or Umami, and shown on the campaign's [Results](/ads/results) tab with the spend you enter.

> [!NOTE]
> If your Google Ads account is linked to GA4 with auto-tagging on, GA4 may attribute Google visits to `google / cpc` from auto-tagging instead of the manual tags. GA4 has a setting to let manual tags take priority.

## In the demo

[Demo mode](/guides/demo-mode) has two sample campaigns for Fieldnote:

- **Search: offline field notes**, a Google Ads campaign in **Draft**, with two ad groups ("Field notes app" and "No signal"), keywords, negative keywords and a responsive search ad each, ready to hand off.
- **Reddit: grad student fieldwork**, a Reddit campaign marked **Running**, with one group of fieldwork communities and two promoted posts. It has two [creatives](/ads/creatives#in-the-demo) and two weeks of sample [results](/ads/results#in-the-demo): one ad to scale, one to stop.

You can open them, edit them and download their files. Planning and rewriting need the AI, which is off in the demo: **New campaign** is disabled without a key, and a **Plan again** or **Rewrite** just waits.

## Related

- [Creatives](/ads/creatives)
- [Hand-off](/ads/hand-off)
- [Results and what to do next](/ads/results)
- [Limits and checks](/ads/limits)
- [Analytics](/guides/analytics)
- [How Startica uses AI](/concepts/ai)
- [Costs](/concepts/costs)
