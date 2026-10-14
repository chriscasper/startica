---
title: Content and documents
description: Broken links, spelling, readability and your own content rules from every scanned page, and the PDFs your site links to checked for what screen readers need.
layout: doc
---

Every scan also reads each page's main text. **Accessibility → Content** shows what it found, and **Accessibility → Documents** shows the PDFs your pages link to. None of this uses AI or costs anything.

## Content

**Accessibility → Content** has four tabs.

### Broken links

Links on your pages that lead nowhere:

- **Links to your own pages** come from each scan (the same list as **Broken internal link** in [SEO & GEO](/seo)).
- **Links to other sites** are checked after each full scan: a `HEAD` request, then a `GET` if the site doesn't answer `HEAD`. At most 500 links, one request a second to each site, and each result is kept for a week, so a later scan doesn't ask again. Links to `.example`, `.test` and `.invalid` addresses are never requested.

A site that answers 401, 403 or 429 refused the check rather than broke the link, so it's listed separately as **couldn't be checked**. Press **Check documents and links now** to check again without a full scan.

### Spelling

Possible misspellings on pages in US English, or with no language set, checked against a Hunspell US English dictionary. To keep false alarms down, it only checks lowercase words of three or more letters, and skips:

- capitalized words (names, products, the start of a sentence) and acronyms;
- words with digits, file names and code such as `robots.txt`;
- the product's name and its [keywords](/seo).

Each word shows its suggestions and the pages it's on. **Not a mistake** adds it to the site's own word list, so it's never flagged again.

### Readability

The US school grade needed to read each page's main text easily (Flesch–Kincaid), and its reading ease out of 100, for English pages with at least 100 words. Pages above the site's target (grade 9 by default; **Target: grade 9** changes it, from 4 to 16) are highlighted. Like every readability score, it counts sentence and word length, not meaning: use it to find pages worth a second look.

### Your rules

Things every page should or shouldn't have, checked on every page from the next scan. Up to 20 a site:

| Rule | Example |
| --- | --- |
| Text that shouldn't appear | `lorem ipsum`, `coming soon`, an old product name |
| Text every page should have | a copyright line |
| Element that shouldn't appear (CSS selector) | `.old-banner` |
| Element every page should have (CSS selector) | `footer`, `main` |
| Links to a domain | `old-cdn.example` (and its subdomains) |

Text matches ignore case. To use a regular expression, write it between slashes: `/v\d+\.\d+/`.

## Documents

**Accessibility → Documents** lists the PDFs on your own site that your pages link to (up to 200, each up to 30 MB), checked after each full scan. Each one is downloaded and read with [pdf.js](https://mozilla.github.io/pdf.js/), on your computer:

| Check | Why it matters |
| --- | --- |
| Tagged | Without tags, screen readers can't tell headings, lists, tables and reading order apart. |
| Real text | Scanned pages are pictures of text that nothing can read. |
| A title, shown instead of the file name | Screen readers and tabs announce the title. |
| A language | Screen readers pick their voice and pronunciation from it. |
| Alternative text on figures | Images in a tagged PDF need it, as on a web page. |
| Headings, and bookmarks on long documents | People move through a document by them. |
| Labels on form fields | Fillable forms need named fields. |

These are the basics, not a full PDF/UA check. Also open each document with a screen reader.

## Related

- [Scanning a site](/accessibility/scanning)
- [Reading the results](/accessibility/results)
- [Background jobs](/reference/jobs)
