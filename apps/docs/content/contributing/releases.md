---
title: Releases
description: "For maintainers: how Startica is versioned, how a tag becomes a draft GitHub release with installers and download links for every OS, how the download page finds them, and how to set up code signing and notarization."
layout: doc
---

A release is a version tag on `main`. Pushing the tag starts a GitHub Actions workflow that builds the installers for macOS, Windows and Linux and uploads them to a **draft** GitHub release. You review the draft and publish it by hand; the installed app's auto-update only sees published releases. This page covers versioning, cutting a release, what the workflow builds, the release notes and the download page, signing and notarization, local builds, and what isn't done yet.

## Current state

> [!WARNING]
> The pipeline is built, but nothing has been released through it yet. Read this before you cut the first release.

- **Not signed yet.** The Apple Developer ID and a Windows code-signing certificate haven't been bought, so every build is unsigned. Unsigned builds work, but users see OS warnings, and macOS can't install updates (see [Unsigned builds](#unsigned-builds)).
- **Auto-update can't reach the releases yet.** The app reads the releases of `chriscasper/startica` without a token, so it only works once the repository is public. Until then every check fails quietly.
- **Windows and Linux builds haven't been tried by hand.** They build on GitHub's runners, but nobody has installed and run them yet. See [Test Windows and Linux builds](#test-windows-and-linux-builds).
- **Users still build from source.** [Install from source](/getting-started/install) stays the documented way in until signed releases are published.

## Versioning

Startica follows [semantic versioning](https://semver.org). While the version is below 1.0, minor versions (0.**x**.0) may include breaking changes, and patch versions (0.1.**x**) are fixes only.

The app version is the `version` in `apps/desktop/package.json`. electron-builder uses it for the installer names and the app's About information, the release workflow checks the tag against it, and auto-update compares it with the latest release. Keep the root `package.json` and `apps/desktop-web/package.json` on the same version. `packages/core` and `packages/db` aren't published on their own and stay at `0.0.0`.

A database migration is not a breaking change on its own, because migrations run automatically on startup. A change that drops or rewrites user data, or changes where data is stored, is.

### Changelog

`CHANGELOG.md` at the repo root follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Add your change under `## [Unreleased]` in the same pull request, in one of these groups: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`. Write entries for users, not for reviewers: what changed for them, not which files moved.

## Cutting a release

1. Make sure `main` is green in CI.
2. Run the full checks locally, plus the desktop smoke test on a built app:

   ```bash
   yarn typecheck && yarn lint && yarn test && yarn smoke:desktop
   yarn build:desktop
   yarn workspace @startica/desktop smoke --packaged
   ```

3. Bump the version in `apps/desktop/package.json`, the root `package.json` and `apps/desktop-web/package.json`.
4. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.0.2] - YYYY-MM-DD`, add a new empty `## [Unreleased]` above it, and update the comparison links at the bottom.
5. Commit (`Release 0.0.2`), then tag and push. The tag must be `v` plus the exact version in `apps/desktop/package.json`:

   ```bash
   git tag -a v0.0.2 -m "Startica 0.0.2"
   git push origin main v0.0.2
   ```

6. Watch **Actions → Release**. A first job creates the draft release, so the builds all upload to the same one. The three build jobs (macOS, Windows, Linux) take a while; each uploads its files to the same draft release named after the version. A last job, **Release notes**, then writes the draft's notes (see [Release notes](#release-notes)).
7. Open the draft under **Releases**. Check that every file below is there and the notes read well, then click **Publish release**. Publishing also rebuilds mystartica.com, so [the download page](#the-download-page) links to the new version once you approve the `production` deployment.

If the tag and the version don't match, every job stops at **Check the tag matches the app version** with "Tag v0.0.2 doesn't match apps/desktop/package.json version 0.0.1". Delete the tag (`git push origin :refs/tags/v0.0.2` and `git tag -d v0.0.2`), fix the version, and tag again.

> [!WARNING]
> Publishing is what ships the update. Within six hours, every installed copy that checks automatically downloads it. Don't publish a release you haven't installed and opened at least on macOS.

Don't delete or rename the `latest*.yml` files on a release: `latest-mac.yml`, `latest.yml` (Windows) and `latest-linux.yml` are what the app reads to find the update. Pre-releases and drafts are ignored by auto-update.

## What the workflow builds

`.github/workflows/release.yml` runs one job per OS on GitHub's hosted runners, with Node 24 and `yarn install --immutable`. Each job runs `yarn workspace @startica/desktop build` with its OS flag. electron-builder's settings are the `build` field in `apps/desktop/package.json`.

| Runner | Files | Architectures |
| --- | --- | --- |
| `macos-latest` | `.dmg` (to install) and `.zip` (what auto-update downloads), each with a `.blockmap`, plus `latest-mac.yml` | Apple Silicon (`arm64`) and Intel (`x64`), as separate files |
| `windows-latest` | NSIS installer `.exe` with a `.blockmap`, plus `latest.yml` | `x64` |
| `ubuntu-latest` | `.AppImage` and `.deb`, plus `latest-linux.yml` | `x64` |

The Windows installer isn't one-click: it asks where to install. On Linux the executable is `startica` and the `.deb` maintainer is `Startica <hello@mystartica.com>`.

The workflow has two triggers:

| Trigger | What happens |
| --- | --- |
| Pushing a `v*` tag | Builds, signs and notarizes when the secrets are set, and uploads everything to a draft release (`--publish always`, with the `publish` setting `github`, `chriscasper/startica`, `releaseType: draft`). The workflow's own `GITHUB_TOKEN` (with `contents: write`) does the upload; you don't add a token. |
| **Run workflow** by hand | Builds without publishing (`--publish never`) and keeps the installers as workflow artifacts named `startica-macOS`, `startica-Windows` and `startica-Linux`. For testing. |

## Release notes

After the three build jobs, the **Release notes** job runs `apps/desktop/scripts/release-notes.mjs` and replaces the draft's notes with:

- **Download:** a table with a link and size for each installer: macOS Apple Silicon and Intel `.dmg`, the Windows `Setup .exe`, the Linux `.AppImage` and `.deb`. The links use the real tag (`/releases/download/v0.0.2/…`), so they work once the draft is published (a draft's own file links use a temporary `untagged-…` address).
- **Install notes** for unsigned builds, for each system whose certificate secret (`CSC_LINK`, `WIN_CSC_LINK`) isn't set: how to get past Gatekeeper or SmartScreen. A hidden `<!-- startica:unsigned=macos,windows -->` line records the same for the download page.
- **Beta:** while the version is 0.x, the release is titled "Startica 0.x.y beta" and the notes open with a beta note; the download page shows the same. It's still a normal published release, not a GitHub pre-release, because auto-update and the download page skip pre-releases.
- **What's new:** the version's entry from `CHANGELOG.md`. Without one, the job warns and the notes list only the downloads.

The job fails if any of the five installers is missing from the draft, which usually means a build job failed. Which files count as installers is in `apps/desktop/scripts/installers.mjs`; if you change an `artifactName` in `apps/desktop/package.json`, update its patterns too.

Edit the notes on the draft by hand if you like before publishing; rerunning the job overwrites them. To preview them locally against a draft:

```bash
node apps/desktop/scripts/release-notes.mjs v0.0.2
```

## The download page

[mystartica.com/download](https://mystartica.com/download) is built from the latest **published** release (drafts and pre-releases are skipped, as auto-update skips them). `apps/web/scripts/release.mjs` reads it from the GitHub API during `yarn build` and writes `apps/web/content/download.md` (git-ignored), which `layouts/download.njk` turns into one card per system. The page marks the card for the visitor's system; on a Mac in Chrome or Edge, which report the chip, it puts the matching `.dmg` first. Safari doesn't, so Apple Silicon stays first there.

- The `Sites` workflow runs on `release: published` as well as pushes to `main`, so publishing a release redeploys the site from `main`.
- In CI, a failed request to GitHub fails the site build, so a deploy never swaps real links for "no release yet". Locally it only warns. `GH_TOKEN` or `GITHUB_TOKEN` raises the API's rate limit.
- With nothing published, the page says the first release isn't out yet and links to building from source.

## Signing and notarization

Every secret is optional. Without them the workflow still builds, unsigned. With them, macOS builds are signed with your Developer ID and notarized by Apple, and Windows builds are signed.

| Secret | What it is |
| --- | --- |
| `CSC_LINK` | The macOS "Developer ID Application" certificate and its private key, as a `.p12` file, base64-encoded |
| `CSC_KEY_PASSWORD` | The password you set when exporting the `.p12` |
| `APPLE_API_KEY` | The contents of the App Store Connect API key file (`AuthKey_XXXXXXXXXX.p8`), for notarization |
| `APPLE_API_KEY_ID` | That key's ID (10 characters) |
| `APPLE_API_ISSUER` | Your team's Issuer ID (a UUID) |
| `WIN_CSC_LINK` | The Windows code-signing certificate as a `.pfx` file, base64-encoded |
| `WIN_CSC_KEY_PASSWORD` | The `.pfx` password |

When `CSC_LINK` is empty for a job, the workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so electron-builder builds unsigned instead of looking for a certificate on the runner. When `APPLE_API_KEY` is set, the macOS job writes it to `~/private_keys/AuthKey.p8` and adds `-c.mac.notarize=true`; `notarize` is `false` in `apps/desktop/package.json` so local builds don't try to notarize.

### macOS signing certificate

You need a paid [Apple Developer Program](https://developer.apple.com/programs/) membership ($99 a year). Only the team's Account Holder can create a Developer ID certificate.

1. On a Mac, open Xcode → **Settings** → **Accounts**, select the team, click **Manage Certificates**, then **+** → **Developer ID Application**. (Without Xcode: create a certificate signing request in Keychain Access → **Certificate Assistant**, then create the certificate at [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates) and double-click the download.)
2. Open Keychain Access → **login** → **My Certificates**. Find "Developer ID Application: *your name* (*team ID*)" and expand it to check the private key is under it.
3. Right-click the certificate (not the key) → **Export**, choose **Personal Information Exchange (.p12)**, and set a strong password.
4. Base64-encode it and save both as repository secrets (**Settings → Secrets and variables → Actions**, or with the GitHub CLI):

   ```bash
   base64 -i DeveloperID.p12 -o DeveloperID.p12.b64
   gh secret set CSC_LINK < DeveloperID.p12.b64
   gh secret set CSC_KEY_PASSWORD
   ```

5. Delete the `.p12` and `.b64` files, or keep them only in a password manager. The certificate can sign apps as you.

It must be a **Developer ID Application** certificate. "Apple Development", "Apple Distribution" and "Mac App Distribution" certificates don't work outside the Mac App Store.

### macOS notarization

Notarization uploads the signed app to Apple, which scans it and issues a ticket that Gatekeeper checks. The workflow uses an App Store Connect API key, not your Apple ID password.

1. In [App Store Connect](https://appstoreconnect.apple.com), go to **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys**, and click **+**.
2. Name it (for example "Startica notarization") and give it the **Developer** role.
3. Download the `.p8` file. Apple only lets you download it once.
4. Note the **Key ID** next to the key and the **Issuer ID** above the list.
5. Save the three secrets:

   ```bash
   gh secret set APPLE_API_KEY < AuthKey_XXXXXXXXXX.p8
   gh secret set APPLE_API_KEY_ID --body XXXXXXXXXX
   gh secret set APPLE_API_ISSUER --body 00000000-0000-0000-0000-000000000000
   ```

`APPLE_API_KEY` is the file's contents (the `-----BEGIN PRIVATE KEY-----` block), not a path.

After the next tagged build, download the `.dmg` from the draft and check it on a Mac:

```bash
spctl -a -vvv -t install /Applications/Startica.app
xcrun stapler validate /Applications/Startica.app
```

The first should say `accepted` and `source=Notarized Developer ID`. If it says `Unnotarized Developer ID`, the build was signed but not notarized: look for the notarization step in the macOS job's log.

### Why the hardened runtime entitlements

Notarization requires the hardened runtime (`hardenedRuntime: true`). Electron needs three exceptions to it, in `apps/desktop/resources/entitlements.mac.plist`, used for the app and every helper:

| Entitlement | Why |
| --- | --- |
| `com.apple.security.cs.allow-jit` | V8, the JavaScript engine, compiles code at run time. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | V8 also writes executable memory that isn't signed. |
| `com.apple.security.cs.disable-library-validation` | The local server runs the same Electron binary in Node mode (`ELECTRON_RUN_AS_NODE`) and loads the app's own modules, including native ones, that aren't signed by Apple. |

Don't add entitlements without a reason in the file's comment. The app isn't sandboxed (no `com.apple.security.app-sandbox`): it's distributed outside the Mac App Store.

### Windows signing

With `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` set, the Windows job signs the installer and the app. The workflow passes them to electron-builder as `CSC_LINK` and `CSC_KEY_PASSWORD`.

1. Buy an OV (organization validation) or EV code-signing certificate from a certificate authority.
2. If the certificate comes as an exportable `.pfx`, base64-encode it and save the secrets:

   ```bash
   base64 -i startica.pfx -o startica.pfx.b64
   gh secret set WIN_CSC_LINK < startica.pfx.b64
   gh secret set WIN_CSC_KEY_PASSWORD
   ```

> [!NOTE]
> Most certificate authorities now issue code-signing keys only on a hardware token or in a cloud key store, so there's no `.pfx` to export. Those need a different signing step in the workflow. The likely later option is [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/), which electron-builder supports through `win.azureSignOptions` and which needs an Azure account and identity validation. Neither is set up yet; discuss before adding one.

A signed installer still starts with little SmartScreen reputation, so some users may see the warning for the first releases.

## Unsigned builds

Without the secrets, the workflow builds the same files, unsigned. They install and run, but:

### macOS

A downloaded app that isn't signed and notarized is blocked by Gatekeeper. macOS says Apple couldn't verify that Startica is free of malware (on older versions, that it's from an "unidentified developer"). Users get past it in System Settings → **Privacy & Security** → **Open Anyway**. On Apple Silicon, macOS may instead say the app "is damaged and can't be opened"; removing the download quarantine works around that:

```bash
xattr -dr com.apple.quarantine /Applications/Startica.app
```

Auto-update doesn't work: macOS only installs an update signed by the same developer as the running app. The app finds and downloads the update, then fails to install it.

### Windows

SmartScreen shows "Windows protected your PC". Users click **More info**, then **Run anyway**. Auto-update works: electron-updater only checks the update's signature when the installed app was signed.

### Linux

Linux has no signing requirement. The AppImage runs after `chmod +x`; the `.deb` installs with `sudo apt install ./startica_*.deb`.

## Local builds

The release workflow runs the same build script you can run yourself. Installers land in `apps/desktop/dist/`. Build each OS on that OS (see [Cross-building](#cross-building)).

```bash
yarn build:desktop --mac --publish never
```

`yarn build:desktop` is `yarn workspace @startica/desktop build`. The build script compiles the Next.js server, assembles it in `apps/desktop/build/server`, and passes every other argument to electron-builder (see [Architecture](/contributing/architecture#packaging)).

| OS | Command | Output |
| --- | --- | --- |
| macOS | `yarn build:desktop --mac` | `.dmg` and `.zip` for `arm64` and `x64`, `latest-mac.yml`, plus `dist/mac*/Startica.app` |
| Windows | `yarn build:desktop --win` | NSIS `Setup .exe`, `latest.yml`, plus `dist/win-unpacked/` |
| Linux | `yarn build:desktop --linux` | `.AppImage`, `.deb`, `latest-linux.yml`, plus `dist/linux-unpacked/` |

Notes:

- **Nothing is uploaded** from your machine unless you pass `--publish always` with a `GH_TOKEN`. Pass `--publish never` to be sure.
- **Signing on your Mac.** If your keychain has a Developer ID Application certificate, electron-builder finds it and signs with it. To build unsigned anyway, set `CSC_IDENTITY_AUTO_DISCOVERY=false`. Notarization is off unless you pass `-c.mac.notarize=true` with `APPLE_API_KEY` (a path to the `.p8`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` set.
- **Your build checks for updates too.** Every packaged build contains `app-update.yml` pointing at this repository's releases. Once releases are published, a copy you built yourself offers to update to a newer official release. Turn off **Check for Updates Automatically** in its tray menu if you don't want that.
- `--no-package` stops after assembling the server, for debugging the standalone server without electron-builder:

  ```bash
  yarn workspace @startica/desktop build --no-package
  ```

### Cross-building

Build each OS's installer on that OS. electron-builder can produce some targets from another platform (for example Windows installers on Linux with Wine), but Startica doesn't support or test that: the bundled server's `node_modules` are traced and copied on the build machine, so platform-specific packages would come from the wrong OS. DMGs can only be built on macOS. If you don't have a Windows or Linux machine, use a manual workflow run.

## Test Windows and Linux builds

A manual run builds all three OSes on GitHub's runners without creating a release.

1. Go to **Actions → Release → Run workflow**, pick your branch (not a tag), and run it. Or:

   ```bash
   gh workflow run release.yml --ref your-branch
   ```

2. When it finishes, download the artifacts from the run's page, or:

   ```bash
   gh run download --name startica-Windows
   gh run download --name startica-Linux
   ```

3. On a real or virtual machine, install it and check: the installer runs; the window opens; the welcome wizard saves an API key (Windows DPAPI, or the Linux keyring); the tray icon and its menu work; closing the window keeps it in the tray; **Launch at Login** starts it hidden after logging in again; **Quit Startica** stops it; uninstalling leaves the data folder.

Report what you find on the pull request or in [GitHub Discussions](https://github.com/chriscasper/startica/discussions).

## Still to do

These need a decision or money first. Discuss before starting on any of them.

- **Buy the Apple Developer ID** ($99 a year) and set the five macOS secrets. Until then, macOS users see Gatekeeper warnings and can't auto-update.
- **Windows signing:** an exportable code-signing certificate, or Azure Trusted Signing with a change to the workflow.
- **Make the repository public**, so auto-update can read the releases.
- **Run the workflow by hand once** and test the Windows and Linux installers.
- **Point Get started at the download page** once a release is published: the home page, Get started and the install guide still lead with building from source.
