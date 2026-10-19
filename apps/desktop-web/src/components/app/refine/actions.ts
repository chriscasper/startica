"use server";

import { z } from "zod";
import { chatSubjectKinds } from "@startica/db/schema";
import { hasAiKey } from "@startica/core/ai/client";
import { applyRevision, restoreVersion, retryReply, sendChatMessage, setChatWebSearch, startOver, stopReply } from "@startica/core/chat/threads";
import type { ActionResult } from "@/components/app/form-dialog";
import { fail, id, mutate } from "@/lib/actions";
import { getWorkspace } from "@/lib/dal";
import { desktopApp } from "@/lib/desktop";

/** Refine chats (ARCHITECTURE.md section 5.1). The replies are written by the chat_reply job. */

const kind = z.enum(chatSubjectKinds);

async function needAi() {
  if (desktopApp().demo) throw new Error("AI help is off in the demo.");
  if (!(await hasAiKey())) throw new Error("Add an AI key first (Settings → General → AI)");
}

export async function sendRefineMessage(subjectKind: string, subjectId: string, text: string): Promise<ActionResult> {
  try {
    await needAi();
    await sendChatMessage((await getWorkspace()).id, kind.parse(subjectKind), id.parse(subjectId), text);
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

/** Applies a revision: the page shows it, so it's refreshed. */
export async function applyRefineRevision(messageId: string): Promise<ActionResult> {
  return mutate(async () => applyRevision((await getWorkspace()).id, id.parse(messageId)));
}

export async function stopRefineReply(messageId: string): Promise<ActionResult> {
  try {
    await stopReply((await getWorkspace()).id, id.parse(messageId));
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function retryRefineReply(messageId: string): Promise<ActionResult> {
  try {
    await needAi();
    await retryReply((await getWorkspace()).id, id.parse(messageId));
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function startRefineOver(subjectKind: string, subjectId: string): Promise<ActionResult> {
  try {
    await startOver((await getWorkspace()).id, kind.parse(subjectKind), id.parse(subjectId));
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function setRefineWebSearch(on: boolean): Promise<ActionResult> {
  try {
    await setChatWebSearch(z.boolean().parse(on));
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreSuggestionVersion(versionId: string): Promise<ActionResult> {
  return mutate(async () => restoreVersion((await getWorkspace()).id, id.parse(versionId)));
}
