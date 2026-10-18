import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { withLogo } from "./logo.mjs";

test("the splash screen carries the current wordmark (run `yarn workspace @startica/desktop splash`)", () => {
  const html = readFileSync(new URL("splash.html", import.meta.url), "utf8");
  assert.equal(html, withLogo(html));
});
