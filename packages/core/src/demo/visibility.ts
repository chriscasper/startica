import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { runMetrics, type AnalyzedAnswer } from "../visibility/analysis.ts";

/**
 * The demo's AI visibility (ARCHITECTURE.md section 10.2): twelve questions and four weekly runs in
 * which Fieldnote gets mentioned a little more each week. Written as runs would store them.
 */

const QUESTIONS: { text: string; topic: string; stage: s.PromptStage }[] = [
  { text: "What's the best app for taking field notes when there's no phone signal?", topic: "offline notes", stage: "discover" },
  { text: "How do ecology grad students organize field data from transects?", topic: "transects", stage: "discover" },
  { text: "Good alternatives to TerraJot for a small research team", topic: "alternatives", stage: "compare" },
  { text: "TerraJot vs Quadrat for archaeology field schools", topic: "alternatives", stage: "compare" },
  { text: "Is there a field notebook app that tags notes with GPS and weather automatically?", topic: "offline notes", stage: "discover" },
  { text: "Which note app should my lab use to share site observations?", topic: "teams", stage: "decide" },
  { text: "Digital field notebook for anthropology interviews and photos", topic: "interviews", stage: "discover" },
  { text: "How can I export field notes to CSV or GeoJSON for analysis?", topic: "export", stage: "discover" },
  { text: "Logbook Pro is too expensive for students, what else is there?", topic: "alternatives", stage: "compare" },
  { text: "Best offline-first notes app for UX researchers on site visits", topic: "offline notes", stage: "decide" },
  { text: "Templates for consistent field observations across a team", topic: "teams", stage: "discover" },
  { text: "What do field researchers use instead of paper notebooks?", topic: "offline notes", stage: "discover" },
];

const COMPETITORS = ["TerraJot", "Quadrat", "Logbook Pro"];

/** Which questions mention Fieldnote in each run (oldest first): visibility grows week by week. */
const MENTIONED: number[][] = [
  [0, 4, 9],
  [0, 4, 9, 2],
  [0, 4, 9, 2, 10],
  [0, 4, 9, 2, 10, 7],
];
const RECOMMENDED = new Set([0, 9, 2]);

function answerFor(q: number, mentioned: boolean, recommended: boolean, run: number): { analysis: AnalyzedAnswer; text: string; citations: s.AnswerCitation[] } {
  const others = [COMPETITORS[q % 3]!, COMPETITORS[(q + 1) % 3]!];
  const named = mentioned ? (recommended ? ["Fieldnote", ...others] : [...others, "Fieldnote"]) : others;
  const position = mentioned ? named.indexOf("Fieldnote") + 1 : null;
  const lines = named.map((p) =>
    p === "Fieldnote"
      ? `- **Fieldnote**: an offline-first field notebook; notes carry location, time and photos and sync to a shared project later.`
      : `- **${p}**: a popular choice for structured field data, with templates and team sharing.`,
  );
  const text = `Here are options researchers commonly use:\n\n${lines.join("\n")}\n\nPick based on whether you need offline use, team sharing and exports.`;
  const citations: s.AnswerCitation[] = [
    { url: `https://www.reddit.example/r/ecology/comments/field-notes-${q}`, title: "What do you use for field notes? : r/ecology" },
    { url: `https://reviews.example/field-notebook-apps-${2026 - (run % 2)}`, title: "The best field notebook apps" },
    ...(mentioned && q % 2 === 0 ? [{ url: "https://fieldnote.example/features/offline", title: "Offline field notes | Fieldnote" }] : []),
  ];
  return {
    text,
    citations,
    analysis: {
      mentioned,
      recommended: mentioned && recommended,
      position,
      productsNamed: named,
      competitors: others,
      ownCitations: citations.filter((c) => c.url.startsWith("https://fieldnote.example")).map((c) => c.url),
      description: mentioned ? "an offline-first field notebook; notes carry location, time and photos" : null,
      sentiment: mentioned ? "positive" : null,
    },
  };
}

export async function seedDemoVisibility(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const prompts = await db
    .insert(s.aiPrompts)
    .values(QUESTIONS.map((q, i) => ({ workspaceId, productId, ...q, source: i === 8 ? ("owner" as const) : ("ai" as const), createdAt: ago(30, -i) })))
    .returning({ id: s.aiPrompts.id, text: s.aiPrompts.text });
  for (const [run, mentionedIdx] of MENTIONED.entries()) {
    const startedAt = ago(21 - run * 7, 3);
    const results = QUESTIONS.map((_, q) => answerFor(q, mentionedIdx.includes(q), RECOMMENDED.has(q), run));
    const metrics = runMetrics(
      results.map((r) => r.analysis),
      "Fieldnote",
      COMPETITORS,
    );
    const [row] = await db
      .insert(s.aiVisibilityRuns)
      .values({
        workspaceId,
        productId,
        model: "claude-sonnet-5-5",
        status: "done",
        trigger: run === 0 ? "manual" : "weekly",
        promptCount: QUESTIONS.length,
        capUsd: 2,
        costUsd: 0.71 + run * 0.03,
        metrics,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 6 * 60_000),
        createdAt: startedAt,
      })
      .returning({ id: s.aiVisibilityRuns.id });
    await db.insert(s.aiVisibilityAnswers).values(
      results.map((r, q) => ({
        workspaceId,
        runId: row!.id,
        promptId: prompts[q]!.id,
        promptText: prompts[q]!.text,
        answer: r.text,
        citations: r.citations,
        searches: [QUESTIONS[q]!.text.toLowerCase().replace(/[?,]/g, "").split(" ").slice(0, 6).join(" ")],
        ...r.analysis,
        createdAt: startedAt,
      })),
    );
  }
  return QUESTIONS.length;
}
