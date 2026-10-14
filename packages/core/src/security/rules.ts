/**
 * Security checks (ARCHITECTURE.md section 11): what each finding means, how to fix it, and the
 * references a report lists next to it. Startica checks configuration and exposure on
 * sites the user has verified; it never tries to break in. `info` rules are facts worth
 * knowing, not problems; they don't count against the score.
 */

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";
export type SecurityCategory = "transport" | "headers" | "cookies" | "content" | "exposure" | "email" | "disclosure" | "components" | "monitoring";

export type SecurityRule = {
  title: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  /** Checked on every page (grouped into one finding listing the pages), or once for the site. */
  scope: "page" | "site";
  why: string;
  fix: string;
  /** OWASP Top 10 (2021) category, when one fits. */
  owasp?: OwaspId;
  /** Related controls, for an auditor's reference (never a claim of conformance). */
  controls: ControlId[];
};

export const OWASP = {
  A01: "A01:2021 Broken Access Control",
  A02: "A02:2021 Cryptographic Failures",
  A05: "A05:2021 Security Misconfiguration",
  A06: "A06:2021 Vulnerable and Outdated Components",
  A08: "A08:2021 Software and Data Integrity Failures",
} as const;
export type OwaspId = keyof typeof OWASP;

export const CONTROLS = {
  "soc2-cc6.1": "SOC 2 CC6.1: logical access security",
  "soc2-cc6.6": "SOC 2 CC6.6: protection against threats from outside the system",
  "soc2-cc6.7": "SOC 2 CC6.7: protection of data in transmission",
  "soc2-cc7.1": "SOC 2 CC7.1: detecting configuration changes and vulnerabilities",
  "iso-5.26": "ISO/IEC 27001:2022 A.5.26: response to information security incidents",
  "iso-8.9": "ISO/IEC 27001:2022 A.8.9: configuration management",
  "iso-8.12": "ISO/IEC 27001:2022 A.8.12: data leakage prevention",
  "iso-8.24": "ISO/IEC 27001:2022 A.8.24: use of cryptography",
  "iso-8.8": "ISO/IEC 27001:2022 A.8.8: management of technical vulnerabilities",
} as const;
export type ControlId = keyof typeof CONTROLS;

const TRANSPORT: ControlId[] = ["soc2-cc6.7", "iso-8.24"];
const CONFIG: ControlId[] = ["soc2-cc6.6", "soc2-cc7.1", "iso-8.9"];
const LEAK: ControlId[] = ["soc2-cc6.1", "iso-8.12"];

