import { describe, expect, it } from "vitest";
import { botWall, findPage, readinessScore, runChecks, signInRedirect, visibleWords, type AgentInputs, type Probe } from "./checks.ts";

const probe = (url: string, text: string, o: Partial<Probe> = {}): Probe => ({ url, finalUrl: url, status: 200, headers: {}, text, ...o });
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const base: AgentInputs = {
  startUrl: "https://fieldnote.example/",
  pages: [
    { url: "https://fieldnote.example/", title: "Fieldnote", state: "done", httpStatus: 200, wordCount: 400, structuredTypes: ["Organization", "SoftwareApplication"] },
    { url: "https://fieldnote.example/pricing", title: "Pricing", state: "done", httpStatus: 200, wordCount: 300, structuredTypes: [] },
    { url: "https://fieldnote.example/docs/getting-started", title: "Docs", state: "done", httpStatus: 200, wordCount: 900, structuredTypes: [] },
  ],
  a11y: [],
  bestPractice: true,
  aiAccess: {
    crawlers: [
      { token: "GPTBot", operator: "OpenAI", purpose: "training", allowed: false },
      { token: "ChatGPT-User", operator: "OpenAI", purpose: "user", allowed: true },
      { token: "Claude-User", operator: "Anthropic", purpose: "user", allowed: true },
    ],
    llmsTxt: "present",
    checkedAt: 0,
  },
  probes: {
    home: probe("https://fieldnote.example/", `<html><body><main><h1>Fieldnote</h1><p>${words(300)}</p></main><script>var x = 1;</script></body></html>`),
    pricing: probe("https://fieldnote.example/pricing", "<h1>Pricing</h1><p>Free for 3 projects. Team: $8 per user per month.</p>"),
    docs: probe("https://fieldnote.example/docs/getting-started", `<p>${words(200)}</p>`),
  },
  endpoints: [],
  markdownType: null,
};

const statusOf = (i: AgentInputs) => Object.fromEntries(runChecks(i).map((r) => [r.id, r.status]));

