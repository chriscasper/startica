import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { adCampaigns, adCreatives, adGroups, ads, aiRuns, competitors, jobs, products } from "@startica/db/schema";
import { shapeOf, templateHtml } from "./templates.ts";

// Pictures come from runImage; tests hand back a small PNG and log what a real call would cost.
const image = vi.hoisted(() => ({ calls: [] as { system: string; prompt: string; size: string }[], png: Buffer.alloc(0) as Buffer }));
vi.mock("../ai/client.ts", async (original) => ({
  ...(await original<typeof import("../ai/client.ts")>()),
  runImage: vi.fn(async (ctx: { workspaceId: string; jobRunId?: string }, req: { system: string; messages: { content: string }[]; size: string }) => {
    image.calls.push({ system: req.system, prompt: req.messages[0]!.content, size: req.size });
    await getDb().insert(aiRuns).values({ workspaceId: ctx.workspaceId, jobRunId: ctx.jobRunId ?? null, task: "image", model: "gpt-image-2.5-flare", promptVersion: "ad-image@1", status: "ok", costUsd: 0.06 });
    return image.png;
  }),
}));
const { createCreative, creativeInput, deleteCreative, imageEstimate, listCreatives, readCreativeFile, saveLogo, updateCreative, CREATIVE_SPECS } = await import("./creatives.ts");
const { runCreativeImage, runCreativeRender } = await import("./creative-jobs.ts");
const { playwrightRenderer, renderTemplate, setRenderer } = await import("./render.ts");

/** A PNG's width and height from its IHDR chunk. */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
const jpegOrPng = (b: Buffer) => (b[0] === 0x89 ? "png" : b[0] === 0xff ? "jpeg" : "other");

let workspaceId = "";
let productId = "";
let campaignId = "";
let adId = "";
let renderer: Awaited<ReturnType<typeof playwrightRenderer>> = null;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-creatives-"));
  process.env.STARTICA_DATA_DIR = dir;
  openDatabase(join(dir, "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
  productId = (await getDb().insert(products).values({ workspaceId, name: "Fieldnote", oneLiner: "Offline field notes" }).returning())[0]!.id;
  await getDb().insert(competitors).values({ workspaceId, productId, name: "Notably" });
  campaignId = (await getDb().insert(adCampaigns).values({ workspaceId, productId, platform: "reddit", name: "Reddit test", goal: "Signups", landingUrl: "https://fieldnote.example/", utmCampaign: "reddit-test", status: "draft" }).returning())[0]!.id;
  const groupId = (await getDb().insert(adGroups).values({ workspaceId, campaignId, name: "Group" }).returning())[0]!.id;
  adId = (await getDb().insert(ads).values({ workspaceId, groupId, copy: { title: "Hello" } }).returning())[0]!.id;
  renderer = await playwrightRenderer();
  setRenderer(renderer);
  // A picture to "draw": the renderer itself makes a 2048×2048 PNG from a plain page.
  const pic = mkdtempSync(join(tmpdir(), "startica-pic-"));
  writeFileSync(join(pic, "index.html"), `<body style="margin:0;background:linear-gradient(#f97316,#1e3a8a)"><script>document.documentElement.dataset.ready=1</script>`);
  image.png = renderer ? (await renderer.render({ dir: pic, width: 2048, height: 2048, format: "png" })).data : Buffer.alloc(0);
}, 60_000);
afterAll(async () => {
  await renderer?.close?.();
  setRenderer(null);
  closeDatabase();
});

const campaign = async () => (await getDb().select().from(adCampaigns).where(eq(adCampaigns.id, campaignId)))[0]!;
const form = (v: Record<string, string>) => creativeInput.parse({ headline: "Notes that write themselves", subline: "Offline, with photos", cta: "Try it free", ...v });

