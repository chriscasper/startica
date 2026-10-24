import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { localDay } from "../growth/moves.ts";

/**
 * The demo's content calendar (ARCHITECTURE.md, Content Studio): a season of earlier Bluesky
 * posts with their engagement (so the best-time hint has something to say), an AI content plan
 * for the coming week written by hand (no AI calls), a planned Inbox reply, and one post image
 * rendered from a CSS-drawn stand-in picture when a renderer is available.
 */

// Earlier Bluesky posts: mornings on Tuesdays and Thursdays did well, late evenings didn't.
const HISTORY: { weeksAgo: number; weekday: number; hour: number; score: number; replies: number; topic: string }[] = [
  { weeksAgo: 20, weekday: 2, hour: 9, score: 48, replies: 9, topic: "A waterproof notebook isn't a backup plan" },
  { weeksAgo: 19, weekday: 4, hour: 9, score: 41, replies: 6, topic: "Five fields every transect note needs" },
  { weeksAgo: 18, weekday: 0, hour: 21, score: 6, replies: 0, topic: "Sunday field kit check" },
  { weeksAgo: 17, weekday: 2, hour: 10, score: 37, replies: 7, topic: "Photos next to the note, not in a camera roll" },
  { weeksAgo: 16, weekday: 5, hour: 21, score: 4, replies: 1, topic: "What we packed for the coastal survey" },
  { weeksAgo: 15, weekday: 4, hour: 9, score: 52, replies: 11, topic: "Typing up field notes at night is a tax" },
  { weeksAgo: 14, weekday: 3, hour: 22, score: 5, replies: 0, topic: "Late thought on plot codes" },
  { weeksAgo: 13, weekday: 2, hour: 9, score: 44, replies: 8, topic: "Offline first, sync later: why it matters in the field" },
  { weeksAgo: 12, weekday: 6, hour: 20, score: 7, replies: 1, topic: "Weekend reading on field methods" },
  { weeksAgo: 11, weekday: 4, hour: 10, score: 39, replies: 5, topic: "Templates keep a team's notes comparable" },
];

/** The demo plan: three posts over the next week. Bodies are written here; the demo never calls the AI. */
const PLAN = {
  summary: "Teach first: two practical posts on taking field notes without signal, then one on what a season of structured notes makes possible, with Fieldnote mentioned only where it fits.",
  items: [
    {
      offset: 1,
      hour: 9,
      channel: "bluesky" as const,
      format: "post" as const,
      topic: "Three things to write down before you lose signal",
      why: "Bluesky posts did best around 09:00 on Tuesdays and Thursdays; a short checklist suits the feed.",
      body: "Three things to write down before you lose signal on a field day:\n\n1. Plot code and GPS fix\n2. Weather and time\n3. Who's on the team today\n\nEverything else can wait until you're back in range.",
      image: true,
    },
    {
      offset: 3,
      hour: 12,
      channel: "linkedin" as const,
      format: "post" as const,
      topic: "What a season of structured field notes taught our lab",
      why: "A longer lesson for lab leads reading at lunch; the weekly read-out says LinkedIn visits convert best.",
      body: "We spent a season taking field notes with the same template across six people.\n\nThe surprise wasn't speed. It was that we could finally compare plots without a week of cleanup.\n\nThree things made the difference:\n- one template per method, agreed before the season\n- photos attached to the note, not the camera roll\n- syncing at the end of the day, not the end of the month\n\nWhat does your team standardize before fieldwork starts?",
      image: false,
    },
    {
      offset: 5,
      hour: 18,
      channel: "mastodon" as const,
      format: "post" as const,
      topic: "Ask: how do you back up field notes without signal?",
      why: "A question invites replies; Mastodon's science communities are active in the early evening.",
      body: "Question for #FieldWork folks: how do you back up notes on multi-day trips without signal? Paper copies, a second device, something else? Collecting ideas for our next field school. #Ecology #FieldResearch",
      image: false,
    },
  ],
};

/** A stand-in "photo" for the demo post image, drawn with CSS. */
const DEMO_PICTURE = `<html><body style="margin:0;width:2048px;height:2048px;overflow:hidden;background:linear-gradient(180deg,#9cc6dd 0%,#d8ead6 50%,#6e9566 51%,#3f6337 100%)">
<div style="position:absolute;left:300px;top:1050px;width:1450px;height:700px;background:#7a5532;border-radius:24px"></div>
<div style="position:absolute;left:520px;top:900px;width:1000px;height:700px;background:#fdf8ec;border-radius:18px;transform:rotate(4deg);box-shadow:0 40px 80px rgba(0,0,0,.35)">
<div style="margin:100px 90px;height:6px;background:#c9d6e3;box-shadow:0 80px 0 #c9d6e3,0 160px 0 #c9d6e3,0 240px 0 #c9d6e3,0 320px 0 #c9d6e3"></div></div>
<div style="position:absolute;left:1500px;top:300px;width:240px;height:240px;border-radius:50%;background:#fff2b8;box-shadow:0 0 160px 60px rgba(255,236,170,.7)"></div>
<script>document.documentElement.dataset.ready=1</script></body></html>`;

