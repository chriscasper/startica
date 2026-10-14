import { createRequire } from "node:module";
import { join } from "node:path";
import { criteriaFromTags } from "./results.ts";

/**
 * WCAG success criteria and the standards built on them (ARCHITECTURE.md section 9.3), for the
 * compliance views: which criteria a profile includes, and which ones axe-core can test
 * at all. Manual statuses per criterion come with A4's checklist.
 */

export type Level = "A" | "AA" | "AAA";
/** `since`: the WCAG version that added it. 4.1.1 Parsing was removed in 2.2. */
export type Criterion = { id: string; title: string; level: Level; since: "2.0" | "2.1" | "2.2"; removedIn?: "2.2" };

const c = (id: string, title: string, level: Level, since: Criterion["since"] = "2.0", removedIn?: "2.2"): Criterion => ({ id, title, level, since, ...(removedIn ? { removedIn } : {}) });

export const WCAG_CRITERIA: Criterion[] = [
  c("1.1.1", "Non-text Content", "A"),
  c("1.2.1", "Audio-only and Video-only (Prerecorded)", "A"),
  c("1.2.2", "Captions (Prerecorded)", "A"),
  c("1.2.3", "Audio Description or Media Alternative (Prerecorded)", "A"),
  c("1.2.4", "Captions (Live)", "AA"),
  c("1.2.5", "Audio Description (Prerecorded)", "AA"),
  c("1.2.6", "Sign Language (Prerecorded)", "AAA"),
  c("1.2.7", "Extended Audio Description (Prerecorded)", "AAA"),
  c("1.2.8", "Media Alternative (Prerecorded)", "AAA"),
  c("1.2.9", "Audio-only (Live)", "AAA"),
  c("1.3.1", "Info and Relationships", "A"),
  c("1.3.2", "Meaningful Sequence", "A"),
  c("1.3.3", "Sensory Characteristics", "A"),
  c("1.3.4", "Orientation", "AA", "2.1"),
  c("1.3.5", "Identify Input Purpose", "AA", "2.1"),
  c("1.3.6", "Identify Purpose", "AAA", "2.1"),
  c("1.4.1", "Use of Color", "A"),
  c("1.4.2", "Audio Control", "A"),
  c("1.4.3", "Contrast (Minimum)", "AA"),
  c("1.4.4", "Resize Text", "AA"),
  c("1.4.5", "Images of Text", "AA"),
  c("1.4.6", "Contrast (Enhanced)", "AAA"),
  c("1.4.7", "Low or No Background Audio", "AAA"),
  c("1.4.8", "Visual Presentation", "AAA"),
  c("1.4.9", "Images of Text (No Exception)", "AAA"),
  c("1.4.10", "Reflow", "AA", "2.1"),
  c("1.4.11", "Non-text Contrast", "AA", "2.1"),
  c("1.4.12", "Text Spacing", "AA", "2.1"),
  c("1.4.13", "Content on Hover or Focus", "AA", "2.1"),
  c("2.1.1", "Keyboard", "A"),
  c("2.1.2", "No Keyboard Trap", "A"),
  c("2.1.3", "Keyboard (No Exception)", "AAA"),
  c("2.1.4", "Character Key Shortcuts", "A", "2.1"),
  c("2.2.1", "Timing Adjustable", "A"),
  c("2.2.2", "Pause, Stop, Hide", "A"),
  c("2.2.3", "No Timing", "AAA"),
  c("2.2.4", "Interruptions", "AAA"),
  c("2.2.5", "Re-authenticating", "AAA"),
  c("2.2.6", "Timeouts", "AAA", "2.1"),
  c("2.3.1", "Three Flashes or Below Threshold", "A"),
  c("2.3.2", "Three Flashes", "AAA"),
  c("2.3.3", "Animation from Interactions", "AAA", "2.1"),
  c("2.4.1", "Bypass Blocks", "A"),
  c("2.4.2", "Page Titled", "A"),
  c("2.4.3", "Focus Order", "A"),
  c("2.4.4", "Link Purpose (In Context)", "A"),
  c("2.4.5", "Multiple Ways", "AA"),
  c("2.4.6", "Headings and Labels", "AA"),
  c("2.4.7", "Focus Visible", "AA"),
  c("2.4.8", "Location", "AAA"),
  c("2.4.9", "Link Purpose (Link Only)", "AAA"),
  c("2.4.10", "Section Headings", "AAA"),
  c("2.4.11", "Focus Not Obscured (Minimum)", "AA", "2.2"),
  c("2.4.12", "Focus Not Obscured (Enhanced)", "AAA", "2.2"),
  c("2.4.13", "Focus Appearance", "AAA", "2.2"),
  c("2.5.1", "Pointer Gestures", "A", "2.1"),
  c("2.5.2", "Pointer Cancellation", "A", "2.1"),
  c("2.5.3", "Label in Name", "A", "2.1"),
  c("2.5.4", "Motion Actuation", "A", "2.1"),
  c("2.5.5", "Target Size (Enhanced)", "AAA", "2.1"),
  c("2.5.6", "Concurrent Input Mechanisms", "AAA", "2.1"),
  c("2.5.7", "Dragging Movements", "AA", "2.2"),
  c("2.5.8", "Target Size (Minimum)", "AA", "2.2"),
  c("3.1.1", "Language of Page", "A"),
  c("3.1.2", "Language of Parts", "AA"),
  c("3.1.3", "Unusual Words", "AAA"),
  c("3.1.4", "Abbreviations", "AAA"),
  c("3.1.5", "Reading Level", "AAA"),
  c("3.1.6", "Pronunciation", "AAA"),
  c("3.2.1", "On Focus", "A"),
  c("3.2.2", "On Input", "A"),
  c("3.2.3", "Consistent Navigation", "AA"),
  c("3.2.4", "Consistent Identification", "AA"),
  c("3.2.5", "Change on Request", "AAA"),
  c("3.2.6", "Consistent Help", "A", "2.2"),
  c("3.3.1", "Error Identification", "A"),
  c("3.3.2", "Labels or Instructions", "A"),
  c("3.3.3", "Error Suggestion", "AA"),
  c("3.3.4", "Error Prevention (Legal, Financial, Data)", "AA"),
  c("3.3.5", "Help", "AAA"),
  c("3.3.6", "Error Prevention (All)", "AAA"),
  c("3.3.7", "Redundant Entry", "A", "2.2"),
  c("3.3.8", "Accessible Authentication (Minimum)", "AA", "2.2"),
  c("3.3.9", "Accessible Authentication (Enhanced)", "AAA", "2.2"),
  c("4.1.1", "Parsing", "A", "2.0", "2.2"),
  c("4.1.2", "Name, Role, Value", "A"),
  c("4.1.3", "Status Messages", "AA", "2.1"),
];

