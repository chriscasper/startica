# Contributing to Startica

Thanks for helping. The full guide (dev setup, architecture, adding a channel, connector or job, and the release process) lives in the docs: **https://docs.mystartica.com/contributing/**.

The short version:

1. **Set up:** Node.js 24+, then `corepack enable && yarn`. Run the app with `yarn dev:desktop` (or `yarn dev:desktop-web` in a browser).
2. **Try it with demo data:** `STARTICA_DATA_DIR="$PWD/.demo-data" yarn seed:demo`, then `STARTICA_DATA_DIR="$PWD/.demo-data" yarn dev:desktop-web`. The demo product (Fieldnote) is fictional, and the seed makes no AI calls.
3. **Read before coding:** [ARCHITECTURE.md](ARCHITECTURE.md) covers the architecture, decisions and working rules (section 17); [PLAN.md](PLAN.md) lists what's left to do. `apps/desktop-web` runs Next.js 16 with Cache Components; read [apps/desktop-web/AGENTS.md](apps/desktop-web/AGENTS.md) before using a Next.js API.
4. **Before opening a PR:** `yarn typecheck && yarn lint && yarn test && yarn smoke:desktop`. CI runs the same checks on macOS and Linux.
5. **Keep PRs focused.** For larger changes (new channels, connectors, schema changes), open an issue or a Discussion first so we can agree on the approach.

Ground rules that come from the product's promises: nothing may post anywhere without the user's approval, no scraping that breaks a platform's terms, no telemetry, and every AI call goes through `packages/core/src/ai/client.ts` from a background job.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE), and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
