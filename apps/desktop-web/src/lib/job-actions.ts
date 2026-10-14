"use server";

import { z } from "zod";
import { stopSiteScan } from "@startica/core/a11y/sites";
import { stopJob } from "@startica/core/jobs/cancel";
import type { ActionResult } from "@/components/app/form-dialog";
import { id, mutate } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

/** Stops a waiting or running job (scans, AI work); see packages/core/src/jobs/cancel.ts. */
export async function stopJobAction(jobId: string): Promise<ActionResult> {
  return mutate(async () => {
    const result = await stopJob((await getWorkspace()).id, id.parse(jobId));
    if (result === "not_found") throw new Error("That job already finished");
  });
}

/** Stops every job behind one line of the status indicator (e.g. all the scoring batches). */
export async function stopJobsAction(jobIds: string[]): Promise<ActionResult> {
  return mutate(async () => {
    const workspaceId = (await getWorkspace()).id;
    const ids = z.array(id).min(1).max(200).parse(jobIds);
    const results = await Promise.all(ids.map((jobId) => stopJob(workspaceId, jobId)));
    if (results.every((r) => r === "not_found")) throw new Error("That already finished");
  });
}

/** Stops an accessibility scan or page check; pages already checked keep their results. */
export async function stopSiteScanAction(scanId: string): Promise<ActionResult> {
  return mutate(async () => stopSiteScan((await getWorkspace()).id, id.parse(scanId)));
}
