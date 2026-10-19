import { eq } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@startica/db/client";
import { a11yIssueGroups, securityFindings, type A11yAiFix, type ChatSubjectKind, type SecurityAiHelp } from "@startica/db/schema";
import { FIX_SYSTEM, fixContext, fixFrom, fixOutput, ownGroup } from "../a11y/ai.ts";
import { EXPLAIN_SYSTEM, explainContext, explainOutput, helpFrom } from "../security/ai.ts";
import { ownFinding } from "../security/findings.ts";
import { isSecurityRule, SECURITY_RULES } from "../security/rules.ts";

/**
 * What a Refine chat can work on (ARCHITECTURE.md section 5.1). Each kind says how to load the
 * suggestion and what the AI should know about it, the shape of a revision (the same schema the
 * suggestion was first written with), and how to store one. Adding a kind: an entry here, its
 * kind in `chatSubjectKinds` (schema.ts), and its revision view in the desktop's refine panel.
 */
export type ChatSubject<P extends z.ZodType = z.ZodType, V extends object = object> = {
  /** What the suggestion is called in the panel and the prompt ("the fix steps"). */
  noun: string;
  /** The feature's own instructions (who the owner is, the rules), followed by the chat rules. */
  system: string;
  /** The revision's shape: the tool input the model writes. */
  revision: P;
  /** The title, the context the AI sees, and the suggestion shown now. Throws when the subject isn't the workspace's. */
  load(workspaceId: string, subjectId: string): Promise<{ title: string; context: string; current: V | null }>;
  /** The stored value from an accepted revision. */
  toStored(revision: z.infer<P>, model: string): V;
  /** The stored value in the revision's shape (what the AI sees as the current version). */
  toRevision(value: V): z.infer<P>;
  /** Writes a stored value to the subject (apply a revision, restore a version). */
  write(workspaceId: string, subjectId: string, value: V): Promise<void>;
};

const securityHelp: ChatSubject<typeof explainOutput, SecurityAiHelp> = {
  noun: "fix steps",
  system: EXPLAIN_SYSTEM,
  revision: explainOutput,
  async load(workspaceId, subjectId) {
    const { finding, site } = await ownFinding(workspaceId, subjectId);
    const title = isSecurityRule(finding.rule) ? SECURITY_RULES[finding.rule].title : (finding.title ?? finding.rule);
    return { title, context: await explainContext(finding, site), current: finding.aiHelp };
  },
  toStored: helpFrom,
  toRevision: (v) => ({ summary: v.summary, steps: v.steps, snippets: v.snippets, verify: v.verify }),
  async write(workspaceId, subjectId, value) {
    await ownFinding(workspaceId, subjectId);
    await getDb().update(securityFindings).set({ aiHelp: value, aiStatus: "ready", aiError: null }).where(eq(securityFindings.id, subjectId));
  },
};

const a11yFix: ChatSubject<typeof fixOutput, A11yAiFix> = {
  noun: "fix",
  system: FIX_SYSTEM,
  revision: fixOutput,
  async load(workspaceId, subjectId) {
    const { group, content } = await fixContext(workspaceId, subjectId);
    return { title: group.help, context: content, current: group.aiFix };
  },
  toStored: (revision, model) => fixFrom(revision, model, null),
  toRevision: (v) => ({ explanation: v.explanation, fixed_html: v.html, steps: v.steps, confidence: v.confidence }),
  async write(workspaceId, subjectId, value) {
    await ownGroup(workspaceId, subjectId);
    await getDb().update(a11yIssueGroups).set({ aiFix: value, aiFixStatus: "ready", aiFixError: null }).where(eq(a11yIssueGroups.id, subjectId));
  },
};

export const CHAT_SUBJECTS: Record<ChatSubjectKind, ChatSubject> = {
  security_help: securityHelp as unknown as ChatSubject,
  a11y_fix: a11yFix as unknown as ChatSubject,
};
