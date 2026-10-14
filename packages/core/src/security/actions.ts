import { and, eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { roadmapItems } from "@startica/db/schema";
import { describeDetail, findingInfo } from "./report.ts";
import { ownFinding } from "./findings.ts";

/** What the owner can do with a finding besides deciding on it (ARCHITECTURE.md section 11.2). Server actions call these. */

/** A roadmap item the owner owns, so re-plans keep it (playbook "security-fixes"). */
export async function addFindingToRoadmap(workspaceId: string, findingId: string): Promise<string> {
  const { finding, site } = await ownFinding(workspaceId, findingId);
  const info = findingInfo(finding);
  const detail = finding.source === "scan" ? describeDetail(finding.detail) : null;
  const title = `Security: ${info.title}${detail ? ` (${detail})` : ""} on ${site.name}`;
  const [existing] = await getDb()
    .select({ id: roadmapItems.id })
    .from(roadmapItems)
    .where(and(eq(roadmapItems.productId, site.productId), eq(roadmapItems.title, title)));
  if (existing) throw new Error("Already on the Roadmap");
  const [item] = await getDb()
    .insert(roadmapItems)
    .values({
      workspaceId,
      productId: site.productId,
      stage: "retention",
      title,
      why: info.why,
      playbook: "security-fixes",
      successMetric: finding.source === "scan" ? "Marked fixed by the next security check" : "Fixed and marked fixed in Security",
      nextStep: info.fix || "Fix it, then mark it fixed in Security",
      priority: finding.severity === "critical" || finding.severity === "high" ? 1 : finding.severity === "medium" ? 2 : 3,
      source: "owner",
    })
    .returning({ id: roadmapItems.id });
  return item!.id;
}
