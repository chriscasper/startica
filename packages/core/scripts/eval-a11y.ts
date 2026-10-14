/**
 * Runs Accessibility's fix-suggestion eval (ARCHITECTURE.md section 9.4) against the current
 * prompt and the draft task's model, in a throwaway database. Each suggested fix is
 * swapped into a small page in Playwright's Chromium and checked with the same axe rule.
 * Called by `yarn eval a11y`. Needs Playwright's Chromium.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sum } from "drizzle-orm";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { aiModels, aiRuns } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { PROVIDERS, type AiProvider } from "../src/ai/models.ts";
import { runStructured } from "../src/ai/client.ts";
import { FIX_CASES, page } from "../src/ai/evals/a11y/cases.ts";
import { FIX_PROMPT_VERSION, FIX_SYSTEM, fixMessage, fixOutput } from "../src/a11y/ai.ts";
import { axeSource } from "../src/a11y/scanner.ts";

export async function runA11yEvals(provider: AiProvider, apiKey: string, model?: string): Promise<number> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    console.error("The a11y eval needs Playwright's Chromium: yarn playwright install chromium (in apps/desktop-web).");
    return 1;
  }
  const dir = mkdtempSync(join(tmpdir(), "startica-eval-"));
  openDatabase(join(dir, "eval.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../db/migrations"));
  const workspaceId = (await ensureWorkspace()).id;
  await putSecret(PROVIDERS[provider].secret, apiKey);
  if (model) await getDb().update(aiModels).set({ model }).where(eq(aiModels.task, "draft"));
  const [routing] = await getDb().select().from(aiModels).where(eq(aiModels.task, "draft"));
  console.log(`Prompt ${FIX_PROMPT_VERSION}, model ${routing?.model}\n`);

  const browser = await pw.chromium.launch();
  const axe = axeSource();
  /** Whether the rule passes on a page with this body (no violations of it). */
  const passes = async (ruleId: string, body: string) => {
    const tab = await browser.newPage();
    try {
      await tab.setContent(page(body));
      await tab.evaluate(axe);
      const violations = (await tab.evaluate(`axe.run(document, { runOnly: { type: "rule", values: [${JSON.stringify(ruleId)}] } }).then((r) => r.violations.length)`)) as number;
      return violations === 0;
    } finally {
      await tab.close();
    }
  };

  let failures = 0;
  for (const c of FIX_CASES) {
    const problems: string[] = [];
    try {
      if (await passes(c.rule.id, c.html)) problems.push("the original already passes (bad case)");
      const out = await runStructured({ workspaceId }, {
        task: "draft",
        promptVersion: FIX_PROMPT_VERSION,
        system: FIX_SYSTEM,
        messages: [{ role: "user", content: fixMessage({ ...c.rule, ruleId: c.rule.id }, [{ url: "https://fieldnote.example/", selector: "main > *", html: c.html, summary: c.summary }], c.pages) }],
        schema: fixOutput,
      });
      if (!(await passes(c.rule.id, out.fixed_html))) problems.push(`the fix still fails ${c.rule.id}: ${out.fixed_html}`);
      if (out.steps.length === 0) problems.push("no steps");
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    failures += problems.length ? 1 : 0;
    console.log(`  ${problems.length ? "✗" : "✓"} ${c.id}${problems.length ? `: ${problems.join("; ")}` : ""}`);
  }

  await browser.close();
  const [cost] = await getDb().select({ total: sum(aiRuns.costUsd) }).from(aiRuns);
  console.log(`\n${failures ? `${failures} failed` : "All passed"}. Cost: $${Number(cost?.total ?? 0).toFixed(4)}`);
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
  return failures;
}
