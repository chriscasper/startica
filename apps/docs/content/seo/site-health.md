---
title: Site health
description: What the SEO & GEO Overview and Site health screens show, every check Startica runs for search and AI, when each one runs, and how the score works.
layout: doc
---

**Site health** checks the pages of your site for what search engines, AI assistants and AI crawlers need: titles and descriptions, headings, indexing, links, structured data and AI access. This page explains the **Overview** and **Site health** screens, lists every check with its severity, and explains when the checks run and how the score works.

To add a site and run a scan, see [SEO & GEO](/seo). The scan itself is the same one Accessibility uses; see [Scanning a site](/accessibility/scanning).

> [!NOTE]
> Everything on these screens comes from fixed checks over the pages the scan loaded. They find common technical problems. They don't measure rankings or AI mentions, and passing them doesn't guarantee a place in search results or AI answers.

## Overview

| Card | What it shows |
| --- | --- |
| **Site health** | The site's score out of 100, how many pages were checked and when the last scan finished. Green at 90 or above, amber up to 20 points below, red further below. See [The score](#the-score). |
| **Problems to fix** | How many problems there are, with counts by severity: high, medium and low. A problem shared by several pages (one duplicate title, one broken address) counts once. FYI items aren't counted. Click the counts to open **Site health**. |
| **AI search access** | **Open to AI search** when `robots.txt` lets every AI search and user crawler in, **Some AI search is blocked** when it doesn't, or **Not checked yet** before the first scan finishes. Below it, whether the site has an `llms.txt`: found, found but not in the usual format, or none. |
| **Clicks from Google, 28 days** | Clicks from Google search over the latest 28 days of Search Console data, with impressions, average position and the change in clicks against the 28 days before. The change only shows when the stored data covers those earlier 28 days. Click it to open **Search**. Before the first sync finishes it says "Search Console is connected; numbers appear after the first sync.", and without Search Console it shows a dash and **Connect Search Console**. See [Overview card](/seo/search#overview-card). |

Below the cards:

- **Fix these first**: the top 5 problems, high severity first, then the ones on the most pages. Each links to its card on **Site health**. The **Pages** column says how many pages it's on, or "site" for a site-wide problem.
- **AI crawlers**: each AI crawler Startica knows, its operator, what it's for, and whether your `robots.txt` lets it read the site's start page (**Allowed** or **Blocked**). The card says when the crawler list was last checked. See [AI crawlers and llms.txt](/seo/ai-crawlers).
- **Coming next**: the planned parts of SEO & GEO. See [What's coming](/seo).

**Scan now** and **Check a page** at the top start the same scans as on the Accessibility Overview.

## The Site health screen

**Site health** lists every problem, grouped by area, in this order:

1. **AI access**
2. **Indexing**
3. **Links**
4. **Titles, descriptions and headings**
5. **Structured data**

Within each area, high severity comes first, then the problems on the most pages. Each problem is a card with:

- its title, a severity badge (**high**, **medium** or **low**) and how many pages it's on;
- why it matters;
- **How to fix**;
- the pages it's on, each a link that opens the page in your browser, with details where they help: the title and its length, the shared title, the headings found, the canonical address, where a `noindex` came from, which JSON-LD block can't be read, which properties are missing, or which crawlers are blocked.

A broken link shows the address that doesn't work, the HTTP status it answered with, and up to 10 pages that link to it ("and more" if there are others).

Problems shared by several pages are grouped so one fix covers them. For example, a title used on three pages is one card entry, "_title_" on 3 pages, and two different shared titles are two entries.

### Good to know

Some findings are facts worth knowing, not problems. They're listed last, under **Good to know**, with an **FYI** badge, and they never count against the score:

- a page asks not to be indexed, and isn't in the sitemap;
- a page's canonical points to another page;
- AI training crawlers are blocked.

Each is fine if it's what you intended. The card says what to change if it isn't.

## When the checks run

Every page a scan checks is checked for search and AI at the same time as for accessibility, in the same browser load. The checks come in two kinds:

| Kind | Checks | When they run |
| --- | --- | --- |
| Page checks | Title, description, headings, `noindex`, canonical elsewhere, structured data on the page | As each page is checked. **Check a page** and the recheck buttons re-run them for those pages. |
| Site checks | Duplicate titles and descriptions, broken internal links, broken canonicals, orphan pages, missing sitemap, the home page's structured data and social image, AI crawlers, `llms.txt` | When any scan finishes: a full scan, a page check or an issue recheck. They use the latest results of every page. |

The sitemap is read fresh on every full scan. Which pages it lists matters for two checks: a `noindex` page in the sitemap, and orphan pages. If you change your sitemap, run **Scan now** to pick it up; a page check uses the sitemap from the last full scan.

`robots.txt` and `llms.txt` are fetched from the site when a scan finishes, so the **AI crawlers** table and the `llms.txt` status are as of the last scan.

## Every check

Severities: **high** problems are likely to keep pages out of search or AI answers; **medium** ones hurt how pages are shown or understood; **low** ones are smaller improvements; **FYI** items don't count.

### AI access

| Check | Severity | Reported when | How to fix |
| --- | --- | --- | --- |
| AI search or answer crawlers are blocked | high | `robots.txt` stops an AI search crawler, or a crawler that fetches pages people ask about, from reading the start page. | Allow the search and user crawlers listed. You can keep the training crawlers blocked. |
| AI training crawlers are blocked | FYI | `robots.txt` stops an AI training crawler from reading the start page. | Nothing, if that's your choice. |
| No llms.txt | low | `/llms.txt` doesn't answer with HTTP 200, or answers with a web page (HTML) instead of a text file: that's usually the site's catch-all page for addresses that don't exist. | Publish `/llms.txt`: a `#` title, a one-paragraph summary, then links to your most important pages. |
| llms.txt doesn't follow the expected format | low | `/llms.txt` exists but doesn't start with a Markdown `#` title. | Start the file with `# Your product name` and a one-paragraph summary. |

See [AI crawlers and llms.txt](/seo/ai-crawlers) for how `robots.txt` is read, and examples of both files.

### Indexing

| Check | Severity | Reported when | How to fix |
| --- | --- | --- | --- |
| Missing pages answer as if they exist (soft 404) | medium | An address that can't exist on the site (Startica asks for one made-up address after each scan) answers HTTP 200 instead of 404. | Make unknown addresses answer HTTP 404; with a catch-all route, call the framework's not-found page when nothing matches. |
| Page is in the sitemap but asks not to be indexed | high | The page's robots meta tag or `X-Robots-Tag` header says `noindex` (or `none`), and the sitemap lists it. | Remove the `noindex` if the page should be found, or take it out of the sitemap. |
| Canonical points to a page that doesn't work | medium | The page's canonical points to another page on the site that the scan couldn't load. | Point the canonical to a working page, usually the page itself. |
| Page is only in the sitemap: nothing links to it | low | The sitemap lists the page, but no checked page links to it. The start page is never reported. | Link to it from a related page or the navigation, or remove it from the sitemap if it's obsolete. |
| No sitemap found | low | The last full scan found no page listed in a sitemap. | Publish `/sitemap.xml` and list it in `robots.txt` with a `Sitemap:` line. |
| robots.txt is a web page, not a text file | low | `/robots.txt` answers HTTP 200 with an HTML page, so crawlers find no rules and no `Sitemap:` line. Its rules are then treated as allowing everything. | Serve a plain-text `/robots.txt` with a `Sitemap:` line. |
| Page asks not to be indexed | FYI | The page says `noindex` and isn't in the sitemap. | Nothing, if that's intended. Otherwise remove the `noindex`. |
| Canonical points to another page | FYI | The page's canonical address isn't the page's own address. Fragments (`#…`) and query strings are ignored when comparing. | Nothing, if the page is a copy or variant. Otherwise point the canonical to the page itself. |

### Links

| Check | Severity | Reported when | How to fix |
| --- | --- | --- | --- |
| Broken internal link | high | A checked page links to a page on the same site that answers with HTTP 400 or higher. | Fix or remove the links, or redirect the old address to the right page. |

Only links within the site are checked. Links to other sites aren't followed.

### Titles, descriptions and headings

| Check | Severity | Reported when | How to fix |
| --- | --- | --- | --- |
| Missing page title | high | The page has no `<title>`, or it's empty. | Add a title that says what the page is, in about 50 to 60 characters. |
| Several pages share the same title | medium | Two or more checked pages have the same title, ignoring upper and lower case and spaces at the ends. | Give each page its own title. |
| Missing meta description | medium | The page has no `<meta name="description">`, or it's empty. | Add one of about 120 to 160 characters that says what the page offers. |
| No main heading (h1) | medium | The page has no `<h1>`. | Add one `<h1>` that names the page's topic. |
| Title is too long | low | The title is longer than 60 characters. | Shorten it to about 60 characters, with the important words first. |
| Title is very short | low | The title is shorter than 10 characters. | Say what the page offers and for whom, in 30 to 60 characters. |
| Meta description is too long | low | The description is longer than 160 characters. | Shorten it to about 160 characters. |
| Several pages share the same meta description | low | Two or more checked pages have the same description. | Write a description for each page. |
| More than one main heading (h1) | low | The page has two or more `<h1>` elements. | Keep one `<h1>` and make the others `<h2>`. |
| Home page has no social preview image | low | The start page has no `og:image` meta tag. | Add `og:title` and `og:image` meta tags to the home page, and ideally every page. |

Lengths count characters, after trimming spaces at the ends.

### Structured data

| Check | Severity | Reported when | How to fix |
| --- | --- | --- | --- |
| Structured data (JSON-LD) can't be read | medium | A `<script type="application/ld+json">` block on the page isn't valid JSON. The page's entry says which block (counting from 1). | Fix the JSON (a missing comma or quote is typical) and check it with a schema validator. |
| Structured data is missing required properties | low | A block of one of the types below is missing a property it needs. Reported once per type, with the pages it's on. | Add the missing properties listed on the page. |
| Home page has no structured data about the product | low | The start page has no `Organization`, `WebSite`, `Product`, `SoftwareApplication` or `LocalBusiness` data. | Add a JSON-LD block to the home page: `Organization` (name, url, logo) and `Product` or `SoftwareApplication` (name, description, offers). |

The properties Startica checks for each type are a practical subset of what search engines ask for, not every property they can use:

| Type | Needs |
| --- | --- |
| `Organization` | `name` and `url` |
| `WebSite` | `name` and `url` |
| `Product` | `name`, and one of `offers`, `review` or `aggregateRating` |
| `SoftwareApplication` | `name` and `offers` |
| `FAQPage` | `mainEntity` |
| `Article`, `BlogPosting` | `headline` |
| `BreadcrumbList` | `itemListElement` |

Blocks inside an `@graph` are checked too. Other types are recognized but not checked for properties.

## The score

The score is Startica's own measure of progress. It isn't a ranking, a prediction of traffic, or a score any search engine uses.

For each page, the score starts at 100 and loses points for each problem on the page:

| Severity | Points |
| --- | --- |
| high | 15 |
| medium | 7 |
| low | 2 |
| FYI | 0 |

A page doesn't go below 0. For example, a page with a missing description (7) and two h1s (2) scores 91.

The site's score is the average of its checked pages' scores, less the site-wide problems: those that belong to the site rather than a page (blocked AI search crawlers, no sitemap, no or malformed `llms.txt`), and broken internal links. Each costs 10 points if high, about 4.7 if medium and about 1.3 if low, and together they take off at most 30 points. The score is kept to one decimal place, shown as a whole number, and doesn't go below 0.

Some notes:

- Only checked pages count. Skipped and failed pages have no score.
- A broken link is recorded on the address that doesn't work. That address failed, so it has no page score of its own; each broken link counts against the site's score instead (10 points, within the 30-point limit).
- The home page's structured data and social image checks count against the home page's score.
- The Overview colors the score against 90. Unlike Accessibility, SEO & GEO has no target score setting.

## Fix and recheck

1. Start with **Fix these first** on the Overview.
2. Open the problem on **Site health** and read why it matters and how to fix it.
3. Fix it on the site and deploy the change.
4. Click **Check a page** on the Overview for a page you fixed. Its page checks run again, and the site checks are recomputed when it finishes.
5. For changes to your sitemap, or to fix problems across many pages, run **Scan now**.

**Recheck page** and **Recheck N pages** under **Accessibility** run the same checks, so a recheck there updates Site health too.

Every problem (not FYI items) is also on **SEO & GEO → Opportunities**, ranked against what Search and AI visibility found. For title and description, structured data and `llms.txt` problems, the AI can draft the fix there for you to copy. See [Opportunities](/seo/opportunities#site-health-opportunities).

## Limits

The checks look at what a page tells crawlers in its HTML and headers. They can't tell:

- whether a title or description is good, only whether it exists and how long it is;
- whether the content answers what people search for;
- how search engines or AI assistants rank or cite the site;
- whether a crawler actually follows `robots.txt` or reads `llms.txt`.

Not checked yet: redirect chains, how many clicks a page is from the home page, broken links to other sites, and language alternates (`hreflang`).

## Related

- [SEO & GEO](/seo)
- [AI crawlers and llms.txt](/seo/ai-crawlers)
- [Opportunities](/seo/opportunities): Site health problems ranked with the rest, and fix drafts
- [Scanning a site](/accessibility/scanning)
- [Try the demo](/guides/demo-mode): sample results for `fieldnote.example`
