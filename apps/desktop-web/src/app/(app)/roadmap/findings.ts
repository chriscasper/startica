import { versionsToShowFor, type VersionToShow } from "@startica/core/chat/threads";
import { getWorkspace } from "@/lib/dal";

/** Versions of every finding of these audits, by Refine subject id (`<audit id>:<index>`). */
export async function findingVersions(audits: { id: string; findings: unknown[] }[]): Promise<Record<string, VersionToShow[]>> {
  const ids = audits.flatMap((a) => a.findings.map((_, i) => `${a.id}:${i}`));
  return versionsToShowFor((await getWorkspace()).id, "audit_finding", ids);
}
