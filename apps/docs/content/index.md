---
title: Startica documentation
description: Install, set up and use Startica, the open-source AI co-founder for everything after you ship. Marketing, SEO & GEO, accessibility and security for your product, on your own computer.
layout: doc
---

Startica is an open-source (MIT) desktop app that looks after a product once it's shipped. It has four modules: **Marketing** finds conversations worth joining and drafts replies, posts and ads in your voice; **SEO & GEO** helps the product get found in search, in AI answers and by AI agents; **Accessibility** checks your sites against WCAG; and **Security** checks what anyone on the internet can see about your sites, and keeps watching. A **Dashboard** and a short daily list pull it together.

It runs on your computer, keeps its data in a local SQLite file, and calls the Claude or OpenAI API with your own key. Nothing is posted, launched or changed without you.

> [!NOTE]
> There are no published installers yet. You run Startica from source, or build an installer for your own computer with one command. See [Install from source](/getting-started/install). The release workflow and automatic updates are built, and signed installers will follow on GitHub Releases.

## Start here

1. [What is Startica](/getting-started/what-is-startica): the four modules and what each page does.
2. [Requirements](/getting-started/requirements): what you need before you install.
3. [Install from source](/getting-started/install): clone, install, run or build.
4. [First run](/getting-started/first-run): the welcome wizard connects your AI provider and adds your first product.
5. [Try the demo](/guides/demo-mode): look around with a sample product first, no API key needed.
6. [Your first day](/getting-started/first-day): Today's Getting started checklist, from intel to your first posted reply.
7. [Updating](/getting-started/updating): pull new code without losing data.

## Sections

- [Guides](/guides/finding-conversations): how to use the Marketing module and the pages every module shares, from finding conversations to the [Dashboard](/guides/dashboard) and reading analytics.
- [Ads](/ads): plan paid campaigns for Google Ads, Meta and Reddit, with ads checked against each platform's limits and files to import. You launch and pay; Startica never does.
- [Accessibility](/accessibility): check your product's websites with automated accessibility checks, fix what matters most first, and recheck.
- [SEO & GEO](/seo): check your sites for what search engines and AI crawlers need, see how they do in Google and Bing, see whether AI assistants recommend your product, check whether AI agents can use your site, and see which sites AI answers cite and whether you're on them.
- [Security](/security): prove a site is yours, then check its HTTPS, headers, cookies, exposed files and email setup on every scan, watch for new subdomains, expiring certificates, look-alike domains and vulnerable libraries, and get a disclosure kit. Defensive checks only.
- [Bring your own credentials](/credentials): set up your Anthropic or OpenAI key, Google Analytics or Umami, Google Search Console, Bing Webmaster Tools, your product database (Supabase or Postgres), Stripe, GitHub or GitLab for issues, and the optional X API.
- [Concepts](/concepts/glossary): the vocabulary, how Startica uses AI, what it costs, and how it handles your data.
- [Reference](/reference/settings): settings, background jobs, environment variables, the data folder and scripts.
- [Troubleshooting](/troubleshooting): common problems and fixes, plus the [FAQ](/troubleshooting/faq).
- [Contributing](/contributing): architecture, development setup, and how to add channels, connectors, jobs and playbooks.

## Links

- Source code: [github.com/chriscasper/startica](https://github.com/chriscasper/startica)
- Website: [mystartica.com](https://mystartica.com)
