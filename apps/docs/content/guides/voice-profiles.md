---
title: Voice profiles
description: Turn writing samples from creators your audience likes into a style guide Startica follows when it writes content for you.
layout: doc
---

A voice profile is a short style guide that the AI follows when it writes in Content Studio. You build one from writing samples: posts and comments by creators whose writing your audience already likes, or your own. Startica reads the samples and distills how they write (tone, structure, recurring phrasing), not what they say.

Voice profiles live in **Content Studio**, on the **Voices** tab.

## How it works

1. You add a **source**: a creator or account, and where they write.
2. You give the source **samples**: paste them, or import them automatically from Reddit or Hacker News.
3. You click **Build voice**. The AI reads the samples and writes a style guide.
4. The finished voice appears in the **Voice** menu when you create content.

## Add a source

On the **Voices** tab, click **Add source**. The **Add a voice source** dialog asks for:

| Field | What to enter |
| --- | --- |
| Creator or account | A name you'll recognise. Required. |
| Where they write | Reddit, X, LinkedIn, Hacker News, Mastodon, Bluesky, Discourse, Blog, Newsletter, Email or Other. |
| Username | Their Reddit or Hacker News username. Leave it empty for other platforms. A leading `@` or `u/` is removed. |
| Profile link | Optional. A link to their profile. |
| What you like about their writing | Optional notes for yourself. |

If you enter a username and pick Reddit or Hacker News, Startica starts importing their writing as soon as you save.

> [!TIP]
> Pick writers your audience already reads and trusts. For Fieldnote, that might be a field ecologist who posts long, practical answers in a research subreddit. You can also add yourself as a source and paste your own best posts.

## Add samples

The source card shows how many samples it has. The card says to aim for 10 or more samples per source for a good voice. You need at least 3 before you can build.

### Paste samples

Click **Paste samples** on the source card. Paste posts or comments into the box, and separate samples with a line that contains only three dashes:

```text
First post or comment goes here.
It can span several lines.
---
Second sample.
---
Third sample.
```

Samples shorter than 20 characters are skipped. Pasting works for every platform.

### Import from Reddit

For a Reddit source with a username, click **Import**. Startica reads the user's public RSS feeds for their submitted posts and their comments (up to 25 of each). It keeps items with at least 40 characters of text and skips link-only or image-only posts.

Reddit limits feed requests to about one per minute, so an import takes about 2 minutes. The card shows **importing…** while it runs. Private or missing profiles return nothing; if no writing is found at all, the import fails with a message saying so.

### Import from Hacker News

For a Hacker News source with a username, click **Import**. Startica asks the public Hacker News search API (Algolia) for the user's 40 most recent stories and comments, and keeps those with at least 40 characters of text.

Running **Import** again only adds samples it hasn't seen before (matched by link), so it's safe to repeat.

> [!NOTE]
> Automatic import works only for Reddit and Hacker News. For every other platform, paste the samples.

## Build a voice

There are two ways to build:

| Button | Where | What it builds |
| --- | --- | --- |
| **Build voice** | On each source card | A voice from that one source, named after the source. |
| **Build one voice from all sources** | Below the source list, when you have more than one source | A blended voice named "Blend of all sources", from every source for the product. |

A single-source voice copies one writer's style closely. A blend averages several writers, which is useful when no one writer fits your audience exactly.

While a voice builds, its card shows a spinner. Building takes a short while and runs in the background, so you can keep working.

### What gets sent to the AI

Startica sends the most recent samples, up to about 40,000 characters in total. Older samples beyond that limit are left out. The build uses the `strategy` model task, which is Claude Opus or GPT-6.1 Sol by default. You can change the model per task in **Settings → General → AI**; see [AI models](/concepts/ai) and [Settings](/reference/settings).

### What the style guide contains

Each voice card shows the guide in these parts:

| Part | Contents |
| --- | --- |
| Summary | Two or three sentences that capture the voice. |
| Tone | How it sounds. |
| Structure | How posts open, flow and close. |
| Do / Don't | Concrete rules to follow and avoid. |
| Vocabulary | Characteristic words, phrasings and formatting habits. |
| Example openers | Three to five new opening lines written in the voice. |

The instructions tell the AI to capture style and ignore topics, to quote only short fragments, and to write new example openers rather than copying sentences from the samples.

## Change a voice

There is no editor for a finished style guide. To change a voice:

- Add or remove samples on its source, then click **Build voice** again. Each build creates a **new** voice card; the old one stays until you delete it.
- Delete voices you no longer want with the trash icon on the voice card.

If a build fails (for example, fewer than 3 samples), the card shows **Failed** and the reason.

Deleting a source deletes its samples. Voices already built from it keep their guide, and their card shows "(deleted sources)".

## Where voices are used

- **Content Studio.** The **Voice** menu on the **Create** tab lists every ready voice, plus **Plain (no voice)**. The newest ready voice is selected by default. See [Content Studio](/guides/content-studio).
- **Today.** When you have a ready voice and haven't created any content in the last 3 days, Today suggests writing and posting one piece in your saved voice. See [Today](/guides/today).

Voices are not used for Inbox reply drafts. Those follow their own instructions; see [Drafting replies](/guides/drafting-replies).

The AI follows a voice for style only. The writing instructions tell it never to copy the source's opinions or claims.

## Costs

Imports are free: they only read public pages. Building a voice is one AI call on the `strategy` task. See [Costs](/concepts/costs) for how to estimate and cap spending.
