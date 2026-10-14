---
title: Reading the results
description: What the Accessibility Overview, Issues and Pages screens show, how issues are grouped and scored, and what automated checks can't tell you.
layout: doc
---

After a scan, the **Accessibility** screens show what the automated checks found: a summary on the **Overview**, every issue under **Issues**, and every page under **Pages**. This page explains each screen, how issues are grouped and marked fixed, how the score works, and what the checks don't cover.

> [!NOTE]
> Everything on these screens is issues found by automated checks: a list of things to fix, not a verdict on whether a site meets WCAG. See [Limits of automated checks](#limits-of-automated-checks).

## Overview

| Card | What it shows |
| --- | --- |
| **Score** | The site's score out of 100 and its target (90 unless you changed it). Green at or above the target, amber up to 20 points below, red further below. Below it, the **no critical issues** goal: met, or how many critical issues are open. See [The score](#the-score). |
| **Open issues** | How many issues are open, with counts by impact: critical, serious, moderate and minor. Each count opens **Issues** filtered to that impact. |
| **Pages checked** | How many pages were checked, how many couldn't be checked, and a link to the items that need a person to review. See [Needs review](#needs-review). |
| **Last scan** | When the last scan ran, and how many issues were new and fixed in it. |

Below the cards:

- **Fix these first**: the top 5 open issues by [priority](#priority), with their impact, WCAG criteria, pages and, with Google Analytics or Umami connected, the visits those pages got in 30 days. **Export CSV** downloads every issue. An issue on many pages is usually one fix in a shared template.
- **Score history**: the score after each full scan, with the target as a dashed line (after two full scans).
- **What changed**: the issues the last scan found for the first time and the ones it found fixed.
- **Scans**: the latest 10 scans, each with when it ran, its kind (**Full scan**, **Page check** or **Issue recheck**), its status (queued, running, done or failed, with the error), pages checked (and failed), score, and new and fixed issues.

## Issues

**Issues** lists issue groups. An issue group is one check failing on the same element across one or more pages.

Elements count as the same when their HTML matches, ignoring `id`, `data-` and `style` attributes and cache-busting query strings on addresses. So a logo in a shared header with no alt text is one issue on every page it appears on. Fix the header once and it's fixed everywhere.

Filter by **Open**, **Fixed** or **Ignored**, and by impact (each with its count). The [By criterion](#by-criterion) view links here filtered to one WCAG criterion. Open issues are listed by [priority](#priority). **Export CSV** downloads every issue, one row per element.

| Column | What it shows |
| --- | --- |
| Issue | The check's description and a sample CSS selector for the element. Ignored issues show why. |
| Priority | High, medium or low (open issues). See [Priority](#priority). |
| Impact | critical, serious, moderate or minor, as axe-core rates it. |
| WCAG | The success criteria (for example 1.1.1) and level: A, AA, AAA or best practice. |
| Pages | How many pages it's on. |
| Elements | How many elements fail, across those pages. |
| Visits, 30 days | With Google Analytics or Umami connected: the sessions (Umami: visits) that viewed those pages in the last 30 days (open issues). |

### An issue

Click an issue to open it. It shows:

- the check's description, its impact and status, its WCAG criteria and level, and its page and element counts;
- the rule id (for example `image-alt`) and a **How to fix this (rule documentation)** link to the rule's page on Deque University;
- a note when the issue is on several pages, since it's probably part of a shared template;
- **Recheck N pages**, which checks just the pages it's on;
- **Ignore** (or **Stop ignoring**) and **Add to Roadmap**. See [Ignore an issue](#ignore-an-issue);
- **Create GitHub issue** or **Create GitLab issue** when the product has a connected repository, a link to the repository issue once there is one, or a **Connect GitHub or GitLab** link when there's none. See [Send issues to GitHub or GitLab](#send-issues-to-github-or-gitlab);
- **Where it fails**: every failing element, with its page (a link to the page report), its CSS selector, its HTML, and what the check found.

## Pages

**Pages** lists every page the scans found, lowest scores first. Each row has the page's path and title, its score, its issue counts by impact, and when it was checked. Pages that were skipped, failed or are still waiting show that state and the reason instead. See [Skipped and failed pages](/accessibility/scanning#skipped-and-failed-pages).

### A page report

Click a page to open its report:

- its title and address (click the address to open the page in your browser), and **Recheck page**;
- its score, its number of issues, its language (from the page's `lang` attribute) and when it was checked;
- **Where they are**: a screenshot of the page as the scan saw it, with each failing element boxed and numbered like the issues below it. Startica takes screenshots only of pages with issues, at most 4,000 pixels tall, and keeps the latest one per page in your data folder;
- each issue on the page, numbered, with its failing elements, their HTML and how to fix them, a link to the issue, and "also on N other pages" when the same issue is elsewhere;
- **Open with highlights** (desktop app): opens the live page in a window with every failing element outlined in its impact's color, so you can see it in context and try the page. The window shows only that site; links to other sites open in your browser.

## Fix and recheck

1. Start with **Fix these first** on the Overview.
2. Open the issue. Read **Where it fails** and the rule documentation.
3. Fix it on the site and deploy the change.
4. Click **Recheck N pages** on the issue, or **Recheck page** on a page report. Only those pages are checked, on their own queue, so it takes seconds.
5. If the issue is gone from every page, it moves to **Fixed**.

You can also check any single page with **Check a page** on the Overview. A full **Scan now** catches issues on pages you didn't recheck.

## Send issues to GitHub or GitLab

If your team tracks work in GitHub or GitLab, connect the product's repository in **Settings → Products → Issue tracker for …**. Then:

- **Create GitHub issue** (or **Create GitLab issue**) on an open issue opens one repository issue with the check, its WCAG criteria, how to fix it and up to 20 failing elements. Clicking it again never makes a duplicate; the issue's page links to the repository issue instead, for example "GitHub issue #12 (open)".
- Optionally, Startica opens issues by itself after each scan for new issues at or above an impact you choose (at most 10 a scan, most important first), closes them with a comment when they're fixed, and reopens them if they come back.

See [Issues in GitHub or GitLab](/accessibility/issue-trackers) for the details and [GitHub and GitLab](/credentials/github-gitlab) for the token.

## Priority

Open issues are ranked by impact, the pages they're on and how much those pages are visited:

- each page counts 1, plus its sessions in the last 30 days when Google Analytics or Umami is connected;
- the total is multiplied by the impact's weight: critical 10, serious 5, moderate 2, minor 1.

The bands: **High** for critical and serious issues on 5 or more pages or on pages with at least 10% of the site's tracked visits; **Medium** for other critical and serious issues, and moderate ones on 5 or more pages; **Low** for the rest. The page visits come from GA4's sessions or Umami's visits by page path, synced daily with the rest of your [Google Analytics](/credentials/google) or [Umami](/credentials/umami) data (the product's web analytics; GA4 when both work).

**Today** suggests fixing the top issue when it's high or medium priority, with the visits it affects.

## Ignore an issue

**Ignore** on an issue asks why: **False positive** (the check got it wrong), **Won't fix**, or **Not applicable**, with an optional note. An ignored issue is kept on record under **Ignored**, leaves the open list and the [By criterion](#by-criterion) view, and later scans don't raise it again. **Stop ignoring** puts it back: open if the latest results still find it, fixed if not. An ignored issue covers the whole site.

## Open and fixed

- An open issue becomes **fixed** when it isn't found on any page in the latest results.
- A fixed issue reopens if a later check finds it again. Ignored issues stay ignored.
- In the **Scans** list and the **Last scan** card, **new** counts issue groups first seen in that scan, and **fixed** counts issue groups that became fixed in that scan.

## The score

The score is Startica's own measure of progress. It isn't a percentage of WCAG met and doesn't measure compliance.

For each page:

- every check the page passed counts 1;
- every check it failed counts by its impact: critical 10, serious 5, moderate 2, minor 1;
- each check counts once per page, however many elements fail it.

The page's score is the passed points as a share of all the points, out of 100. For example, a page with 40 passed checks:

| Failures | Calculation | Score |
| --- | --- | --- |
| None | 40 / 40 | 100 |
| One critical | 40 / (40 + 10) | 80 |
| One minor | 40 / (40 + 1) | 97.6, shown as 98 |

The site's score is the average of its checked pages' scores. Skipped and failed pages don't count.

The target is 90 by default. Change it with **Target score** in [Site settings](/accessibility#site-settings). Use it as a goal for the issues automated checks can find.

## Needs review

Some checks can't decide on their own: for example, whether text on a background image has enough contrast. axe-core reports these as needing review, and they're listed under **Accessibility → Needs review**, each with up to three of its elements and a **How to check it** link.

Look at each one and choose:

- **Pass**: it's fine.
- **Fail**: it's a real problem. It becomes an issue under **Issues** and counts as failing in [By criterion](#by-criterion). It doesn't change the page score, which only counts what axe-core decided itself.
- **Skip**: decide later.

Startica remembers your decision for that element across scans. **Decided** lists what you've decided, with **Undo**.

## By criterion

**Accessibility → By criterion** lists every success criterion of a standard, with what the automated checks found:

| Result | Meaning |
| --- | --- |
| **Failing** | An open issue maps to it (links to those issues). |
| **Needs review** | An item you haven't decided maps to it. |
| **No automated failures** | axe-core tests it and found nothing. A person may still find problems. |
| **Not testable automatically** | Only a person can check it. |

Your own results from the [checklist](/accessibility/checklist-and-reports#the-checklist) appear next to these in the report and the conformance draft.

Standards: **WCAG 2.2** (levels A and AA, plus AAA if the site checks it), **EN 301 549** for the European Accessibility Act (WCAG 2.1 AA), **ADA Title II** (WCAG 2.1 AA) and **Section 508** (WCAG 2.0 AA). This shows progress; it isn't a conformance claim, and legal scope and deadlines change. Check the current rules for your situation.

## Limits of automated checks

Automated checks such as axe-core cover only part of WCAG. They can tell that an image has no alt text, but not whether the alt text it has is meaningful. A site with no issues found by automated checks can still be hard or impossible to use.

Things that need a person to check include:

- using every page and control with the keyboard alone, in a sensible order, with visible focus;
- whether alternative text, link text and headings make sense;
- whether the language is clear and instructions are understandable;
- captions and transcripts for audio and video;
- how the site works with a screen reader and with zoom.

Use the scan results to find and fix what can be found automatically, then review the rest yourself or with people who use assistive technology.

## Related

- [Accessibility](/accessibility)
- [Scanning a site](/accessibility/scanning)
- [Issues in GitHub or GitLab](/accessibility/issue-trackers)
- [Try the demo](/guides/demo-mode): sample results for `fieldnote.example`
