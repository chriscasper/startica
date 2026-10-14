import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Db } from "@startica/db/client";
import { eq } from "drizzle-orm";
import * as s from "@startica/db/schema";

/**
 * The demo's ad campaigns (ARCHITECTURE.md section 8.6): a Google search campaign ready to hand off,
 * and a Reddit campaign the founder has launched. Written as a plan would have stored them.
 */

type Campaign = Omit<typeof s.adCampaigns.$inferInsert, "workspaceId" | "productId"> & {
  groups: { name: string; angle: string; targeting: s.AdTargeting; ads: s.AdCopy[] }[];
};

const CAMPAIGNS: Campaign[] = [
  {
    platform: "google",
    name: "Search: offline field notes",
    goal: "Free signups from grad students searching for a field notes app",
    landingUrl: "https://fieldnote.example/",
    monthlyBudget: 300,
    testBudget: 210,
    testDays: 21,
    successMetric: "Cost per signup under $12 by day 21. Stop early if 100 clicks bring no signups.",
    bidStrategy: "Maximize clicks with a $2.50 max CPC until signups are tracked as conversions in Google Ads.",
    summary:
      "Two small ad groups for people already searching for a way to take notes in the field: one for the app itself, one for working without signal. Exact and phrase match keep the budget on searches with intent. Watch the search terms report in the first week and add negatives for anything unrelated.",
    status: "draft",
    utmCampaign: "search-offline-field-notes",
    groups: [
      {
        name: "Field notes app",
        angle: "Researchers looking for an app to replace the paper field notebook.",
        targeting: {
          keywords: [
            { text: "field notes app", match: "phrase" },
            { text: "field notebook app", match: "phrase" },
            { text: "digital field notebook", match: "exact" },
            { text: "app for field research notes", match: "phrase" },
            { text: "ecology field data app", match: "phrase" },
          ],
          negativeKeywords: ["jobs", "course", "template pdf", "music"],
          locations: ["United States", "Canada", "United Kingdom"],
        },
        ads: [
          {
            headlines: [
              "Field Notes App for Research",
              "Fieldnote: Field Notebook",
              "Works With No Signal",
              "GPS and Time on Every Note",
              "Photos and Audio in One Note",
              "Templates for Transects",
              "Sync When You're Back",
              "Export to CSV or GeoJSON",
              "Free for 3 Projects",
              "Built for Grad Students",
            ],
            descriptions: [
              "An offline-first notebook for field research. Notes carry location, time and photos.",
              "Reusable templates keep a team's observations consistent. Free for individuals.",
              "Stop typing up paper notes at night. Capture once, sync when you're back in range.",
              "Export to CSV, GeoJSON or Markdown for analysis. Team plan $8 a researcher a month.",
            ],
            path1: "field-notes",
            path2: "app",
          },
        ],
      },
      {
        name: "No signal",
        angle: "People whose note app fails where they work: remote sites without coverage.",
        targeting: {
          keywords: [
            { text: "offline note taking app", match: "phrase" },
            { text: "notes app without internet", match: "phrase" },
            { text: "offline data collection app", match: "phrase" },
          ],
          negativeKeywords: ["free download windows", "music", "game"],
          locations: ["United States", "Canada", "United Kingdom"],
        },
        ads: [
          {
            headlines: [
              "Notes That Work Offline",
              "Made for No-Signal Sites",
              "Offline Field Notebook",
              "Syncs When You're in Range",
              "Location Stamped Notes",
              "Photos Next to Each Note",
              "Fieldnote for Fieldwork",
              "Free for Individuals",
            ],
            descriptions: [
              "Fieldnote works fully offline and syncs to your team when the connection comes back.",
              "Every note stamped with location, time and weather. Free for 3 projects!",
            ],
            path1: "offline",
          },
        ],
      },
    ],
  },
  {
    platform: "reddit",
    name: "Reddit: grad student fieldwork",
    goal: "Signups from ecology and anthropology grad students",
    landingUrl: "https://fieldnote.example/",
    monthlyBudget: 150,
    testBudget: 100,
    testDays: 14,
    successMetric: "At least 15 signups in 14 days (under about $7 each).",
    targetCost: 7,
    bidStrategy: "Automatic bidding with a daily budget of about $7.",
    summary:
      "Promoted posts in the communities where grad students talk about fieldwork, written like a post from the team. Plain claims and the free plan up front: Redditors respond to what it is, not to hype.",
    status: "running",
    utmCampaign: "reddit-grad-student-fieldwork",
    groups: [
      {
        name: "Fieldwork communities",
        angle: "Grad students preparing for or in the middle of a field season.",
        targeting: { communities: ["ecology", "GradSchool", "AskAcademia", "Anthropology"], interests: ["Science", "Education"], locations: ["United States", "Canada"] },
        ads: [
          { title: "We built an offline field notebook after one too many soggy paper notebooks. Free for 3 projects.", body: "Notes carry GPS, time and photos, follow templates for transects or interviews, and sync when you're back in range.", callToAction: "Sign Up" },
          { title: "Typing up field notes every night? Fieldnote captures them once, with location and photos.", callToAction: "Learn More" },
        ],
      },
    ],
  },
];

