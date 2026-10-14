---
title: Checklist and reports
description: Check each WCAG criterion by hand, then share where the site stands with a printable report, an accessibility statement and a conformance report draft.
layout: doc
---

Automated checks decide only part of WCAG. **Accessibility → Checklist** is where you record what you check by hand, and **Accessibility → Reports** turns the automated results and your checklist into documents to share. None of them use AI or cost anything, and none of them claim the site is compliant or certified.

## The checklist

The checklist lists every WCAG 2.2 success criterion at level A and AA (and AAA when the site checks AAA in [Site settings](/accessibility#site-settings)), grouped by principle: Perceivable, Operable, Understandable, Robust. For each one you see:

- the automated result: **Failing** (with a link to its issues), **Needs review**, **No automated failures**, or **Not testable automatically**;
- a one-line description of how to check it by hand, and a link to W3C's Understanding page for it;
- your result: **Passes**, **Fails** or **N/A** (click again to clear it), and **Note** to write what you checked and found. The note can also hold a remark for the conformance draft.

**To check** lists the criteria without a result yet, **Failing** the ones that fail by hand or in the automated checks, **All** everything. A criterion that fails can go to the Roadmap with **Add to Roadmap**.

A clean automated result isn't a pass: **No automated failures** means axe-core found nothing, not that a person using a keyboard or screen reader can use the page. Check it by hand too.

## The report

**Open** shows a single printable page: the score and its history, every criterion with its automated and manual result, the top issues by priority, and the pages with the lowest scores. In the desktop app, **Save as PDF** asks where to save it. In a browser, open it and print it. **Issues CSV** downloads every issue, one row per element.

## Accessibility statement

An accessibility statement is a page on your site that says what you aim for and how people can get help. Click **Fill in the details** and give:

| Field | What it's for |
| --- | --- |
| **Organization or product name** | Who the statement is from. |
| **How people can report problems** | An email address or a contact page. |
| **The standard you aim for** | WCAG 2.2 AA (recommended), WCAG 2.1 AA or WCAG 2.2 A. |
| **Anything else you do** | Optional, for example how you test before releases. |
| **Other known limitations** | Optional, for problems the checks can't see. |

Startica writes the statement following W3C's model: your commitment, the standard you aim for, how you check (automated checks and how many criteria you've reviewed by hand), the known limitations (the top open issues and the criteria that fail by hand, with your notes), how to give feedback, and the date. It says you aim for the standard; it never says you meet it. Copy it, or download it as Markdown, and publish it on your site. Update it after each round of fixes.

## Conformance report draft

The conformance report draft is a table in the style of an Accessibility Conformance Report (ACR) or VPAT: each WCAG 2.2 A and AA criterion with a conformance level and remarks. Startica fills it in:

| Level | When |
| --- | --- |
| **Supports** | You marked it Passes, and the automated checks found nothing. |
| **Partially Supports** | The automated checks found problems on less than half of the checked pages. |
| **Does Not Support** | You marked it Fails, or the automated problems are on half the pages or more. |
| **Not Applicable** | You marked it N/A. |
| **Not Evaluated** | You haven't checked it by hand, however clean the automated checks are. |

The remarks say what the checks found and what you noted; a remark you write on a criterion replaces the generated one. It's always a draft: review every row before you share it, and keep in mind that a formal ACR is usually prepared by someone who has tested the product thoroughly. Download it as Markdown.
