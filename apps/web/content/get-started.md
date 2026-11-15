---
title: Get started
layout: page
eyebrow: Get started
lede: Download the installer for macOS, Windows or Linux, or run Startica from source. Either way takes about ten minutes.
description: Install Startica on macOS, Windows or Linux, from an installer or from source, add your Claude or OpenAI API key and set up your first product and its website.
---

## Download

The quickest way in is the [download page](/download): pick the installer for your system and open it. The Mac builds are signed and notarized. The Windows installer isn't code-signed yet, so Windows asks you to confirm the first time you open it. Startica is in beta, and Windows and Linux are less tested than macOS.

You need **a Claude or OpenAI API key**, from the [Anthropic Console](https://platform.claude.com) or the [OpenAI platform](https://platform.openai.com/api-keys). You set a monthly budget inside Startica. Site scans and checks don't use AI, so they cost nothing.

The first time it opens, Startica shows the [three-step setup](#install-and-run) described below.

## Run from source instead

To read or change the code, or to run the newest changes before they're released, clone the repository. You need:

- **Node.js 24 or newer.** Startica uses Node's built-in SQLite.
- **Yarn 4**, which comes with Node through Corepack.
- **git**

## Install and run

```bash
git clone https://github.com/chriscasper/startica.git
cd startica
corepack enable
yarn
yarn dev:desktop
```

The Startica window opens on **Welcome to Startica**, a three-step setup:

1. **Connect AI:** pick Claude or OpenAI, paste your API key and set a monthly budget. A typical month for one product costs a few dollars.
2. **What are you marketing?:** your product's name and website. Startica starts building intel right away (about 3–4 minutes).
3. **A few extras:** launch at login, your Mastodon server, and pointers for connecting analytics later.

Startica then opens on the **Dashboard**, and **Today** shows a short *Getting started* checklist that takes you to your first posted reply.

To check your site for accessibility, search and security problems, open **Accessibility** and add the site (usually your product's website); one scan runs every module's checks. Security checks start once you [prove the site is yours](https://docs.mystartica.com/security#prove-the-site-is-yours).

> Not ready to add a key? Choose **Look around with a sample product first** to explore Startica with a fictional product that has sample results in every module. Your own data stays untouched, and **Leave demo** takes you back.

## Build an installer for your computer

To keep a copy you built yourself in your Applications folder or Start menu instead of running it from a terminal, build an installer for the system you're on:

```bash
yarn build:desktop --mac     # or --win, or --linux
```

The installer lands in `apps/desktop/dist/`. It isn't code-signed, so your operating system will ask you to confirm the first time you open it. The [install guide](https://docs.mystartica.com/getting-started/install) shows what to expect on each system.

## Next steps

1. [First run](https://docs.mystartica.com/getting-started/first-run): the setup wizard, step by step.
2. [Your first day](https://docs.mystartica.com/getting-started/first-day): the Getting started checklist, from intel to your first posted reply.
3. [Scan your site](https://docs.mystartica.com/accessibility/scanning): one scan checks accessibility, search basics and, once verified, security.
4. [Bring your own credentials](https://docs.mystartica.com/credentials): connect Google Analytics or Umami, Search Console, Stripe or your product's database to measure results.

Stuck? Check [troubleshooting](https://docs.mystartica.com/troubleshooting) or ask in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).
