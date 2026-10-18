// Puts the current wordmark between splash.html's logo markers (scripts/splash.mjs, splash.test.mjs).
import { logoSvg } from "@startica/brand/logo";

const MARKERS = /<!-- logo:start -->[\s\S]*?<!-- logo:end -->/;

/** @param {string} html */
export function withLogo(html) {
  if (!MARKERS.test(html)) throw new Error("splash.html has lost its logo markers");
  return html.replace(MARKERS, () => `<!-- logo:start -->${logoSvg()}<!-- logo:end -->`);
}
