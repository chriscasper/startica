---
title: Security
description: What the Security module checks on your own sites, how to prove a site is yours, what it never does, and where to start.
layout: doc
---

**Security** checks your product's sites for the security problems anyone on the internet can see: weak HTTPS, missing security headers, cookies without protection, files that should never be public, email that's easy to forge, and no way for people to report a problem to you. It runs on the same scan as [Accessibility](/accessibility) and [SEO & GEO](/seo), lists what it finds with how to fix it, and marks each problem fixed when it's gone.

This page explains how to turn it on and what it does and doesn't do. [Checks](/security/checks) lists every check, and [Findings and report](/security/findings) explains the findings, the score and the report.

> [!WARNING]
> Security checks look at your site from the outside, the way any visitor's browser does. They don't test how your application handles input, whether one user can see another's data, or anything behind a sign-in. A short list of findings doesn't mean the site is safe, and nothing in Startica certifies a site as secure or compliant.

## Turn it on

1. Add the site under **Accessibility** or **Security**, if it isn't there yet. Sites are shared by every module.
2. Open **Security → Overview** and prove the site is yours (below).
3. Press **Scan now**. When the scan finishes, the Overview shows the score and the most serious findings.

Every later scan of the site checks it for security too.

## Prove the site is yours

Security checks request a few addresses that ordinary page loads don't (for example `/.git/HEAD`), so Startica runs them only on sites you can show you control. Do one of these, then press **Verify**:

| Method | What to do |
| --- | --- |
| **Search Console** | Nothing, if the product's [Search Console connection](/credentials/search-console) works and its property covers the site: a domain property (`sc-domain:fieldnote.example`) for the site's domain, or a URL-prefix property for its address. |
| **DNS record** | Add a TXT record on the site's domain (or its exact host name) with the value shown, for example `startica-verification=3f9c…`. DNS changes can take up to an hour to show up. |
| **File** | Publish a text file at `/.well-known/startica-verification.txt` on the site containing the code shown. |

**Verify** tries them in that order and says what each one found. Sites on your own computer or network (`localhost`, private addresses) are verified as soon as you press it.

If you change a site's address to a different host name, it needs verifying again. Changing only the path doesn't.

> [!NOTE]
> The code isn't a secret: it only proves you can change the site or its DNS. You can remove the DNS record or file after verifying.

## What it never does

- **It never tries to break in.** No attack payloads, no guessing passwords, no filling in or submitting forms, no fuzzing. Every request is an ordinary GET of a page or a well-known address, a TLS handshake or a DNS lookup. [Monitoring](/security/monitoring) also asks free public services about your domain and libraries, and downloads the third-party scripts your pages load.
- **It never checks sites you haven't verified.**
- **It never changes your site or DNS.** It tells you what to change.
- **Its checks make no AI calls** and cost nothing. AI help (explaining a finding, reading another report, triaging a reported problem) runs only when you ask, on your own key.

## What it can't see

- Pages behind a sign-in.
- How the application handles input: injection, access control between users, business logic.
- Servers, ports and cloud settings other than the website itself.
- Your source code, server-side dependencies and secrets inside the code.
- People and processes: phishing, password practices, how you respond to an incident.

For those, a penetration test by people you trust is still the way to go. Startica can help you prepare for one: fix what the checks find first, so the testers spend their time on what automation can't do.

## Screens

| Screen | What it shows |
| --- | --- |
| **Overview** | Before verifying: the steps above. After: the score, open findings by severity, the HTTPS certificate, the email domain and security.txt, and the most serious findings. **Scan now** and **Check a page** start the same scans as on the Accessibility Overview. |
| **Monitoring** | Libraries with known vulnerabilities, subdomains and certificates, look-alike domains and third-party scripts. See [Monitoring](/security/monitoring). |
| **Findings** | Every finding, most serious first, filtered by **Open**, **Fixed** or **Accepted or not a problem**. Each opens its own page. See [Findings and report](/security/findings). |
| **Report** | The report for the site, with a **Download Markdown** button. See [The report](/security/findings#the-report). |
| **Disclosure** | A security.txt and disclosure policy to publish, and the problems people report to you. See [Disclosure](/security/disclosure). |

## Today and the Roadmap

**Today** suggests "Fix N critical or high security findings" while any are open, and "Verify <site> to turn on security checks" for a scanned site that isn't verified. Any finding can go to the **Roadmap** (playbook **Security fixes**) or, with an [issue tracker](/accessibility/issue-trackers) connected, become a GitHub or GitLab issue.
