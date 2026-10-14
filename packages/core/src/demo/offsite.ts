import { eq, inArray } from "drizzle-orm";
import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { domainOf } from "../offsite/domains.ts";

/**
 * The demo's off-site presence (ARCHITECTURE.md section 10.4): what the pages its AI visibility
 * answers cite "said" when read, written as the offsite_check job would store them (the
 * demo makes no requests). Review lists name the competitors but not Fieldnote; one
 * community thread mentions it.
 */
export async function seedDemoOffsite(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const runs = await db.select({ id: s.aiVisibilityRuns.id }).from(s.aiVisibilityRuns).where(eq(s.aiVisibilityRuns.productId, productId));
  if (runs.length === 0) return 0;
  const answers = await db
    .select({ citations: s.aiVisibilityAnswers.citations })
    .from(s.aiVisibilityAnswers)
    .where(inArray(s.aiVisibilityAnswers.runId, runs.map((r) => r.id)));
  const pages = new Map<string, string>();
  for (const a of answers) for (const c of a.citations) if (!c.url.startsWith("https://fieldnote.example")) pages.set(c.url, c.title);
  const rows = [...pages].map(([url, title], i) => {
    const review = url.includes("reviews.example");
    return {
      workspaceId,
      productId,
      url,
      domain: domainOf(url)!,
      title,
      status: "read" as const,
      httpStatus: 200,
      // Review lists name TerraJot and Quadrat; one community thread in four mentions Fieldnote.
      mentionsProduct: !review && i % 4 === 0,
      competitors: review ? ["TerraJot", "Quadrat"] : i % 3 === 0 ? ["Logbook Pro"] : [],
      checkedAt: ago(0, 6),
    };
  });
  if (rows.length) await db.insert(s.offsitePages).values(rows).onConflictDoNothing();
  return rows.length;
}
