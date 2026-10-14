---
title: AI crawlers and llms.txt
description: Which AI crawlers Startica checks your robots.txt for, what blocking each kind means, how robots.txt is read, and what llms.txt is.
layout: doc
---

AI companies read websites with crawlers, for different reasons: to train models, to build the search index their assistants cite, and to fetch a page when someone asks about it. Your site's `robots.txt` can allow or block each one. This page explains the crawlers Startica checks for, what blocking each kind means, how Startica reads `robots.txt`, and what `llms.txt` is. Both files show on the SEO & GEO Overview, in the **AI search access** card and the **AI crawlers** table.

## The crawlers Startica checks

Each crawler is known by the name (user-agent token) it answers to in `robots.txt`. Startica checks these, by what they're for:

| Crawler | Operator | For |
| --- | --- | --- |
| `GPTBot` | OpenAI | Model training |
| `OAI-SearchBot` | OpenAI | AI search index (citations in answers) |
| `ChatGPT-User` | OpenAI | Fetching a page someone asked about |
| `ClaudeBot` | Anthropic | Model training |
| `Claude-SearchBot` | Anthropic | AI search index (citations in answers) |
| `Claude-User` | Anthropic | Fetching a page someone asked about |
| `PerplexityBot` | Perplexity | AI search index (citations in answers) |
| `Perplexity-User` | Perplexity | Fetching a page someone asked about |
| `Google-Extended` | Google | Model training |
| `Applebot-Extended` | Apple | Model training |

`Google-Extended` and `Applebot-Extended` aren't separate crawlers. They're names you can use in `robots.txt` to say whether pages the company's normal crawler fetched may be used for AI training.

The list was last checked against the operators' published lists on 2026-10-10; the **AI crawlers** card shows that date. Operators add and rename crawlers, so the list is updated with Startica. It isn't a list of every AI crawler.

## Training versus search

The three kinds of crawler do different things, so blocking them has different effects:

| If you block | What happens | How Startica reports it |
| --- | --- | --- |
| Training crawlers | Your pages aren't used to train those models. Assistants can still cite your site in answers, as long as their search and user crawlers are allowed. | **AI training crawlers are blocked**, under **Good to know**. It doesn't count against the score: it's your choice. |
| Search crawlers | The assistant's search index leaves your site out, so its answers can't cite you. | **AI search or answer crawlers are blocked**, high severity. |
| User crawlers | The assistant can't open your page when someone asks about it or pastes its link. | **AI search or answer crawlers are blocked**, high severity. |

A common reason for blocked search crawlers is a broad rule meant for training crawlers, such as blocking every AI crawler by name, or a `User-agent: *` group with `Disallow: /`. If you want to stay out of AI training but still appear in AI answers, block only the training crawlers.

> [!NOTE]
> Allowing a crawler makes it possible for an assistant to read and cite your site. It doesn't mean the assistant will. Whether and how a site appears in AI answers is up to each AI provider.

## How Startica reads robots.txt

When a scan finishes, Startica fetches `/robots.txt` from the site and works out, for each crawler, whether it may read the site's start address. It follows the rules in [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309), the standard search engines use:

- **Groups.** A crawler follows the group that names it (`User-agent: GPTBot`, upper or lower case). If no group names it, it follows the `User-agent: *` group. Several `User-agent` lines in a row share one group.
- **Longest rule wins.** Of the `Allow` and `Disallow` rules that match the address, the longest one applies. If an `Allow` and a `Disallow` are equally long, `Allow` wins.
- **Wildcards.** `*` matches any characters, and `$` at the end of a rule means the address must end there.
- **No file, no limits.** If `robots.txt` doesn't answer with HTTP 200, or no group applies, every crawler is allowed.

This check is separate from the site setting **Follow the site's robots.txt**, which decides which pages Startica's own scanner opens. See [Skipped and failed pages](/accessibility/scanning#skipped-and-failed-pages).

`robots.txt` is a request, not a lock. Well-behaved crawlers follow it, and some operators say that fetches made on a user's request don't. Startica can tell you what your file asks for, not what each crawler does. Check each operator's documentation for how its crawlers behave.

### Example: allow AI search, block AI training

This `robots.txt` for `fieldnote.example` lets search engines and AI search and user crawlers read the whole site, and asks the training crawlers to stay out:

```text
# Search engines and every crawler not named below
User-agent: *
Allow: /

# AI training: not allowed
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Applebot-Extended
Disallow: /

# AI search, and pages people ask about: allowed
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
Allow: /

Sitemap: https://fieldnote.example/sitemap.xml
```

The search and user crawlers would be allowed by the `*` group anyway. Naming them makes the intent clear, and keeps them allowed if you later tighten the `*` group. With this file, the **AI crawlers** table shows the four training crawlers as **Blocked** and the rest as **Allowed**, **AI search access** says **Open to AI search**, and **Good to know** lists the blocked training crawlers.

## llms.txt

`llms.txt` is an emerging, informal convention: a plain Markdown file at `/llms.txt` that briefs AI systems on what the site is and where its key pages are. It isn't a standard, and support varies by AI provider. Some may read it and others may ignore it, so treat it as a cheap extra, not a way to get into AI answers.

Startica checks two things when a scan finishes:

| Result | Shown as | Severity |
| --- | --- | --- |
| `/llms.txt` answers with HTTP 200 and starts with a Markdown `#` title | **llms.txt: found** | None |
| It answers, but doesn't start with a `#` title | **llms.txt: found, but not in the usual format**, and the problem **llms.txt doesn't follow the expected format** | low |
| It doesn't answer with HTTP 200 | **llms.txt: none**, and the problem **No llms.txt** | low |

Startica doesn't check the rest of the file: whether the summary is accurate or the links work.

To get a first version, use **Draft llms.txt** on the **No llms.txt** opportunity in [Opportunities](/seo/opportunities#llms.txt): the AI writes one from the pages the scan found, and Startica checks its format and links before you copy it.

### Example llms.txt

A short file with a title, a one-paragraph summary, and links to the most important pages:

```markdown
# Fieldnote

> Fieldnote is a note-taking app for field researchers: offline notebooks, photos and GPS tags, synced when you're back online.

## Product

- [Features](https://fieldnote.example/features): offline notebooks, photo and GPS tagging, and sync for field teams
- [Pricing](https://fieldnote.example/pricing): free for one notebook; Pro for unlimited notebooks and team sharing

## Help

- [Getting started](https://fieldnote.example/help/getting-started): set up a notebook and sync it
- [Working offline](https://fieldnote.example/help/offline): what works without a signal, and how sync catches up
```

Keep it short and factual, and update it when your key pages change.

## What Startica fetches

At the end of each scan, Startica fetches two files from the site, besides the pages it checks: `/robots.txt` and `/llms.txt`, with the user agent `StarticaAccessibilityScan/0.1 (+https://mystartica.com; scans sites their owners add)`. Nothing is fetched for reserved names that never resolve, such as addresses ending in `.example`, `.test` or `.invalid`. See [Privacy and security](/concepts/privacy-security#accessibility-scans).

## Related

- [Site health](/seo/site-health)
- [SEO & GEO](/seo)
- [Scanning a site](/accessibility/scanning)