// AD3 fixture for the running Reddit campaign: two weeks of spend and GA4 visits per ad.
// Ad 1 brings signups well under the $7 target (Scale); ad 2 costs four times as much (Stop).
const DEMO_RESULTS = [
  { spend: [28, 31], clicks: [140, 162], impressions: [52_000, 56_000], visitsPerDay: 18, signups: [1, 1, 0, 2, 1, 1, 0, 1, 2, 1, 1, 0, 2, 1] },
  { spend: [27, 30], clicks: [96, 88], impressions: [50_000, 54_000], visitsPerDay: 11, signups: [0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
];

/** A stand-in "photo" for the demo creative, drawn with CSS (the demo never calls an image model). */
const DEMO_PICTURE = `<html><body style="margin:0;width:2048px;height:2048px;overflow:hidden;background:linear-gradient(180deg,#bfe3f2 0%,#e8f3e9 46%,#8fb48a 47%,#56804f 100%)">
<div style="position:absolute;left:-200px;top:820px;width:1400px;height:500px;border-radius:50%;background:#6f9a68"></div>
<div style="position:absolute;left:900px;top:860px;width:1500px;height:520px;border-radius:50%;background:#7fa877"></div>
<div style="position:absolute;left:0;top:1350px;width:2048px;height:700px;background:linear-gradient(180deg,#a87b4f,#7a5532)"></div>
<div style="position:absolute;left:560px;top:1080px;width:900px;height:640px;background:#fdf8ec;border-radius:18px;transform:rotate(-6deg);box-shadow:0 40px 80px rgba(0,0,0,.35)">
<div style="margin:90px 80px;height:6px;background:#c9d6e3;box-shadow:0 70px 0 #c9d6e3,0 140px 0 #c9d6e3,0 210px 0 #c9d6e3,0 280px 0 #c9d6e3,0 350px 0 #c9d6e3"></div></div>
<div style="position:absolute;left:1380px;top:1180px;width:60px;height:520px;background:#2f4858;border-radius:30px;transform:rotate(28deg)"></div>
<div style="position:absolute;left:1560px;top:380px;width:220px;height:220px;border-radius:50%;background:#fff6c9;box-shadow:0 0 160px 60px rgba(255,240,180,.7)"></div>
<script>document.documentElement.dataset.ready=1</script></body></html>`;

/** Creatives for the Reddit campaign: one rendered (when a renderer is available), one idea. */
async function seedDemoCreatives(tx: Db, workspaceId: string, campaignId: string, adId: string | undefined): Promise<void> {
  const [ready] = await tx
    .insert(s.adCreatives)
    .values({
      workspaceId,
      campaignId,
      adId: adId ?? null,
      concept: "An open paper field notebook on a weathered wooden table at the edge of a meadow, hills behind, soft morning sun",
      template: "overlay",
      text: { headline: "Your field notebook, minus the soggy pages", subline: "Offline notes with GPS, photos and templates. Free for 3 projects.", cta: "Sign up free" },
      colors: { background: "#1f2d24", text: "#ffffff", accent: "#f2c14e" },
      useLogo: false,
      imageSource: "upload",
      status: "idea",
    })
    .returning({ id: s.adCreatives.id });
  await tx.insert(s.adCreatives).values({
    workspaceId,
    campaignId,
    concept: "A grad student's backpack open on a rock by a stream, a rugged tablet and a muddy pencil beside it, overcast light",
    template: "panel",
    text: { headline: "Stop typing up field notes at night", subline: "Capture them once, with location and photos.", cta: "Learn more" },
    colors: { background: "#f6f1e7", text: "#1d2a22", accent: "#2f6b4f" },
    useLogo: false,
    status: "idea",
  });
  // Rendering is local (no AI, nothing sent anywhere): draw the stand-in picture, then the sizes.
  const { getRenderer } = await import("../ads/render.ts");
  const renderer = getRenderer();
  if (!renderer) return;
  const dir = mkdtempSync(join(tmpdir(), "startica-demo-"));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), DEMO_PICTURE);
    const { data: picture } = await renderer.render({ dir, width: 2048, height: 2048, format: "jpeg", quality: 88 });
    const { savePicture } = await import("../ads/creatives.ts");
    const { runCreativeRender } = await import("../ads/creative-jobs.ts");
    await tx.update(s.adCreatives).set({ imageFile: savePicture(ready!.id, picture), status: "rendering" }).where(eq(s.adCreatives.id, ready!.id));
    await runCreativeRender({ workspaceId }, { workspaceId, creativeId: ready!.id });
  } catch {
    // No renderer that works here: the creative stays an idea.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function seedDemoResults(tx: Db, workspaceId: string, productId: string, campaignId: string, adIds: string[]): Promise<void> {
  const localDay = (d: Date) => d.toLocaleDateString("en-CA");
  const dayAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDay(d);
  };
  const metrics: (typeof s.metricsSnapshots.$inferInsert)[] = [];
  for (const [i, r] of DEMO_RESULTS.entries()) {
    const adId = adIds[i];
    if (!adId) continue;
    await tx.insert(s.adSpend).values([
      { workspaceId, campaignId, adId, startDay: dayAgo(13), endDay: dayAgo(7), amount: r.spend[0]!, clicks: r.clicks[0]!, impressions: r.impressions[0]! },
      { workspaceId, campaignId, adId, startDay: dayAgo(6), endDay: dayAgo(0), amount: r.spend[1]!, clicks: r.clicks[1]!, impressions: r.impressions[1]! },
    ]);
    for (let n = 0; n < 14; n++) {
      const day = dayAgo(13 - n);
      const dimension = `utm_content:${adId}`;
      metrics.push({ workspaceId, productId, day, source: "ga4", metric: "sessions", dimension, value: r.visitsPerDay + ((n * 7) % 5) - 2 });
      metrics.push({ workspaceId, productId, day, source: "ga4", metric: "key_events", dimension, value: r.signups[n]! });
    }
  }
  if (metrics.length) await tx.insert(s.metricsSnapshots).values(metrics);
}

export async function seedDemoAds(tx: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  let count = 0;
  for (const [i, { groups, ...campaign }] of CAMPAIGNS.entries()) {
    const [row] = await tx
      .insert(s.adCampaigns)
      .values({ ...campaign, workspaceId, productId, createdAt: ago(10 - i * 6), updatedAt: ago(9 - i * 6) })
      .returning({ id: s.adCampaigns.id });
    for (const [position, g] of groups.entries()) {
      const [group] = await tx.insert(s.adGroups).values({ workspaceId, campaignId: row!.id, name: g.name, angle: g.angle, targeting: g.targeting, position }).returning({ id: s.adGroups.id });
      const adRows = await tx
        .insert(s.ads)
        .values(g.ads.map((copy, n) => ({ workspaceId, groupId: group!.id, copy, createdAt: ago(9 - i * 6, -n) })))
        .returning({ id: s.ads.id });
      if (campaign.status === "running" && position === 0) {
        await seedDemoResults(tx, workspaceId, productId, row!.id, adRows.map((a) => a.id));
        await seedDemoCreatives(tx, workspaceId, row!.id, adRows[0]?.id);
      }
    }
    count++;
  }
  return count;
}
