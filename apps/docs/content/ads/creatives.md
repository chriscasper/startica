---
title: Creatives
description: "Make the images for a campaign's ads: a picture drawn by AI or uploaded, your words, logo and button added by a template, rendered in every size the platform takes."
layout: doc
---

A **creative** is one ad image: a picture, with your headline, logo and button laid over it by a template, rendered in every size the campaign's platform takes. The AI can draw the picture, or you upload your own, or you use no picture at all. The words are never drawn by the AI: a template adds them on your computer, so they're always spelled right.

This page covers the **Creatives** tab: the sizes, making and editing a creative, suggested ideas, the logo, what drawing costs and how the images are rendered. To plan the campaign first, see [Ads](/ads).

> [!WARNING]
> Startica never uploads images to your ad account. You download each size and add it to the ad in the platform's ad manager yourself. Only use pictures you have the rights to.

## Find it

Open a campaign in **Ads**. The tabs under its name are **Plan and ads**, **Creatives** and [Results](/ads/results). **Creatives** lists the campaign's creatives, newest first, with the buttons:

- **New creative** opens the [creative dialog](#make-a-creative).
- **Suggest ideas** asks the AI for three ideas from the campaign's ads. See [Suggested ideas](#suggested-ideas). It's disabled until the campaign has ad groups.
- **Upload logo** (or **Replace logo** and **Remove**) on the right. See [The logo](#the-logo).

## Sizes for each platform

The **Sizes** card lists the sizes Startica renders for the campaign's platform and the file limit each image is kept under. The sizes were last checked against the platforms' help pages on **2026-10-10**.

| Platform | Sizes | File limit |
| --- | --- | --- |
| Google Ads | 1.91:1 at 1200×628 (Landscape: Display, Demand Gen, Performance Max), 1:1 at 1200×1200 (Square), 4:5 at 960×1200 (Portrait: Demand Gen), 9:16 at 1080×1920 (Vertical: YouTube Shorts, Demand Gen) | 5 MB |
| Meta | 4:5 at 1440×1800 (Feed, recommended), 1:1 at 1440×1440 (Feed), 9:16 at 1440×2560 (Stories and Reels), 1.91:1 at 1200×628 (Links and right column) | 30 MB |
| Reddit | 4:5 at 1080×1350 (Feed, the tallest Reddit shows), 1:1 at 1080×1080 (Feed) | 3 MB |

> [!NOTE]
> Google Search ads don't show images, and the campaigns Ads plans for Google are Search campaigns. Use Google creatives in a Demand Gen, Display or Performance Max campaign you set up yourself. Reddit's file limit hasn't been confirmed against its documentation.

### Labelling AI images

The card also says what each platform asks about AI-made images:

| Platform | What it asks |
| --- | --- |
| Google Ads | Disclosure of AI-made images in election ads, and since July 2026 for AI assets shown in the EU, India and New York: check the AI-content setting when you upload there. |
| Meta | Disclosure only in political and social-issue ads; Meta labels AI media it detects itself (since June 2026). |
| Reddit | It follows its political-ads rules for disclosure; check its ad policy before using AI-made people or places in sensitive topics. |

These notes aren't legal advice. Each platform's own policy and review decide.

## Make a creative

Click **New creative**. The dialog has the fields on the left and a live square preview on the right.

| Field | What to enter |
| --- | --- |
| **Picture** | **Draw it with AI**, **Upload my own**, or **No picture, just the words**. See [The picture](#the-picture). |
| **What the picture shows** | With **Draw it with AI**: the scene, up to 1,000 characters. For example "A field researcher's notebook and coffee on a sunlit wooden table, soft morning light". Describe the scene, not the words. |
| **Image** | With **Upload my own**: a PNG, JPEG or WebP file, up to 20 MB. |
| **Headline** | Required, up to 80 characters. |
| **Supporting line (optional)** | Up to 140 characters. |
| **Button (optional)** | Up to 24 characters, for example "Try it free". |
| **Price or offer (optional)** | Up to 24 characters, for example "$9/mo". Shown as a tag in the top corner. |
| **Template** | **Overlay**, **Panel** or **Frame**. See [Templates](#templates). |
| **Background**, **Words**, **Button** | The three colors. They start as `#111827` (near black), `#ffffff` and `#f59e0b` (amber). |
| **Add the logo** | Ticked by default. Adds the product's logo, if you've [uploaded one](#the-logo). |
| **For ad (optional)** | **The whole campaign**, or one of its ads (shown as "_group_: ad _n_"). Only a label to help you match images to ads. |

Click **Draw and render** (with **Draw it with AI**) or **Render**. The creative appears in the list with its status, and the page updates by itself as it finishes.

The preview shows the template at 1080×1080 as you type, with your upload or the current picture. An AI picture appears only once it's drawn.

> [!TIP]
> Make the headline the ad's promise in a few words. The template shrinks long text to fit, but short headlines stay large and readable on a phone.

### The picture

| Choice | What happens | Cost |
| --- | --- | --- |
| **Draw it with AI** | OpenAI's image model draws the picture from what you wrote, then the sizes are rendered. Takes about a minute. | One picture, about $0.05 at the default quality. See [What drawing costs](#what-drawing-costs). |
| **Upload my own** | Your file is used as it is, then the sizes are rendered. | Nothing |
| **No picture, just the words** | The template draws the words on the background color. | Nothing |

**Draw it with AI** needs an OpenAI API key, even if Claude is your provider; without one it's disabled with "needs an OpenAI key in Settings". See [The image task](/concepts/ai#the-image-task).

What you wrote can't name a competitor from the product's [Intel](/getting-started/first-run): that's refused with "Leave _name_ out of the picture: ads can't show other brands".

Each size crops the picture from the middle to fill its space, so a wide size loses the top and bottom of a square picture and a tall size loses the sides. AI pictures are drawn square and large for that reason. For uploads, square or larger works best, with the subject in the middle.

### Templates

| Template | Layout |
| --- | --- |
| **Overlay** | The picture fills the ad; the words sit on a shaded edge: along the bottom in square and tall sizes, down the left side in wide ones. |
| **Panel** | The picture on one side, the words on a solid panel of the background color: the picture on top in square and tall sizes, on the right in wide ones. |
| **Frame** | A solid background, the words above and the picture framed below (side by side in wide sizes), with rounded corners and a shadow. |

The words are sized from each ad's shorter side, so they look the same in every size. If the headline, supporting line and button don't fit their space, the template shrinks them step by step, down to 40% of their starting size. The button keeps the background color for its text and the button color behind it.

If the words had to shrink below 70% of their size, or still don't fit at 40%, the creative says so above its downloads, with the sizes affected: "The words had to shrink a lot to fit at 1.91:1, so they may be hard to read." or "The words don't fit at 1.91:1: they're cut off." A size whose words are cut off shows a warning sign on its download button. Shorten the headline or supporting line, or try another template; wide sizes (1.91:1) have the least room.

## Suggested ideas

**Suggest ideas** asks the AI for three creatives, each testing a different angle: the problem, the outcome, the product in use, or a scene from the customer's day. It reads the product's details, the campaign's goal and plan, and its ads, and writes for each idea:

- what the picture shows, for the image model;
- a headline of up to about 40 characters, a supporting line, and a button;
- a template, and three colors (words with strong contrast on the background, and a button color that stands out from both);
- which ad it's for, or the whole campaign.

Ideas appear with the status **Idea** and "Not drawn yet". No picture is drawn and nothing is spent on images until you click **Draw it** on one (the button shows the estimate). **Edit or upload** opens the dialog to change the idea or use your own picture instead.

Suggesting ideas uses the `draft` task on your usual provider, and costs a few cents. An idea whose picture names a competitor is dropped. While it runs, the button reads **Suggesting…**.

## The logo

The logo is kept per product and used by every campaign of that product. Click **Upload logo** and pick a PNG, JPEG or WebP file, up to 20 MB. A transparent PNG works best on any background.

The template places it above the headline (top left in Overlay's square and tall sizes), up to 7.5% of the ad's shorter side high. Creatives already rendered keep their old images: click **Render again** on a creative to add the new logo. **Remove** deletes the logo; creatives keep it until they're rendered again.

## What drawing costs

Each creative's card and the **Sizes** card show the estimate for one picture, for example "about $0.05 at medium quality", based on the `image` task's model and quality in **Settings → General → AI**. The default is GPT Image 2.5 Flare at `medium`. Each picture is drawn once at 2048×2048, and every size is cropped from it, so the number of sizes doesn't change the cost.

After drawing, the card shows what the picture cost, and the **Sizes** card shows what this campaign's pictures have cost so far. It all counts toward your [monthly AI budget](/concepts/costs#the-monthly-budget). Quality and prices are in [Costs: Ad pictures](/concepts/costs#ad-pictures).

### The rules every picture is drawn under

The prompt sent to the image model starts with fixed rules, then your product's name and one-line description, then what you wrote:

- no text, letters, numbers, captions, logos, watermarks or screens with readable words, because the words are added later;
- no real or identifiable people, celebrities or public figures; people, if any, are generic and not a face close-up;
- no brand names, trademarks, or other companies' products, packaging or app icons;
- no before-and-after comparisons, body-image or health claims, or anything shocking;
- the subject near the center with generous margins, so it can be cropped to wide and tall sizes;
- for Overlay, a calm lower third where the words sit; otherwise a clean background;
- natural light and a modern, credible look, not stock-photo clichés.

The full prompt is kept with the creative: open **Prompt sent to the image model** on its card. If OpenAI declines a prompt, the creative shows "OpenAI declined to draw this" with OpenAI's reason. Change what the picture shows and draw again.

## Rendering

Every size is rendered on your computer, not by the AI. Startica writes the template as a small web page, renders it to an image in a hidden window at exactly the ad's pixel size, and saves it. Only the template, the picture and the logo can load in that window: nothing is fetched from the internet. See [Privacy and security](/concepts/privacy-security#ad-creatives).

Each size is saved as a PNG, which keeps text sharpest. If the PNG is over the platform's file limit, it's saved as a JPEG instead, at the highest quality that fits (92, 85 or 75). If even that's too big, rendering fails with "The _width_×_height_ image is bigger than the platform takes".

Rendering needs the desktop app. In browser development mode it uses Playwright's Chromium if it's installed; otherwise it fails with "Images can't be rendered here: open Startica's desktop app (or install Playwright's Chromium for browser dev mode)".

## Work with a creative

Each card shows the headline, the status, the template, which ad it's for and what its picture cost. Below the preview (the 4:5 size, or 1:1) are the picture's description, a download button per size with its file size, and the buttons:

| Button | What it does |
| --- | --- |
| **Edit** | Opens the dialog. **Keep the current picture** is selected, so saving only renders again. Pick **Draw a new one with AI** or **Upload my own** to replace the picture. |
| **Draw again** | Draws a new picture from the same description, after you confirm "Draw a new picture? It costs about $…". Only for AI pictures, with an OpenAI key. |
| **Render again** (the arrows icon) | Renders every size again, for example after changing the logo or after a failed render. |
| **Stop** | While drawing or rendering. The creative keeps its earlier images, if it had any, and shows "Stopped by you". |
| Trash icon | Deletes the creative and its images, after you confirm. |

| Status | Meaning |
| --- | --- |
| **Idea** | Suggested by the AI; no picture yet. |
| **Drawing** | The AI is drawing the picture. |
| **Rendering** | The sizes are being rendered. |
| **Ready** | Every size is ready to download. |
| **Failed** | Drawing or rendering didn't finish. The error is shown on the card. |

A creative can't be edited while it's drawing or rendering ("Wait for this creative to finish").

### Download and use

Click a size to download it. Files are named after the creative and the size, for example `creative-7b1e4c2a-4x5.png`. Then add them to the ad in the platform:

- **Meta:** after the [bulk import](/ads/hand-off#meta), add the 4:5 (or 1:1) image to each ad in Ads Manager, and the 9:16 for Stories and Reels placements.
- **Reddit:** add the 4:5 or 1:1 image to the promoted post when you [create the ads](/ads/hand-off#reddit).
- **Google:** use them in a Demand Gen, Display or Performance Max campaign. Search ads don't take images.

Deleting an ad in Startica keeps its creatives; they become **Whole campaign**. Deleting a campaign deletes its creatives and their files.

## Where the files are

Pictures, rendered sizes and logos are files in the [data folder](/reference/data-folder#ad-images): `ads/creatives/<creative id>/` and `ads/logos/`. Uploads stay there and are never sent anywhere.

## In the demo

[Demo mode](/guides/demo-mode) gives the Reddit campaign two creatives: "Your field notebook, minus the soggy pages", rendered in Overlay from a stand-in picture drawn on your computer (it stays an **Idea** if the demo can't render), and "Stop typing up field notes at night", an idea in Panel not drawn yet. No background jobs run in the demo, so **Suggest ideas**, drawing a picture and rendering (after a save or **Render again**) all queue a job that just waits. You can download the rendered sizes.

## Related

- [Ads](/ads)
- [Results and what to do next](/ads/results)
- [Hand-off](/ads/hand-off)
- [How Startica uses AI](/concepts/ai#the-image-task)
- [Costs](/concepts/costs#ad-pictures)