describe("agent readiness checks", () => {
  it("passes a site that's ready for agents, and scores it 100", () => {
    const results = runChecks(base);
    expect(statusOf(base)).toEqual({
      "controls-named": "pass",
      "forms-labeled": "pass",
      structure: "pass",
      "content-without-js": "pass",
      "pricing-in-text": "pass",
      "public-pages": "pass",
      "no-bot-wall": "pass",
      "agent-access": "pass",
      "structured-data": "pass",
      "llms-txt": "pass",
      "docs-public": "pass",
      "api-description": "info",
      "agent-tools": "info",
      markdown: "info",
    });
    expect(readinessScore(results)).toBe(100);
  });

  it("finds the problems agents run into", () => {
    const bad: AgentInputs = {
      ...base,
      a11y: [
        { ruleId: "button-name", pagesCount: 6 },
        { ruleId: "label", pagesCount: 1 },
      ],
      aiAccess: { ...base.aiAccess!, crawlers: base.aiAccess!.crawlers.map((c) => ({ ...c, allowed: c.token !== "Claude-User" })), llmsTxt: "missing" },
      probes: {
        home: probe("https://fieldnote.example/", '<div id="root"></div><script src="/app.js"></script>'),
        pricing: probe("https://fieldnote.example/pricing", "<title>Just a moment...</title><script src='https://challenges.cloudflare.com/x'></script>", { status: 403 }),
        docs: probe("https://fieldnote.example/docs/getting-started", "<form>Sign in</form>", { finalUrl: "https://fieldnote.example/login?next=/docs" }),
      },
      pages: base.pages.map((p, i) => (i === 0 ? { ...p, structuredTypes: ["WebSite"] } : p)),
    };
    const results = runChecks(bad);
    expect(statusOf(bad)).toMatchObject({
      "controls-named": "fail",
      "forms-labeled": "warn",
      "content-without-js": "fail",
      "pricing-in-text": "warn",
      "public-pages": "fail",
      "no-bot-wall": "fail",
      "agent-access": "fail",
      "structured-data": "warn",
      "llms-txt": "warn",
    });
    expect(results.find((r) => r.id === "no-bot-wall")?.summary).toMatch(/Cloudflare browser check/);
    expect(results.find((r) => r.id === "agent-access")?.summary).toBe("robots.txt blocks Claude-User.");
    expect(results.find((r) => r.id === "public-pages")?.detail).toEqual(["/docs/getting-started → /login"]);
    expect(readinessScore(results)).toBeLessThan(40);
  });

  it("says when it can't tell yet, and leaves that out of the score", () => {
    const fresh: AgentInputs = { ...base, pages: [], a11y: null, aiAccess: null, probes: { home: null, pricing: null, docs: null } };
    const s = statusOf(fresh);
    expect(s["controls-named"]).toBe("unknown");
    expect(s["agent-access"]).toBe("unknown");
    expect(s["pricing-in-text"]).toBe("unknown");
    expect(readinessScore(runChecks(fresh))).toBeNull();
  });

  it("reads HTML like an agent without JavaScript would", () => {
    expect(visibleWords("<p>Hello <b>field</b> notes</p><script>var a = 'lots of words here';</script><style>p{}</style>")).toBe(3);
    expect(findPage(base.pages, /\/(pricing|plans)(\/|$)/)).toBe("https://fieldnote.example/pricing");
    expect(signInRedirect(probe("https://x.example/pricing", "", { finalUrl: "https://x.example/auth/sign-in" }))).toBe(true);
    expect(signInRedirect(probe("https://x.example/login", "", { finalUrl: "https://x.example/login" }))).toBe(false);
    // A long page that only embeds a CAPTCHA in a form isn't a wall.
    expect(botWall(probe("https://x.example/contact", `<p>${words(400)}</p><div class="g-recaptcha"></div>`))).toBeNull();
    expect(botWall(probe("https://x.example/", "", { status: 403, headers: { "cf-mitigated": "challenge" } }))).toMatch(/Cloudflare/);
    expect(botWall(probe("https://x.example/", "", { status: 402, headers: { "crawler-price": "USD 0.01" } }))).toMatch(/pay per crawl/);
    expect(botWall(probe("https://x.example/", "<html></html>", { status: 403, headers: { "x-datadome": "protected" } }))).toMatch(/DataDome/);
  });

  it("reads prices like a reader without scripts, and says what Structure couldn't see", () => {
    const pricing = (html: string): AgentInputs => ({ ...base, probes: { ...base.probes, pricing: probe("https://fieldnote.example/pricing", html) } });
    expect(statusOf(pricing('<div id="app"></div><script>window.__DATA__={"price":"$8"}</script>'))["pricing-in-text"]).toBe("warn");
    expect(statusOf(pricing("<p>Start your free trial today.</p>"))["pricing-in-text"]).toBe("warn");
    expect(statusOf(pricing("<p>Free plan for individuals.</p>"))["pricing-in-text"]).toBe("pass");
    expect(runChecks({ ...base, bestPractice: false }).find((r) => r.id === "structure")?.summary).toMatch(/turn on best-practice checks/);
    const gatedDocs: AgentInputs = { ...base, probes: { ...base.probes, docs: probe("https://fieldnote.example/docs/getting-started", "", { finalUrl: "https://fieldnote.example/login" }) } };
    expect(statusOf(gatedDocs)["docs-public"]).toBe("warn");
  });

  it("notices API descriptions and agent tools when a site offers them", () => {
    const withTools: AgentInputs = {
      ...base,
      endpoints: [
        { path: "/.well-known/api-catalog", status: 200, contentType: "application/linkset+json" },
        { path: "/.well-known/ai-catalog.json", status: 200, contentType: "application/ai-catalog+json" },
      ],
      markdownType: "text/markdown; charset=utf-8",
      probes: { ...base.probes, home: probe("https://fieldnote.example/", `<p>${words(100)}</p><script>document.modelContext.registerTool({ name: "search" })</script>`) },
    };
    expect(statusOf(withTools)).toMatchObject({ "api-description": "pass", "agent-tools": "pass", markdown: "pass" });
    const declarative: AgentInputs = { ...base, probes: { ...base.probes, home: probe("https://fieldnote.example/", `<p>${words(100)}</p><form toolname="search_notes" tooldescription="Search notes"></form>`) } };
    expect(statusOf(declarative)["agent-tools"]).toBe("pass");
  });
});