/** The standards a site can be viewed against. Legal scope changes: the docs link the sources; Startica gives no legal advice. */
export const PROFILES = {
  wcag22: { label: "WCAG 2.2", version: "2.2", note: "The current version of WCAG." },
  en301549: { label: "EN 301 549 (European Accessibility Act)", version: "2.1", note: "Its web clauses follow WCAG 2.1 level AA." },
  ada2: { label: "ADA Title II", version: "2.1", note: "The Department of Justice rule references WCAG 2.1 level AA." },
  s508: { label: "Section 508", version: "2.0", note: "The Revised 508 Standards incorporate WCAG 2.0 level AA." },
} as const;
export type ProfileId = keyof typeof PROFILES;
export const isProfile = (v: unknown): v is ProfileId => typeof v === "string" && v in PROFILES;

const ORDER = { "2.0": 0, "2.1": 1, "2.2": 2 } as const;
const LEVELS: Record<Level, number> = { A: 0, AA: 1, AAA: 2 };

/** The criteria a profile includes: its WCAG version's, at A and AA (AAA too when the site checks it). */
export function profileCriteria(profile: ProfileId, includeAaa = false): Criterion[] {
  const version = PROFILES[profile].version;
  return WCAG_CRITERIA.filter(
    (x) => ORDER[x.since] <= ORDER[version] && !(x.removedIn && ORDER[x.removedIn] <= ORDER[version]) && LEVELS[x.level] <= (includeAaa && profile === "wcag22" ? 2 : 1),
  );
}

