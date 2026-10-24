"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adapters, channelFromUrl, redditCommunity } from "@startica/core/channels/index";
import { saveOwnerDraft, storeConversation } from "@startica/core/distribution/jobs";
import { draftReplyAnswer, replyStatuses, setReplyStatus } from "@startica/core/distribution/replies";
import { LISTEN_CHANNELS, listeningState, pauseFor, setChannelPaused, setListeningPaused } from "@startica/core/distribution/listening";
import { scanActivity } from "@startica/core/jobs/activity";
import { setThresholds } from "@startica/core/distribution/thresholds";
import { recordReplyPosted } from "@startica/core/posting/record";
import { replyRequest } from "@startica/core/posting/requests";
import { enqueue } from "@startica/db/queue";
import { channels, conversations, dismissReasons, drafts, opportunities } from "@startica/db/schema";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, formFields, id, mutate, productScope } from "@/lib/actions";
import { db, getWorkspace } from "@/lib/dal";
import { channelLabels } from "@/lib/channels";
import { openPostingWindow, postingContext } from "@/lib/posting";

/** The opportunity, if it belongs to this workspace. */
async function ownOpportunity(opportunityId: string) {
  const workspace = await getWorkspace();
  const [opp] = await (await db())
    .select({ id: opportunities.id, productId: opportunities.productId, conversationId: opportunities.conversationId })
    .from(opportunities)
    .where(and(eq(opportunities.id, id.parse(opportunityId)), eq(opportunities.workspaceId, workspace.id)));
  if (!opp) throw new Error("Not found");
  return { ...opp, workspaceId: workspace.id };
}

export async function scanNow(productId: string): Promise<ActionResult> {
  try {
    const scope = await productScope(productId);
    if ((await scanActivity(scope.workspaceId, scope.productId)).scan) return { error: "A scan is already under way; follow it at the top of the window." };
    const listening = await listeningState(scope.productId);
    if (LISTEN_CHANNELS.every((c) => listening.channels.includes(c))) return { error: "Every source is paused. Turn one back on under Searching first." };
    await enqueue(scope.workspaceId, "listen_scan", { productId: scope.productId });
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

const importSchema = z.object({
  url: z.url("Paste the full link to the post"),
  text: z.string().trim().default(""),
  community: z.string().trim().default(""),
});

/** Adds a conversation by link. Channels with an adapter are read; others need the pasted text. */
export async function importLink(productId: string, formData: FormData): Promise<ActionResult> {
  try {
    const input = importSchema.parse(formFields(formData));
    const scope = await productScope(productId);
    const channel = channelFromUrl(input.url);

    const fetched = await adapters[channel]?.fetchThread(input.url).catch(() => null);
    if (!fetched && !input.text) {
      return {
        error: adapters[channel]
          ? channel === "x"
            ? "Paste the post's text too. (With an X API token in Settings, Startica reads X links itself.)"
            : channel === "reddit"
            ? "Couldn't read that Reddit link right now (Reddit limits how often it can be read). Try again in a minute, or paste the post's text."
            : `Couldn't read that ${channelLabels[channel] ?? channel} link right now. Try again, or paste the post's text.`
          : `Startica can't read ${channel === "other" ? "that site" : channel} links directly. Paste the post's text too.`,
      };
    }
    const community = input.community || fetched?.community || (channel === "reddit" ? redditCommunity(input.url) : null) || null;
    const { opportunityId } = await storeConversation({
      ...scope,
      origin: "manual",
      matchedOn: "pasted",
      conversation: {
        channel,
        externalId: fetched?.externalId ?? input.url,
        url: fetched?.url ?? input.url,
        kind: fetched?.kind ?? "post",
        community,
        author: fetched?.author ?? null,
        title: fetched?.title ?? null,
        threadTitle: fetched?.threadTitle ?? null,
        body: input.text || fetched?.body || "",
        postedAt: fetched?.postedAt ?? null,
        score: fetched?.score ?? null,
        numComments: fetched?.numComments ?? null,
      },
    });
    return mutate(async () => {
      await (await db()).update(opportunities).set({ status: "new", error: null }).where(eq(opportunities.id, opportunityId));
      await enqueue(scope.workspaceId, "opportunity_score", { opportunityIds: [opportunityId], force: true });
    });
  } catch (error) {
    return fail(error);
  }
}

export async function saveDraftEdit(opportunityId: string, body: string): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    await saveOwnerDraft(opp.workspaceId, opp.id, body);
  });
}

