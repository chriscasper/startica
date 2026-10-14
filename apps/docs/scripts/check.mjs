// Docs checks, run in CI before building:
// - every page is in the sidebar (site.docsNav) and every sidebar entry has a page
// - every root-relative Markdown link points to a page that exists
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../simple.config.js';

const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../content');

async function* mdFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* mdFiles(full);
    else if (entry.name.endsWith('.md')) yield full;
  }
}

const urlFor = (file) => {
  const rel = path.relative(content, file).replace(/\\/g, '/').replace(/\.md$/, '');
  return rel === 'index' ? '/' : '/' + rel.replace(/\/index$/, '');
};

const files = [];
for await (const file of mdFiles(content)) files.push(file);
const pages = new Set(files.map(urlFor).filter((url) => url !== '/404'));

const problems = [];
const nav = new Set(config.site.docsNav.flatMap((group) => group.items.map((item) => item.url)));
for (const url of pages) if (url !== '/' && !nav.has(url)) problems.push(`Not in site.docsNav: ${url}`);
for (const url of nav) if (!pages.has(url)) problems.push(`In site.docsNav but no page: ${url}`);

const LINK = /\]\((\/[^)\s#]*)(#[^)\s]*)?\)/g;
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const [, target] of text.matchAll(LINK)) {
    const normalized = target.length > 1 ? target.replace(/\/$/, '') : target;
    if (/\.(md|txt|xml|png|svg|jpg)$/.test(normalized)) continue;
    if (!pages.has(normalized)) problems.push(`${path.relative(content, file)}: broken link ${target}`);
  }
}

for (const problem of problems) console.error(problem);
if (problems.length) process.exit(1);
console.log(`Docs OK: ${pages.size} pages, sidebar and internal links match`);
