import { describe, expect, it } from "vitest";
import { parseSitemap } from "./discovery.ts";
import { criteriaFromTags, fingerprint, levelFromTags, normalizeHtml, pageScore } from "./results.ts";
import { runScript } from "./scanner.ts";
import { allowedForSite, matchesPattern, normalizeUrl, scanRequestAllowed } from "./urls.ts";

const site = { startUrl: "https://fieldnote.example/", include: [] as string[], exclude: [] as string[] };

describe("accessibility URLs", () => {
  it("normalizes page URLs", () => {
    // A query string is the same page (tracking tags, filters, sort order).
    expect(normalizeUrl("HTTPS://Fieldnote.Example:443/a?utm_source=x&b=2&a=1#top")).toBe("https://fieldnote.example/a");
    expect(normalizeUrl("https://fieldnote.example/pricing?plan=pro")).toBe(normalizeUrl("https://fieldnote.example/pricing"));
    expect(normalizeUrl("/pricing", "https://fieldnote.example/docs/")).toBe("https://fieldnote.example/pricing");
    expect(normalizeUrl("mailto:hi@example.com")).toBeNull();
  });

  it("keeps a crawl on the site's pages and off excluded ones", () => {
    expect(allowedForSite("https://www.fieldnote.example/about", site)).toBe(true);
    expect(allowedForSite("https://other.example/", site)).toBe(false);
    expect(allowedForSite("https://fieldnote.example/guide.pdf", site)).toBe(false);
    expect(allowedForSite("https://fieldnote.example/account/logout", site)).toBe(false);
    expect(allowedForSite("https://fieldnote.example/blog/1", { ...site, exclude: ["/blog/*"] })).toBe(false);
    expect(allowedForSite("https://fieldnote.example/docs/a", { ...site, include: ["/docs/*"] })).toBe(true);
    expect(allowedForSite("https://fieldnote.example/blog", { ...site, include: ["/docs/*"] })).toBe(false);
    expect(matchesPattern("https://fieldnote.example/en/help", "help")).toBe(true);
  });

  it("never lets a scanned page reach Startica, and private addresses only from local sites", () => {
    expect(scanRequestAllowed("http://127.0.0.1:58300/api/events", "https://fieldnote.example/", 58300)).toBe(false);
    expect(scanRequestAllowed("http://localhost:58300/", "http://localhost:3000/", 58300)).toBe(false);
    expect(scanRequestAllowed("http://192.168.1.10/admin", "https://fieldnote.example/", 58300)).toBe(false);
    expect(scanRequestAllowed("http://localhost:3000/app.js", "http://localhost:3000/", 58300)).toBe(true);
    expect(scanRequestAllowed("https://cdn.example.com/a.js", "https://fieldnote.example/", 58300)).toBe(true);
  });

  it("reads sitemaps and sitemap indexes", () => {
    expect(parseSitemap("<urlset><url><loc> https://fieldnote.example/a?x=1&amp;y=2 </loc></url></urlset>")).toEqual({ pages: ["https://fieldnote.example/a?x=1&y=2"], sitemaps: [] }); // normalized later
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://fieldnote.example/s1.xml</loc></sitemap></sitemapindex>")).toEqual({ pages: [], sitemaps: ["https://fieldnote.example/s1.xml"] });
  });
});

describe("accessibility results", () => {
  it("maps axe tags to WCAG criteria and levels", () => {
    expect(criteriaFromTags(["cat.text-alternatives", "wcag2a", "wcag111", "wcag1410"])).toEqual(["1.1.1", "1.4.10"]);
    expect(levelFromTags(["wcag2a", "wcag111"])).toBe("A");
    expect(levelFromTags(["wcag22aa", "wcag258"])).toBe("AA");
    expect(levelFromTags(["best-practice"])).toBe("best practice");
  });

  it("fingerprints a template element the same on every page", () => {
    const a = '<img src="/logo.svg?v=12" id="logo-3" data-reactid="7" class="logo">';
    const b = '<img src="/logo.svg?v=13" id="logo-9" data-reactid="2" class="logo">';
    expect(normalizeHtml(a)).toBe('<img src="/logo.svg" class="logo">');
    expect(fingerprint("violation", "image-alt", a)).toBe(fingerprint("violation", "image-alt", b));
    expect(fingerprint("violation", "image-alt", a)).not.toBe(fingerprint("needs_review", "image-alt", a));
  });

  it("scores passed checks 1 each and failures by impact", () => {
    const passes = Array.from({ length: 40 }, (_, i) => `rule-${i}`);
    const rule = (impact: string) => ({ id: "x", impact, help: "", description: "", helpUrl: "", tags: [], nodes: [] });
    expect(pageScore({ passes, violations: [rule("critical")] })).toBe(80);
    expect(pageScore({ passes, violations: [rule("minor")] })).toBe(97.6);
    expect(pageScore({ passes: [], violations: [] })).toBe(100);
  });
});

describe("the in-page scan script", () => {
  it("keeps its regular expressions intact inside the template string", () => {
    // A single backslash in the template becomes a plain letter: /\s+/ would split on "s".
    const script = runScript(["wcag2a"]);
    expect(script).toContain(".split(/\\s+/)");
    expect(script).not.toContain(".split(/s+/)");
    expect(script).not.toMatch(/[^\\]\/s\+\//); // no regex anywhere that lost its backslash
  });
});
