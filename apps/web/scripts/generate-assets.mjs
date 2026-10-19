/**
 * Generates the favicons (both sites) and og.png for mystartica.com and the docs site,
 * from the logo shapes in packages/brand, and the downloads on /brand (public/brand/). Runs as part of `yarn build`.
 */
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { LOGO_PATHS, LOGO_VIEWBOX, MARK_PATH, MARK_VIEWBOX } from '@startica/brand/logo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const docsPublicDir = path.resolve(__dirname, '../../docs/public');

const paths = (list) => list.map((d) => `<path d="${d}"/>`).join('');

// Ember "S" from the wordmark on a navy square.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Startica">
  <rect width="512" height="512" fill="#01314e"/>
  <svg x="96" y="96" width="320" height="320" viewBox="${MARK_VIEWBOX}" fill="#f15e34">${paths([MARK_PATH])}</svg>
</svg>
`;

// The wordmark is 491 × 98; at 96 px tall it's 481 px wide.
const ogSvg = ({ label, host }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="3%" stop-color="#01314e"/>
      <stop offset="98%" stop-color="#00517c"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="560" width="300" height="70" fill="#f47a52"/>
  <rect x="300" y="560" width="300" height="70" fill="#3ec79c"/>
  <rect x="600" y="560" width="300" height="70" fill="#4fb3e0"/>
  <rect x="900" y="560" width="300" height="70" fill="#a996ff"/>
  <svg x="80" y="176" width="481" height="96" viewBox="${LOGO_VIEWBOX}" fill="#fbf5e9">${paths(LOGO_PATHS)}</svg>
  ${label ? `<text x="585" y="270" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#fab53b">${label}</text>` : ''}
  <text x="80" y="350" font-family="Arial, sans-serif" font-size="34" fill="#e3e7e4">Your AI, harnessed for everything after you ship.</text>
  <text x="80" y="400" font-family="Arial, sans-serif" font-size="26" fill="#a7b8c6">Marketing · SEO &amp; GEO · Accessibility · Security · Open source</text>
  <text x="80" y="520" font-family="Arial, sans-serif" font-size="24" fill="#fab53b">${host}</text>
</svg>
`;

for (const dir of [publicDir, docsPublicDir]) {
  await writeFile(path.join(dir, 'favicon.svg'), faviconSvg);
  await sharp(Buffer.from(faviconSvg)).png().resize(512, 512).toFile(path.join(dir, 'favicon.png'));
}
await sharp(Buffer.from(ogSvg({ host: 'mystartica.com' }))).png().toFile(path.join(publicDir, 'og.png'));
await sharp(Buffer.from(ogSvg({ label: 'Docs', host: 'docs.mystartica.com' }))).png().toFile(path.join(docsPublicDir, 'og.png'));
// Downloads for /brand: the wordmark in navy and in cream, the S mark, and the app icon.
const brandDir = path.join(publicDir, 'brand');
await mkdir(brandDir, { recursive: true });
const flat = (viewBox, list, fill, [w, h]) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}" fill="${fill}" role="img" aria-label="Startica"><title>Startica</title>${paths(list)}</svg>\n`;
const brandFiles = [
  ['startica-logo', LOGO_VIEWBOX, LOGO_PATHS, '#01314e', [491, 98]],
  ['startica-logo-light', LOGO_VIEWBOX, LOGO_PATHS, '#fbf5e9', [491, 98]],
  ['startica-mark', MARK_VIEWBOX, [MARK_PATH], '#f15e34', [88, 88]],
];
for (const [name, viewBox, list, fill, size] of brandFiles) {
  const svg = flat(viewBox, list, fill, size);
  await writeFile(path.join(brandDir, `${name}.svg`), svg);
  await sharp(Buffer.from(svg), { density: 72 * 4 }).png().toFile(path.join(brandDir, `${name}.png`));
}
const desktopAssets = path.resolve(__dirname, '../../desktop/assets');
await copyFile(path.join(desktopAssets, 'icon.svg'), path.join(brandDir, 'startica-app-icon.svg'));
await copyFile(path.join(desktopAssets, 'icon.png'), path.join(brandDir, 'startica-app-icon.png'));

console.log('Wrote favicon.svg, favicon.png and og.png for both sites, and the /brand downloads');
