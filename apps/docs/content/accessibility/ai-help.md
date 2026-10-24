---
title: AI help for accessibility
description: Fix suggestions for an issue's actual HTML, an alt text review of your images, a second opinion on Needs review items, and a plain-language summary, all with your own AI key.
layout: doc
---

With an AI key set, Accessibility can help with four things. Each runs only when you press its button, costs a little (shown next to the button), and gives you text to copy: Startica never changes your site. The checks themselves stay free and don't use AI.

> [!NOTE]
> What the AI reads comes from your pages: HTML, alt text, nearby text, images and screenshots. It's sent to your AI provider as data, with instructions to ignore anything in it that looks like an instruction. See [How Startica uses AI](/concepts/ai).

## Fix suggestions

On an issue's page, **Suggest a fix** sends the rule, its WCAG criteria and up to three failing elements' HTML. You get:

- a short explanation of what's wrong for people using assistive technology;
- the corrected HTML of the element, to copy;
- steps, including where it probably lives when the issue is on many pages (a shared template or component);
- a confidence: high when the fix is mechanical, medium or low when it depends on content the AI can't see (for example what an image shows).

**Suggest again** asks for a new one, optionally with guidance such as "We use React; the logo is the `<Logo>` component in `Header.tsx`". About $0.01 each. After you fix it, **Recheck** the issue's pages.

**Refine** opens a chat about the fix: ask who the issue affects, give your framework, or ask for JSX instead of HTML. A revised fix appears under the AI's reply with **Apply**, and **Versions** keeps every one. See [Refining AI suggestions](/guides/refine).

## Fix plans

To fix several issues at once, tick them on **Accessibility → Issues** (the Open list), or tick the box in the header to pick everything listed (up to 25). Then click **Write one fix plan**, optionally add guidance such as your framework or where your components live, and click **Write the plan**.

You get one short plan for all of them, written to paste into a coding agent such as Claude Code or Cursor:

- **Issues**: each one on a line, with its rule, WCAG criteria, impact, pages and an example element and page;
- **Tasks**: what to change, in order. Issues with the same cause, such as one header component, are one task. Each task says which issues it fixes, where the code probably is and the change, with corrected HTML when it helps;
- **Done when**: a few checks for afterwards.

The copy button in the plan's top-right corner (it shows when you point at the plan) copies it. **Write again** writes it again for the same issues, with new guidance if you like. The plan page says how many of its issues have been fixed since; after your agent makes the changes, **Recheck** the pages or run a scan. Earlier plans are under **Fix plans** on the Issues list. About $0.01 for every one or two issues.

## Alt text review

**Accessibility → Images** lists every image the scans found, once per address (a logo on every page is one row), with its alt text and how many pages use it. **Need attention** shows images without alt text and those the review flagged.

**Review N images** downloads up to 50 images not reviewed yet, most used first, and judges each one's alt text in context (the page, nearby text, whether it's a link):

| Verdict | Meaning |
| --- | --- |
| **Good** | The alt text conveys the image's purpose. |
| **Needs better** | It's vague, a file name, too long, or describes the wrong thing. A link's image should say where the link goes. |
| **Decorative** | The image adds nothing; it should have `alt=""`. |
| **Missing** | It has no alt attribute, or an empty one although it carries meaning. |
| **Check by hand** | It couldn't be read: an SVG, over 4 MB, or not reachable. |

Each verdict comes with a reason and, where it helps, a suggested `alt` to copy. About $0.005 an image. When you change an image's alt text, the next scan clears its verdict so it's reviewed again.

## Needs review

On **Needs review**, **Ask AI** looks at an item's element, with the page screenshot when there is one, and suggests **Pass** or **Fail** (or that you look closely) with its reasoning. It's a second opinion: you still press Pass, Fail or Skip. About $0.01 each.

## Summary

On the Overview, **Summarize** writes three to five sentences on where the site stands, what changed in recent scans, and what to fix next. It says when there's a newer scan than the one it summarized. About $0.01.

## Costs

All four use your AI key and count toward the monthly budget in **Settings → General → AI**. Fix suggestions and summaries use the **draft** model; the alt text review and Ask AI use the **vision** model, which reads images. See [Costs and budget](/concepts/costs).