describe("templates", () => {
  it("escapes the words and ignores bad colors and file names", () => {
    const html = templateHtml({
      template: "overlay",
      width: 1080,
      height: 1080,
      text: { headline: `<img src=x onerror=alert(1)> "Fast" & free` },
      colors: { background: "red;}</style><script>", text: "#ffffff", accent: "#000000" },
      image: "../../etc/passwd",
      logo: "javascript:alert(1)",
    });
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &quot;Fast&quot; &amp; free");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("--bg: #111827");
    expect(html).not.toContain("passwd");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("default-src 'none'");
  });

  it("knows wide, tall and square", () => {
    expect(shapeOf(1200, 628)).toBe("wide");
    expect(shapeOf(1080, 1920)).toBe("tall");
    expect(shapeOf(1080, 1350)).toBe("square");
  });
});

describe("rendering", () => {
  it("renders every template at exactly the ad's size, with the words fitted", async () => {
    if (!renderer) return; // Playwright's Chromium isn't installed here
    for (const template of ["overlay", "panel", "frame"] as const)
      for (const [width, height] of [
        [1200, 628],
        [1080, 1920],
      ] as const) {
        const out = await renderTemplate(
          { template, width, height, text: { headline: "A very long headline that has to shrink to fit inside the space the template gives it", cta: "Go" }, colors: { background: "#0f172a", text: "#ffffff", accent: "#facc15" }, image: null, logo: null, imagePath: null, logoPath: null },
          30e6,
        );
        expect(out.format).toBe("png");
        expect(pngSize(out.data)).toEqual({ width, height });
      }
  });

  it("says when the words had to shrink a lot, or still don't fit", async () => {
    if (!renderer) return;
    const render = (headline: string, subline?: string) =>
      renderTemplate(
        { template: "panel", width: 1200, height: 628, text: { headline, subline, cta: "Try it" }, colors: { background: "#0f172a", text: "#ffffff", accent: "#facc15" }, image: null, logo: null, imagePath: null, logoPath: null },
        30e6,
      );
    expect((await render("Notes that write themselves")).fit).toBe("ok");
    const line = "Field notes for crews who work far from a signal and need every photo to sync ";
    expect((await render(line.repeat(3).trim())).fit).toBe("small");
    expect((await render(line.repeat(8).trim(), line.repeat(8))).fit).toBe("overflow");
  }, 30_000);

  it("falls back to JPEG when a PNG is over the platform's limit", async () => {
    if (!renderer) return;
    const dir = mkdtempSync(join(tmpdir(), "startica-big-"));
    const path = join(dir, "pic.png");
    writeFileSync(path, image.png);
    const out = await renderTemplate({ template: "overlay", width: 1080, height: 1350, text: { headline: "Hi" }, colors: { background: "#000000", text: "#ffffff", accent: "#ff0000" }, image: null, logo: null, imagePath: path, logoPath: null }, 60_000);
    expect(out.format).toBe("jpeg");
    expect(out.data.length).toBeLessThanOrEqual(60_000);
  });

  it("blocks every request outside the render folder", async () => {
    if (!renderer) return;
    const { renderRequestAllowed } = await import("./render.ts");
    expect(renderRequestAllowed("file:///tmp/startica-render-abc/picture.png", "/tmp/startica-render-abc")).toBe(true);
    expect(renderRequestAllowed("file:///tmp/startica-render-abcd/x.png", "/tmp/startica-render-abc")).toBe(false);
    expect(renderRequestAllowed("file:///etc/passwd", "/tmp/startica-render-abc")).toBe(false);
    expect(renderRequestAllowed("https://fieldnote.example/pixel.gif", "/tmp/startica-render-abc")).toBe(false);
  });
});

