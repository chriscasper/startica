---
title: Disclosure
description: Publish a security.txt and a disclosure policy so people can report problems to you, and triage what they send.
layout: doc
---

**Security → Disclosure** helps you make it easy for people to tell you about a security problem, and keep track of what they report. It has three parts: a **security.txt** for your site, a **disclosure policy** to publish, and **Reported problems**, where you paste what people send.

## security.txt

[security.txt](https://www.rfc-editor.org/rfc/rfc9116) is a small text file at `/.well-known/security.txt` that tells people how to reach you about a security problem. Fill in:

| Field | What to enter |
| --- | --- |
| **Contact** | An email address (it becomes `mailto:`) or the `https://` address of a form |
| **Policy address** | Where you'll publish the disclosure policy below. Defaults to `/security-policy` on your site |
| **Valid for** | 1 to 12 months. The file must carry an expiry date; make a new one before it passes |
| **Languages** | The languages you can read reports in, e.g. `en` |

**Make security.txt** writes the file, checked with the same rules the [security.txt check](/security/checks#reporting-problems) uses. Copy it and publish it at `/.well-known/security.txt`. The next scan confirms it's there.

## Disclosure policy

**Make the policy** writes a Markdown page that tells people how to report a problem, which sites are in scope (your product's sites), what not to do (access other people's data, slow the service down, phish your team), and that you won't take legal action against people who follow it. It says there's no paid bug bounty.

> [!WARNING]
> The policy is a starting point, not legal advice. Edit it to match how you actually handle reports, and have whoever handles legal questions read it before you publish it.

## Reported problems

When someone emails you about a security problem, paste it here with **Add a report**. With an AI key, it's triaged (about $0.02):

- **Severity**, and whether it **looks real**, is **unclear** (no concrete evidence yet) or is **probably not a problem** (generic or automated reports, like ones asking for a bounty before sharing details).
- **A finding you already have**, when it's the same problem the checks found.
- **What's missing**, to ask the reporter for.
- **A reply to send**: short and polite, asking for what's missing. It never promises money, a fix date or legal terms. Copy it into your email; Startica never sends anything.

Then:

- **Track as a finding** adds it to **Findings** (or links it to the finding it duplicates), so it's in the report and can go to the Roadmap or an issue tracker. You need a verified site for this.
- **Resolved** or **Dismiss** moves it out of the list; **Reopen** brings it back.

What people send is treated as untrusted text: the AI is told to ignore any instructions in it, and nothing in it is followed or opened.
