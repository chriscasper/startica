---
title: Audits
description: Have the AI review your landing page, onboarding, SEO and visibility in AI search, then turn findings into roadmap items.
layout: doc
---

Audits are one-off reviews of your website. The AI reads your site (or, for AI search, the web), lists problems and opportunities by severity, and suggests a fix for each. You can add any finding to your roadmap with one click.

Audits are in two places:

| Audits | Where |
| --- | --- |
| **Landing page** and **Onboarding** | The **Roadmap** page, in the **Audits** card below the board |
| **SEO** and **AI search** | **SEO & GEO → Opportunities**, in the **AI audits** card below the list |

The SEO and AI search audits used to be on the Roadmap too. They moved to [Opportunities](/seo/opportunities#ai-audits), next to the ranked fixes from Site health, Search and AI visibility. They work the same in both places, and the Roadmap's re-plan still reads all four.

## Before you start

Audits need your product's website. Set it in **Settings → Products** with the pencil next to the product (the **Website** field). Without it, an audit fails with "Add the product's website in Settings first".

Audits also use your product intel (brief, personas, notes) for context, so [build intel](/getting-started/first-run) first for better results.

## The four audits

| Audit | Label in the app | What it checks |
| --- | --- | --- |
| Landing page | **Landing page** | Promise, proof and call to action |
| Onboarding | **Onboarding** | The path from first visit to first meaningful action |
| SEO | **SEO** | Technical basics and missing pages |
| GEO | **AI search** | Whether AI assistants and search recommend you |

### Landing page

The AI reviews your homepage and key pages as a landing page for your audience. It checks:

- whether the promise is clear in five seconds, in the audience's words;
- whether there is one obvious call to action;
- proof: examples, numbers, testimonials;
- whether objections are answered (price, privacy, "is anyone using this?");
- clutter and competing links;
- mobile issues visible in the page text.

### Onboarding

The AI reviews the path from first visit to the first meaningful action. It can't sign up, so it judges from your pages, FAQ, help and docs: signup friction, what a new user sees first, whether the first action is suggested, invite-only or waitlist confusion, and what would make someone come back.

### SEO

Before the AI looks, Startica measures some facts directly from your homepage:

| Fact | What's recorded |
| --- | --- |
| Homepage status | The HTTP status code |
| Title | The text and its length |
| Meta description | The text and its length |
| H1 | How many, and the first three |
| Canonical | The canonical link, or missing |
| Open Graph | Whether title, description and image are set |
| robots.txt | Present or not, with up to five Disallow or Sitemap lines |
| sitemap.xml | Present or not, and how many URLs it lists |

The AI combines these with your page text to look for indexing problems, weak titles and descriptions, thin pages, missing pages that answer your audience's searches (comparisons, how-tos, "best X for Y"), and internal linking.

Only `/sitemap.xml` at your site's root is checked. A sitemap at another path is reported as missing.

### AI search (GEO)

GEO (generative engine optimization) is about showing up in AI assistants' answers. This audit doesn't crawl your site. Instead, the AI searches the web the way your audience would, with several phrasings of their questions and of "best X for Y". It notes which products come up, whether yours appears and how it's described, and which sources (lists, forums, reviews) drive those answers. It then reviews those notes and suggests what content or mentions would get your product included.

For Fieldnote, that means searches like "best note-taking app for field research" or "offline notes app for ecologists".

## How an audit runs

Click **Run** next to an audit (or **Run again** if it has run before), on the Roadmap or on Opportunities. The button shows **Running…** while it works. Each audit takes a minute or two.

| Step | Landing page, Onboarding, SEO | AI search |
| --- | --- | --- |
| 1. Gather | Crawl up to 8 pages: your homepage, then the most relevant links from it. Respects `robots.txt`. | Web research with up to 8 searches and 4 page fetches, citing URLs. |
| 2. Measure | SEO only: the facts listed above. | — |
| 3. Review | The AI writes a summary and 5–12 findings. | Same. |

Crawled text is capped at about 50,000 characters. Pages that time out or return errors are skipped. If nothing can be crawled, the AI is told so and says what it couldn't check.

The review uses the `strategy` model task (Claude Opus or GPT-6.1 Sol by default). The AI search research uses the `research` task (the same models by default) with the provider's web search. See [AI models](/concepts/ai).

Audits run once per click. They aren't retried automatically; if one fails, the error shows on the card and you can run it again.

## Findings

When an audit finishes, its section shows the date, a two- or three-sentence summary with the single most important fix, and a collapsible list of findings, high severity first.

| Severity | Meaning |
| --- | --- |
| high | Likely costing you signups now |
| medium | A clear improvement |
| low | Polish |

Each finding has a title, a detail (what the AI saw, often quoting the page) and a **Fix**.

Only the latest run of each audit is shown. The roadmap re-plan reads the high-severity findings from your latest audits.

> [!WARNING]
> The AI is told never to invent facts about your product and to say when it couldn't check something. It can still be wrong. Check each finding against your site before acting on it.

## Add a finding to the roadmap

Click **Roadmap** on a finding. Startica adds it as your own roadmap item, so re-plans won't change or drop it:

| Roadmap field | Comes from |
| --- | --- |
| Title | The finding's title |
| Why | The finding's detail |
| Next step | The finding's fix |
| Stage | Activation for Onboarding; Acquisition for the others |
| Priority | P1 for high, P3 for medium, P4 for low |

The success metric is left empty. Edit the item to add one. See [Roadmap](/guides/roadmap).

## Costs

The app describes each audit as costing well under $1. The AI search audit costs a little more than the others because of the web searches. Actual cost depends on your site and the model you chose; check **System** for real spend. See [Costs](/concepts/costs).