const RULES = {
  // --- Transport (HTTPS and TLS)
  "https-missing": {
    title: "Site isn't served over HTTPS",
    severity: "high",
    category: "transport",
    scope: "site",
    why: "Without HTTPS, anyone on the same network can read or change what visitors send and receive, including passwords. Browsers mark the site as not secure.",
    fix: "Turn on HTTPS for the site (most hosts offer free certificates) and change the start address in Startica to https://.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "http-no-redirect": {
    title: "The http:// address doesn't redirect to HTTPS",
    severity: "medium",
    category: "transport",
    scope: "site",
    why: "Visitors who type the address or follow an old link stay on an unencrypted connection.",
    fix: "Redirect every http:// request to the same https:// address with a 301.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "tls-old": {
    title: "Connection uses an outdated TLS version",
    severity: "high",
    category: "transport",
    scope: "site",
    why: "TLS 1.0 and 1.1 have known weaknesses and are switched off in current browsers.",
    fix: "Allow TLS 1.2 and 1.3 only, in the server or CDN settings.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "cert-invalid": {
    title: "The HTTPS certificate isn't trusted",
    severity: "high",
    category: "transport",
    scope: "site",
    why: "Browsers show a full-page warning, and most visitors leave. The certificate may be expired, self-signed or for another name.",
    fix: "Install a certificate from a trusted authority that covers this host name.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "cert-expiring": {
    title: "The HTTPS certificate expires soon",
    severity: "medium",
    category: "transport",
    scope: "site",
    why: "When it expires, browsers block the site with a warning.",
    fix: "Renew the certificate, and turn on automatic renewal if your host offers it.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "hsts-missing": {
    title: "No Strict-Transport-Security header",
    severity: "medium",
    category: "transport",
    scope: "page",
    why: "Without it, a browser may still try http:// first, which an attacker on the network can intercept.",
    fix: "Send Strict-Transport-Security: max-age=31536000 (add includeSubDomains once every subdomain has HTTPS).",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "hsts-short": {
    title: "Strict-Transport-Security lasts less than six months",
    severity: "low",
    category: "transport",
    scope: "page",
    why: "A short max-age means browsers forget to insist on HTTPS soon after a visit.",
    fix: "Raise max-age to at least 15552000 (180 days); a year (31536000) is common.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  // --- Headers
  "csp-missing": {
    title: "No Content-Security-Policy",
    severity: "medium",
    category: "headers",
    scope: "page",
    why: "A Content-Security-Policy limits where scripts can come from, so an injected script is much less likely to run.",
    fix: "Add a Content-Security-Policy header. Start with Content-Security-Policy-Report-Only to see what it would block, then enforce it.",
    owasp: "A05",
    controls: CONFIG,
  },
  "csp-weak": {
    title: "Content-Security-Policy allows any script",
    severity: "low",
    category: "headers",
    scope: "page",
    why: "'unsafe-inline' (without nonces or hashes) or a bare * in script sources lets almost any script run, so the policy protects little.",
    fix: "Replace 'unsafe-inline' with nonces or hashes, and list script hosts instead of *.",
    owasp: "A05",
    controls: CONFIG,
  },
  "frame-protection-missing": {
    title: "Pages can be framed by other sites",
    severity: "medium",
    category: "headers",
    scope: "page",
    why: "Another site can show your page in an invisible frame and trick visitors into clicking buttons on it (clickjacking).",
    fix: "Send Content-Security-Policy: frame-ancestors 'self' (or X-Frame-Options: DENY).",
    owasp: "A05",
    controls: CONFIG,
  },
  "nosniff-missing": {
    title: "No X-Content-Type-Options header",
    severity: "low",
    category: "headers",
    scope: "page",
    why: "Browsers may guess a file's type and run something meant as plain text or an image.",
    fix: "Send X-Content-Type-Options: nosniff on every response.",
    owasp: "A05",
    controls: CONFIG,
  },
  "referrer-policy-missing": {
    title: "No Referrer-Policy header",
    severity: "low",
    category: "headers",
    scope: "page",
    why: "Full page addresses, which can include tokens or search terms, may be sent to other sites when visitors follow links.",
    fix: "Send Referrer-Policy: strict-origin-when-cross-origin.",
    owasp: "A05",
    controls: LEAK,
  },
  "permissions-policy-missing": {
    title: "No Permissions-Policy header",
    severity: "info",
    category: "headers",
    scope: "page",
    why: "It switches off browser features the site doesn't use (camera, microphone, location) for every script on the page.",
    fix: "If you like, send Permissions-Policy: camera=(), microphone=(), geolocation=().",
    owasp: "A05",
    controls: CONFIG,
  },
  "server-version": {
    title: "Server software version is shown",
    severity: "low",
    category: "headers",
    scope: "page",
    why: "Server or X-Powered-By headers with a version number tell attackers which known problems to look for.",
    fix: "Remove the version (or the whole header) in the server or framework settings.",
    owasp: "A05",
    controls: CONFIG,
  },
  // --- Cookies
  "cookie-not-secure": {
    title: "Cookie sent without the Secure flag",
    severity: "medium",
    category: "cookies",
    scope: "page",
    why: "The browser may send the cookie over an unencrypted connection, where it can be read.",
    fix: "Set the Secure attribute on every cookie the site sets.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "cookie-not-httponly": {
    title: "Cookie readable by scripts (no HttpOnly)",
    severity: "low",
    category: "cookies",
    scope: "page",
    why: "If a script is injected, it can read the cookie. Sign-in and session cookies should never be readable by scripts.",
    fix: "Set HttpOnly on cookies that scripts don't need, above all session cookies.",
    owasp: "A05",
    controls: CONFIG,
  },
  "cookie-no-samesite": {
    title: "Cookie without a SameSite attribute",
    severity: "low",
    category: "cookies",
    scope: "page",
    why: "SameSite stops the browser from sending the cookie with requests started by other sites (cross-site request forgery).",
    fix: "Set SameSite=Lax (or Strict) on cookies, unless one really must be sent cross-site.",
    owasp: "A01",
    controls: CONFIG,
  },
  // --- Page content
  "mixed-content-active": {
    title: "HTTPS page loads scripts or frames over http://",
    severity: "high",
    category: "content",
    scope: "page",
    why: "A script loaded over http:// can be swapped on the way, and it then controls the whole page. Browsers block most of it, so parts of the page may also break.",
    fix: "Load every script, stylesheet and frame over https://.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "mixed-content-passive": {
    title: "HTTPS page loads images or media over http://",
    severity: "low",
    category: "content",
    scope: "page",
    why: "Browsers warn about it or upgrade it, and the files can be read or changed on the way.",
    fix: "Load images, audio and video over https://.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "form-insecure": {
    title: "Form sends data over an unencrypted connection",
    severity: "high",
    category: "content",
    scope: "page",
    why: "A form that posts to http://, or a password field on an http:// page, sends what people type in readable form.",
    fix: "Serve the page over HTTPS and point the form's action to an https:// address.",
    owasp: "A02",
    controls: TRANSPORT,
  },
  "third-party-script-no-sri": {
    title: "Script from another site without an integrity check",
    severity: "low",
    category: "content",
    scope: "page",
    why: "If that site or CDN is compromised, the changed script runs on your pages. Subresource Integrity makes the browser refuse a file that changed.",
    fix: "Add integrity and crossorigin attributes to scripts from fixed versions on a CDN, or host the file yourself. (Scripts that change on purpose, like analytics, can't use it.)",
    owasp: "A08",
    controls: CONFIG,
  },
  "directory-listing": {
    title: "A folder's file list is public",
    severity: "medium",
    category: "exposure",
    scope: "page",
    why: "Anyone can browse the files in the folder, including ones never meant to be linked.",
    fix: "Turn off directory listing in the server settings, or add an index page.",
    owasp: "A05",
    controls: LEAK,
  },
  "generator-version": {
    title: "Site builder and version are shown",
    severity: "info",
    category: "headers",
    scope: "page",
    why: "A generator meta tag with a version tells attackers which known problems to look for. Fine if you keep the software up to date.",
    fix: "Remove the version from the generator meta tag, and keep the software current.",
    owasp: "A06",
    controls: CONFIG,
  },
  // --- Exposed files (one quiet GET each, on verified sites only)
  "exposed-git": {
    title: "The site's Git folder is public",
    severity: "critical",
    category: "exposure",
    scope: "site",
    why: "Anyone can download the source code and its history, often with passwords and keys that were committed at some point.",
    fix: "Block /.git/ in the server settings (or deploy without it), then change any secret that was ever in the repository.",
    owasp: "A05",
    controls: LEAK,
  },
  "exposed-env": {
    title: "An environment file (.env) is public",
    severity: "critical",
    category: "exposure",
    scope: "site",
    why: "Environment files usually hold database passwords and API keys.",
    fix: "Remove the file from the public folder or block it, then change every secret that was in it.",
    owasp: "A05",
    controls: LEAK,
  },
  "exposed-ds-store": {
    title: "A .DS_Store file is public",
    severity: "low",
    category: "exposure",
    scope: "site",
    why: "macOS folder files list the names of other files in the folder, including ones that aren't linked anywhere.",
    fix: "Delete .DS_Store files from the deployed site and block them in the server settings.",
    owasp: "A05",
    controls: LEAK,
  },
  // --- Email domain
  "spf-missing": {
    title: "No SPF record for the domain",
    severity: "medium",
    category: "email",
    scope: "site",
    why: "Without SPF, anyone can send email that claims to come from your domain, which makes phishing in your name easy.",
    fix: "Publish a TXT record starting with v=spf1 that lists the services allowed to send your email (your email provider documents it).",
    controls: CONFIG,
  },
  "dmarc-missing": {
    title: "No DMARC record for the domain",
    severity: "medium",
    category: "email",
    scope: "site",
    why: "DMARC tells mail providers what to do with email that fails SPF or DKIM; without it, forged email often reaches inboxes.",
    fix: "Publish a TXT record at _dmarc.<your domain>, e.g. v=DMARC1; p=none; rua=mailto:you@<your domain>, then tighten it to quarantine or reject.",
    controls: CONFIG,
  },
  "dmarc-none": {
    title: "DMARC only monitors (p=none)",
    severity: "low",
    category: "email",
    scope: "site",
    why: "With p=none, mail providers still deliver forged email; the policy only produces reports.",
    fix: "Once the reports show your real mail passes, change the policy to p=quarantine, then p=reject.",
    controls: CONFIG,
  },
  // --- Disclosure
  "security-txt-missing": {
    title: "No security.txt",
    severity: "low",
    category: "disclosure",
    scope: "site",
    why: "security.txt (RFC 9116) tells people who find a problem how to report it to you, instead of posting it publicly or giving up.",
    fix: "Publish /.well-known/security.txt with at least a Contact: line (an email address or form) and an Expires: date.",
    controls: ["iso-5.26"],
  },
  "security-txt-invalid": {
    title: "security.txt is incomplete or expired",
    severity: "low",
    category: "disclosure",
    scope: "site",
    why: "RFC 9116 requires a Contact and an Expires field, and an expired file tells reporters it may not be read.",
    fix: "Make sure the file has a Contact: line and an Expires: date in the future (within a year).",
    controls: ["iso-5.26"],
  },
  // --- Exposure monitoring (S2): found by the daily monitor, not the page checks
  "vulnerable-library": {
    title: "A library with known vulnerabilities",
    severity: "high",
    category: "components",
    scope: "site",
    why: "The site loads a version of a library with published security advisories. Attackers look for these versions because the problems and often the exploits are public. EPSS estimates how likely exploitation is; CISA's KEV list means it's being exploited now.",
    fix: "Update the library to a version the advisories list as fixed, and check the pages that use it still work.",
    owasp: "A06",
    controls: ["soc2-cc7.1", "iso-8.8"],
  },
  "subdomain-takeover": {
    title: "Subdomain points to a service that no longer exists",
    severity: "high",
    category: "monitoring",
    scope: "site",
    why: "The subdomain's CNAME record points to a name that doesn't exist any more (a deleted app, bucket or site). Someone could claim that name at the provider and serve their own content on your subdomain.",
    fix: "Delete the DNS record, or point it at a service you control again.",
    owasp: "A05",
    controls: CONFIG,
  },
  "lookalike-domain": {
    title: "A look-alike domain is registered",
    severity: "low",
    category: "monitoring",
    scope: "site",
    why: "A domain one typo away from yours resolves. It may be harmless, parked, or used to phish your customers with email or a fake login page.",
    fix: "Look at what it is. If it's abusing your name, report it to its registrar or host; consider registering likely typos yourself. Accept the risk if it's unrelated.",
    controls: ["soc2-cc6.6"],
  },
  "third-party-script-changed": {
    title: "A third-party script changed",
    severity: "medium",
    category: "monitoring",
    scope: "site",
    why: "A script your pages load from another site, without an integrity check, has new content since the last check. Usually it's a normal update; if the provider was compromised, it would run on your pages.",
    fix: "Check the provider's changelog or the change itself. Pin a fixed version with Subresource Integrity where you can. Mark it reviewed (accept) once you're satisfied.",
    owasp: "A08",
    controls: CONFIG,
  },
} satisfies Record<string, SecurityRule>;

export type SecurityRuleId = keyof typeof RULES;
export const SECURITY_RULES: Record<SecurityRuleId, SecurityRule> = RULES;

/** Points off the 100-point score per open finding (not per page: one fix covers every page). */
export const SEVERITY_WEIGHT: Record<Exclude<SecuritySeverity, "info">, number> = { critical: 30, high: 15, medium: 7, low: 2 };

export const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export const CATEGORY_LABEL: Record<SecurityCategory, string> = {
  transport: "HTTPS and certificates",
  headers: "Security headers",
  cookies: "Cookies",
  content: "Page content",
  exposure: "Exposed files",
  email: "Email domain",
  disclosure: "Reporting problems",
  components: "Libraries",
  monitoring: "Monitoring",
};

export const isSecurityRule = (id: string): id is SecurityRuleId => id in SECURITY_RULES;
