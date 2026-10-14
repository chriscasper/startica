"use server";

import { enqueue } from "@startica/db/queue";
import { mutate } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";

export async function enqueuePing() {
  return mutate(async () => {
    const workspace = await getWorkspace();
    await enqueue(workspace.id, "ping", { message: "Say hello to Startica in one sentence." });
  });
}
