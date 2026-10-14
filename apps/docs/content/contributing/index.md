---
title: How to contribute
description: How to propose ideas, report bugs, pick up issues and open pull requests for Startica.
layout: doc
---

Startica is open source under the MIT License, and contributions are welcome: bug reports, fixes, new channel adapters and metrics connectors, docs, and design feedback. This page covers how to get a change from idea to merged pull request. The rest of the Contributing section explains how the app is built and how to extend it: [add a channel adapter](/contributing/channel-adapter), [a metrics connector](/contributing/connector), [a background job](/contributing/background-job), [a playbook](/contributing/playbook) or [a site check](/contributing/site-check).

## Where to start

| You want to | Go to |
|---|---|
| Ask a question or get help using Startica | [GitHub Discussions](https://github.com/chriscasper/startica/discussions) |
| Propose a feature or a bigger change | Discussions first, then an issue once the idea is agreed |
| Request a new channel or metrics source | The **Channel or connector request** issue template |
| Report a bug | [Open an issue](https://github.com/chriscasper/startica/issues/new/choose) |
| Find something small to work on | Issues labeled [good first issue](https://github.com/chriscasper/startica/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) |
| Report a security problem | Privately, as described in [Security reports](#security-reports) |

### Big ideas: Discussions first

Start a thread in Discussions before you write code for anything larger than a fix: a new module, a new channel, a change to how jobs or AI calls work, a new dependency, or anything that changes what leaves the user's machine. Describe the problem, the approach, and what you considered instead. This saves you from building something that conflicts with a decision already made (the decisions and the alternatives that were turned down are listed in `ARCHITECTURE.md` at the repo root).

Some changes need agreement before any code, because they change Startica's promises to its users:

- Anything that posts, comments or sends messages on a user's behalf. Startica never posts automatically: in the posting window it only fills in, and the user presses the site's own button.
- Anything that scrapes a site or breaks a platform's terms.
- A paid or hosted service, telemetry, or a new network destination.

### Bug reports

Use the **Bug report** template. It asks for:

- Your OS and version, and how you run Startica (`yarn dev:desktop`, `yarn dev:desktop-web`, or a build you made).
- The version or commit you're on (`git rev-parse --short HEAD`).
- What happened, and the steps to reproduce it.
- Logs: the terminal output, and for job failures the error from the System page.

Remove API keys, OAuth tokens and anything private from logs before you paste them.

### Good first issues

Issues labeled **good first issue** are small, well-defined and don't need deep knowledge of the codebase. Comment on the issue to say you're taking it, so two people don't do the same work. If you get stuck, ask in the issue.

## Pull request flow

1. Fork the repo and create a branch from `main`.
2. Set up your environment as described in [Development setup](/contributing/dev-setup).
3. Make the change. Follow the [working rules](/contributing/working-rules): where code goes, how AI calls and schema changes work.
4. Add or update tests. See [Testing](/contributing/testing).
5. Run the checks below and make sure they pass.
6. Update the docs in the same pull request if you changed behavior, a setting, a command or an environment variable. See [Docs and website](/contributing/docs-and-website).
7. Open the pull request and fill in the template: what changed and why, which checks you ran, and screenshots for UI changes (light and dark).

Keep pull requests focused on one thing. A small PR with a clear description gets reviewed faster than a large one.

### The checks

Run these from the repo root before you open a pull request:

```bash
yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
```

- `yarn typecheck` runs `tsc --noEmit` in every workspace (plus `next typegen` in `apps/desktop-web`).
- `yarn lint` runs ESLint in `apps/desktop-web`. The other workspaces have no lint config yet.
- `yarn test` runs Vitest in `packages/core` and `packages/db`.
- `yarn smoke:desktop` starts an isolated server and drives it in a real browser.

If you changed the Electron shell (`apps/desktop`), also run the desktop smoke test:

```bash
yarn workspace @startica/desktop smoke
```

CI runs the same checks on every pull request, on macOS and Linux. Pull requests are merged only when they pass.

### Special cases

- **Schema changes** include the migration that `yarn db:generate` wrote. Never edit a committed migration.
- **Prompt changes** bump the prompt's version string. If the prompt has an eval set, rerun it and put the result in the commit message. See [Prompts and evals](/contributing/prompts-evals).
- **New dependencies** need a reason in the PR description. Native modules are not accepted: the desktop build relies on having none.

## Code of conduct

Everyone taking part in the project (issues, Discussions, pull requests, reviews) is expected to follow the [Code of Conduct](https://github.com/chriscasper/startica/blob/main/CODE_OF_CONDUCT.md), which is the Contributor Covenant 2.1. Report unacceptable behavior to `hello@mystartica.com`.

## License

Startica is released under the [MIT License](https://github.com/chriscasper/startica/blob/main/LICENSE). By opening a pull request, you agree that your contribution is licensed under the MIT License too. Only submit code you wrote or have the right to submit under that license.

The license covers the code, not the Startica name and logo. If you publish a fork, give it your own name: see the [trademark policy](https://github.com/chriscasper/startica/blob/main/TRADEMARKS.md).

## Security reports

Don't open a public issue for a security problem. Report it privately, either through GitHub's **Report a vulnerability** button on the repository's Security tab or by email to `security@mystartica.com`. The [security policy](https://github.com/chriscasper/startica/blob/main/SECURITY.md) lists what's in scope (the local server, the launch token and keychain encryption) and what to include in a report.

> [!NOTE]
> For how Startica protects data on a user's machine, see [Privacy and security](/concepts/privacy-security).
