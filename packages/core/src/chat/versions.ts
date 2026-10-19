import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { suggestionVersions, type ChatSubjectKind } from "@startica/db/schema";

/**
 * Every version of a refinable suggestion (ARCHITECTURE.md section 5.1), so the owner can go
 * back after applying a revision from a chat or asking for a new suggestion. Kept apart from
 * the chat registry so feature modules can record versions without importing it.
 */

type Subject = { workspaceId: string; kind: ChatSubjectKind; subjectId: string };

/** The `createdAt` a stored suggestion carries, as a Date (now if it has none). */
const writtenAt = (value: Record<string, unknown>) => {
  const at = typeof value.createdAt === "string" ? new Date(value.createdAt) : null;
  return at && !Number.isNaN(at.getTime()) ? at : new Date();
};

/**
 * Records a suggestion the subject now shows. `previous` is what it showed before: kept as the
 * first version when nothing was recorded yet (suggestions written before versions existed).
 */
export async function recordVersion(subject: Subject, value: object, source: "suggested" | "chat", options: { previous?: object | null; threadId?: string } = {}): Promise<void> {
  const db = getDb();
  const where = and(eq(suggestionVersions.workspaceId, subject.workspaceId), eq(suggestionVersions.subjectKind, subject.kind), eq(suggestionVersions.subjectId, subject.subjectId));
  const scope = { workspaceId: subject.workspaceId, subjectKind: subject.kind, subjectId: subject.subjectId };
  if (options.previous) {
    const [any] = await db.select({ id: suggestionVersions.id }).from(suggestionVersions).where(where).limit(1);
    if (!any) {
      const previous = options.previous as Record<string, unknown>;
      await db.insert(suggestionVersions).values({ ...scope, value: previous, source: "suggested", appliedAt: writtenAt(previous), createdAt: writtenAt(previous) });
    }
  }
  await db.insert(suggestionVersions).values({ ...scope, value: value as Record<string, unknown>, source, threadId: options.threadId ?? null, appliedAt: new Date() });
}

export type SuggestionVersion = { id: string; value: Record<string, unknown>; source: "suggested" | "chat"; createdAt: Date; current: boolean };

/** A subject's versions, newest first; `current` marks the one applied last. */
export async function listVersions(subject: Subject): Promise<SuggestionVersion[]> {
  const rows = await getDb()
    .select()
    .from(suggestionVersions)
    .where(and(eq(suggestionVersions.workspaceId, subject.workspaceId), eq(suggestionVersions.subjectKind, subject.kind), eq(suggestionVersions.subjectId, subject.subjectId)))
    .orderBy(desc(suggestionVersions.createdAt));
  const latest = rows.reduce<(typeof rows)[number] | null>((best, r) => (!best || r.appliedAt > best.appliedAt ? r : best), null);
  return rows.map((r) => ({ id: r.id, value: r.value, source: r.source, createdAt: r.createdAt, current: r.id === latest?.id }));
}

/** One version, checked against the workspace. */
export async function ownVersion(workspaceId: string, versionId: string) {
  const [row] = await getDb()
    .select()
    .from(suggestionVersions)
    .where(and(eq(suggestionVersions.id, versionId), eq(suggestionVersions.workspaceId, workspaceId)));
  if (!row) throw new Error("Version not found");
  return row;
}

/** Marks a version as the one the subject shows (after its value was written back). */
export async function markApplied(versionId: string): Promise<void> {
  await getDb().update(suggestionVersions).set({ appliedAt: new Date() }).where(eq(suggestionVersions.id, versionId));
}
