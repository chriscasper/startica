import { and, asc, desc, eq, inArray, ne, sum } from "drizzle-orm";
import { z } from "zod";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { getDb } from "@startica/db/client";
import { enqueue } from "@startica/db/queue";
import { aiRuns, chatMessages, chatThreads, type ChatSource, type ChatSubjectKind } from "@startica/db/schema";
import { jobByPayload, stopJob } from "../jobs/cancel.ts";
import { CHAT_SUBJECTS } from "./subjects.ts";
import { listVersions, markApplied, ownVersion, recordVersion } from "./versions.ts";

/**
 * Refine chats (ARCHITECTURE.md section 5.1): a conversation with the AI about one suggestion,
 * until the owner applies a revision from it. Pages and actions call these; the replies are
 * written by the chat_reply job (jobs.ts), never here.
 */

export const WEB_SEARCH_SETTING = "chat_web_search";
export const MAX_MESSAGE_CHARS = 4000;
export const messageInput = z.string().trim().min(1, "Write a message first").max(MAX_MESSAGE_CHARS, `Keep it under ${MAX_MESSAGE_CHARS} characters`);

/** Web search in chats: on unless the owner turned it off in a chat. */
export async function chatWebSearch(): Promise<boolean> {
  return (await getSetting<boolean>(WEB_SEARCH_SETTING)) ?? true;
}

export async function setChatWebSearch(on: boolean): Promise<void> {
  await setSetting(WEB_SEARCH_SETTING, on);
}

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  body: string;
  status: "pending" | "streaming" | "done" | "failed" | "cancelled";
  error: string | null;
  proposal: Record<string, unknown> | null;
  proposalStatus: "proposed" | "applied" | null;
  sources: ChatSource[];
  webSearch: boolean;
  model: string | null;
  createdAt: string;
};

export type ChatSnapshot = {
  title: string;
  noun: string;
  /** The open thread, or null before the first message. */
  threadId: string | null;
  messages: ChatMessageView[];
  /** Earlier chats about this suggestion, newest first (applied or started over). */
  earlier: { id: string; status: "applied" | "closed"; createdAt: string; messages: number }[];
  webSearch: boolean;
  /** What the open thread's replies cost so far. */
  costUsd: number;
  /** A reply is being written. */
  busy: boolean;
};

const BUSY = ["pending", "streaming"] as const;

const view = (m: typeof chatMessages.$inferSelect): ChatMessageView => ({
  id: m.id,
  role: m.role,
  body: m.body,
  status: m.status,
  error: m.error,
  proposal: m.proposal,
  proposalStatus: m.proposalStatus,
  sources: m.sources ?? [],
  webSearch: m.webSearch,
  model: m.model,
  createdAt: m.createdAt.toISOString(),
});

function subjectOf(kind: string) {
  const subject = CHAT_SUBJECTS[kind as ChatSubjectKind];
  if (!subject) throw new Error("This can't be refined in a chat");
  return subject;
}

async function openThread(workspaceId: string, kind: ChatSubjectKind, subjectId: string) {
  const [thread] = await getDb()
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.workspaceId, workspaceId), eq(chatThreads.subjectKind, kind), eq(chatThreads.subjectId, subjectId), eq(chatThreads.status, "open")))
    .orderBy(desc(chatThreads.createdAt))
    .limit(1);
  return thread ?? null;
}

async function threadMessages(threadId: string) {
  return getDb().select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.createdAt));
}

