// Runs after `simple build`: converts callouts in the built HTML, then builds the Pagefind search index.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pagefind from 'pagefind';
import { convertCallouts } from './callouts.mjs';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(full);
    else if (entry.name.endsWith('.html')) yield full;
  }
}

let converted = 0;
for await (const file of htmlFiles(dist)) {
  const html = await readFile(file, 'utf8');
  const next = convertCallouts(html);
  if (next !== html) {
    await writeFile(file, next);
    converted++;
  }
}
console.log(`Callouts: updated ${converted} page(s)`);

const { index, errors } = await pagefind.createIndex({});
if (errors.length) throw new Error(errors.join('\n'));
const added = await index.addDirectory({ path: dist });
if (added.errors.length) throw new Error(added.errors.join('\n'));
await index.writeFiles({ outputPath: path.join(dist, 'pagefind') });
await pagefind.close();
console.log(`Search: indexed ${added.page_count} page(s)`);
