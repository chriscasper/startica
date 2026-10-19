import { z } from "zod";
import { chatSubjectKinds } from "@startica/db/schema";
import { chatSnapshot, earlierChat } from "@startica/core/chat/threads";
import { getWorkspace } from "@/lib/dal";

const query = z.union([z.object({ kind: z.enum(chatSubjectKinds), id: z.guid() }), z.object({ thread: z.guid() })]);

/**
 * A Refine chat for the panel: `?kind=&id=` is the suggestion's open chat (messages, earlier
 * chats, cost, web search); `?thread=` an earlier chat's messages. Read again whenever
 * /api/events reports a change to chat_messages or chat_threads, so replies appear as they stream.
 */
export async function GET(request: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    const workspaceId = (await getWorkspace()).id;
    const q = parsed.data;
    return Response.json("thread" in q ? { messages: await earlierChat(workspaceId, q.thread) } : await chatSnapshot(workspaceId, q.kind, q.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
