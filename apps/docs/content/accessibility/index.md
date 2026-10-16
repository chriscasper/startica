---
title: Accessibility
description: Check your product's websites with automated accessibility checks, see what to fix first, and track progress from scan to scan.
layout: doc
---

The **Accessibility** module checks your product's websites for accessibility issues. It crawls a site, opens each page in a real browser, runs automated checks against WCAG, and lists the issues it finds, most important first. When you fix something, you recheck just the pages it affected and see it marked fixed.

Scans run on your computer and use no AI, so they cost nothing. The same scan also checks each page for search and AI basics, shown under [SEO & GEO](/seo).

![The Accessibility overview for the demo site fieldnote.example: score 68 out of 100, 5 open issues, 7 pages checked, and a Fix these first table ranking issues by priority, impact, WCAG criterion, pages and visits](/images/app/accessibility.png)

This page covers what the module does, how to find it, and how to add a site. [Scanning a site](/accessibility/scanning) explains how a scan works. [Reading the results](/accessibility/results) explains the screens, the score and what to do with them. [Issues in GitHub or GitLab](/accessibility/issue-trackers) explains sending issues to your repository.

> [!WARNING]
> Automated checks find only part of what WCAG asks for. A scan with no issues doesn't mean a site meets WCAG. Many criteria, like keyboard use, meaningful alternative text and clear language, need a person to review them. See [Limits of automated checks](/accessibility/results#limits-of-automated-checks).

## What it does

- **Finds pages.** It starts at the site's start address, reads its sitemap, and follows links between pages on the same site.
- **Checks each page.** It loads the page in Chromium and runs [axe-core](https://github.com/dequelabs/axe-core), an open-source accessibility engine, against WCAG 2.0, 2.1 and 2.2 levels A and AA.
- **Groups issues.** The same failure on the same element across many pages (for example a logo in a shared header with no alt text) shows as one issue, so you fix it once.
- **Ranks what to fix.** **Fix these first** lists the open issues with the most impact across the most pages.
- **Checks content and documents.** Broken links, spelling, readability, your own content rules, and the PDFs your pages link to. See [Content and documents](/accessibility/content-and-documents).
- **Tracks progress.** Each scan records how many issues are new and how many were fixed, and gives the site a score out of 100.
- **Sends issues to your tracker.** Optionally, it opens a GitHub or GitLab issue for each problem, by hand or after each scan, and closes it when the problem is fixed. See [Issues in GitHub or GitLab](/accessibility/issue-trackers).

## Find it in the sidebar

The left sidebar starts with **Dashboard**, then has a section for each module. Click a section's header to collapse or expand it.

| Section | Pages |
| --- | --- |
| **Dashboard** | A single page above the modules that sums up all of them. See [Dashboard](/guides/dashboard). |
| **Marketing** | Today, Inbox, Content Studio, Ads, Roadmap, Intel, Analytics |
| **Accessibility** | Overview, Issues, Pages, Needs review, Images, Content, Documents, By criterion, Checklist, Reports |
| **SEO & GEO** | Overview, Site health, Search, AI visibility, Opportunities, Agents, Off-site |
| **Security** | Overview, Findings, Monitoring, Report, Disclosure |

Startica remembers which sections you collapsed, per device. When the sidebar is shrunk to icons only, every section's icons show.

Like the rest of Startica, Accessibility works on the product picked in the product switcher.

## Add a site

A site belongs to a product. A product can have several sites, for example its marketing site, its docs and its web app.

1. Open **Accessibility** → **Overview**. With no site yet, it shows a card, "Check _product_'s website".
2. Click **Add the site**. The form is filled in with the product's name and website.
3. Check the fields, tick **I own this site or am allowed to test it**, and click **Add site**.

| Field | What it means |
| --- | --- |
| **Name** | How the site is shown in Startica. |
| **Start address** | Where a scan starts, for example `https://fieldnote.example/`. Only pages on this site are checked. |
| **Most pages per scan** | The page cap for a full scan. Default 250, at most 5,000. |
| **Follow the site's robots.txt (turn off only for your own site)** | Ticked by default. Pages that `robots.txt` disallows are skipped. |
| **I own this site or am allowed to test it** | Required. Only scan sites you own or have permission to test. |

Sites are shared with [SEO & GEO](/seo): a site added here is checked there too, and you can add one from either module. To add another site to the same product (a docs site, a web app, a staging copy), click **Add a site** on the Overview. You can also add sites, and see each one's score and target, in **Settings → Products → Sites**. When a product has more than one site, a switcher at the top of each Accessibility screen picks which one you're looking at.

## Site settings

Click **Site settings** on the Overview, or on the site's row in **Settings → Products → Sites**, to change a site. Changes apply from the next scan.

| Setting | What it does |
| --- | --- |
| **Name**, **Start address**, **Most pages per scan** | As when you added the site. |
| **Target score (1–100; the Overview colors the score against it)** | The score you aim for. Default 90. See [The score](/accessibility/results#the-score). |
| **Scan again automatically** | Every day, week (the default), two weeks or month, or never. See [Scheduled scans](/accessibility/scanning#scheduled-scans). |
| **Only pages matching** | Patterns, one per line, for example `/docs/*`. Only matching pages are checked. Leave it empty to check the whole site. |
| **Skip pages matching** | Patterns, one per line, for example `/blog/*`. Matching pages are never checked. |
| **Also check WCAG level AAA** | Adds the AAA checks to the A and AA ones. |
| **Also check best practices (shown separately, not WCAG failures)** | Adds axe-core's best-practice checks. Their issues are labeled "best practice", not a WCAG level. |
| **Follow the site's robots.txt (turn off only for your own site)** | As when you added the site. |

How patterns match:

- Patterns are compared with the page's path (queries are dropped from addresses). Upper and lower case don't matter.
- `*` matches anything, including `/`. `/docs/*` matches `/docs/setup` and `/docs/guides/export`, but not `/docs` itself.
- A pattern that starts with `/` or `*` must match the whole path.
- A pattern without a leading `/` or `*` matches anywhere in the path. `draft` matches `/blog/draft-notes` and `/drafts/`.

The start address is always checked, even if it doesn't match **Only pages matching**.

Startica always skips sign-out, log-out and delete links, and anything under `/api/`, whatever the patterns say.

### Remove a site

**Remove site**, next to **Site settings**, deletes the site and all its scan results. Startica asks you to confirm first. This can't be undone.

## Where it runs

Scans need a browser, so they run only in the Startica desktop app.

- In browser development mode (`yarn dev:desktop-web`), scans use Playwright's Chromium if it's installed. Install it once with `yarn playwright install chromium` in `apps/desktop-web`.
- In [demo mode](/guides/demo-mode), scans are off. The demo shows sample results for `fieldnote.example` instead.

When scans can't run, the Overview says so and the scan buttons are disabled.

## Related

- [Scanning a site](/accessibility/scanning)
- [Reading the results](/accessibility/results)
- [Issues in GitHub or GitLab](/accessibility/issue-trackers)
- [Privacy and security: accessibility scans](/concepts/privacy-security#accessibility-scans)
- [Troubleshooting: accessibility scans](/troubleshooting#accessibility-scans)
