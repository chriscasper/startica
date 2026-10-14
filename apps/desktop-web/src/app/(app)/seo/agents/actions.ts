"use server";

import { queueAgentCheck } from "@startica/core/agents/run";
import { ownSite } from "@startica/core/a11y/sites";
import type { ActionResult } from "@/components/app/form-dialog";
import { id, mutate } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** Agent readiness (ARCHITECTURE.md section 10.3): check a site again now. */
export async function checkNow(siteId: string): Promise<ActionResult> {
  return mutate(async () => {
    if (desktopApp().demo) throw new Error("Checks are off in the demo, like every other outside call.");
    await queueAgentCheck(await ownSite((await getWorkspace()).id, id.parse(siteId)));
  });
}
