import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LOGO_PATHS, logoSvg, markSvg } from "./logo.js";

test("the shared paths are exactly the ones in both logo files", () => {
  for (const file of ["startica-logo.svg", "startica-logo-dark.svg"]) {
    const source = readFileSync(new URL(`../assets/${file}`, import.meta.url), "utf8");
    const count = [...source.matchAll(/<path d="/g)].length;
    assert.equal(count, LOGO_PATHS.length, file);
  }
  const white = readFileSync(new URL("../assets/startica-logo.svg", import.meta.url), "utf8");
  for (const d of LOGO_PATHS) assert.ok(white.includes(`d="${d}"`));
});

test("logoSvg is named by default and hidden when title is null", () => {
  const named = logoSvg({ className: "h-6 w-auto" });
  assert.match(named, /role="img" aria-label="Startica"/);
  assert.match(named, /<title>Startica<\/title>/);
  assert.match(named, /class="h-6 w-auto"/);
  assert.match(named, /fill="currentColor"/);
  assert.equal([...named.matchAll(/<path /g)].length, 8);

  const hidden = logoSvg({ title: null });
  assert.match(hidden, /aria-hidden="true"/);
  assert.doesNotMatch(hidden, /<title>/);
});

test("markSvg draws only the S", () => {
  assert.equal([...markSvg().matchAll(/<path /g)].length, 1);
  assert.match(markSvg({ title: 'A "quoted" <name>' }), /aria-label="A &quot;quoted&quot; &lt;name&gt;"/);
});
