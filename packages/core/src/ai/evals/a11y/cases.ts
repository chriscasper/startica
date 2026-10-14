/**
 * Eval cases for Accessibility's fix suggestions (ARCHITECTURE.md section 9.4), run with
 * `yarn eval a11y`: the stand-in site's planted failures. Each suggested fix is swapped
 * into a page and checked with the same axe rule; it passes when the rule passes.
 */

export type FixCase = {
  id: string;
  rule: { id: string; help: string; description: string; criteria: string[]; level: string };
  /** The failing element's HTML, as axe reports it. */
  html: string;
  summary: string;
  pages: number;
  /** Extra page content the element needs (styles, a heading). */
  around?: { before?: string; after?: string };
};

export const FIX_CASES: FixCase[] = [
  {
    id: "logo-without-alt",
    rule: { id: "image-alt", help: "Images must have alternative text", description: "Ensure <img> elements have alternative text or a role of none or presentation", criteria: ["1.1.1"], level: "A" },
    html: '<img src="/logo.svg" width="120" height="32">',
    summary: "Fix any of the following:\n  Element does not have an alt attribute\n  aria-label attribute does not exist or is empty",
    pages: 5,
  },
  {
    id: "logo-link-without-name",
    rule: { id: "link-name", help: "Links must have discernible text", description: "Ensure links have discernible text", criteria: ["2.4.4", "4.1.2"], level: "A" },
    html: '<a href="/"><img src="/logo.svg" width="120" height="32"></a>',
    summary: "Fix all of the following:\n  Element is in tab order and does not have accessible text",
    pages: 5,
  },
  {
    id: "low-contrast-text",
    rule: { id: "color-contrast", help: "Elements must meet minimum color contrast ratio thresholds", description: "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds", criteria: ["1.4.3"], level: "AA" },
    html: '<p style="color:#b0b0b0;background:#ffffff">Free for one notebook.</p>',
    summary: "Fix any of the following:\n  Element has insufficient color contrast of 2.1 (foreground color: #b0b0b0, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1",
    pages: 1,
  },
  {
    id: "unlabeled-input",
    rule: { id: "label", help: "Form elements must have labels", description: "Ensure every form element has a label", criteria: ["4.1.2"], level: "A" },
    html: '<input type="email" name="email">',
    summary: "Fix any of the following:\n  Form element does not have an implicit (wrapped) <label>\n  Form element does not have an explicit <label>",
    pages: 1,
  },
  {
    id: "empty-button",
    rule: { id: "button-name", help: "Buttons must have discernible text", description: "Ensure buttons have discernible text", criteria: ["4.1.2"], level: "A" },
    html: '<button type="submit"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8h12"/></svg></button>',
    summary: "Fix any of the following:\n  Element does not have inner text that is visible to screen readers\n  aria-label attribute does not exist or is empty",
    pages: 1,
  },
];

/** A small page around the element, so axe checks it the way it was found. */
export const page = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Eval</title></head><body><main><h1>Eval</h1>${body}</main></body></html>`;
