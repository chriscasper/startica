import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { forumBase } from "@startica/core/channels/discourse";
import { xEnabled } from "@startica/core/channels/x";
import type { PostingContext, PostingRequest } from "@startica/core/posting/requests";
import { getSetting } from "@startica/db/bootstrap";
import { communities } from "@startica/db/schema";
import { db } from "@/lib/dal";

/** Settings → Channels → Posting. */
export const POSTING_SETTINGS = "posting";
export type PostingSettings = { mastodonServer?: string | null };

/**
 * Assisted posting (ARCHITECTURE.md section 8.4) runs in the desktop app's posting
 * window, which the Electron process owns; the server asks for it over the
 * child-process IPC channel (like the keychain). In a plain browser run
 * (`yarn dev:desktop-web`) it isn't available and the UI keeps copy-and-open.
 */
export function assistedPostingAvailable(): boolean {
  // Not in demo mode: its sample text must never reach a real site.
  return process.env.STARTICA_ELECTRON === "1" && process.env.STARTICA_DEMO !== "1" && typeof process.send === "function";
}

export function openPostingWindow(request: PostingRequest): void {
  if (!assistedPostingAvailable()) throw new Error("Posting from Startica needs the desktop app; copy the text and open the thread instead");
  process.send!({ type: "posting-open", request });
}

/** The user's Mastodon server and, for new Discourse topics, the product's first watched forum. */
export async function postingContext(productId: string): Promise<PostingContext> {
  const [settings, [forum], x] = await Promise.all([
    getSetting<PostingSettings>(POSTING_SETTINGS),
    (await db())
      .select({ name: communities.name, url: communities.url })
      .from(communities)
      .where(and(eq(communities.productId, productId), eq(communities.channel, "discourse"), eq(communities.status, "watching")))
      .orderBy(asc(communities.createdAt))
      .limit(1),
    xEnabled(),
  ]);
  return { mastodonServer: settings?.mastodonServer ?? null, discourseForum: forum ? forumBase(forum.url ?? forum.name) : null, xTracked: x };
}