let covered: Set<string> | undefined;
/** Criteria at least one axe-core rule tests (from the pinned axe-core's own rule metadata). */
export function axeCoveredCriteria(): Set<string> {
  if (covered) return covered;
  try {
    // Resolved at run time from the working directory, like the scanner's axe source.
    const axe = createRequire(join(process.cwd(), "noop.js"))(["axe-core"].join("")) as { getRules: () => { tags: string[] }[] };
    covered = new Set(axe.getRules().flatMap((r) => criteriaFromTags(r.tags)));
  } catch {
    covered = new Set(createRequire(import.meta.url)("axe-core").getRules().flatMap((r: { tags: string[] }) => criteriaFromTags(r.tags)));
  }
  return covered!;
}

export type CriterionStatus = "failing" | "needs_review" | "no_failures" | "manual";

export const STATUS_LABEL: Record<CriterionStatus, string> = {
  failing: "Failing",
  needs_review: "Needs review",
  no_failures: "No automated failures",
  manual: "Not testable automatically",
};

/**
 * Each criterion's automated status from the open groups: failing (an open issue maps to
 * it), needs review (an undecided review item does), no automated failures (axe tests it
 * and found nothing), or not testable automatically (a person has to check it).
 */
export function complianceView(
  profile: ProfileId,
  groups: { criteria: string[]; kind: "violation" | "needs_review"; status: string; reviewStatus: string | null; pagesCount: number }[],
  includeAaa = false,
) {
  const axe = axeCoveredCriteria();
  const failing = new Map<string, number>();
  const review = new Map<string, number>();
  for (const g of groups) {
    if (g.status !== "open") continue;
    const fails = g.kind === "violation" || g.reviewStatus === "fail";
    const undecided = g.kind === "needs_review" && !g.reviewStatus;
    for (const id of g.criteria) {
      if (fails) failing.set(id, (failing.get(id) ?? 0) + 1);
      else if (undecided) review.set(id, (review.get(id) ?? 0) + 1);
    }
  }
  return profileCriteria(profile, includeAaa).map((x) => {
    const status: CriterionStatus = failing.has(x.id) ? "failing" : review.has(x.id) ? "needs_review" : axe.has(x.id) ? "no_failures" : "manual";
    return { ...x, status, issues: failing.get(x.id) ?? 0, reviews: review.get(x.id) ?? 0 };
  });
}

// --- Manual testing (A4)

