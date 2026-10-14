import { describe, expect, it } from "vitest";
import { extractPage, isAllowedByRobots } from "./crawl.ts";

describe("isAllowedByRobots", () => {
  const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\nDisallow: /private*\n";

  it("applies only the * group", () => {
    expect(isAllowedByRobots(robots, "/about")).toBe(true);
    expect(isAllowedByRobots(robots, "/admin/users")).toBe(false);
    expect(isAllowedByRobots(robots, "/private-area")).toBe(false);
  });

  it("allows everything when nothing is disallowed", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow:\n", "/anything")).toBe(true);
  });
});

describe("extractPage", () => {
  it("pulls title, description, text and absolute links", () => {
    const html = `<html><head><title>Fieldnote</title><meta name="description" content="Notes for field researchers"></head>
      <body><nav><a href="/about">About</a><a href="https://other.site/x">x</a></nav>
      <main><p>Capture observations offline and sync them later.</p></main><script>var x=1</script></body></html>`;
    const page = extractPage("https://fieldnote.example", html);
    expect(page.title).toBe("Fieldnote");
    expect(page.content).toContain("Description: Notes for field researchers");
    expect(page.content).toContain("Capture observations offline");
    expect(page.content).not.toContain("var x");
    expect(page.links).toContain("https://fieldnote.example/about");
  });
});