describe("creatives", () => {
  it("estimates a picture's cost from the image model and quality", async () => {
    const e = await imageEstimate({ workspaceId });
    expect(e.model).toBe("gpt-image-2.5-flare");
    expect(e.quality).toBe("medium");
    // 4 MP at medium: ~1,756 output tokens at $30 per million, plus the prompt.
    expect(e.usd).toBeGreaterThan(0.04);
    expect(e.usd).toBeLessThan(0.07);
  });

  it("refuses pictures of other brands and needs a concept to draw", async () => {
    await expect(createCreative(await campaign(), form({ image_source: "ai", concept: "A Notably notebook on a desk" }), null, ["Notably"])).rejects.toThrow(/Leave Notably out/);
    await expect(createCreative(await campaign(), form({ image_source: "ai", concept: "" }), null, [])).rejects.toThrow(/what the picture should show/);
    await expect(createCreative(await campaign(), form({ image_source: "upload" }), Buffer.from("not an image"), [])).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(createCreative(await campaign(), form({ image_source: "none", ad_id: "00000000-0000-4000-8000-000000000000" }), null, [])).rejects.toThrow(/isn't in this campaign/);
  });

  it("draws the picture, keeps the prompt and cost, then renders every Reddit size", async () => {
    if (!renderer) return;
    const id = await createCreative(await campaign(), form({ image_source: "ai", concept: "A notebook on a mossy rock by a stream", ad_id: adId }), null, ["Notably"]);
    const [job] = await getDb().select().from(jobs).where(eq(jobs.queue, "ad_creative_image"));
    expect(job?.payload).toMatchObject({ creativeId: id });
    await runCreativeImage({ workspaceId, jobRunId: undefined }, { workspaceId, creativeId: id });
    expect(image.calls.at(-1)!.size).toBe("2048x2048");
    expect(image.calls.at(-1)!.system).toMatch(/No text, letters/);
    expect(image.calls.at(-1)!.prompt).toContain("Fieldnote: Offline field notes");
    let [row] = await getDb().select().from(adCreatives).where(eq(adCreatives.id, id));
    expect(row!.status).toBe("rendering");
    expect(row!.prompt).toContain("A notebook on a mossy rock");
    expect(row!.imageFile).toBe("picture.png");
    await runCreativeRender({ workspaceId }, { workspaceId, creativeId: id });
    [row] = await getDb().select().from(adCreatives).where(eq(adCreatives.id, id));
    expect(row!.status).toBe("ready");
    expect(row!.renders.map((r) => r.size)).toEqual(CREATIVE_SPECS.reddit.sizes.map((s) => s.size));
    for (const r of row!.renders) {
      const data = readCreativeFile(id, r.file)!;
      expect(data.length).toBe(r.bytes);
      expect(r.bytes).toBeLessThanOrEqual(CREATIVE_SPECS.reddit.maxBytes);
      if (jpegOrPng(data) === "png") expect(pngSize(data)).toEqual({ width: r.width, height: r.height });
    }
    expect(readCreativeFile(id, "../../startica.db")).toBeNull();
  }, 60_000);

  it("uploads, adds the logo, and re-renders on edit without drawing again", async () => {
    if (!renderer) return;
    saveLogo(productId, image.png);
    const id = await createCreative(await campaign(), form({ image_source: "upload", use_logo: "on" }), image.png, []);
    await runCreativeRender({ workspaceId }, { workspaceId, creativeId: id });
    let [row] = await getDb().select().from(adCreatives).where(eq(adCreatives.id, id));
    expect(row!.status).toBe("ready");
    const drawn = image.calls.length;
    await updateCreative(row!, await campaign(), form({ image_source: "keep", headline: "New words", template: "frame" }), null, []);
    [row] = await getDb().select().from(adCreatives).where(eq(adCreatives.id, id));
    expect(row!.status).toBe("rendering");
    expect(row!.template).toBe("frame");
    await runCreativeRender({ workspaceId }, { workspaceId, creativeId: id });
    expect(image.calls.length).toBe(drawn);
    await deleteCreative(row!);
    expect(readCreativeFile(id, "picture.png")).toBeNull();
    expect((await listCreatives(campaignId)).some((c) => c.id === id)).toBe(false);
  }, 60_000);

  it("records a failed render with a reason", async () => {
    const id = await createCreative(await campaign(), form({ image_source: "none" }), null, []);
    setRenderer(null);
    try {
      await expect(runCreativeRender({ workspaceId }, { workspaceId, creativeId: id })).rejects.toThrow(/can't be rendered here/);
    } finally {
      setRenderer(renderer);
    }
    const [row] = await getDb().select().from(adCreatives).where(eq(adCreatives.id, id));
    expect(row!.status).toBe("failed");
    expect(row!.error).toMatch(/can't be rendered here/);
  });
});
