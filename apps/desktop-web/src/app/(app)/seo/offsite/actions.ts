"use server";

import { z } from "zod";
import { queueOffsiteCheck, watchSubreddit } from "@startica/core/offsite/check";
import type { ActionResult } from "@/components/app/form-dialog";
import { mutate, productScope } from "@/lib/actions";
import { desktopApp } from "@/lib/desktop";

/** Off-site presence (ARCHITECTURE.md section 10.4): read the cited pages again, and watch a cited community. */

export async function checkPages(productId: string): Promise<ActionResult> {
  return mutate(async () => {
    if (desktopApp().demo) throw new Error("Reading other sites is off in the demo, like every other outside call.");
    const scope = await productScope(productId);
    await queueOffsiteCheck(scope.workspaceId, scope.productId);
  });
}

export async function watch(productId: string, name: string): Promise<ActionResult> {
  return mutate(async () => {
    if (desktopApp().demo) throw new Error("Changes to communities are off in the demo.");
    const scope = await productScope(productId);
    await watchSubreddit(scope, z.string().max(40).parse(name), "AI answers cite its threads (SEO & GEO → Off-site).");
  });
}
