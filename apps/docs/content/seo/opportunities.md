---
title: Opportunities
description: "The Opportunities screen in SEO & GEO: one ranked list of what to do next to be found in search and AI answers, built from Site health, Search and AI visibility, with fixes the AI can draft for you to copy."
layout: doc
---

**Opportunities** is the fourth part of [SEO & GEO](/seo). It reads what the other three found ([Site health](/seo/site-health), [Search](/seo/search) and [AI visibility](/seo/ai-visibility)) and turns it into one ranked list of things to do: a query close to page 1, a page whose title gets few clicks, a site problem, a question where AI assistants name your competitors but not you. Each one says why it matters, with the numbers behind it, and what to do. For many, the AI can draft the fix for you to copy: titles and descriptions, structured data, an `llms.txt` file or an FAQ answer.

This page explains where the list comes from, every kind of opportunity and its exact rule, how they're ranked, every button, every kind of draft and its checks, what it costs, what leaves your computer, and every message you may see.

> [!NOTE]
> In this page, an opportunity is something to do on your site. It's unrelated to the conversations scored in the **Inbox**, which the rest of Startica also calls opportunities.

## Find it

Open **SEO & GEO → Opportunities** in the left sidebar. Like the rest of Startica, it shows the product picked in the product switcher in the header. Without a product, it says "Add a product in Settings first."

It needs no setup of its own. It shows what it can from the data you have:

| You have | You get |
| --- | --- |
| A site scan (**Scan now** on the SEO & GEO Overview) | [Site health](#site-health-opportunities) opportunities |
| [Google Search Console](/credentials/search-console), synced | [Search](#search-opportunities) opportunities |
| An [AI visibility](/seo/ai-visibility) run with answers | [AI answers](#ai-answers-opportunities) opportunities |

With none of them, the page says "Nothing yet. Opportunities come from a site scan (Overview → Scan now), Search Console (Search) and AI visibility runs (AI visibility)."

## How the list is built

Opportunities aren't stored. Every time you open the page, Startica runs a set of fixed rules over the latest data: the latest scan results, the latest 28 days of Search Console data and the latest AI visibility run. So the list always follows the data: fix a page and rescan, and its opportunity is gone; a sync that moves a query into striking distance adds one.

Building the list uses no AI and costs nothing. Only drafts and **Write it in Content Studio** call the AI, and only when you click them.

What Startica does store is what you did with each one: done or dismissed, the latest draft, and whether it's on the Roadmap or in Content Studio. That's kept in the `seo_opportunities` table under a stable key, such as `query:field notes app` or `site:<site id>:description-missing`. When the rules find the same thing again, it picks up its status and draft. When the data no longer produces it, it leaves the list, including **Done and dismissed**, and its stored row just waits in case it comes back.

The page refreshes itself when a draft finishes, a sync or scan finishes, an AI visibility run or audit ends, or a Content Studio piece changes.

## Kinds of opportunities

There are six kinds, in three areas. Each card has a badge for its area: **Search**, **Site health** or **AI answers**.

### Search opportunities

Search opportunities use Google Search Console data only (not Bing), over the latest 28 days of stored data, ending at the newest day synced. That's fixed: the range you pick on the **Search** screen doesn't change it. They use the same flags as the Search screen; see [Striking distance](/seo/search#striking-distance) and [Low click-through](/seo/search#low-click-through).

All three estimate clicks with the same rough click-through rates by position the flags use:

| Average position | Expected click-through rate |
| --- | --- |
| under 1.5 | 25% |
| 1.5 to under 2.5 | 14% |
| 2.5 to under 3.5 | 9% |
| 3.5 to under 5.5 | 6% |
| 5.5 to under 10.5 | 3% |
| 10.5 or lower | 1% |

#### Move a query up to page 1

**Move "_query_" up to page 1.** A query in striking distance (average position 4.5 to 20, at least 84 impressions in the 28 days) that isn't a brand query. Brand queries, those that name the product, are left out, because you rank for your own name already; see [Brand and non-brand](/seo/search#brand-and-non-brand).

- **Estimate:** the extra clicks a month it would get at about position 3: impressions × (9% − its click-through rate now), rounded. Shown as "~_n_ more clicks a month".
- **Limits:** the 15 striking-distance queries with the most clicks are considered; any with an estimate under 3 clicks is left out.
- **What to do:** "Strengthen the page that ranks for it (answer the query in its heading and first paragraph, link to it from related pages), or write a page that answers it directly."
- **Actions:** it has a content brief, so **Write it in Content Studio** writes a blog article that answers the query. No fix draft.

#### Rewrite a page's title and description

**Rewrite the title and description of _/path_.** A page with the **Low click-through** flag: average position 10 or better, at least 168 impressions in the 28 days, and a click-through rate under half of what its position usually gets.

- **Estimate:** the extra clicks a month at the usual rate for its position: impressions × (expected rate − its rate now), rounded.
- **Limits:** the first 10 low click-through pages among the 200 with the most clicks; any with an estimate under 3 is left out.
- **What to do:** "Write a title and meta description that match what people search for and say why to click."
- **Actions:** **Draft title and description** (see [Titles and descriptions](#titles-and-descriptions)).

#### Find out why a page lost clicks

**Find out why _/path_ lost clicks.** A page that got at least 10 fewer clicks in the latest 28 days than in the 28 days before, and at least 30% fewer.

- **Estimate:** the clicks lost, shown as "_n_ clicks lost".
- **Limits:** only when the stored data fully covers the 28 days before (Search Console keeps 16 months, so this is normal after the first sync), Pages are taken from the 200 with the most clicks in the latest 28 days, plus pages among the 200 with the most clicks in the 28 days before that have no data at all now. So a page that dropped out of search completely is reported too, as "0 clicks in the last 28 days, down from _n_ (100% fewer)".
- **What to do:** "Check whether the page changed, went missing or got a noindex, and which of its queries dropped in Search Console's Performance report."
- **Actions:** no draft or brief. Use Search Console, then mark it done.

### Site health opportunities

**One opportunity per Site health problem**, for every site of the product, with the problem's own title (for example **Missing meta description**), why it matters and how to fix it. FYI items aren't included. See [Every check](/seo/site-health#every-check).

- **Impact:** the severity and how many pages it's on, for example "medium · 2 pages", or "site-wide" for a problem that belongs to the site, such as **No llms.txt**. With more than one site, the why names the site.
- **See the evidence** opens the problem's card on **Site health**.
- **Drafts:**

| Site health problems | Draft |
| --- | --- |
| Missing page title, title too long or very short, several pages share a title, missing meta description, description too long, several pages share a description | **Draft title and description**, for up to 5 of its pages |
| Structured data can't be read, structured data is missing required properties, home page has no structured data about the product | **Draft structured data**, for its first page (the product's website when it's site-wide) |
| No llms.txt, llms.txt doesn't follow the expected format | **Draft llms.txt** |

The other problems (broken links, `noindex`, headings, sitemaps, blocked crawlers and so on) have no draft: the fix is in your site's code or settings.

### AI answers opportunities

AI answers opportunities use the latest AI visibility run that has finished (or stopped) and answered at least one question. Questions that failed in that run are ignored.

#### Get into AI answers for a question

**Get into AI answers for "_question_".** A question where the answer named at least one of your competitors but not your product.

- **Impact:** how many competitors it named, for example "2 competitors named instead".
- **Limits:** the 12 questions with the most competitors named.
- **What to do:** for a comparison question (one that says "vs", "versus", "alternative", "instead of", "compare" or "better than"): "Publish an honest comparison or alternatives page for this question, and an FAQ answer on your site that AI assistants can cite." For any other question: "Answer this question on your site in plain words (an FAQ entry or a section on the relevant page), so assistants that search the web can find and cite it."
- **Actions:** **Draft an FAQ answer** (see [FAQ answers](#faq-answers)). Comparison questions also have a content brief, so **Write it in Content Studio** writes an honest comparison article.

#### Get listed on a page AI answers cite

**Get listed in "_page title_".** A comparison, list or review page that answers cited at least twice when they didn't mention your product.

- **Which pages count:** a cited page whose title or address has "best", "top", "top 10" (any number), "alternative", "alternatives", "vs", "versus", "compare", "compared", "compares", "comparing", "comparison", "comparisons", "review" or "reviews" as a word, from answers that didn't mention the product. Each answer counts a page once, however often it cites it. Your own pages, and pages whose title already names your product, don't count.
- **Impact:** how many times it was cited, for example "cited in 6 answers".
- **Limits:** the 5 pages cited most.
- **What to do:** "If it's a list or review that takes suggestions, reach out to its author with what makes your product a fit. Never pay for or fake a mention."
- **See the evidence** opens the page itself, in your browser.

For every site AI answers cite, not only comparison pages, and whether you and your competitors are actually on them, see [Off-site presence](/seo/off-site).

## How they're ranked

All opportunities, from every area, are in one list, highest score first. The score isn't shown. It's a rough estimate of what each is worth, made so the areas can be compared:

| Kind | Score |
| --- | --- |
| Move a query up to page 1 | 30 + gain(extra clicks) |
| Rewrite a title and description | 28 + gain(extra clicks) |
| Find out why a page lost clicks | 25 + gain(clicks lost) |
| Site health problem | high 70, medium 45, low 22, plus 1 per page it's on (at most 10) |
| Get into AI answers for a question | 32 + 6 per competitor named |
| Get listed on a page AI answers cite | 26 + 4 per citation |

gain(_n_) is 8 × log₂(1 + _n_). It grows with the number of clicks, but more slowly the bigger it gets, so a few very large estimates don't push everything else off the screen: 10 clicks give 28 points, 60 give 47, 170 give 59 and 370 give 68.

### A worked example

In the [demo](#in-the-demo), Fieldnote's query "field notes app" had 2,658 impressions and 70 clicks in 28 days, at an average position of 7.6:

1. Its click-through rate is 70 ÷ 2,658 = 2.6%.
2. Near position 3 it would be about 9%. The extra clicks are 2,658 × (9% − 2.6%) ≈ 169. The card says "~169 more clicks a month".
3. Its score is 30 + 8 × log₂(170) ≈ 30 + 59 = 89.

The demo's **Missing meta description** on 2 pages scores 45 + 2 = 47, and a question where the answer named TerraJot and Quadrat but not Fieldnote scores 32 + 2 × 6 = 44. So the query comes first, then the description, then the question.

The estimates are rough. Real click-through rates vary a lot by query and by what else is on the results page, a better position isn't guaranteed, and "a month" means the latest 28 days. Use the ranking to choose where to start, not as a forecast.

## Filters

The tabs above the list filter it, each with a count:

| Tab | Shows |
| --- | --- |
| **All** | Every open opportunity |
| **Search** | Open Search opportunities |
| **Site health** | Open Site health opportunities |
| **AI answers** | Open AI answers opportunities |
| **Done and dismissed** | Everything you marked done or dismissed, from every area |

When a tab has nothing open, it says "Nothing open here. Nice." **Done and dismissed** says "Nothing done or dismissed yet." until you close one.

## A card

Each card has:

- the title, the area badge, and **Done** or **Dismissed** once you've closed it;
- the why, with the numbers, for example "2,658 impressions in 28 days at position 7.6, 70 clicks. Near the top it would get about 169 more.";
- the impact, on the right;
- **What to do:**, with **See the evidence**, which opens the Search screen, the problem on Site health, AI visibility, or the cited page;
- the latest draft, if there is one (see [Read a draft](#read-a-draft));
- the buttons.

Closed cards are dimmed, and show only **Reopen** (and their draft, if they have one).

## What you can do

| Button | What it does |
| --- | --- |
| **Draft title and description**, **Draft structured data**, **Draft llms.txt** or **Draft an FAQ answer** | Asks the AI for a fix draft. See [Drafts](#drafts). Shows **Drafting…** while it works, and **Draft again** once there's a draft. |
| **Write it in Content Studio** | Creates a blog article in Content Studio from the opportunity's brief, and starts writing it. Then shows **In Content Studio**, which opens the Content Studio library. |
| **Roadmap** | Adds a roadmap item. Then shows **On the Roadmap**, disabled. |
| **Today** | Adds a move to today's list. Then shows **On Today**, disabled, until the day ends. |
| **Done** | Marks it done. It moves to **Done and dismissed**. |
| **Dismiss** | Dismisses it: not worth doing. It moves to **Done and dismissed**. |
| **Reopen** | On a closed card: back to open. |

Draft buttons appear only on opportunities that have a draft, and **Write it in Content Studio** only on those with a content brief: striking-distance queries and comparison questions. Both need AI, so they're disabled in the demo (hover: "AI is off in the demo") and without an AI key (hover: "Add an AI key in Settings first"). The other buttons always work.

### Add to the Roadmap

**Roadmap** adds an item you own, so re-plans never change or drop it. See [AI items and your items](/guides/roadmap#ai-items-and-your-items).

| Roadmap field | Comes from |
| --- | --- |
| Title | The opportunity's title |
| Why | Its why, with the numbers |
| Next step | Its **What to do** |
| Stage | Acquisition |
| Playbook | `seo-geo` (SEO and AI-search visibility) |
| Priority | P1 for a score of 60 or more, P2 for 40 to 59, P3 below 40 |
| Success metric | Search: "More clicks from Google in Search". Site health: "Gone from Site health after the next scan". AI answers: "Mentioned in the next AI visibility runs". |

An opportunity can be on the Roadmap once. If you delete the item, you can add it again.

### Add to Today

**Today** adds a move at the end of today's list, with the opportunity's title and why and the **Yours** badge. Its **Go** opens the card on this page. It's a move you added, so you can delete it, and **Refresh** keeps it. It can be added once a day: while it's on today's list, the button shows **On Today** and is disabled. Tomorrow it's back to **Today**. See [Today](/guides/today#work-through-the-list).

Marking the move done on Today doesn't mark the opportunity done. Do that here too.

### Write it in Content Studio

**Write it in Content Studio** creates a piece with channel **Blog** and format **Article**, with the opportunity's topic and why as its rationale, and starts writing it straight away with guidance from the brief:

- For a query: an article that fully answers the search, answers it in the first paragraph, then goes deeper with practical examples.
- For a comparison question: an honest comparison article that names the competitors AI assistants recommend now, compares fairly, says who each option suits, and where your product fits best.

It's written like any Content Studio piece, with your product's brief and personas, and the same rules (no invented facts or numbers). It's written in the product's newest ready [voice profile](/guides/voice-profiles) (the one updated most recently), or, if the product has none, in Content Studio's default voice. Find it in **Content Studio → Library**, edit it, use **Rewrite** with guidance, and publish it yourself. See [Content Studio](/guides/content-studio).

An opportunity can go to Content Studio once. If you delete the piece, the button comes back.

### Done, dismiss and reopen

**Done** and **Dismiss** only record your decision; Startica doesn't check that anything changed. A done opportunity stays under **Done and dismissed** for as long as the rules still find it. When the data no longer produces it (the query moved up, the next scan doesn't find the problem), it leaves the list.

> [!TIP]
> Mark a fix done when you've shipped it, then check after the next scan, sync or AI visibility run. If it's still under **Done and dismissed**, the data hasn't caught up yet, or the fix didn't work: **Reopen** it.

## Drafts

A draft is a fix written by the AI for one opportunity, for you to review and copy. Startica never changes your site. Each draft is one AI call on the `draft` task, runs in the background as the `opportunity_draft` job ("Drafting a fix" on the System page), and takes a few seconds.

Before it starts, Startica recomputes the list from the latest data, so the draft follows the opportunity as it is now, not as it was when the page loaded. Every draft is then checked in code before it's shown, and anything that didn't pass is listed with it.

Every draft is written with your product's context: name, website, one-liner, brief, personas, competitors and your notes. The instructions tell the AI to follow Google's search guidelines (write for people first, describe the page accurately, no keyword stuffing or hidden text), to make no claim the product description doesn't support (prices, numbers, awards, features), to use plain, specific language in the product's terms, and to respect every length limit.

**Draft again** writes a new draft and replaces the old one. Only the latest draft is kept.

### Titles and descriptions

For **Rewrite the title and description** and the title and description problems in Site health. For each page (up to 5), the AI gets the page's current title, description and main heading, and, when [Search Console](/credentials/search-console) is connected, the 15 Google searches it was found for over the last 28 days, with their impressions and positions, read live from Search Console as the draft starts. Without Search Console, or if that request fails, the AI is told "Google searches: not available" and drafts without them.

It's asked for a title of 30 to 60 characters and a description of 120 to 160 for each page. The checks then flag:

| Check | Message |
| --- | --- |
| Title over 60 characters | "_url_: title is _n_ characters (over 60)" |
| Title under 30 characters | "_url_: title is short (_n_ characters; aim for 30 to 60)" |
| Description over 160 characters | "_url_: description is _n_ characters (over 160)" |
| Description under 120 characters | "_url_: description is short (_n_ characters; aim for 120 to 160)" |
| Two pages in the draft with the same title | "Two pages got the same title" |

These are the lengths the AI is asked for. Site health is more lenient: it only flags titles under 10 characters and doesn't flag short descriptions. The duplicate check only compares the pages in this draft, not the rest of your site. The draft shows each page as a search result would (the address, the title in blue, the description) with counters such as "60/60 · 162/160", then the HTML to copy. For Fieldnote's guide to taking field notes:

```text
https://fieldnote.example/blog/how-to-take-field-notes
<title>How to take field notes: a step-by-step guide with templates</title>
<meta name="description" content="Learn how to take field notes that hold up later: what to record, a simple structure for each entry, and free templates for transects, interviews and site visits.">
```

This one shows "https://fieldnote.example/blog/how-to-take-field-notes: description is 162 characters (over 160)" above it: cut a few words before you use it.

### Structured data

For the structured data problems in Site health. The AI gets the page's title, description, main heading and the structured data types it has now. On the home page it's asked for an `@graph` with `Organization` (name, url, logo if known) and the product as `SoftwareApplication` or `Product`, with `offers` only when your product notes mention pricing; on other pages, the type that fits the page (`Article`, `FAQPage`, `BreadcrumbList` and so on).

The result is checked with Site health's own structured-data checks:

| Check | Message |
| --- | --- |
| Not valid JSON | "It isn't valid JSON" |
| `@context` isn't `https://schema.org` | `@context should be "https://schema.org"` |
| No schema.org type | "No schema.org @type" |
| A type is missing a property Site health requires | "_Type_ is missing _properties_", for example "SoftwareApplication is missing offers" |

The required properties are those in [Structured data](/seo/site-health#structured-data). The draft is formatted and wrapped in a `<script type="application/ld+json">` tag, ready to paste into the page's `<head>`.

A `SoftwareApplication` without `offers` is a common result when the AI has no pricing to go on: it's told not to make up a price, so the check flags it. Add your real price, or use a type that doesn't need one.

### llms.txt

For **No llms.txt** and **llms.txt doesn't follow the expected format**. The AI gets up to 40 of the pages the scan checked (closest to the home page first), with their titles, and is asked for a `# Product` title, a one-paragraph summary as a `> ` quote, a few short notes, and `## ` sections linking to the most useful pages, using only those pages. The checks:

| Check | Message |
| --- | --- |
| Doesn't start with a Markdown `#` title | "It should start with a Markdown # title" |
| No links | "It links to no pages" |
| A link to an address the scan didn't check | "Links to a page the scan didn't find: _url_" |

Save it as `/llms.txt` at the root of your site. For example:

```markdown
# Fieldnote

> Fieldnote is an offline-first field notebook for researchers: notes carry location, time and photos, and sync when you're back in signal.

- Works without a connection; nothing is lost when you lose signal.

## Product

- [Features](https://fieldnote.example/features): what Fieldnote records and how notes sync
- [Pricing](https://fieldnote.example/pricing): plans for individuals and research teams

## Help

- [Getting started](https://fieldnote.example/help/getting-started): set up a notebook and take your first note
```

See [AI crawlers and llms.txt](/seo/ai-crawlers#llms.txt) for what the file is, and why it's a cheap extra rather than a way into AI answers.

### FAQ answers

For **Get into AI answers for "_question_"**. The AI gets the question and is asked for an FAQ entry that answers it honestly and helpfully in 40 to 120 words, says when your product is a good fit and when it isn't, and says which page of your site it belongs on. It may rephrase the question as a heading.

The `FAQPage` JSON-LD is then built by Startica from the question and answer, not written by the AI, so it's always valid. The one check: an answer over 140 words shows "The answer is _n_ words; aim for 120 or fewer".

The draft is the heading, the answer, where it belongs (as an HTML comment), and the JSON-LD. For "Which note app should my lab use to share site observations?":

```markdown
### Which note app should a lab use to share site observations?

Use an app that works offline and keeps location, time and photos with each note, so the whole team sees the same record. Fieldnote is built for this: entries sync when you're back in signal, and a shared notebook lets a lab review site observations together. If your team already works in a general note app and rarely leaves the office, that may be enough; Fieldnote fits best when people collect notes in the field.

<!-- The FAQ section of the pricing page, where research teams compare plans. -->

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Which note app should a lab use to share site observations?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Use an app that works offline and keeps location, time and photos with each note, …"
      }
    }
  ]
}
</script>
```

Put the question and answer on the page as visible text, and the JSON-LD on the same page. Structured data should describe what's on the page, not add content that isn't there.

### Read a draft

Under the card, a draft shows:

- **Passed Startica's checks** in green, or each problem the checks found, in amber;
- for titles and descriptions, a search-result preview of each page with its counters;
- the text, with **Copy** ("Copied", or "Couldn't copy" if the clipboard isn't available);
- "Drafted by _model_. Startica doesn't change your site: review it, then add it where it belongs."

A draft with problems is still shown, so you can fix it by hand or click **Draft again**.

### What "Passed Startica's checks" means

Only that the checks above found nothing: the lengths are in range, the JSON parses and has the properties Site health looks for, the `llms.txt` links only to pages the scan found, the FAQ answer isn't too long. It doesn't mean the draft is true, good or right for your site. The checks can't tell:

- whether what it says about your product is accurate (prices, features, who it's for);
- whether a title matches what's actually on the page, or duplicates a title on a page outside the draft;
- whether the structured data describes what's visible on the page, or would qualify for rich results in Google;
- whether search engines will show your new title (they sometimes rewrite titles), or whether any AI assistant will cite the FAQ.

> [!WARNING]
> Read every draft before you use it. The AI is told not to invent facts, but it can still be wrong. Structured data that doesn't match the page, or claims you can't back up, can go against Google's guidelines.

## Costs

Building the list and every button except two are free. The two that cost money:

| Action | Task and default model | Rough cost |
| --- | --- | --- |
| One fix draft | `draft`, Sonnet or Sol | $0.01 to $0.03 |
| **Write it in Content Studio** | `draft`, Sonnet or Sol | $0.01 to $0.05, like any Content Studio piece |

Both count against your [monthly AI budget](/concepts/costs#the-monthly-budget). Drafting all 20 or so opportunities of a typical list costs well under $1. Neither is retried on its own: if one fails, click the button again. The real cost of each call is in **AI calls** on the **System** page. See [Costs](/concepts/costs).

The **AI audits** below the list are separate, with their own costs; see [AI audits](#ai-audits).

## Privacy

- **To your AI provider, for a draft:** your product's context (name, website, one-liner, brief, personas, competitor names and your notes), and the draft's material: for titles and descriptions, the pages' addresses, current titles, descriptions and main headings and their Google searches; for structured data, one page's address, title, description, main heading and structured data types; for `llms.txt`, the addresses and titles of up to 40 pages; for an FAQ answer, the question.
- **To your AI provider, for Content Studio:** what any Content Studio piece sends; see [Content Studio](/guides/content-studio).
- **To Google, for a title and description draft:** with Search Console connected, one request per page to the Search Console API for the searches that page was found for, with your own service account, the same way the daily sync reads it. Nothing else goes to Google.
- **Nothing else.** Building the list, filters, the Roadmap, Today, done and dismiss all run on your computer, from data already in your local database. Drafts are stored there too, in `seo_opportunities`.

See [Privacy and security](/concepts/privacy-security#what-goes-over-the-network).

## AI audits

Below the list, the **AI audits** card has the two AI-written reviews of your site's search and AI visibility: **SEO** (technical basics and missing pages) and **AI search** (do AI assistants and search recommend you?). They used to be on the Roadmap, which now keeps the landing page and onboarding audits. They work as before: **Run**, **Run again**, a summary and findings, and **Roadmap** on each finding. See [Audits](/guides/audits).

Audits are different from the list above: they're a one-off review by the AI, with its judgment and costs, while opportunities are fixed rules over your own data.

## Troubleshooting

| Message | What it means and what to do |
| --- | --- |
| "Nothing yet. Opportunities come from a site scan (Overview → Scan now), Search Console (Search) and AI visibility runs (AI visibility)." | There's no data to build from. Run a scan, connect Search Console, or run AI visibility. |
| "Nothing open here. Nice." | This tab has nothing open. Check the others, or **Done and dismissed**. |
| No Search opportunities with Search Console connected | Nothing qualifies: no non-brand query in striking distance worth 3 clicks, no low click-through page, no page that lost clicks. Or the first sync hasn't finished. Lost clicks also need 56 days of data. |
| No AI answers opportunities after a run | In the latest run that answered something, every answer that named a competitor also named you, and no comparison page was cited twice. Or the run had no answers. |
| "This opportunity is gone: the data changed since the page loaded. Reload to see the latest." | A scan, sync or run changed the data, and the rules no longer find this one. Reload the page. |
| "The draft didn't finish: This opportunity is gone or has nothing to draft (the data changed since the page loaded)" | The same, found when the draft started. Reload. |
| "The draft didn't finish: Stopped by you" | The `opportunity_draft` job was stopped on the System page. Click the draft button again. |
| "The draft didn't finish: …" with any other error | The AI call failed: no key for the `draft` task's provider, the [monthly budget](/concepts/costs#the-monthly-budget) reached, a refusal, or the output limit. See [What happens when a job fails](/reference/jobs#what-happens-when-a-job-fails). |
| "There's nothing to draft for this one" | The opportunity no longer has a draft kind. Reload. |
| "There's no content brief for this one" | The opportunity no longer has a brief. Reload. |
| "Already on the Roadmap" | It was added already. Find it on the **Roadmap**. |
| "Already on Today" | It's on today's list already. |
| "Already in Content Studio" | A piece was created already. Open **Content Studio → Library**. |
| "Already drafting this one" | A draft for this opportunity is waiting or running. Wait for it; the card updates when it's done. |
| "AI is off in the demo, like every other outside call." | In the [demo](/guides/demo-mode), drafts and Content Studio are off. |
| "Add an AI key in Settings → General → AI first." | There's no Anthropic or OpenAI key. See [Anthropic API key](/credentials/anthropic) or [OpenAI API key](/credentials/openai). |
| **Drafting…** for a long time | Drafts run in the background while Startica is open. Check **System → Running and waiting** for "Drafting a fix". Clicking the button again while one is waiting or running shows "Already drafting this one" and doesn't start a second. |
| A draft's titles ignore your real searches | Search Console isn't connected for the product, or the live request failed. The draft is written without them. |
| A done opportunity is still listed | Done records your decision; the rules still find it. It leaves the list when the next scan, sync or run no longer produces it. |

## In the demo

In [demo mode](/guides/demo-mode), Opportunities is built from the demo's sample data, with the same rules: Fieldnote's striking-distance queries such as "field notes app" and "offline field notebook", a guide page with low click-through, the sample Site health problems (missing descriptions, a long title, pricing structured data missing `offers`, a page nothing links to, no `llms.txt`), questions where the latest run named TerraJot, Quadrat or Logbook Pro but not Fieldnote, and a "best field notebook apps" list the answers cite.

AI is off in the demo, so the draft buttons and **Write it in Content Studio** are disabled. **Roadmap**, **Today**, **Done**, **Dismiss** and **Reopen** work.

## Related

- [SEO & GEO](/seo)
- [Site health](/seo/site-health)
- [Search performance](/seo/search)
- [AI visibility](/seo/ai-visibility)
- [Off-site presence](/seo/off-site)
- [AI crawlers and llms.txt](/seo/ai-crawlers)
- [Roadmap](/guides/roadmap), [Today](/guides/today) and [Content Studio](/guides/content-studio)
- [Audits](/guides/audits)