/** Everything the Refine panel shows for one suggestion. */
export async function chatSnapshot(workspaceId: string, kind: ChatSubjectKind, subjectId: string): Promise<ChatSnapshot> {
  const subject = subjectOf(kind);
  const db = getDb();
  const { title } = await subject.load(workspaceId, subjectId);
  const thread = await openThread(workspaceId, kind, subjectId);
  const messages = thread ? await threadMessages(thread.id) : [];
  const runIds = messages.flatMap((m) => (m.jobRunId ? [m.jobRunId] : []));
  const [cost] = runIds.length ? await db.select({ total: sum(aiRuns.costUsd) }).from(aiRuns).where(inArray(aiRuns.jobRunId, runIds)) : [];
  const closed = await db
    .select({ id: chatThreads.id, status: chatThreads.status, createdAt: chatThreads.createdAt })
    .from(chatThreads)
    .where(and(eq(chatThreads.workspaceId, workspaceId), eq(chatThreads.subjectKind, kind), eq(chatThreads.subjectId, subjectId), ne(chatThreads.status, "open")))
    .orderBy(desc(chatThreads.createdAt))
    .limit(20);
  const counts = closed.length
    ? await db
        .select({ threadId: chatMessages.threadId, id: chatMessages.id })
        .from(chatMessages)
        .where(inArray(chatMessages.threadId, closed.map((t) => t.id)))
    : [];
  return {
    title,
    noun: subject.noun,
    threadId: thread?.id ?? null,
    messages: messages.map(view),
    earlier: closed.map((t) => ({ id: t.id, status: t.status as "applied" | "closed", createdAt: t.createdAt.toISOString(), messages: counts.filter((c) => c.threadId === t.id).length })),
    webSearch: await chatWebSearch(),
    costUsd: Number(cost?.total ?? 0),
    busy: messages.some((m) => (BUSY as readonly string[]).includes(m.status)),
  };
}

/** An earlier chat's messages, to read back. */
export async function earlierChat(workspaceId: string, threadId: string): Promise<ChatMessageView[]> {
  const [thread] = await getDb().select().from(chatThreads).where(and(eq(chatThreads.id, threadId), eq(chatThreads.workspaceId, workspaceId)));
  if (!thread) throw new Error("Chat not found");
  return (await threadMessages(thread.id)).map(view);
}

/** Sends the owner's message (starting a chat if none is open) and queues the reply. */
export async function sendChatMessage(workspaceId: string, kind: ChatSubjectKind, subjectId: string, text: string): Promise<{ threadId: string; messageId: string }> {
  const subject = subjectOf(kind);
  const body = messageInput.parse(text);
  const { current } = await subject.load(workspaceId, subjectId);
  if (!current) throw new Error(`There are no ${subject.noun} to refine yet: ask for them first`);
  const db = getDb();
  let thread = await openThread(workspaceId, kind, subjectId);
  if (thread && (await threadMessages(thread.id)).some((m) => (BUSY as readonly string[]).includes(m.status))) {
    throw new Error("Wait for the reply, or stop it, before sending another message");
  }
  thread ??= (await db.insert(chatThreads).values({ workspaceId, subjectKind: kind, subjectId }).returning())[0]!;
  const at = Date.now();
  await db.insert(chatMessages).values({ workspaceId, threadId: thread.id, role: "user", body, status: "done", createdAt: new Date(at) });
  const [reply] = await db
    .insert(chatMessages)
    .values({ workspaceId, threadId: thread.id, role: "assistant", status: "pending", webSearch: await chatWebSearch(), createdAt: new Date(at + 1) })
    .returning({ id: chatMessages.id });
  await db.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, thread.id));
  await enqueue(workspaceId, "chat_reply", { messageId: reply!.id });
  return { threadId: thread.id, messageId: reply!.id };
}

async function ownMessage(workspaceId: string, messageId: string) {
  const [row] = await getDb()
    .select({ message: chatMessages, thread: chatThreads })
    .from(chatMessages)
    .innerJoin(chatThreads, eq(chatThreads.id, chatMessages.threadId))
    .where(and(eq(chatMessages.id, messageId), eq(chatMessages.workspaceId, workspaceId)));
  if (!row) throw new Error("Message not found");
  return row;
}

