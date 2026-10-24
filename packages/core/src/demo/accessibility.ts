import { and, eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { finishScan, storePageResult } from "../a11y/scan.ts";
import { importKey } from "../security/ai.ts";
import { finishSecurity } from "../security/findings.ts";
import { AI_CRAWLERS } from "../seo/crawlers.ts";
import type { PageResult, RawRuleResult } from "../a11y/scanner.ts";

/**
 * The demo's accessibility results (ARCHITECTURE.md section 9.2): Fieldnote's site with a
 * month of weekly scans, getting better, and today's open issues. Stored through the
 * same code a real scan uses, so the screens show exactly what a scan would.
 */

const SITE = "https://fieldnote.example";
const AXE = "4.14.0";
const help = (id: string) => `https://dequeuniversity.com/rules/axe/4.14/${id}?application=axeAPI`;

const RULES: Record<string, Omit<RawRuleResult, "nodes">> = {
  "image-alt": { id: "image-alt", impact: "critical", help: "Images must have alternative text", description: "Ensure <img> elements have alternative text or a role of none or presentation", helpUrl: help("image-alt"), tags: ["cat.text-alternatives", "wcag2a", "wcag111", "section508"] },
  "link-name": { id: "link-name", impact: "serious", help: "Links must have discernible text", description: "Ensure links have discernible text", helpUrl: help("link-name"), tags: ["cat.name-role-value", "wcag2a", "wcag244", "wcag412", "section508"] },
  "color-contrast": { id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds", description: "Ensure the contrast between foreground and background colors meets WCAG 2 AA minimum contrast ratio thresholds", helpUrl: help("color-contrast"), tags: ["cat.color", "wcag2aa", "wcag143"] },
  label: { id: "label", impact: "critical", help: "Form elements must have labels", description: "Ensure every form element has a label", helpUrl: help("label"), tags: ["cat.forms", "wcag2a", "wcag412", "section508"] },
  "target-size": { id: "target-size", impact: "serious", help: "All touch targets must be 24px large, or leave sufficient space", description: "Ensure touch targets have sufficient size and space", helpUrl: help("target-size"), tags: ["cat.sensory-and-visual-cues", "wcag22aa", "wcag258"] },
};

// Checks that pass on every demo page (for the score).
const PASSES = ["aria-allowed-attr", "aria-hidden-body", "aria-required-attr", "aria-roles", "aria-valid-attr", "aria-valid-attr-value", "button-name", "bypass", "document-title", "duplicate-id-aria", "html-has-lang", "html-lang-valid", "list", "listitem", "meta-viewport", "nested-interactive", "role-img-alt", "scrollable-region-focusable", "valid-lang", "video-caption", "frame-title", "input-button-name", "select-name", "svg-img-alt", "td-headers-attr", "th-has-data-cells", "autocomplete-valid", "avoid-inline-spacing", "definition-list", "dlitem"];

const logo = { target: "header > a > img", html: '<img src="/img/fieldnote-logo.svg" width="132" height="32">', failureSummary: "Fix any of the following:\n  Element does not have an alt attribute\n  aria-label attribute does not exist or is empty", impact: "critical" };
const logoLink = { target: "header > a", html: '<a href="/" class="brand">', failureSummary: "Fix all of the following:\n  Element is in tab order and does not have accessible text", impact: "serious" };

type DemoPage = { path: string; title: string; text?: string; issues: { rule: string; nodes: RawRuleResult["nodes"] }[]; review?: { rule: string; nodes: RawRuleResult["nodes"] }[]; description?: string; jsonLd?: string[] };

const PAGES: DemoPage[] = [
  {
    path: "/",
    title: "Fieldnote: notes for field researchers",
    issues: [],
    description: "Fieldnote is a note-taking app for field researchers: offline notebooks, photos and GPS tags, synced when you're back online.",
    jsonLd: ['{"@context":"https://schema.org","@type":"Organization","name":"Fieldnote","url":"https://fieldnote.example/"}'],
  },
  {
    path: "/features",
    title: "Features: Fieldnote",
    issues: [],
    description: "Offline notebooks, photo and GPS tagging, and sync for field teams.",
    // A check axe can't decide: text over a photo (Needs review, A2).
    review: [{ rule: "color-contrast", nodes: [{ target: ".hero h2", html: '<h2 class="hero-caption">Take notes where the signal ends</h2>', failureSummary: "Review:\n  Element's background color could not be determined due to a background image", impact: "serious" }] }],
  },
  {
    path: "/pricing",
    title: "Pricing: Fieldnote",
    description: "Free for one notebook; Pro for unlimited notebooks and team sharing.",
    jsonLd: ['{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Fieldnote","applicationCategory":"Productivity"}'],
    issues: [{ rule: "color-contrast", nodes: [{ target: ".plan-note", html: '<p class="plan-note">Billed yearly. Cancel anytime.</p>', failureSummary: "Fix any of the following:\n  Element has insufficient color contrast of 2.6 (foreground color: #a3a3a3, background color: #ffffff, font size: 10.5pt (14px), font weight: normal). Expected contrast ratio of 4.5:1", impact: "serious" }] }],
  },
  {
    path: "/signup",
    title: "Start your free notebook: Fieldnote",
    description: "Create a free Fieldnote notebook in a minute: no card needed.",
    issues: [{ rule: "label", nodes: [{ target: "#signup-email", html: '<input id="signup-email" type="email" placeholder="you@lab.example">', failureSummary: "Fix any of the following:\n  Form element does not have an implicit (wrapped) <label>\n  Form element does not have an explicit <label>\n  Element has no placeholder that is used as a visible label", impact: "critical" }] }],
  },
  { path: "/blog", title: "Field notes blog: Fieldnote", issues: [{ rule: "target-size", nodes: [{ target: ".tags > a:nth-child(2)", html: '<a href="/blog?tag=ecology" class="tag">ecology</a>', failureSummary: "Fix any of the following:\n  Target has insufficient size (40px by 14px, should be at least 24px by 24px)", impact: "serious" }] }] },
  {
    path: "/blog/offline-field-kit",
    title: "Packing an offline field kit: what we bring to every site visit, and why it matters",
    issues: [],
    // A5: long sentences and long words (readability above the target), and a misspelling.
    text: "Packing an offline field kit. ".concat(
      "Comprehensive preparation for extended observational expeditions necessitates considerable organizational deliberation, particularly regarding redundant power provisioning, environmental protection for documentation equipment, and synchronization methodologies appropriate for intermittent connectivity conditions. ".repeat(3),
      "We keep a seperate battery for the notebook tablet, because a field day without notes is a day of observations lost, and recovering those observations afterwards from memory is considerably less dependable than contemporaneous documentation. ".repeat(2),
    ),
    description: "Batteries, backups and the notebook setup we use when there's no signal for days.",
  },
  // A5: placeholder text left on a page (the demo's content rule) and a misspelling.
  { path: "/help", title: "Help: Fieldnote", issues: [], text: "Help. How do I sync my notes? Your notes sync when you're back online. You'll recieve an email when a shared notebook changes. Screenshots coming soon." },
];

/**
 * Security (ARCHITECTURE.md section 11.2): what Fieldnote's server sends. HTTPS, HSTS, framing,
 * nosniff and a referrer policy are set; there's no Content-Security-Policy, the edge
 * server shows its version, and a theme cookie lacks HttpOnly and SameSite.
 */
function headers(page: DemoPage): Record<string, string> {
  return {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "SAMEORIGIN",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    server: "Fieldnote-Edge/2.4",
    ...(page.path === "/" ? { "set-cookie": "fn_session=demo; Path=/; Secure; HttpOnly; SameSite=Lax\nfn_theme=light; Path=/; Secure" } : {}),
  };
}

function security(page: DemoPage): NonNullable<PageResult["security"]> {
  return {
    insecureResources: { active: [], passive: page.path === "/blog" ? ["http://images.fieldnote.example/2024/old-cover.jpg"] : [] },
    forms: page.path === "/signup" ? [{ action: `${SITE}/signup`, hasPassword: true }] : [],
    scripts: [
      { src: `${SITE}/js/app.js`, integrity: false },
      ...(page.path === "/pricing" ? [{ src: "https://cdn.chartkit.example/chart.min.js", integrity: false }] : []),
    ],
    generator: null,
    directoryListing: false,
  };
}

function result(page: DemoPage): PageResult {
  const violations = page.issues.map((i) => ({ ...RULES[i.rule]!, nodes: i.nodes }));
  // The shared header's logo has no text alternative on every page but the home page (fixed there last week).
  if (page.path !== "/") violations.push({ ...RULES["image-alt"]!, nodes: [logo] }, { ...RULES["link-name"]!, nodes: [logoLink] });
  return {
    url: `${SITE}${page.path}`,
    title: page.title,
    lang: "en",
    text: page.text ?? `${page.title}. ${page.description ?? ""}`,
    links: page.path === "/" ? PAGES.filter((p) => p.path !== "/help").map((p) => `${SITE}${p.path}`) : [`${SITE}/`],
    seo: {
      description: page.description ?? null,
      canonical: `${SITE}${page.path}`,
      robots: null,
      h1: [page.title.split(":")[0]!],
      ogTitle: page.path === "/" ? "Fieldnote" : null,
      ogImage: page.path === "/" ? `${SITE}/og.png` : null,
      jsonLd: page.jsonLd ?? [],
      wordCount: 400,
    },
    security: security(page),
    images: [
      { src: `${SITE}/img/fieldnote-logo.svg`, alt: page.path === "/" ? "Fieldnote" : null, decorative: false, link: `${SITE}/`, nearby: "", width: 132, height: 32 },
      ...(page.path === "/" ? [{ src: `${SITE}/img/coast-team.jpg`, alt: "IMG_2041.jpg", decorative: false, link: null, nearby: "Our field team taking notes on the coast, offline for three days", width: 1600, height: 900 }] : []),
      ...(page.path === "/blog/offline-field-kit" ? [{ src: `${SITE}/img/field-kit.jpg`, alt: "A field kit laid out: notebook, power bank, GPS unit and a waterproof bag", decorative: false, link: null, nearby: "What we bring to every site visit", width: 1200, height: 800 }] : []),
    ],
    axeVersion: AXE,
    violations,
    incomplete: (page.review ?? []).map((i) => ({ ...RULES[i.rule]!, nodes: i.nodes })),
    passes: PASSES.filter((id) => !violations.some((v) => v.id === id)),
  };
}

export async function seedDemoAccessibility(workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const db = getDb();
  const [site] = await db
    .insert(s.sites)
    .values({ workspaceId, productId, name: "fieldnote.example", startUrl: `${SITE}/`, ownershipConfirmedAt: ago(30), createdAt: ago(30), securityVerifiedAt: ago(30), securityVerifiedBy: "demo",
      contentRules: [{ id: "demo-placeholder-text", name: "No placeholder text", kind: "text_contains", value: "coming soon" }],
    })
    .returning();

  // A month of weekly scans, improving (the history and its trend).
  const history = [
    { days: 28, score: 54, impacts: { critical: 3, serious: 5, moderate: 2, minor: 0 }, newIssues: 9, fixedIssues: 0 },
    { days: 21, score: 59, impacts: { critical: 2, serious: 4, moderate: 1, minor: 0 }, newIssues: 0, fixedIssues: 2 },
    { days: 14, score: 63, impacts: { critical: 2, serious: 3, moderate: 0, minor: 0 }, newIssues: 1, fixedIssues: 2 },
  ];
  const securityHistory = [62, 70, 74];
  for (const [i, h] of history.entries()) {
    await db.insert(s.siteScans).values({
      securityScore: securityHistory[i],
      workspaceId,
      siteId: site!.id,
      status: "done",
      trigger: "scheduled",
      pagesDone: PAGES.length,
      axeVersion: AXE,
      score: h.score,
      impacts: h.impacts,
      needsReview: 0,
      newIssues: h.newIssues,
      fixedIssues: h.fixedIssues,
      startedAt: ago(h.days),
      finishedAt: ago(h.days, -1),
      createdAt: ago(h.days),
    });
  }

  // Last week's scan: today's results, stored the way a real scan stores them.
  const [scan] = await db
    .insert(s.siteScans)
    .values({ workspaceId, siteId: site!.id, status: "running", trigger: "scheduled", axeVersion: AXE, startedAt: ago(7), createdAt: ago(7) })
    .returning({ id: s.siteScans.id });
  for (const page of PAGES) {
    const [row] = await db
      .insert(s.sitePages)
      .values({ workspaceId, siteId: site!.id, url: `${SITE}${page.path}`, depth: page.path === "/" ? 0 : 1, scanId: scan!.id, createdAt: ago(28) })
      .returning();
    await db.update(s.sitePages).set({ inSitemap: true }).where(eq(s.sitePages.id, row!.id));
    await storePageResult(site!, { ...row!, inSitemap: true }, scan!.id, { httpStatus: 200, finalUrl: row!.url, result: result(page), xRobotsTag: null, headers: headers(page) });
    await db.update(s.sitePages).set({ lastScannedAt: ago(7) }).where(eq(s.sitePages.id, row!.id));
  }
  await finishScan(site!, scan!.id);
  // Its "new" and "fixed" counts are relative to the history above, not to an empty site.
  await db.update(s.siteScans).set({ pagesDone: PAGES.length, newIssues: 1, fixedIssues: 1, finishedAt: ago(7, -1) }).where(eq(s.siteScans.id, scan!.id));
  await db.update(s.a11yIssueGroups).set({ firstSeenAt: ago(28), lastSeenAt: ago(7) }).where(eq(s.a11yIssueGroups.siteId, site!.id));
  // AI access as a real scan would have found it: training blocked for GPTBot, AI search open, no llms.txt.
  await db
    .update(s.sites)
    .set({
      aiAccess: {
        crawlers: AI_CRAWLERS.map((c) => ({ ...c, allowed: c.token !== "GPTBot" })),
        llmsTxt: "missing",
        checkedAt: ago(7).getTime(),
      },
    })
    .where(eq(s.sites.id, site!.id));
  await db.insert(s.seoFindings).values({ workspaceId, siteId: site!.id, rule: "ai-training-blocked", severity: "info", groupKey: "ai-training-blocked", detail: { crawlers: ["GPTBot (OpenAI)"] } });
  await seedDemoSecurity(workspaceId, site!, scan!.id, ago);
  await seedDemoDocuments(workspaceId, site!.id, ago);
  return PAGES.length;
}

/** What the site probes would have found for fieldnote.example (a reserved name, so the real probes make no requests). */
async function seedDemoSecurity(workspaceId: string, site: typeof s.sites.$inferSelect, scanId: string, ago: (days: number, hours?: number) => Date) {
  const db = getDb();
  await db
    .update(s.sites)
    .set({
      security: {
        checkedAt: ago(7).getTime(),
        https: true,
        tls: { protocol: "TLSv1.3", authorized: true, error: null, validTo: ago(-64).getTime(), issuer: "Example Trust CA" },
        httpRedirect: "redirects",
        securityTxt: { status: "missing", contact: [], expires: null, problems: [] },
        email: { domain: "fieldnote.example", spf: "v=spf1 include:_spf.mail.example ~all", dmarc: "v=DMARC1; p=none; rua=mailto:dmarc@fieldnote.example", dmarcPolicy: "none" },
      },
    })
    .where(eq(s.sites.id, site.id));
  await db.insert(s.securityOccurrences).values([
    { workspaceId, siteId: site.id, rule: "security-txt-missing", groupKey: "security-txt-missing", detail: {} },
    { workspaceId, siteId: site.id, rule: "dmarc-none", groupKey: "dmarc-none", detail: { domain: "fieldnote.example", record: "v=DMARC1; p=none; rua=mailto:dmarc@fieldnote.example" } },
  ]);
  const [fresh] = await db.select().from(s.sites).where(eq(s.sites.id, site.id));
  await finishSecurity(fresh!, { scanId, probes: false });
  await db.update(s.securityFindings).set({ firstSeenAt: ago(28), lastSeenAt: ago(7) }).where(eq(s.securityFindings.siteId, site.id));
  // A decision and a fix from earlier weeks, so every state shows.
  await db
    .update(s.securityFindings)
    .set({ status: "accepted", reason: "The theme cookie is read by our own script to switch dark mode; it holds no personal data.", decidedAt: ago(20) })
    .where(eq(s.securityFindings.groupKey, "cookie-not-httponly:fn_theme"));
  await db.insert(s.securityFindings).values({
    workspaceId,
    siteId: site.id,
    groupKey: "exposed-ds-store",
    rule: "exposed-ds-store",
    severity: "low",
    status: "fixed",
    detail: { url: `${SITE}/.DS_Store` },
    firstSeenAt: ago(28),
    lastSeenAt: ago(21),
    fixedAt: ago(14),
  });
  // S4: AI help on the CSP finding, a finding imported from last spring's pentest, and a reported problem with its triage.
  await db
    .update(s.securityFindings)
    .set({
      aiStatus: "ready",
      aiHelp: {
        summary: "Fieldnote's pages don't tell browsers which scripts are allowed to run, so a script injected through a bug would run with full access to the page.",
        steps: [
          "Add a Content-Security-Policy-Report-Only header at the edge server for every page, allowing your own scripts and the chart CDN.",
          "Watch the browser console (or a report endpoint) for a week and add any legitimate source it reports.",
          "Switch the header name to Content-Security-Policy to enforce it.",
        ],
        snippets: [{ label: "Fieldnote-Edge response headers", language: "text", code: "Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://cdn.chartkit.example; frame-ancestors 'self'" }],
        verify: "Open a page with the browser's developer tools and check the header is there, then press Recheck in Startica.",
        model: "claude-sonnet-5-5",
        createdAt: ago(6).toISOString(),
      },
    })
    .where(eq(s.securityFindings.groupKey, "csp-missing"));
  await db.insert(s.securityFindings).values({
    workspaceId,
    siteId: site.id,
    groupKey: importKey("Password reset links stay valid after use"),
    rule: "imported",
    source: "import",
    severity: "high",
    status: "open",
    title: "Password reset links stay valid after use",
    description: "A reset link from the email keeps working after the password has been changed, and for seven days.",
    fix: "Make reset links single-use and expire them after 30 minutes.",
    sourceLabel: "Pentest, June 2026",
    detail: { urls: [`${SITE}/reset`] },
    firstSeenAt: ago(110),
    lastSeenAt: ago(110),
  });
  await db.insert(s.securityReports).values({
    workspaceId,
    productId: site.productId,
    reporter: "a.researcher@mail.example",
    body: "Hello, the pricing page loads chart.min.js from cdn.chartkit.example without an integrity attribute. If that CDN were compromised your visitors would run its code. Kind regards.",
    receivedAt: ago(2),
    triageStatus: "ready",
    triage: {
      severity: "low",
      summary: "A script on /pricing comes from another host without a Subresource Integrity hash.",
      likelyValid: "likely",
      duplicateOf: (await db.select({ id: s.securityFindings.id }).from(s.securityFindings).where(eq(s.securityFindings.groupKey, "third-party-script-no-sri:cdn.chartkit.example")))[0]?.id ?? null,
      missingInfo: [],
      reply: "Hi,\n\nThank you for taking the time to tell us. We already track this one and plan to pin the chart library with an integrity hash. We'll let you know when it's done.\n\nThe Fieldnote team",
      model: "claude-sonnet-5-5",
      createdAt: ago(2).toISOString(),
    },
  });

  // A3: an AI fix suggestion on the logo issue, alt text verdicts and a summary (all as if written by the user's key).
  await db
    .update(s.a11yIssueGroups)
    .set({
      aiFixStatus: "ready",
      aiFix: {
        explanation: "The header logo is an image with no text alternative, so screen readers announce the file name or nothing, and its link has no name.",
        html: '<img src="/img/fieldnote-logo.svg" width="132" height="32" alt="Fieldnote home">',
        steps: ["Open the shared header template (it's on every page but the home page).", 'Add alt="Fieldnote home" to the logo image: it\'s the link\'s only content.', "Recheck the pages."],
        confidence: "high",
        guidance: null,
        model: "claude-sonnet-5-5",
        createdAt: ago(5).toISOString(),
      },
    })
    .where(and(eq(s.a11yIssueGroups.siteId, site.id), eq(s.a11yIssueGroups.ruleId, "image-alt")));
  // A fix plan for three picked issues: the header logo's two (one task) and the signup field.
  const picked = await db
    .select()
    .from(s.a11yIssueGroups)
    .where(and(eq(s.a11yIssueGroups.siteId, site.id), eq(s.a11yIssueGroups.status, "open"), eq(s.a11yIssueGroups.kind, "violation")));
  const planIssues = ["image-alt", "link-name", "label"].map((r) => picked.find((g) => g.ruleId === r)).filter((g): g is (typeof picked)[number] => Boolean(g));
  if (planIssues.length === 3) {
    const [img, link, label] = planIssues as [(typeof picked)[number], (typeof picked)[number], (typeof picked)[number]];
    await db.insert(s.a11yFixPlans).values({
      workspaceId,
      siteId: site.id,
      groupIds: planIssues.map((g) => g.id),
      status: "ready",
      createdAt: ago(3),
      plan: {
        summary: "Name the logo in the shared header (two issues, every page but the home page) and label the signup email field.",
        tasks: [
          {
            title: "Name the header logo",
            groupIds: [img.id, link.id],
            where: "the shared header template (the logo link)",
            change: 'Add alt="Fieldnote home" to the logo image: it\'s the link\'s only content, so it names the link too.',
            html: '<a href="/"><img src="/img/fieldnote-logo.svg" width="132" height="32" alt="Fieldnote home"></a>',
          },
          {
            title: "Label the signup email field",
            groupIds: [label.id],
            where: "the signup form",
            change: "Add a visible <label> tied to the field with for/id; keep the placeholder as an example only.",
            html: '<label for="signup-email">Email</label>\n<input id="signup-email" type="email" placeholder="you@lab.example" autocomplete="email">',
          },
        ],
        doneWhen: ["image-alt, link-name and label pass on the listed elements", "A screen reader announces the logo link and the email field by name"],
        issues: planIssues.map((g) => ({ id: g.id, ruleId: g.ruleId, help: g.help, impact: g.impact, criteria: g.criteria, level: g.level, pagesCount: g.pagesCount, occurrencesCount: g.occurrencesCount, selector: g.sampleSelector, url: null, helpUrl: g.helpUrl })),
        guidance: null,
        model: "claude-sonnet-5-5",
        createdAt: ago(3).toISOString(),
      },
    });
  }
  const verdicts: [string, Partial<typeof s.a11yImages.$inferInsert>][] = [
    [`${SITE}/img/coast-team.jpg`, { verdict: "needs_better", suggestedAlt: "Three researchers writing in notebooks on a rocky coast", reason: "The alt text is a file name, which tells people nothing about the photo.", judgedAlt: "IMG_2041.jpg" }],
    [`${SITE}/img/field-kit.jpg`, { verdict: "good", suggestedAlt: null, reason: "It names what's in the photo and fits the article.", judgedAlt: "A field kit laid out: notebook, power bank, GPS unit and a waterproof bag" }],
  ];
  for (const [src, v] of verdicts) {
    await db.update(s.a11yImages).set({ ...v, status: "ready", model: "claude-sonnet-5-5", reviewedAt: ago(5) }).where(and(eq(s.a11yImages.siteId, site.id), eq(s.a11yImages.src, src)));
  }
  await db
    .update(s.sites)
    .set({
      a11ySummaryStatus: "ready",
      a11ySummary: {
        text: "Fieldnote's accessibility score rose from 54 to about 70 over the past month, with critical issues down from three to two. The biggest remaining problem is the header logo: it has no text alternative on six pages, so screen reader users hear an unnamed link on every page. Fix it once in the shared header, then label the signup email field so people can sign up with assistive technology.",
        scanId: scanId,
        model: "claude-sonnet-5-5",
        createdAt: ago(6).toISOString(),
      },
    })
    .where(eq(s.sites.id, site.id));

  // A4: a few criteria checked by hand, and the statement's details.
  await db.insert(s.a11yCriteriaReviews).values([
    { workspaceId, siteId: site.id, criterion: "2.1.1", status: "pass", note: "Signed up, created and exported a notebook with the keyboard only.", reviewedAt: ago(9) },
    { workspaceId, siteId: site.id, criterion: "2.4.7", status: "fail", note: "The focus outline is removed on the pricing toggle and the blog tag links.", reviewedAt: ago(9) },
    { workspaceId, siteId: site.id, criterion: "1.2.2", status: "not_applicable", note: "No videos on the site.", reviewedAt: ago(9) },
    { workspaceId, siteId: site.id, criterion: "3.3.1", status: "pass", note: "Signup errors are shown in text next to the field.", reviewedAt: ago(9) },
  ]);
  await db
    .update(s.sites)
    .set({ a11yStatement: { organization: "Fieldnote", contact: "accessibility@fieldnote.example", target: "wcag22aa", approach: "We check new features with a screen reader and the keyboard before release.", limitations: "", updatedAt: ago(9).toISOString() } })
    .where(eq(s.sites.id, site.id));

  // S2: what monitoring found: subdomains and certificates from the logs, the chart script's fingerprint, and an old jQuery with advisories.
  const seen = { firstSeenAt: ago(21), lastSeenAt: ago(0, 3) };
  await db.insert(s.securityAssets).values([
    { workspaceId, siteId: site.id, kind: "subdomain", name: "fieldnote.example", detail: { cname: null, resolves: true, dangling: false }, ...seen },
    { workspaceId, siteId: site.id, kind: "subdomain", name: "www.fieldnote.example", detail: { cname: null, resolves: true, dangling: false }, ...seen },
    { workspaceId, siteId: site.id, kind: "subdomain", name: "app.fieldnote.example", detail: { cname: "fieldnote-app.hosting.example", resolves: true, dangling: false }, ...seen },
    { workspaceId, siteId: site.id, kind: "subdomain", name: "docs.fieldnote.example", detail: { cname: "fieldnote.docs-host.example", resolves: true, dangling: false }, firstSeenAt: ago(2), lastSeenAt: ago(0, 3) },
    { workspaceId, siteId: site.id, kind: "certificate", name: "880021", detail: { issuer: "Example Trust CA", names: ["fieldnote.example", "www.fieldnote.example"], notBefore: ago(30).toISOString(), notAfter: ago(-64).toISOString(), logged: ago(30).toISOString() }, ...seen },
    { workspaceId, siteId: site.id, kind: "certificate", name: "880457", detail: { issuer: "Example Trust CA", names: ["docs.fieldnote.example"], notBefore: ago(2).toISOString(), notAfter: ago(-88).toISOString(), logged: ago(2).toISOString() }, firstSeenAt: ago(2), lastSeenAt: ago(0, 3) },
    { workspaceId, siteId: site.id, kind: "script", name: "https://cdn.chartkit.example/chart.min.js", detail: { sha256: "q3Zt6pb0pL1tVv8Q0gq3uFzS0kT3r1H0mOq2J5c8vYk=", bytes: 208_431 }, ...seen },
  ]);
  await db.insert(s.securityFindings).values({
    workspaceId,
    siteId: site.id,
    groupKey: "vuln:jquery@3.4.1",
    rule: "vulnerable-library",
    source: "monitor",
    severity: "high",
    status: "open",
    pagesCount: 0,
    detail: {
      library: "jquery",
      version: "3.4.1",
      pages: [`${SITE}/blog`, `${SITE}/blog/offline-field-kit`],
      kev: true,
      epss: 0.11743,
      vulns: [
        { id: "GHSA-jpcq-cgw6-v4j6", cve: "CVE-2020-11023", summary: "Potential XSS vulnerability in jQuery when passing <option> elements", severity: "medium", fixed: ["3.5.0"], epss: 0.11743, percentile: 0.95, kev: true },
        { id: "GHSA-gxr4-xjj5-5px2", cve: "CVE-2020-11022", summary: "Potential XSS vulnerability in jQuery's htmlPrefilter", severity: "medium", fixed: ["3.5.0"], epss: 0.02251, percentile: 0.84, kev: false },
      ],
    },
    firstSeenAt: ago(21),
    lastSeenAt: ago(0, 3),
  });
  await db.update(s.sites).set({ securityMonitor: { checkedAt: ago(0, 3).getTime(), errors: [] } }).where(eq(s.sites.id, site.id));

  // Score again, now that the theme cookie's risk is accepted.
  await finishSecurity((await db.select().from(s.sites).where(eq(s.sites.id, site.id)))[0]!, { scanId, probes: false });
  await db.update(s.sites).set({ securityCheckedAt: ago(7) }).where(eq(s.sites.id, site.id));
}

/** What the content check (A5) would have found: two PDFs (one untagged) and the external links. fieldnote.example is reserved, so a real check requests nothing. */
async function seedDemoDocuments(workspaceId: string, siteId: string, ago: (days: number, hours?: number) => Date) {
  const db = getDb();
  const checkedAt = ago(7, -1);
  const pdf = { pages: 4, tagged: true, title: "Fieldnote field guide", showsTitle: true, lang: "en", hasText: true, figures: 3, figuresWithoutAlt: 0, headings: 9, bookmarks: 0, fields: 0, unlabeledFields: 0 };
  await db.insert(s.siteDocuments).values([
    { workspaceId, siteId, url: `${SITE}/docs/field-guide.pdf`, status: "ok", httpStatus: 200, bytes: 1_482_113, checks: pdf, problems: [], linkedFrom: [`${SITE}/help`], checkedAt },
    {
      workspaceId,
      siteId,
      url: `${SITE}/docs/team-pricing.pdf`,
      status: "ok",
      httpStatus: 200,
      bytes: 211_904,
      checks: { ...pdf, pages: 2, tagged: false, title: null, showsTitle: false, lang: null, figures: 1, figuresWithoutAlt: 1, headings: 0 },
      problems: ["pdf-untagged", "pdf-no-title", "pdf-no-lang"],
      linkedFrom: [`${SITE}/pricing`],
      checkedAt,
    },
  ]);
  await db.insert(s.siteLinks).values([
    { workspaceId, siteId, url: "https://maps.example/offline-tiles", httpStatus: 200, error: null, linkedFrom: [`${SITE}/blog/offline-field-kit`], checkedAt },
    { workspaceId, siteId, url: "https://gear.example/reviews/field-tablets-2024", httpStatus: 404, error: null, linkedFrom: [`${SITE}/blog/offline-field-kit`], checkedAt },
    { workspaceId, siteId, url: "https://journal.example/articles/field-methods", httpStatus: 403, error: null, linkedFrom: [`${SITE}/blog`], checkedAt },
  ]);
  await db.update(s.sites).set({ contentCheckedAt: checkedAt }).where(eq(s.sites.id, siteId));
}
