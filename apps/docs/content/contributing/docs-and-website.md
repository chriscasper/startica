---
title: Docs and website
description: How to run, write for and deploy Startica's two simple-engine sites, mystartica.com and docs.mystartica.com.
layout: doc
---

Startica has two websites in the monorepo, both built with [simple-engine](https://www.npmjs.com/package/simple-engine) and deployed to Cloudflare Workers as static sites. This page covers running them locally, writing a docs page, adding it to the sidebar, and deploying.

## The two sites

| Site | Folder | Local | Cloudflare Worker |
|---|---|---|---|
| [mystartica.com](https://mystartica.com): the website | `apps/web` | `yarn dev:web`, port 9000 | `startica-web` |
| [docs.mystartica.com](https://docs.mystartica.com): this documentation | `apps/docs` | `yarn dev:docs`, port 9001 | `startica-docs` |

They share one theme, `packages/web-theme` (`@startica/web-theme`). Its `theme.css` holds the Tailwind CSS 4 `@theme` tokens (colors, fonts) and shared classes, plus the light and dark color sets. Each site's `styles/main.css` imports it after Tailwind:

```css
@import "tailwindcss";
@import "@startica/web-theme/theme.css";
```

Change shared colors and type in the theme package, not in one site. Header and footer partials are small and live in each site's `layouts/partials/`.

### The logo

The Startica wordmark and its "S" mark live in `packages/brand` (`@startica/brand`), shared by both sites and the desktop app. The original files are in `packages/brand/assets/`: `startica-logo.svg` (white, for dark backgrounds) and `startica-logo-dark.svg` (navy, for light backgrounds). The code draws the same shapes in the surrounding text color, so one component works on any background.

In a site layout, each site's `simple.config.js` exposes the logo as `site.logo` and the mark as `site.mark`. Put it in a `.brand-logo` wrapper with a height; the width follows:

```html
<a href="/" class="brand-logo h-6" aria-label="Startica home">{{ site.logo | safe }}</a>
```

In the desktop app, use the React components:

```tsx
import { StarticaLogo, StarticaMark } from "@startica/brand/react";

<StarticaLogo className="h-5 w-auto" />
```

Both are named "Startica" for screen readers by default. Pass `title={null}` when a link or heading next to them already says Startica. The favicon and social images are generated from the same shapes by `apps/web/scripts/generate-assets.mjs`, which runs with `yarn build`.

Don't type "Startica" in a display font as a stand-in for the logo.

## Run locally

```bash
yarn dev        # both: website at http://localhost:9000, docs at http://localhost:9001
yarn dev:web    # website only
yarn dev:docs   # docs only
```

Both reload on save. Neither needs the desktop app or any API keys.

## Write a docs page

Docs pages are Markdown files in `apps/docs/content/`. The path sets the URL:

| File | URL |
|---|---|
| `content/guides/today.md` | `/guides/today` |
| `content/contributing/index.md` | `/contributing/` |

### Frontmatter

Every page starts with exactly these fields:

```markdown
---
title: Add a channel adapter
description: One sentence for search results and social cards.
layout: doc
---
```

`title` is shown as the page heading and in the browser tab, and `description` is used for search results, social cards and `llms.txt`. Keep the description to one sentence.

### Conventions

- **No H1.** The layout renders `title` as the page's heading. Start with an intro paragraph that says what the page covers, then use `##` and `###` headings. They become the on-page table of contents, so keep them short.
- **Callouts** use GitHub's alert syntax, and only these three:

  ```markdown
  > [!NOTE]
  > Background that helps but isn't required.

  > [!TIP]
  > A shortcut or better way.

  > [!WARNING]
  > Something that can lose data, cost money or break things.
  ```

- **Internal links** are root-relative and have no `.md`: `[Install from source](/getting-started/install)`, `[jobs reference](/reference/jobs)`. Anchors work too: `/contributing/working-rules#charts`. Link to the GitHub repo with full URLs.
- **Per-OS instructions** go under `###` headings named for the OS, in the order macOS, Windows, Linux:

  ```markdown
  ### macOS

  ### Windows

  ### Linux
  ```

- **Code blocks always have a language** (`bash`, `powershell`, `ts`, `tsx`, `json`, `text`, `markdown`). Use `text` for diagrams and terminal output.
- **Code samples match the repo.** Copy type names, function signatures and file paths exactly, and check them against the source before you submit. If the code changes, the docs change in the same pull request.
- **Voice:** plain, direct, second person ("you"). Short sentences. No marketing language and no emoji.
- **Neutral examples.** Never use a real person, company or product as an example. The demo product is **Fieldnote** (`https://fieldnote.example`).

## Add a page to the sidebar

The sidebar order is defined in `docsNav` in `apps/docs/simple.config.js`. A page that isn't listed there doesn't appear in the sidebar or in the previous/next links. Add an entry to the right section:

```js
{
  title: 'Contributing',
  items: [
    { title: 'How to contribute', url: '/contributing' },
    // …
    { title: 'Add a playbook', url: '/contributing/playbook' },
  ],
},
```

The sidebar `title` can be shorter than the page's frontmatter title. Then check that every page is listed:

```bash
yarn workspace @startica/docs check
```

It fails if a page in `content/` is missing from `docsNav`, or if `docsNav` links to a page that doesn't exist.

## Search

Search uses [Pagefind](https://pagefind.app), which builds a static index from the generated HTML. There's no search server. `yarn build:docs` runs `simple build` and then `apps/docs/scripts/postbuild.mjs`, which turns alert blockquotes into styled callouts and writes the Pagefind index to `dist/pagefind`. Because the index only exists after a build, search works on a built site, not in `yarn dev:docs`:

```bash
yarn build:docs
yarn workspace @startica/docs preview
```

`preview` serves the built `dist/` folder with Wrangler, the same way Cloudflare does.

## Deploy

Both sites deploy as static assets to Cloudflare Workers:

```bash
yarn deploy        # build apps/web and deploy startica-web
yarn deploy:docs   # build apps/docs and deploy startica-docs
```

You need Wrangler logged in to the Cloudflare account (`yarn workspace @startica/docs wrangler login`), so in practice maintainers deploy. Contributors only need the local commands above: open a pull request and the change goes live after it's merged and deployed.

Each site's `wrangler.jsonc` sets the Worker name and custom domain. The website and docs also publish `sitemap.xml`, `robots.txt`, `llms.txt` and raw Markdown copies of each page; you don't need to maintain those by hand.

## Website pages

The website's pages are in `apps/web/content/` and its templates in `apps/web/layouts/`. The same voice and neutrality rules apply. Screenshots should come from the demo product, in both light and dark, so they can be regenerated when the UI changes.