export async function regenerateDraft(opportunityId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    const guidance = z.string().trim().max(1000).parse(formData.get("guidance") ?? "");
    await (await db()).update(opportunities).set({ status: "drafting", error: null }).where(eq(opportunities.id, opp.id));
    await enqueue(opp.workspaceId, "draft_generate", { opportunityId: opp.id, ...(guidance ? { guidance } : {}) });
  });
}

export async function dismissOpportunity(opportunityId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    const reason = z.enum(dismissReasons).parse(formData.get("reason"));
    await (await db()).update(opportunities).set({ status: "dismissed", dismissReason: reason }).where(eq(opportunities.id, opp.id));
  });
}

const postedSchema = z.object({
  url: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.url("That doesn't look like a link").nullable()),
});

/** Records that the owner posted the latest draft (optionally with a link to their reply). */
export async function markPosted(opportunityId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    const { url } = postedSchema.parse({ url: formData.get("url") ?? "" });
    await recordReplyPosted({ opportunityId: opp.id, url });
  });
}

/**
 * Opens the desktop app's posting window on the thread with the reply filled in
 * (ARCHITECTURE.md 8.4). The user presses the site's own button; the window reports the
 * post back and it's recorded like "Mark as posted". Saves unsaved edits first.
 */
export async function postWithStartica(opportunityId: string, text: string): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    const d = await db();
    const [current] = await d.select().from(drafts).where(eq(drafts.opportunityId, opp.id)).orderBy(desc(drafts.version)).limit(1);
    if (!current) throw new Error("No draft to post");
    if (text.trim() && text.trim() !== current.body.trim()) {
      const saved = await saveDraftEdit(opp.id, text);
      if (saved.error) throw new Error(saved.error);
    }
    const [draft] = await d.select().from(drafts).where(eq(drafts.opportunityId, opp.id)).orderBy(desc(drafts.version)).limit(1);
    const [conv] = await d
      .select({ channel: conversations.channel, url: conversations.url, externalId: conversations.externalId, author: conversations.author })
      .from(conversations)
      .where(eq(conversations.id, opp.conversationId));
    const request = conv && draft ? replyRequest(conv, draft, opp.id, await postingContext(opp.productId)) : null;
    if (!request) throw new Error("Startica can't open this thread for posting; copy the reply and open the thread instead");
    openPostingWindow(request);
  });
}

/** Adds the link to a reply posted without one (e.g. held for a moderator, or marked posted by hand). */
export async function addReplyLink(opportunityId: string, formData: FormData): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    const { url } = postedSchema.parse({ url: formData.get("url") ?? "" });
    if (!url) throw new Error("Paste the link to your reply");
    await recordReplyPosted({ opportunityId: opp.id, url });
  });
}

/** Sends an archived opportunity to drafting anyway. */
export async function draftAnyway(opportunityId: string): Promise<ActionResult> {
  return mutate(async () => {
    const opp = await ownOpportunity(opportunityId);
    await (await db()).update(opportunities).set({ status: "drafting", error: null }).where(eq(opportunities.id, opp.id));
    await enqueue(opp.workspaceId, "draft_generate", { opportunityId: opp.id });
  });
}

/** Saves the product's scoring thresholds; optionally drafts recent archived conversations that now pass. */
export async function saveThresholds(
  productId: string,
  input: { relevance: number; intent: number; draftPassing: boolean },
): Promise<ActionResult & { queued: number }> {
  let queued = 0;
  const result = await mutate(async () => {
    const scope = await productScope(productId);
    queued = await setThresholds(scope.workspaceId, scope.productId, input);
  });
  return { ...result, queued };
}

/** Pauses or resumes the hourly search for this product (Scan now still works). */
export async function pauseListening(productId: string, mode: string): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await setListeningPaused(scope.productId, pauseFor.parse(mode));
  });
}

/** Turns one source off or back on in every scan for this product. */
export async function pauseChannel(productId: string, channel: string, paused: boolean): Promise<ActionResult> {
  return mutate(async () => {
    const scope = await productScope(productId);
    await setChannelPaused(scope.productId, z.enum(channels).parse(channel), paused);
  });
}

// --- Replies to the owner's posts (ARCHITECTURE.md 8.1) -------------------------------

/** "Draft an answer": turns a reply into a conversation and opportunity, and queues a draft. */
export async function draftAnswer(replyId: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    await draftReplyAnswer(workspace.id, id.parse(replyId));
  });
}

/** Marks replies seen, answered, dismissed, or new again. */
export async function setRepliesStatus(replyIds: string[], status: string): Promise<ActionResult> {
  return mutate(async () => {
    const workspace = await getWorkspace();
    await setReplyStatus(workspace.id, z.array(id).max(500).parse(replyIds), z.enum(replyStatuses).parse(status));
  });
}
