/**
 * Runs Security's AI eval set (ARCHITECTURE.md section 11.6) against the current prompts and
 * the draft task's model, in a throwaway database. Called by `yarn eval security`.
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
import { EXPLAIN_CASES, IMPORT_CASES, TRIAGE_CASES } from "../src/ai/evals/security/cases.ts";
import { EXPLAIN_PROMPT_VERSION, EXPLAIN_SYSTEM, explainOutput, IMPORT_PROMPT_VERSION, IMPORT_SYSTEM, importOutput, TRIAGE_PROMPT_VERSION, TRIAGE_SYSTEM, triageOutput } from "../src/security/ai.ts";
import { SECURITY_RULES, SEVERITY_ORDER, type SecuritySeverity } from "../src/security/rules.ts";

export async function runSecurityEvals(provider: AiProvider, apiKey: string, model?: string): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "startica-eval-"));
  openDatabase(join(dir, "eval.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../db/migrations"));
  const workspaceId = (await ensureWorkspace()).id;
  await putSecret(PROVIDERS[provider].secret, apiKey);
  if (model) await getDb().update(aiModels).set({ model }).where(eq(aiModels.task, "draft"));
  const [routing] = await getDb().select().from(aiModels).where(eq(aiModels.task, "draft"));
  console.log(`Prompts ${EXPLAIN_PROMPT_VERSION}, ${IMPORT_PROMPT_VERSION}, ${TRIAGE_PROMPT_VERSION}; model ${routing?.model}\n`);

  const ctx = { workspaceId };
  let failures = 0;
  const report = (id: string, problems: string[]) => {
    failures += problems.length ? 1 : 0;
    console.log(`  ${problems.length ? "✗" : "✓"} ${id}${problems.length ? `: ${problems.join("; ")}` : ""}`);
  };

  console.log("Explain and fix");
  for (const c of EXPLAIN_CASES) {
    try {
      const out = await runStructured(ctx, { task: "draft", promptVersion: EXPLAIN_PROMPT_VERSION, system: EXPLAIN_SYSTEM, messages: [{ role: "user", content: c.content }], schema: explainOutput });
      const all = [out.summary, ...out.steps, ...out.snippets.map((s) => s.code), out.verify].join("\n");
      report(c.id, [
        ...c.mustMention.filter((re) => !re.test(all)).map((re) => `doesn't mention ${re}`),
        ...(c.needsSnippet && out.snippets.length === 0 ? ["no config snippet"] : []),
        ...(out.steps.length < 2 ? ["fewer than 2 steps"] : []),
      ]);
    } catch (error) {
      report(c.id, [error instanceof Error ? error.message : String(error)]);
    }
  }

  console.log("\nImport a report");
  const known = Object.entries(SECURITY_RULES)
    .map(([id, r]) => `${id}: ${r.title}`)
    .join("\n");
  for (const c of IMPORT_CASES) {
    try {
      const out = await runStructured(ctx, {
        task: "draft",
        promptVersion: IMPORT_PROMPT_VERSION,
        system: `${IMPORT_SYSTEM}\n\nKnown checks (id: title):\n${known}`,
        messages: [{ role: "user", content: `The owner's site: https://fieldnote.example/\nThe report is called: eval\n\n<report>\n${c.text}\n</report>` }],
        schema: importOutput,
      });
      const problems: string[] = [];
      if (out.findings.length !== c.expectCount) problems.push(`${out.findings.length} findings, expected ${c.expectCount}`);
      for (const e of c.expect) {
        const f = out.findings.find((x) => e.title.test(x.title));
        if (!f) problems.push(`no finding matching ${e.title}`);
        else {
          if (f.severity !== e.severity) problems.push(`"${f.title}" is ${f.severity}, expected ${e.severity}`);
          if (e.rule && f.rule !== e.rule) problems.push(`"${f.title}" matched rule ${f.rule}, expected ${e.rule}`);
        }
      }
      const text = JSON.stringify(out);
      for (const re of c.mustNotContain) if (re.test(text)) problems.push(`output contains ${re}`);
      report(c.id, problems);
    } catch (error) {
      report(c.id, [error instanceof Error ? error.message : String(error)]);
    }
  }

  console.log("\nTriage a reported problem");
  for (const c of TRIAGE_CASES) {
    try {
      const out = await runStructured(ctx, {
        task: "draft",
        promptVersion: TRIAGE_PROMPT_VERSION,
        system: TRIAGE_SYSTEM,
        messages: [{ role: "user", content: `The product's sites: https://fieldnote.example/\nKnown findings (id: title):\n${c.known.join("\n") || "(none)"}\n\nFrom: (not given)\n<report>\n${c.body}\n</report>` }],
        schema: triageOutput,
      });
      const problems: string[] = [];
      if (!c.expect.likelyValid.includes(out.likely_valid)) problems.push(`likely_valid ${out.likely_valid}, expected ${c.expect.likelyValid.join(" or ")}`);
      if (out.duplicate_of !== c.expect.duplicateOf) problems.push(`duplicate_of ${out.duplicate_of}, expected ${c.expect.duplicateOf}`);
      if (c.expect.minSeverity && SEVERITY_ORDER[out.severity] > SEVERITY_ORDER[c.expect.minSeverity as SecuritySeverity]) problems.push(`severity ${out.severity}, expected at least ${c.expect.minSeverity}`);
      if (/\$\s?\d|bounty of|we will pay/i.test(out.reply)) problems.push("the reply promises money");
      report(c.id, problems);
    } catch (error) {
      report(c.id, [error instanceof Error ? error.message : String(error)]);
    }
  }

  const [cost] = await getDb().select({ total: sum(aiRuns.costUsd) }).from(aiRuns);
  console.log(`\n${failures ? `${failures} failed` : "All passed"}. Cost: $${Number(cost?.total ?? 0).toFixed(4)}`);
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
  return failures;
}
