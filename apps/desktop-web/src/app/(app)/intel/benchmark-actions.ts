"use server";

import { addBenchmarkAccount, removeBenchmarkAccount, syncBenchmarksNow } from "@startica/core/benchmarks/accounts";
import type { ActionResult } from "@/components/app/form-dialog";
import { formFields, id, mutate, productScope } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

// Competitor benchmarks (Intel → Benchmarks): add or remove a public account, or read them all now.

export async function addBenchmark(productId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    const f = formFields(formData);
    await addBenchmarkAccount(scope.workspaceId, scope.productId, { competitorId: String(f.competitorId ?? ""), channel: String(f.channel ?? "") as "bluesky", handle: String(f.handle ?? "") });
  });
}

export async function removeBenchmark(accountId: string): Promise<ActionResult> {
  return mutate(async () => removeBenchmarkAccount((await getWorkspace()).id, id.parse(accountId)));
}

export async function checkBenchmarksNow(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await syncBenchmarksNow(scope.workspaceId, scope.productId);
  });
}