/** Applies a revision from the chat: the suggestion shows it (the old one stays under Versions) and the chat ends. */
export async function applyRevision(workspaceId: string, messageId: string): Promise<void> {
  const { message, thread } = await ownMessage(workspaceId, messageId);
  if (thread.status !== "open") throw new Error("This chat has ended; start a new one to change it again");
  if (!message.proposal) throw new Error("That reply has no revision to apply");
  const subject = subjectOf(thread.subjectKind);
  const revision = subject.revision.parse(message.proposal);
  const stored = subject.toStored(revision, message.model ?? "unknown model");
  const { current } = await subject.load(workspaceId, thread.subjectId);
  await subject.write(workspaceId, thread.subjectId, stored);
  await recordVersion({ workspaceId, kind: thread.subjectKind, subjectId: thread.subjectId }, stored, "chat", { previous: current, threadId: thread.id });
  const now = new Date();
  await getDb().update(chatMessages).set({ proposalStatus: "applied" }).where(eq(chatMessages.id, message.id));
  await getDb().update(chatThreads).set({ status: "applied", appliedMessageId: message.id, closedAt: now }).where(eq(chatThreads.id, thread.id));
}

/** Stops a reply being written (or waiting to be). What it wrote so far stays. */
export async function stopReply(workspaceId: string, messageId: string): Promise<void> {
  const { message } = await ownMessage(workspaceId, messageId);
  const job = await jobByPayload(workspaceId, ["chat_reply"], "messageId", message.id);
  if (job && (await stopJob(workspaceId, job)) !== "not_found") {
    // A waiting job is removed without running, so nothing else marks its message.
    if (message.status === "pending") await getDb().update(chatMessages).set({ status: "cancelled", error: "Stopped by you" }).where(and(eq(chatMessages.id, message.id), eq(chatMessages.status, "pending")));
    return;
  }
  if ((BUSY as readonly string[]).includes(message.status)) await getDb().update(chatMessages).set({ status: "cancelled", error: "Stopped by you" }).where(eq(chatMessages.id, message.id));
}

/** Asks again for the last reply, after it failed or was stopped. */
export async function retryReply(workspaceId: string, messageId: string): Promise<void> {
  const { message, thread } = await ownMessage(workspaceId, messageId);
  if (thread.status !== "open") throw new Error("This chat has ended");
  if (message.role !== "assistant" || (message.status !== "failed" && message.status !== "cancelled")) throw new Error("Only a failed or stopped reply can be tried again");
  const messages = await threadMessages(thread.id);
  if (messages.at(-1)?.id !== message.id) throw new Error("Only the last reply can be tried again");
  await getDb()
    .update(chatMessages)
    .set({ status: "pending", body: "", error: null, proposal: null, proposalStatus: null, sources: null, webSearch: await chatWebSearch() })
    .where(eq(chatMessages.id, message.id));
  await enqueue(workspaceId, "chat_reply", { messageId: message.id });
}

/** Ends the open chat without applying anything; the next message starts a new one. */
export async function startOver(workspaceId: string, kind: ChatSubjectKind, subjectId: string): Promise<void> {
  const thread = await openThread(workspaceId, kind, subjectId);
  if (!thread) return;
  if ((await threadMessages(thread.id)).some((m) => (BUSY as readonly string[]).includes(m.status))) throw new Error("Stop the reply first");
  await getDb().update(chatThreads).set({ status: "closed", closedAt: new Date() }).where(eq(chatThreads.id, thread.id));
}

/** Shows an earlier version of a suggestion again. */
export async function restoreVersion(workspaceId: string, versionId: string): Promise<void> {
  const version = await ownVersion(workspaceId, versionId);
  await subjectOf(version.subjectKind).write(workspaceId, version.subjectId, version.value);
  await markApplied(version.id);
}

/** A suggestion's versions for the Versions dialog, each in its revision's shape. */
export async function versionsToShow(workspaceId: string, kind: ChatSubjectKind, subjectId: string) {
  const subject = subjectOf(kind);
  return (await listVersions({ workspaceId, kind, subjectId })).map((v) => ({
    id: v.id,
    createdAt: v.createdAt.toISOString(),
    source: v.source,
    current: v.current,
    revision: subject.toRevision(v.value) as Record<string, unknown>,
  }));
}
