import type { AdCreativeColors, AdCreativeText, AdTemplate } from "@startica/db/schema";

/**
 * Ad templates (ARCHITECTURE.md section 8.6, AD2): the AI draws the picture, a template adds the
 * words. Each template is a page of HTML and CSS sized to one ad size, rendered to an
 * image offscreen (render.ts). The picture and logo are files next to the page; nothing
 * is loaded from the network. A small script shrinks the words until they fit, then sets
 * data-ready on <html> so the renderer knows the page is done: "1", "small" (shrunk a lot)
 * or "overflow" (still doesn't fit at the smallest size).
 */

export type TemplateInput = {
  template: AdTemplate;
  width: number;
  height: number;
  text: AdCreativeText;
  colors: AdCreativeColors;
  /** File names next to the page, data: URLs, or null. */
  image: string | null;
  logo: string | null;
};

export const TEMPLATE_LABEL: Record<AdTemplate, { name: string; description: string }> = {
  overlay: { name: "Overlay", description: "The picture fills the ad; the words sit on a shaded edge." },
  panel: { name: "Panel", description: "The picture on one side, the words on a solid panel." },
  frame: { name: "Frame", description: "A solid background, the words above and the picture framed below." },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const isHexColor = (v: string) => HEX.test(v);

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// A file next to the page (rendering), or a data URL (the live preview in the app).
const source = (f: string | null) => (f && (/^[\w.-]+$/.test(f) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f)) ? f : null);

/** #rrggbb as "r, g, b" for rgba(). */
function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export type Shape = "wide" | "tall" | "square";
export const shapeOf = (width: number, height: number): Shape => (width / height > 1.4 ? "wide" : height / width > 1.4 ? "tall" : "square");

