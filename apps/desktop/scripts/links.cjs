// Checks the server folder's symbolic links before it goes into the app (build.mjs, after-pack.cjs).
// A link that leaves the folder, or points at nothing, works on the build machine at best: it's
// broken in the installed app, and code signing rejects links that leave the bundle.
const { existsSync, readdirSync, readlinkSync } = require("node:fs");
const { dirname, join, resolve, sep } = require("node:path");

exports.checkLinks = function checkLinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isSymbolicLink()) continue;
    const link = join(entry.parentPath, entry.name);
    const target = resolve(dirname(link), readlinkSync(link));
    if (target !== dir && !target.startsWith(dir + sep)) throw new Error(`${link} links outside ${dir}: ${target}`);
    if (!existsSync(target)) throw new Error(`${link} links to a missing file: ${target}`);
  }
};
