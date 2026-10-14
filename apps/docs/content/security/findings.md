---
title: Findings and report
description: How Security findings move between open, fixed, accepted and not a problem, how the score works, and what the report contains.
layout: doc
---

A **finding** is one security problem to fix, listed with every page it's on. This page explains a finding's page, the states it moves through, the score, and the report. For the checks themselves, see [Security checks](/security/checks).

## A finding's page

- **Why it matters** and **How to fix it**, plus what the check saw (the cookie's name, the header's value, the script's host).
- **Pages**: where the latest scan saw it. Missing headers are usually one setting at the server, CDN or framework that fixes every page at once.
- **References**: the OWASP Top 10 category and related SOC 2 and ISO/IEC 27001 controls. They help you or your auditor see where the finding belongs. They are not an assessment: Startica doesn't say whether a control is met.
- **Help for your stack**: with an AI key, **Explain and fix** writes a plain explanation, fix steps and configuration for the server or framework your site's responses show (for example a `Server` header). It's text to copy: nothing is changed for you. About $0.02 each. See [How Startica uses AI](/concepts/ai).
- Buttons: **Accept the risk**, **Not a problem**, **Recheck** (or **Mark fixed** for imported and reported findings), **Add to Roadmap** and, with an issue tracker connected, **Create GitHub issue** or **Create GitLab issue**.

> [!WARNING]
> An issue in a public repository is public. Startica asks before opening one, because a security finding tells everyone where the weak spot is.

## Findings from other reports

**Import a report** on **Findings** reads another security report (a penetration test, a scanner export, a researcher's notes) into the same list. Paste its text or choose a text file, and say where it's from ("Pentest, March 2026"). Your AI key lists each finding with its severity, a short description, the fix and the addresses it names. It leaves out exploit details and credentials, and ignores any instructions written inside the report. About $0.10 for a long report. PDF files aren't read yet: copy the text out of the PDF first.

Findings from [monitoring](/security/monitoring) work like the scans' own: **Recheck** runs monitoring again, and they're fixed when it no longer finds them (a changed script stays open until you accept it).

Imported findings, and problems people reported to you that you track as findings (see [Disclosure](/security/disclosure)), show where they came from instead of a page count. Startica can't check them itself, so scans never change their state and they don't count in the score: press **Mark fixed** when they're done. Importing the same report again updates its findings instead of adding them twice.

## States

| State | Meaning |
| --- | --- |
| **Open** | Seen in the latest check (or imported and not fixed yet). Startica's own findings count against the score. |
| **Fixed** | No longer seen, and it opens again if a later scan sees it. For imported and reported findings: you pressed **Mark fixed**. |
| **Risk accepted** | You decided to live with it and said why. Kept on record, not counted, not raised again. |
| **Not a problem** | The check got it wrong for your site, and you said why. Kept on record, not counted. |

**Reopen** undoes a decision: the finding goes back to open, or to fixed if it's no longer seen.

**Recheck** checks again right away: a page finding's pages are reloaded, and a site-wide finding (certificate, security.txt, exposed files, email) runs the site checks again. Use it after you fix something.

## The score

The score starts at 100 and loses 30, 15, 7 or 2 points for each open critical, high, medium or low finding, down to 0. It counts each finding once, however many pages it's on. FYI findings, accepted risks and findings marked not a problem don't count.

It's Startica's own measure of progress, not a rating from any standard. Green at 90 or above, amber up to 20 points below, red further below.

## The report

**Security → Report** shows the report for the site; **Download Markdown** saves it as a `.md` file to share. It contains:

- The score, the open findings by severity, how the site was verified, and what the site checks saw (TLS version and certificate expiry, SPF and DMARC, security.txt).
- Every open finding with why it matters, how to fix it, its pages, its OWASP Top 10 category and related controls. Imported and reported findings say where they came from.
- Accepted risks and findings marked not a problem, with your reasons and dates.
- Fixed findings with when they were fixed.
- What the checks can't see.

The report never says a site is secure, compliant or tested; it says what the automated checks found.