export async function seedDemoPlanning(db: Db, workspaceId: string, productId: string, now: Date): Promise<{ pieces: number; images: number }> {
  const base = { workspaceId, productId };
  const at = (daysFromNow: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysFromNow, hour, 0);
  const [voice] = await db.select({ id: s.voiceProfiles.id }).from(s.voiceProfiles).where(eq(s.voiceProfiles.productId, productId)).limit(1);

  // Earlier posts with their engagement: the best-time hint for Bluesky.
  for (const h of HISTORY) {
    const day = at(-h.weeksAgo * 7, 0);
    const postedAt = new Date(day.getFullYear(), day.getMonth(), day.getDate() + ((h.weekday - day.getDay() + 7) % 7), h.hour, 12);
    const [piece] = await db
      .insert(s.contentPieces)
      .values({ ...base, voiceProfileId: voice?.id ?? null, channel: "bluesky", format: "post", topic: h.topic, title: null, body: h.topic, status: "posted", postedAt, postedUrl: `https://example.com/demo/bluesky/history-${h.weeksAgo}`, createdAt: postedAt })
      .returning({ id: s.contentPieces.id });
    await db.insert(s.contentSnapshots).values({ workspaceId, pieceId: piece!.id, score: h.score, replies: h.replies, capturedAt: new Date(postedAt.getTime() + 3 * 86400_000) });
  }

  // The coming week's AI plan, as the content_plan job would have stored it.
  const [plan] = await db
    .insert(s.contentPlans)
    .values({
      ...base,
      startDay: localDay(at(1, 0)),
      endDay: localDay(at(7, 0)),
      channels: ["bluesky", "linkedin", "mastodon"],
      postsPerWeek: 3,
      guidance: "Teach first; mention Fieldnote only where it helps.",
      status: "ready",
      summary: PLAN.summary,
      model: "demo",
      costUsd: 0.08,
      createdAt: new Date(now.getTime() - 3600_000),
    })
    .returning({ id: s.contentPlans.id });
  const items: s.ContentPlanItem[] = [];
  let imagePieceId: string | null = null;
  for (const i of PLAN.items) {
    const plannedAt = at(i.offset, i.hour);
    const [piece] = await db
      .insert(s.contentPieces)
      .values({
        ...base,
        voiceProfileId: voice?.id ?? null,
        channel: i.channel,
        format: i.format,
        topic: i.topic,
        body: i.body,
        rationale: i.why,
        status: "draft",
        plannedAt,
        planId: plan!.id,
        planWhy: i.why,
        createdAt: new Date(now.getTime() - 3000_000),
      })
      .returning({ id: s.contentPieces.id });
    items.push({ day: localDay(plannedAt), time: `${String(i.hour).padStart(2, "0")}:00`, channel: i.channel, format: i.format, topic: i.topic, why: i.why, pieceId: piece!.id });
    if (i.image) imagePieceId = piece!.id;
  }
  await db.update(s.contentPlans).set({ items }).where(eq(s.contentPlans.id, plan!.id));

  // A drafted Inbox reply planned for later today.
  const [drafted] = await db
    .select({ id: s.opportunities.id })
    .from(s.opportunities)
    .where(and(eq(s.opportunities.productId, productId), eq(s.opportunities.status, "drafted")))
    .orderBy(asc(s.opportunities.createdAt))
    .limit(1);
  if (drafted) await db.update(s.opportunities).set({ plannedAt: new Date(Math.ceil((now.getTime() + 2 * 3600_000) / 3600_000) * 3600_000) }).where(eq(s.opportunities.id, drafted.id));

  // One post image, rendered locally from the stand-in picture (no AI, nothing sent anywhere).
  let images = 0;
  const { getRenderer } = await import("../ads/render.ts");
  const renderer = getRenderer();
  if (imagePieceId && renderer) {
    const dir = mkdtempSync(join(tmpdir(), "startica-demo-post-"));
    try {
      writeFileSync(join(dir, "index.html"), DEMO_PICTURE);
      const { data: picture } = await renderer.render({ dir, width: 2048, height: 2048, format: "jpeg", quality: 88 });
      const [image] = await db
        .insert(s.contentImages)
        .values({
          ...base,
          pieceId: imagePieceId,
          concept: "An open field notebook on a wooden tailgate at the edge of a meadow, soft morning light",
          imageSource: "upload",
          template: "overlay",
          text: { headline: "Write these down before you lose signal", subline: "Plot code · weather · team" },
          colors: { background: "#1f2d24", text: "#ffffff", accent: "#f2c14e" },
          useLogo: false,
          status: "rendering",
        })
        .returning({ id: s.contentImages.id });
      const { savePictureIn } = await import("../ads/pipeline.ts");
      const { imageFolder } = await import("../content/images.ts");
      const { runContentImageRender } = await import("../content/image-jobs.ts");
      await db.update(s.contentImages).set({ imageFile: savePictureIn(imageFolder(image!.id), picture) }).where(eq(s.contentImages.id, image!.id));
      await runContentImageRender({ workspaceId }, { workspaceId, imageId: image!.id });
      images = 1;
    } catch {
      // No renderer that works here: the piece just has no image.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { pieces: HISTORY.length + PLAN.items.length, images };
}
