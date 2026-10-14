---
title: Install from source
description: Clone the Startica repository, install dependencies, and run the app in dev mode or build an installer for your own computer.
layout: doc
---

There are no published installers yet. You clone the repository and either run Startica in dev mode or build an unsigned installer for your own computer. Both take a few minutes. Check the [requirements](/getting-started/requirements) first.

## Get the code

```bash
git clone https://github.com/chriscasper/startica.git
cd startica
corepack enable
yarn
```

`yarn` installs every workspace's dependencies. It also downloads the Electron binary. There's no env file to set up: you enter your keys in the app, in the welcome wizard or in Settings.

## Option 1: run in dev mode

```bash
yarn dev:desktop
```

This opens the Startica window. The first start takes a little longer while Next.js compiles pages. Keep the terminal open: closing it stops the app. The terminal also shows the app's log.

On a fresh install, the window opens on **Welcome to Startica**, a three-step setup: connect an AI provider (Claude or OpenAI), add your product, and a few extras. See [First run](/getting-started/first-run).

Dev mode is the simplest way to start, and it's what you'll use to [update](/getting-started/updating) later. It uses the same data folder as a built copy, so you can switch between them.

## Option 2: build your own installer

Build an installer for the computer you're on:

```bash
yarn build:desktop --mac
```

Use `--win` on Windows and `--linux` on Linux. The build compiles the app, bundles the server and its database migrations, then packages everything with electron-builder. It takes a few minutes.

The installer lands in `apps/desktop/dist/`:

| Flag | Output |
|---|---|
| `--mac` | A `.dmg` disk image (plus a `.zip` of the app), for Apple Silicon and Intel |
| `--win` | An NSIS installer `.exe` (lets you choose the install folder) |
| `--linux` | An `.AppImage` and a `.deb` package |

> [!NOTE]
> Build on the OS you're targeting. Cross-building (for example a Windows installer on a Mac) hasn't been tested. The Windows and Linux builds haven't been run at all yet.

### macOS

Open the `.dmg` and drag Startica to Applications. Then open it from Applications.

The build isn't signed or notarized by Apple. An app you built yourself usually opens without a warning, because macOS only checks apps that were downloaded. If you copy the `.dmg` to another Mac, Gatekeeper blocks it. To open it anyway, try to open it once, then go to System Settings → Privacy & Security and click **Open Anyway**.

### Windows

Run the `.exe` and follow the installer. Windows SmartScreen may show "Windows protected your PC" because the installer isn't code-signed. Click **More info**, then **Run anyway**. Untested.

### Linux

Make the AppImage executable, then run it:

```bash
chmod +x apps/desktop/dist/*.AppImage
```

```bash
./apps/desktop/dist/Startica-*.AppImage
```

If it fails to start, you may need FUSE (`libfuse2` on recent Ubuntu). Untested.

> [!NOTE]
> A copy you built yourself also checks this repository's GitHub releases for updates. See [Updating](/getting-started/updating#when-an-update-is-not-installed) for what that means and how to turn it off.

## Running in a browser instead

You can run Startica's server without the desktop window and use it in your browser. This is mostly for debugging.

```bash
yarn dev:desktop-web
```

The terminal prints a one-time link like `http://127.0.0.1:58300/?token=…`. Open it once in your browser. It sets a cookie for this run, and you can then use the app normally. Each start prints a new token.

Browser mode differs from the desktop app in a few ways:

- It encrypts secrets with a key file in the data folder, not the OS keychain. Secrets saved in one mode can't be read in the other. See [Troubleshooting](/troubleshooting).
- It uses the same port (58300) as the desktop app, so you can't run both at once.
- There's no tray icon. Background jobs run while the terminal process runs.
- The welcome wizard has no **Look around with a sample product first** link and no launch-at-login option. To see the sample product, load it into its own data folder with `yarn seed:demo` (see [Try the demo](/guides/demo-mode#in-a-browser-run)).

## If the window never opens

Code editors like VS Code and Cursor set `ELECTRON_RUN_AS_NODE=1` in their built-in terminals. With that variable set, Electron starts as plain Node instead of as an app, and you get a JavaScript error instead of a window.

`yarn dev:desktop` clears the variable for you. If you launch Electron or a built copy some other way from an editor terminal, clear it first:

```bash
unset ELECTRON_RUN_AS_NODE
```

On Windows PowerShell:

```text
Remove-Item Env:ELECTRON_RUN_AS_NODE
```

## Next

Startica is installed. Continue with the [first run](/getting-started/first-run), or [try the demo](/guides/demo-mode) first.
