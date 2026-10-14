// Turns GitHub alert blockquotes (> [!NOTE]) into styled callouts.
// Used by postbuild.mjs on the built HTML; public/docs.js does the same in the browser for `yarn dev:docs`.
export const CALLOUT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];

const OPEN = new RegExp(`<blockquote>\\s*<p>\\[!(${CALLOUT_TYPES.join('|')})\\]\\s*(?:<br\\s*/?>)?\\s*`, 'g');

export function convertCallouts(html) {
  let out = '';
  let last = 0;
  for (const match of html.matchAll(OPEN)) {
    if (match.index < last) continue;
    const close = html.indexOf('</blockquote>', match.index);
    if (close === -1) break;
    const type = match[1].toLowerCase();
    const label = type[0].toUpperCase() + type.slice(1);
    const body = html
      .slice(match.index + match[0].length, close)
      .replace(/^\s*<\/p>\s*/, ''); // "[!NOTE]" was alone on its line
    out += html.slice(last, match.index);
    out += `<div class="callout callout-${type}" role="note"><p class="callout-title">${label}</p>${body.startsWith('<') ? '' : '<p>'}${body}</div>`;
    last = close + '</blockquote>'.length;
  }
  return out + html.slice(last);
}
