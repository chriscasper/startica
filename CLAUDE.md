# Startica monorepo

- `apps/web`: the mystartica.com marketing site (simple-engine, Cloudflare Workers). `yarn dev` runs it together with the docs site; `yarn dev:web` alone. `yarn build` / `yarn deploy`.
- `apps/docs`: the docs.mystartica.com documentation site (simple-engine, Pagefind search). `yarn dev:docs` / `yarn build:docs` / `yarn deploy:docs`; `yarn workspace @startica/docs check` validates the sidebar and internal links. Page conventions are in `apps/docs/content/contributing/docs-and-website.md`.
- `packages/brand`: the Startica logo. Use it instead of typing "Startica" as a wordmark: `StarticaLogo`/`StarticaMark` from `@startica/brand/react` in the desktop app, `{{ site.logo | safe }}`/`{{ site.mark | safe }}` in site layouts (inside a `.brand-logo` wrapper with a height). Both draw in currentColor.
- `packages/web-theme`: the Tailwind theme both sites import. The website, docs and open-source launch are planned in [apps/web/PLAN.md](apps/web/PLAN.md); read it before working on either site.
- Keep everything neutral: no real products or people in examples; use the fictional demo product Fieldnote.
- `apps/desktop` + `apps/desktop-web` + `packages/*`: the desktop app. Before working on it, read [apps/desktop/CLAUDE.md](apps/desktop/CLAUDE.md), [apps/desktop/ARCHITECTURE.md](apps/desktop/ARCHITECTURE.md) (how it works) and [apps/desktop/PLAN.md](apps/desktop/PLAN.md) (what's left to do).
- Yarn 4 workspaces (`nodeLinker: node-modules`), Node >= 24. Root scripts are listed in [README.md](README.md).
- Before calling desktop work done: `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`.
