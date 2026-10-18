// Copies the Startica wordmark from @startica/brand into loading/splash.html (run after the logo changes).
// The packaged app has no node_modules for its own window code, so the page carries its own copy.
// Usage: yarn workspace @startica/desktop splash
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { withLogo } from "../loading/logo.mjs";

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "loading", "splash.html");
writeFileSync(file, withLogo(readFileSync(file, "utf8")));
