---
title: Make your site work for everyone
layout: module
module: accessibility
eyebrow: Accessibility
docs: /accessibility
screenshot: /images/app/accessibility.png
screenshotAlt: "Startica's Accessibility overview for fieldnote.example: score 68 out of 100, 5 open issues, 7 pages checked, and a Fix these first table ranking issues like missing alternative text and unlabeled form fields by priority, impact, WCAG criterion, pages and visits"
lede: Startica crawls your site in a real browser, checks every page against WCAG 2.2 with axe-core, groups the same problem across pages so you fix it once, and puts the worst first. Then it helps you fix it, rechecks, and keeps watching.
description: Startica's Accessibility module scans your site against WCAG 2.2 with axe-core, ranks issues by impact, helps fix them, tracks what needs a person to review, and drafts reports. Free, local and open source.
features:
  - title: Scans in a real browser
    body: Starts from your home page and sitemap, loads each page in Chromium, and runs axe-core against WCAG 2.0, 2.1 and 2.2 levels A and AA. Politely, at most one page a second.
    doc: /accessibility/scanning
  - title: Fix these first
    body: The same failure on the same element across many pages is one issue. Issues are ranked by impact and by how many pages, and visits, they affect, with the element highlighted on the page.
    doc: /accessibility/results
  - title: AI help, on request
    body: A fix written for the issue's actual HTML, a review of your images' alt text in context, a second opinion on items that need review, and a plain-language summary. About a cent each.
    doc: /accessibility/ai-help
  - title: Content and documents
    body: Broken links, spelling, readability and your own content rules on every page, and checks of the PDFs your pages link to.
    doc: /accessibility/content-and-documents
  - title: Checklist and reports
    body: The WCAG criteria automation can't decide, for you to mark Pass or Fail. A printable report, an accessibility statement and a conformance report (ACR) draft built from your results.
    doc: /accessibility/checklist-and-reports
  - title: Issues in GitHub or GitLab
    body: Open an issue for any problem, by hand or after every scan, and Startica closes it when the problem is fixed.
    doc: /accessibility/issue-trackers
---

## How it works

1. **Scan.** Add your site and press **Scan now**. A 250-page site is checked on your computer, and every page is checked for search and security basics in the same pass.
2. **Prioritize.** The Overview shows a score out of 100, what changed since the last scan, and the issues to fix first.
3. **Fix.** Each issue explains what's wrong for people using assistive technology and how to fix it. Ask the AI for a fix written for your markup if you want one.
4. **Verify.** **Recheck** just the pages an issue was on. Fixed issues are marked fixed, and reopen if they come back.
5. **Monitor.** Startica rescans every week on its own, and the Dashboard and Today bring up anything critical.

## Honest about what automation can find

Automated checks find only part of what WCAG asks for. Keyboard use, meaningful alternative text and clear language need a person. So Startica always shows what still needs review, its statement says what you aim for rather than claiming you meet it, and its ACR draft says "Not Evaluated" for anything nobody checked by hand. Startica never calls a site compliant or certified, and the score is its own measure of progress.

## What it doesn't do

- **It doesn't change your site.** No overlay widgets, no injected scripts. Fixes are suggestions you make in your own code.
- **It doesn't scan sites you don't own.** You confirm you may test a site before it's scanned.
- **It doesn't certify anything.** It's a tool for finding and fixing problems, not an audit.

## What it costs

Scans and checks run on your computer and use no AI, so they're free. AI help is optional and runs only when you press its button, with the cost shown first: about $0.01 for a fix suggestion, and about $0.005 an image for the alt text review. See [Costs and budget](https://docs.mystartica.com/concepts/costs).
