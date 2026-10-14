# Security policy

## Supported versions

Startica is built from source for now. Security fixes go to the latest `main` only.

| Version | Supported |
|---|---|
| latest `main` | Yes |
| anything older | No |

## Reporting a vulnerability

Please **don't open a public issue.** Report privately by either:

- using GitHub's [private vulnerability reporting](https://github.com/chriscasper/startica/security/advisories/new), or
- emailing **security@mystartica.com**.

Include what you found, how to reproduce it, and what an attacker could do with it. You'll get an acknowledgement within a few days. Once a fix is ready we'll agree on a disclosure date, and we're happy to credit you.

## Scope

Startica is a local-first desktop app with no hosted service. The areas that matter most:

- **The local server and its launch token:** the Next.js server listens on `127.0.0.1` only and refuses any request without the per-launch session token (`apps/desktop-web/src/proxy.ts`). Bypasses, token leaks, or ways for a web page or another local user to drive the server are in scope.
- **Secrets in the OS keychain:** API keys, OAuth tokens and connection credentials are encrypted with Electron `safeStorage` and stored in the `secrets` table (`packages/db/src/secrets.ts`). Any way to read them in plain text, or to make the app send them anywhere other than their own service, is in scope.
- **OAuth callbacks:** `/api/integrations/<provider>/callback` is the one route without the session token; it is authenticated by one-time server-side state. State fixation, CSRF or code injection there is in scope.
- **Product-database access:** the Supabase setup creates a read-only role over aggregate views. Anything that lets Startica write to, or read raw rows from, a connected product database is in scope.
- The Electron shell (`apps/desktop/main.mjs`): sandboxing, IPC, navigation and fuse settings.

Out of scope: vulnerabilities in third-party services Startica talks to (report those to the vendor), attacks that need an already-compromised OS user account, and the websites mystartica.com and docs.mystartica.com unless they expose user data.
