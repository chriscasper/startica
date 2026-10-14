import { backgroundTasks } from "@startica/core/jobs/background";
import { IDLE_ACTIVITY, scanActivity } from "@startica/core/jobs/activity";
import { productScope } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";
import { start } from "@/lib/startup";

const IDLE = { ...IDLE_ACTIVITY, tasks: [] };

/**
 * What's running in the background: a product's scans (scan indicators and buttons) and
 * every waiting or running job in the workspace (the header's status indicator).
 */
export async function GET(request: Request) {
  // No runner (demo mode, jobs disabled): nothing queued will run, so show nothing.
  if (!(await start())) return Response.json(IDLE);
  const productId = new URL(request.url).searchParams.get("productId");
  try {
    const workspaceId = (await getWorkspace()).id;
    const [activity, tasks] = await Promise.all([
      productId ? productScope(productId).then((scope) => scanActivity(scope.workspaceId, scope.productId)) : IDLE_ACTIVITY,
      backgroundTasks(workspaceId),
    ]);
    return Response.json({ ...activity, tasks });
  } catch {
    return Response.json(IDLE);
  }
}
