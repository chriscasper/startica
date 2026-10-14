---
title: Try the demo
description: Look around Startica with Fieldnote, a sample product, in a separate data folder, without an API key and without touching your own data.
layout: doc
---

Demo mode opens Startica with **Fieldnote**, a fictional sample product, already set up: intel, an Inbox with drafted and posted replies, voice profiles, Content Studio pieces, two ad campaigns, a roadmap, audits, 30 days of metrics, 90 days of search data, four AI visibility runs with sample reads of the pages they cite, two agent readiness checks, and sample accessibility and site health results for its site, `fieldnote.example`. It's the quickest way to see what every page does before you connect an AI provider or add your own product.

The demo lives in its own data folder, so nothing in it mixes with your own data, and nothing in it reaches out: no scans, no AI and no posting.

## Open the demo

In the desktop app (installed, or `yarn dev:desktop`):

1. On the **Welcome to Startica** page, click **Look around with a sample product first** at the bottom.
2. Startica says "Opening the demo: Startica restarts with a sample product." and restarts.

It opens on the **Dashboard** for Fieldnote. Every module has sample results, including the site `fieldnote.example`, so you can look through Accessibility, SEO & GEO, Security and Ads too. **Today** has no Getting started checklist, since the sample is already set up. The first time, Startica fills the demo folder with the sample product as it starts. After that, the demo opens with whatever you changed in it last time.

The link is only on the welcome page. Once you've finished or skipped setup, open it again with **Settings** → **General** → **App** → **Run setup again**.

## What's different in the demo

A banner across the top of every page says "Demo: you're looking at Fieldnote, a sample product. Scans, AI and posting are off, and your own data is untouched."

| | In the demo |
|---|---|
| Background jobs | None run: no scheduled scans, engagement checks, metric or search syncs, or re-plans. Buttons that start work (like **Scan now**, **Rebuild intel** or **Regenerate**) queue a job that just waits. |
| AI | Off, because only background jobs call the AI. Nothing is charged, and the demo works without an API key. |
| Posting | **Post…** is hidden, so sample text never reaches a real site. |
| Accessibility | Shows sample results for `fieldnote.example`: a score, open and fixed issues, pages and past scans. Scans are off, so **Scan now**, **Check a page** and the recheck buttons are disabled, and the Overview says "Scans are off in the demo, like every other outside call. The results below are sample data." See [Accessibility](/accessibility). |
| SEO & GEO | Shows sample site health results for `fieldnote.example`, from the same sample scan: a help page nothing links to, pages with no meta description, a blog post whose title is too long, pricing structured data missing a required property (`offers`), no `llms.txt`, and an **AI crawlers** table where `GPTBot` is blocked for training and AI search is open. Scans are off, so **Scan now** and **Check a page** are disabled. **Search** shows 90 days of sample Search Console data for `sc-domain:fieldnote.example` (growing clicks, queries in striking distance and with low click-through, hidden queries, countries, devices and a sitemap), and sample visits from Google and Bing organic search and from ChatGPT, Perplexity and Claude, which also show in the **Search and AI assistants** card on **Analytics**. There's no Bing data. **AI visibility** shows 12 sample questions and four runs a week apart in which Fieldnote is mentioned in more answers each week (3 of 12, then 6 of 12 in the latest), with share of voice against TerraJot, Quadrat and Logbook Pro; **Run now** and **Suggest questions** are disabled. **Opportunities** is built from all that sample data with the usual rules: striking-distance queries, a page with low click-through, the site health problems, questions where the latest run named competitors but not Fieldnote, and a comparison page the answers cite. AI is off, so the draft buttons and **Write it in Content Studio** are disabled; **Roadmap**, **Today**, **Done** and **Dismiss** work. **Agents** shows two agent readiness checks a week apart: 73, then 79 once the pricing page states its prices in the HTML; **Check now** is disabled. **Off-site** shows the three sites the sample answers cite (`fieldnote.example`, a review list on `reviews.example` that names TerraJot and Quadrat but not Fieldnote, and threads on `reddit.example`), with sample page reads; the demo's `.example` names aren't recognized as Reddit, so the threads show as articles and there's no **Watch** button, and **Read the pages again** is disabled. See [SEO & GEO](/seo), [Search performance](/seo/search#in-the-demo), [AI visibility](/seo/ai-visibility#in-the-demo), [Opportunities](/seo/opportunities#in-the-demo), [Agent readiness](/seo/agents#in-the-demo) and [Off-site presence](/seo/off-site#in-the-demo). |
| Ads | Two sample campaigns: a Google Ads search campaign in **Draft**, ready to hand off, and a Reddit campaign marked **Running**. You can edit them and download their files. The Reddit campaign also has two weeks of sample spend and visits, so its **Results** tab suggests scaling one ad and stopping the other (and the stop shows on **Today**), and two creatives on its **Creatives** tab: one rendered from a stand-in picture, one idea not drawn yet. **New campaign** is disabled without an AI key, and **Plan again**, **Rewrite**, **Suggest ideas** and drawing a picture queue a job that just waits. See [Ads](/ads#in-the-demo). |
| Settings | The demo has its own settings and secrets. A key, budget or connection you save there stays in the demo. |
| Browsing and editing | Everything else works: open every page, edit drafts, intel and the roadmap, mark moves done. |

## Leave the demo

Click **Leave demo** in the banner. Startica says "Leaving the demo: Startica restarts with your own data." and restarts with your data folder, where you left off. A fresh install opens the welcome wizard again.

The demo data stays in its folder for next time. To start the demo over, quit Startica and delete the `demo` folder inside your data folder; the next demo start fills it again.

## Where the demo is kept

| What | Where |
|---|---|
| The demo's data | A `demo` folder inside your data folder, for example `~/Library/Application Support/Startica/demo` on macOS. It has its own `startica.db`. |
| Which mode Startica starts in | `startica-mode.json` in your data folder: `{"demo":true}` in the demo, `{"demo":false}` after you leave it. |

Startica reads the mode file each time it starts, so if you quit while in the demo, it opens in the demo again next time. See [Data folder](/reference/data-folder#demo-mode).

## In a browser run

The browser run (`yarn dev:desktop-web`) can't restart itself, so its welcome page has no demo link. Load the sample product into a separate data folder with `yarn seed:demo` instead, and open that folder:

```bash
STARTICA_DATA_DIR="$HOME/startica-demo" yarn seed:demo
STARTICA_DATA_DIR="$HOME/startica-demo" yarn dev:desktop-web
```

`STARTICA_DATA_DIR` is required and must be an absolute path, so the sample never lands in your real data folder. This isn't demo mode: there's no banner, Today can show the Getting started checklist, and jobs run as usual (add `STARTICA_DISABLE_JOBS=1` to stop them). See [Data folder](/reference/data-folder#demo-data).

## Related

- [First run](/getting-started/first-run)
- [FAQ: Can I try it without an API key?](/troubleshooting/faq)
- [Troubleshooting: Stuck in the demo](/troubleshooting#stuck-in-the-demo)
