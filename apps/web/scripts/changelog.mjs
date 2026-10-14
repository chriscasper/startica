// Copies the repo's CHANGELOG.md into content/changelog.md (git-ignored) so /changelog always matches the repo.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../../CHANGELOG.md');
const target = path.resolve(here, '../content/changelog.md');

let body;
try {
  body = (await readFile(source, 'utf8'))
    .replace(/^# .*\n+/, '') // the page layout renders the title
    .replace(/^All notable changes.*\n+/m, '');
} catch {
  body = 'No releases yet.\n';
}

await writeFile(
  target,
  `---
title: Changelog
layout: page
eyebrow: Changelog
lede: Every notable change to Startica, newest first.
description: Release notes for Startica, the open-source AI co-founder for everything after you ship.
---

<!-- Generated from CHANGELOG.md by scripts/changelog.mjs. Edit CHANGELOG.md at the repo root instead. -->

${body}`,
);
console.log('Wrote content/changelog.md');
