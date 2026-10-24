---
title: Post images
description: Make an image for a Content Studio post in every size its channel shows; the AI draws the picture and a template adds the words.
layout: doc
---

A Content Studio piece can have images, made the same way as [ad creatives](/ads/creatives): the AI draws the picture, and a template adds your words in every size the post's channel shows. Click **Image** on a piece in the **Library** to open its images.

## Sizes

| Channel | Sizes | Largest file |
| --- | --- | --- |
| X | 16:9 1200×675, 1:1 1080×1080 | 5 MB |
| Bluesky | 16:9 1200×675, 1:1 1080×1080, 4:5 1080×1350 | 1 MB |
| Mastodon | 16:9 1200×675, 1:1 1080×1080 | 8 MB |
| LinkedIn | 1.91:1 1200×627, 1:1 1080×1080, 4:5 1080×1350 | 5 MB |
| Reddit | 4:5 1080×1350, 1:1 1080×1080 | 20 MB |
| Anything else | 1.91:1 1200×630 (link previews and blog headers), 1:1, 4:5 | 5 MB |

The 1:1 and 4:5 sizes also fit Instagram's square and tall posts. Sizes were checked on 2026-10-21. Images are PNG, or JPEG when a PNG is over the limit.

## Make an image

Click **New image** and pick the picture:

- **Draw it with AI**: describe the scene, not the words (no text, logos, other brands or real people). Needs an OpenAI key; the cost is shown first.
- **Upload my own**: PNG, JPEG or WebP up to 20 MB, square or larger.
- **No picture, just the words**.

Then the words on the image, an optional supporting line, a template (overlay, panel or frame), colors and the logo (uploaded under **Ads → Creatives**). The square preview updates as you type. Saving renders every size in the background.

Each image has a download button and a copy button per size, **Edit**, render again and delete. If the words don't fit at a size, a warning says so.

> [!NOTE]
> **Post…** fills in the text only. Download or copy the image and attach it in the site's own composer before you press its button.

## Costs

Drawing a picture is one call on the `image` task (`post-image@1`), counted in your monthly AI budget. Uploads, words-only images and rendering are free and happen on your computer.
