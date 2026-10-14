import { onChange } from "@startica/db/events";
import { start } from "@/lib/startup";

/** Server-sent events: one message per changed table (replaces Supabase Realtime). */
export async function GET(request: Request) {
  await start();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      send(": connected\n\n");
      const off = onChange((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      const ping = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        off();
        clearInterval(ping);
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