/** A short "how to check it by hand" for each criterion at A and AA (AAA links to W3C's Understanding page). */
export const HOW_TO_TEST: Record<string, string> = {
  "1.1.1": "Every image, icon and image button has a text alternative that serves the same purpose; decorative images have empty alt text.",
  "1.2.1": "Audio-only content has a transcript; video-only content has a transcript or an audio track describing it.",
  "1.2.2": "Prerecorded videos with sound have accurate, synchronized captions (not only auto-captions).",
  "1.2.3": "Prerecorded videos have audio description or a full text alternative of what's shown.",
  "1.2.4": "Live video with sound has live captions.",
  "1.2.5": "Prerecorded videos have audio description of important visual information.",
  "1.3.1": "Headings, lists, tables, labels and groups are marked up as such (not just styled); check with a screen reader or the accessibility tree.",
  "1.3.2": "Reading the page in DOM order (or with a screen reader) makes sense; the visual order doesn't change the meaning.",
  "1.3.3": "Instructions don't rely only on shape, size, position or sound (\"click the round button on the right\").",
  "1.3.4": "The site works in both portrait and landscape on a phone or tablet.",
  "1.3.5": "Fields for the user's own details (name, email, address) have the right autocomplete attribute.",
  "1.4.1": "Color isn't the only way to show information (links in text, errors, required fields, charts).",
  "1.4.2": "Audio that plays by itself for more than 3 seconds can be paused or muted.",
  "1.4.3": "Text has a contrast ratio of at least 4.5:1 (3:1 for large text), including text over images and on hover or focus.",
  "1.4.4": "Text can be zoomed to 200% without losing content or features.",
  "1.4.5": "Text is real text, not pictures of text (logos excepted).",
  "1.4.10": "At 320 CSS pixels wide (400% zoom on a 1280px window), content reflows into one column without horizontal scrolling.",
  "1.4.11": "Buttons, fields, focus indicators and meaningful graphics have at least 3:1 contrast against what's around them.",
  "1.4.12": "Nothing is cut off or overlaps when line height, paragraph, letter and word spacing are increased (use a text-spacing bookmarklet).",
  "1.4.13": "Tooltips and popups shown on hover or focus can be dismissed (Esc), can be hovered themselves, and stay until dismissed.",
  "2.1.1": "Everything can be done with the keyboard alone: Tab, Shift+Tab, Enter, Space and the arrow keys.",
  "2.1.2": "Keyboard focus never gets stuck in a component (widgets, embeds, modals).",
  "2.1.4": "Single-key shortcuts can be turned off, remapped, or only work when their component has focus.",
  "2.2.1": "Time limits can be turned off, adjusted or extended (with a warning before time runs out).",
  "2.2.2": "Moving, blinking, scrolling or auto-updating content can be paused, stopped or hidden.",
  "2.3.1": "Nothing flashes more than three times a second.",
  "2.4.1": "There's a way to skip repeated blocks (a skip link, landmarks or headings).",
  "2.4.2": "Each page has a title that says what it is.",
  "2.4.3": "Tabbing moves through the page in an order that makes sense; focus goes into and back out of dialogs properly.",
  "2.4.4": "Each link's purpose is clear from its text or its surroundings (no bare \"click here\" or \"read more\").",
  "2.4.5": "There's more than one way to find a page (navigation, search, sitemap, links).",
  "2.4.6": "Headings and labels describe their topic or purpose.",
  "2.4.7": "Keyboard focus is always visible.",
  "2.4.11": "The focused element is never completely hidden by sticky headers, footers or cookie banners.",
  "2.5.1": "Anything done with a multi-finger or path gesture (pinch, swipe) can also be done with a single tap or click.",
  "2.5.2": "Actions happen on release, not on touch-down, or can be aborted or undone.",
  "2.5.3": "Each control's accessible name contains its visible label text (voice users can say what they see).",
  "2.5.4": "Anything done by shaking or tilting the device can also be done with a control, and motion can be turned off.",
  "2.5.7": "Anything done by dragging can also be done with single clicks or taps.",
  "2.5.8": "Click and tap targets are at least 24×24 CSS pixels, or have enough space around them.",
  "3.1.1": "The page's language is set in the html lang attribute.",
  "3.1.2": "Passages in another language are marked with their own lang attribute.",
  "3.2.1": "Moving focus to an element doesn't change the page or context by itself.",
  "3.2.2": "Changing a field or option doesn't change the page or context unless the user was told beforehand.",
  "3.2.3": "Navigation repeated across pages appears in the same order each time.",
  "3.2.4": "Components with the same function are named and labeled consistently across pages.",
  "3.2.6": "Help (contact details, chat, a help link) appears in the same place on every page that has it.",
  "3.3.1": "Errors in forms are identified and described in text, next to the field.",
  "3.3.2": "Fields have labels or instructions, including required fields and expected formats.",
  "3.3.3": "When an error can be fixed, the message suggests how.",
  "3.3.4": "Legal, financial or data-changing submissions can be reviewed, corrected, confirmed or undone.",
  "3.3.7": "Information already entered in a process isn't asked for again (or is filled in or selectable).",
  "3.3.8": "Signing in doesn't require a cognitive test (remembering or transcribing) unless there's an alternative, such as paste or a password manager.",
  "4.1.1": "The HTML has no duplicate ids or broken nesting that confuses assistive technology (removed in WCAG 2.2).",
  "4.1.2": "Custom controls expose their name, role and state to assistive technology (check with a screen reader).",
  "4.1.3": "Status messages (\"Saved\", \"3 results\", errors) are announced by screen readers without moving focus.",
};

/** W3C's Understanding page for a criterion (WCAG 2.2). */
export function understandingUrl(c: Pick<Criterion, "title">): string {
  const slug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `https://www.w3.org/WAI/WCAG22/Understanding/${slug}.html`;
}