export function templateHtml(input: TemplateInput): string {
  const { width: w, height: h, text } = input;
  const colors: AdCreativeColors = {
    background: isHexColor(input.colors.background) ? input.colors.background : "#111827",
    text: isHexColor(input.colors.text) ? input.colors.text : "#ffffff",
    accent: isHexColor(input.colors.accent) ? input.colors.accent : "#f59e0b",
  };
  const shape = shapeOf(w, h);
  const unit = Math.min(w, h);
  const pad = Math.round(unit * 0.065);
  const image = source(input.image);
  const logo = source(input.logo);
  // The words: sizes relative to the ad's short side, shrunk by the fit script if they don't fit.
  const headline = Math.round(unit * (shape === "wide" ? 0.115 : 0.088));
  const subline = Math.round(headline * 0.46);
  const cta = Math.round(headline * 0.4);
  const ctaText = text.cta?.trim();
  const words = `
    <div class="words">
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
      <h1 data-fit style="font-size:${headline}px">${escape(text.headline.trim())}</h1>
      ${text.subline?.trim() ? `<p class="sub" data-fit style="font-size:${subline}px">${escape(text.subline.trim())}</p>` : ""}
      ${ctaText ? `<span class="cta" data-fit style="font-size:${cta}px">${escape(ctaText)}</span>` : ""}
    </div>`;
  const price = text.price?.trim() ? `<div class="price" style="font-size:${Math.round(subline * 1.05)}px">${escape(text.price.trim())}</div>` : "";
  const picture = image ? `<img class="picture" src="${image}" alt="">` : "";

  const layouts: Record<AdTemplate, string> = {
    overlay: `
      .ad { background: var(--bg); }
      .picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .scrim { position: absolute; inset: 0; background: ${
        shape === "wide"
          ? `linear-gradient(90deg, rgba(var(--bg-rgb), .92) 0%, rgba(var(--bg-rgb), .75) 42%, rgba(var(--bg-rgb), 0) 70%)`
          : `linear-gradient(0deg, rgba(var(--bg-rgb), .94) 0%, rgba(var(--bg-rgb), .78) 38%, rgba(var(--bg-rgb), 0) 66%)`
      }; }
      .words { position: absolute; ${shape === "wide" ? `left: ${pad}px; top: ${pad}px; bottom: ${pad}px; width: 52%; justify-content: center;` : `left: ${pad}px; right: ${pad}px; bottom: ${pad}px; max-height: ${shape === "tall" ? 40 : 48}%; justify-content: flex-end;`} }
      .words .logo { ${shape === "wide" ? "" : `position: fixed; top: ${pad}px; left: ${pad}px;`} }`,
    panel: `
      .ad { background: var(--bg); display: flex; flex-direction: ${shape === "wide" ? "row-reverse" : "column"}; }
      .media { position: relative; flex: 0 0 ${shape === "wide" ? 48 : shape === "tall" ? 58 : 56}%; overflow: hidden; background: rgba(var(--text-rgb), .08); }
      .picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .words { position: relative; flex: 1; padding: ${pad}px; justify-content: center; }`,
    frame: `
      .ad { background: var(--bg); display: flex; flex-direction: ${shape === "wide" ? "row" : "column"}; padding: ${pad}px; gap: ${pad}px; }
      .words { position: relative; flex: ${shape === "wide" ? "0 0 46%" : `0 0 ${shape === "tall" ? 34 : 38}%`}; justify-content: ${shape === "wide" ? "center" : "flex-start"}; }
      .media { position: relative; flex: 1; border-radius: ${Math.round(unit * 0.03)}px; overflow: hidden; background: rgba(var(--text-rgb), .08); box-shadow: 0 ${Math.round(unit * 0.012)}px ${Math.round(unit * 0.05)}px rgba(0, 0, 0, .28); }
      .picture { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }`,
  };

  const body =
    input.template === "overlay"
      ? `${picture}<div class="scrim"></div>${words}${price}`
      : input.template === "panel"
        ? `<div class="media">${picture}${price}</div>${words}`
        : `${words}<div class="media">${picture}${price}</div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<style>
  :root { --bg: ${colors.background}; --bg-rgb: ${rgb(colors.background)}; --text: ${colors.text}; --text-rgb: ${rgb(colors.text)}; --accent: ${colors.accent}; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${w}px; height: ${h}px; overflow: hidden; }
  body { font-family: Inter, "SF Pro Display", -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }
  .ad { position: relative; width: ${w}px; height: ${h}px; overflow: hidden; }
  .words { display: flex; flex-direction: column; align-items: flex-start; gap: ${Math.round(unit * 0.022)}px; overflow: hidden; z-index: 1; }
  .logo { height: ${Math.round(unit * 0.075)}px; max-width: ${Math.round(unit * 0.4)}px; object-fit: contain; margin-bottom: ${Math.round(unit * 0.01)}px; }
  h1 { font-weight: 800; line-height: 1.04; letter-spacing: -0.02em; overflow-wrap: anywhere; text-wrap: balance; }
  .sub { font-weight: 500; line-height: 1.3; opacity: .9; overflow-wrap: anywhere; text-wrap: pretty; }
  .cta { display: inline-block; margin-top: ${Math.round(unit * 0.012)}px; padding: .7em 1.3em; border-radius: 999px; background: var(--accent); color: var(--bg); font-weight: 700; line-height: 1; white-space: nowrap; }
  .price { position: absolute; top: ${pad}px; right: ${pad}px; z-index: 2; padding: .45em .8em; border-radius: .5em; background: var(--accent); color: var(--bg); font-weight: 800; line-height: 1; }
  ${layouts[input.template]}
</style></head>
<body><div class="ad">${body}</div>
<script>
(async () => {
  await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  if (document.fonts) await document.fonts.ready;
  const box = document.querySelector(".words");
  const fits = () => box.scrollHeight <= box.clientHeight + 1 && box.scrollWidth <= box.clientWidth + 1 && [...box.querySelectorAll("[data-fit]")].every((el) => el.scrollWidth <= el.clientWidth + 1 || el.classList.contains("cta"));
  const items = [...box.querySelectorAll("[data-fit]")].map((el) => [el, parseFloat(el.style.fontSize)]);
  let scale = 1;
  for (; !fits() && scale > 0.4; scale -= 0.04) for (const [el, size] of items) el.style.fontSize = Math.round(size * scale) + "px";
  // "small": shrunk to under 70% of its size to fit, so it may be hard to read at a glance.
  document.documentElement.dataset.ready = !fits() ? "overflow" : scale < 0.7 ? "small" : "1";
})();
</script>
</body></html>`;
}
