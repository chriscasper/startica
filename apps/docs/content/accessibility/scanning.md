---
title: Scanning a site
description: How an accessibility scan finds a site's pages, checks them, and what happens to pages it can't check.
layout: doc
---

This page explains what happens when you scan a site in **Accessibility**: the three kinds of scan, how pages are found, how each page is checked, and why some pages end up skipped or failed. To add a site first, see [Accessibility](/accessibility#add-a-site).

The same scan also runs the [SEO & GEO](/seo) checks, so a site is crawled once for both modules.

## Three ways to scan

| Button | Where | What it checks |
| --- | --- | --- |
| **Scan now** | **Overview** (Accessibility or SEO & GEO) | The whole site: a full scan. |
| **Check a page** | **Overview** (Accessibility or SEO & GEO) | One page, right now. Enter a full address or a path like `/pricing`. |
| **Recheck page** / **Recheck N pages** | A page report / an issue page | Just those pages, after you fix something. |

A full scan is a **Full scan** in the **Scans** list. **Check a page** is a **Page check**, and a recheck from an issue page is an **Issue recheck**.

**Check a page** and the recheck buttons have their own queue, so they never wait behind a full scan. Use them right after a fix.

Scans make no AI calls and cost nothing.

## How pages are found

A full scan:

1. Starts at the site's **Start address**.
2. Reads the site's sitemap: the `Sitemap:` lines in `robots.txt`, or else `/sitemap.xml`. Sitemap indexes are followed, up to 10 sitemaps. The sitemap is read fresh on every full scan, and Startica remembers which pages it lists (SEO & GEO uses that for orphan pages and `noindex` pages in the sitemap).
3. Follows the links on each page it checks, as far as 6 links deep.
4. Stops at the site's **Most pages per scan** (250 by default).

Only pages on the same site are followed. A leading `www.` is ignored, so `www.fieldnote.example` and `fieldnote.example` count as one site.

Addresses are tidied before they're compared, so one page isn't checked twice:

- The part after `#` is dropped.
- The query string (everything after `?`) is dropped, so `/pricing?plan=pro` and `/pricing?utm_source=newsletter` are the same page as `/pricing`.

Files that aren't web pages, such as PDFs, images and archives, aren't opened.

## How a page is checked

Each page is opened in a real Chromium browser, the same engine as Chrome. Once it has loaded, Startica runs axe-core 4.14 against WCAG 2.0, 2.1 and 2.2 levels A and AA, plus AAA and best practices if you turned them on in **Site settings**.

In the same load, the in-page script also collects what search engines and AI systems read: the title, meta description, canonical, robots meta tag, headings, Open Graph tags and JSON-LD blocks, plus the response's `X-Robots-Tag` header. Startica checks these for [SEO & GEO](/seo/site-health) as each page is stored. The page is loaded once for both modules.

Startica only loads pages. It never clicks, types or submits anything on the site.

### Speed

- Two pages at a time.
- At most one page load a second per site, to go easy on the site.
- Roughly 2 to 5 seconds a page. A 250-page site takes about 10 to 20 minutes.

### Skipped and failed pages

| What happened | Shown as | Why |
| --- | --- | --- |
| `robots.txt` disallows the page | **skipped** | **Follow the site's robots.txt** is ticked. |
| The page redirects to another site | **skipped** | Only pages on the site are checked. |
| The page answers with an HTTP error (400 or higher) | **failed** ("couldn't be checked") | A missing page, a server error, or a page that needs signing in. |
| The page takes more than 30 seconds to load | **failed** ("couldn't be checked") | A slow or stuck page. |

`robots.txt` applies to full scans. **Check a page** and the recheck buttons check the pages you ask for.

Skipped and failed pages are listed under **Pages** with their reason. The **Pages checked** card on the Overview says how many couldn't be checked.

## While a scan runs

- The [status indicator](/reference/jobs#the-status-indicator) at the top right of every page shows the scan; hover over it for the progress, for example "Running 3 min · 12 of 40 pages". Click the scan's name there to open the site's Overview.
- **Scan now** shows the same progress and can't be pressed again until the scan finishes.
- Results appear as each page is checked.

To stop a scan, click **Stop scan** next to the scan button, or the **×** in the status indicator. The scan stops after the pages it's checking at that moment (a few seconds). Pages already checked keep their results, and the scan shows as **cancelled** in the **Scans** list. **Stop check** does the same for **Check a page** and rechecks.

If you quit Startica in the middle of a scan, the scan continues where it stopped the next time Startica is open. Scans only run while the app is open; see [Running in the background](/guides/background).

A scan in which no page could be checked ends as **failed**, with the reason in the **Scans** list. See [Troubleshooting](/troubleshooting#no-page-could-be-checked).

## Scheduled scans

Once a site has been scanned, Startica scans it again on its own when the last full scan is older than **Scan again automatically** in [Site settings](/accessibility#site-settings): every week by default. It checks every hour at 37 minutes past, so if Startica was closed, the scan starts within the hour after you open it. A scan that's already running or waiting isn't started twice. Scheduled scans show as **scheduled** in the **Scans** list and work like **Scan now**: every module's checks run, and an issue tracker opens or closes issues if it's set to.

## After a scan

- Pages a full scan no longer finds are dropped from the results.
- Pages with issues have a new screenshot for the page report; pages without issues have none. See [A page report](/accessibility/results#a-page-report).
- Issues no longer found on any page are marked **fixed**. See [Reading the results](/accessibility/results#open-and-fixed).
- The SEO & GEO site checks run (duplicate titles and descriptions, broken links, orphan pages, AI crawlers and `llms.txt`), using the latest results of every page. They run after **Check a page** and rechecks too. Startica fetches the site's `robots.txt` and `llms.txt` for them. See [When the checks run](/seo/site-health#when-the-checks-run).

## Scanning a local site

You can scan a development copy of your site running on your own computer, for example `http://localhost:4000/`. Startica normally blocks addresses on your own computer and private network, but allows them when the site's start address is itself local. Untick **Follow the site's robots.txt** if your development server's `robots.txt` blocks everything.

## Related

- [Reading the results](/accessibility/results)
- [Site health](/seo/site-health): the search and AI checks run by the same scan
- [Privacy and security: accessibility scans](/concepts/privacy-security#accessibility-scans)
- [Background jobs](/reference/jobs): the `site_scan` and `site_page_check` jobs
