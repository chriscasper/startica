import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, chatMessages, chatThreads, jobs, securityFindings } from "@startica/db/schema";
import { seedDemo } from "../demo/seed.ts";

// Replies come from a fake runChat that streams its text and may return a revision.
type ChatCall = { system: string; messages: { role: string; content: string }[]; webSearch: boolean; tool?: { name: string } };
const ai = vi.hoisted(() => ({
  structured: null as unknown,
  reply: null as null | { text: string; proposal: unknown; proposalError: string | null } | Error,
  calls: [] as ChatCall[],
  partial: [] as string[],
}));
vi.mock("../ai/client.ts", () => ({
  runStructured: vi.fn(async () => ai.structured),
  runChat: vi.fn(async (_ctx: unknown, req: ChatCall & { onText: (t: string) => void }) => {
    ai.calls.push(req);
    const reply = ai.reply!;
    if (reply instanceof Error) {
      req.onText("Half a rep");
      throw reply;
    }
    req.onText(reply.text.slice(0, 4));
    req.onText(reply.text);
    return { ...reply, citations: [{ url: "https://docs.example/headers", title: "Headers" }], searches: ["csp header"], model: "claude-sonnet-5-5" };
  }),
  taskModel: async () => ({ model: "claude-sonnet-5-5", effort: "medium", maxTokens: 4000 }),
  hasAiKey: async () => true,
}));
const { runSecurityExplain } = await import("../security/ai.ts");
const { applyRevision, chatSnapshot, earlierChat, restoreVersion, retryReply, sendChatMessage, setChatWebSearch, startOver } = await import("./threads.ts");
const { chatHistory, runChatReply } = await import("./jobs.ts");
const { listVersions } = await import("./versions.ts");

let workspaceId = "";
let findingId = "";

beforeAll(async () => {
  openDatabase(join(mkdtempSync(join(tmpdir(), "startica-chat-")), "test.db"));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  ({ workspaceId } = await seedDemo());
  findingId = (await getDb().select().from(securityFindings).where(eq(securityFindings.groupKey, "csp-missing")))[0]!.id;
  // The demo comes with help written; these tests start without any.
  await getDb().update(securityFindings).set({ aiHelp: null, aiStatus: null }).where(eq(securityFindings.id, findingId));
});
afterAll(() => closeDatabase());

const help = async () => (await getDb().select().from(securityFindings).where(eq(securityFindings.id, findingId)))[0]!.aiHelp;
const subject = () => ({ workspaceId, kind: "security_help" as const, subjectId: findingId });
const queued = async () => (await getDb().select().from(jobs).where(eq(jobs.queue, "chat_reply"))).map((j) => j.payload.messageId);
const reply = async (messageId: string) => {
  await runChatReply({ workspaceId, jobRunId: undefined }, { workspaceId, messageId });
  await getDb().delete(jobs);
};
const revision = { summary: "No CSP on Next.js.", steps: ["Add headers() to next.config.ts", "Start in report-only mode"], snippets: [{ label: "Next.js next.config.ts", language: "ts", code: "async headers() {}" }], verify: "Press Recheck in Startica." };

describe("refining a security fix in a chat", () => {
  it("can't start before there's a suggestion", async () => {
    await expect(sendChatMessage(workspaceId, "security_help", findingId, "Shorter please")).rejects.toThrow(/ask for them first/);
  });

  it("keeps every suggestion as a version", async () => {
    ai.structured = { summary: "No CSP.", steps: ["Add a policy"], snippets: [], verify: "Press Recheck in Startica." };
    await runSecurityExplain({ workspaceId }, { workspaceId, findingId });
    ai.structured = { summary: "No CSP (nginx).", steps: ["Add add_header"], snippets: [], verify: "Press Recheck in Startica." };
    await runSecurityExplain({ workspaceId }, { workspaceId, findingId });
    const versions = await listVersions(subject());
    expect(versions.map((v) => [v.value.summary, v.source, v.current])).toEqual([
      ["No CSP (nginx).", "suggested", true],
      ["No CSP.", "suggested", false],
    ]);
  });

  it("answers a question without a revision, streaming the reply and keeping its sources", async () => {
    const { threadId, messageId } = await sendChatMessage(workspaceId, "security_help", findingId, "  Why does this matter?  ");
    expect(await queued()).toEqual([messageId]);
    await expect(sendChatMessage(workspaceId, "security_help", findingId, "Hello?")).rejects.toThrow(/Wait for the reply/);

    ai.reply = { text: "Because injected scripts run.", proposal: null, proposalError: null };
    await reply(messageId);
    const call = ai.calls.at(-1)!;
    expect(call.webSearch).toBe(true);
    expect(call.tool?.name).toBe("propose_revision");
    expect(call.system).toMatch(/Never explain how to exploit/);
    expect(call.system).toContain("<context>");
    expect(call.system).toContain('"summary": "No CSP (nginx)."');
    expect(call.messages).toEqual([{ role: "user", content: "Why does this matter?" }]);

    const snap = await chatSnapshot(workspaceId, "security_help", findingId);
    expect(snap).toMatchObject({ threadId, busy: false, webSearch: true, earlier: [] });
    expect(snap.messages.map((m) => [m.role, m.status, m.body])).toEqual([
      ["user", "done", "Why does this matter?"],
      ["assistant", "done", "Because injected scripts run."],
    ]);
    expect(snap.messages[1]).toMatchObject({ proposal: null, sources: [{ url: "https://docs.example/headers", title: "Headers" }], model: "claude-sonnet-5-5" });
  });

  it("proposes a revision, sends it back in later turns, and applying it ends the chat", async () => {
    await setChatWebSearch(false);
    const { messageId, threadId } = await sendChatMessage(workspaceId, "security_help", findingId, "We're on Next.js, not nginx.");
    ai.reply = { text: "Switched the snippet to next.config.ts.", proposal: revision, proposalError: null };
    await reply(messageId);
    expect(ai.calls.at(-1)!.webSearch).toBe(false);
    expect((await chatSnapshot(workspaceId, "security_help", findingId)).messages.at(-1)).toMatchObject({ proposal: revision, proposalStatus: "proposed" });

    const next = await sendChatMessage(workspaceId, "security_help", findingId, "Thanks, shorter steps?");
    ai.reply = { text: "Sure.", proposal: null, proposalError: null };
    await reply(next.messageId);
    const sent = ai.calls.at(-1)!.messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(sent[3]!.content).toContain('<proposed_revision applied="false">');

    await applyRevision(workspaceId, messageId);
    expect(await help()).toMatchObject({ summary: "No CSP on Next.js.", model: "claude-sonnet-5-5" });
    const [thread] = await getDb().select().from(chatThreads).where(eq(chatThreads.id, threadId));
    expect(thread).toMatchObject({ status: "applied", appliedMessageId: messageId });
    await expect(applyRevision(workspaceId, messageId)).rejects.toThrow(/ended/);

    const versions = await listVersions(subject());
    expect(versions.map((v) => [v.value.summary, v.source, v.current])).toEqual([
      ["No CSP on Next.js.", "chat", true],
      ["No CSP (nginx).", "suggested", false],
      ["No CSP.", "suggested", false],
    ]);

    // The next message starts a new chat; the applied one can be read back.
    const snap = await chatSnapshot(workspaceId, "security_help", findingId);
    expect(snap).toMatchObject({ threadId: null, messages: [], earlier: [{ id: threadId, status: "applied", messages: 6 }] });
    expect((await earlierChat(workspaceId, threadId)).at(3)!.body).toContain("Switched");

    // Going back to an earlier version.
    await restoreVersion(workspaceId, versions[1]!.id);
    expect((await help())!.summary).toBe("No CSP (nginx).");
    expect((await listVersions(subject())).find((v) => v.current)!.id).toBe(versions[1]!.id);
    await setChatWebSearch(true);
  });

  it("keeps a failed reply's partial text, tries it again, and starts over", async () => {
    const { messageId, threadId } = await sendChatMessage(workspaceId, "security_help", findingId, "And for Caddy?");
    ai.reply = new Error("Overloaded");
    await expect(runChatReply({ workspaceId }, { workspaceId, messageId })).rejects.toThrow("Overloaded");
    await getDb().delete(jobs);
    const [failed] = await getDb().select().from(chatMessages).where(eq(chatMessages.id, messageId));
    expect(failed).toMatchObject({ status: "failed", error: "Overloaded", body: "Half a rep" });

    await retryReply(workspaceId, messageId);
    expect(await queued()).toEqual([messageId]);
    ai.reply = { text: "Use the header directive.", proposal: null, proposalError: null };
    await reply(messageId);
    expect((await getDb().select().from(chatMessages).where(eq(chatMessages.id, messageId)))[0]).toMatchObject({ status: "done", body: "Use the header directive." });

    await startOver(workspaceId, "security_help", findingId);
    expect((await getDb().select().from(chatThreads).where(eq(chatThreads.id, threadId)))[0]!.status).toBe("closed");
  });

  it("says when a revision came back in the wrong shape", async () => {
    const { messageId } = await sendChatMessage(workspaceId, "security_help", findingId, "Redo it");
    ai.reply = { text: "Here you go.", proposal: null, proposalError: "steps: Too small" };
    await reply(messageId);
    const [row] = await getDb().select().from(chatMessages).where(eq(chatMessages.id, messageId));
    expect(row!.body).toMatch(/nothing to apply/);
    await startOver(workspaceId, "security_help", findingId);
  });
});

describe("refining an accessibility fix", () => {
  it("applies a revision in the fix's own shape", async () => {
    const [group] = await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.kind, "violation")).limit(1);
    const before = { explanation: "No alt.", html: '<img src="a.png">', steps: ["Add alt"], confidence: "medium" as const, guidance: null, model: "claude-sonnet-5-5", createdAt: "2026-10-01T00:00:00.000Z" };
    await getDb().update(a11yIssueGroups).set({ aiFix: before }).where(eq(a11yIssueGroups.id, group!.id));
    const { messageId } = await sendChatMessage(workspaceId, "a11y_fix", group!.id, "It's the company logo.");
    ai.reply = { text: "Used the company name.", proposal: { explanation: "Logo needs alt.", fixed_html: '<img src="a.png" alt="Fieldnote">', steps: ["Add alt"], confidence: "high" }, proposalError: null };
    await reply(messageId);
    expect(ai.calls.at(-1)!.system).toContain('"fixed_html": "<img src=\\"a.png\\">"');
    await applyRevision(workspaceId, messageId);
    const [after] = await getDb().select().from(a11yIssueGroups).where(eq(a11yIssueGroups.id, group!.id));
    expect(after!.aiFix).toMatchObject({ html: '<img src="a.png" alt="Fieldnote">', confidence: "high", guidance: null });
    expect((await listVersions({ workspaceId, kind: "a11y_fix", subjectId: group!.id })).map((v) => v.source)).toEqual(["chat", "suggested"]);
  });
});

describe("chat history", () => {
  const row = (role: "user" | "assistant", body: string, status: "done" | "failed" = "done") => ({ role, body, status, proposal: null, proposalStatus: null }) as unknown as typeof chatMessages.$inferSelect;
  it("drops unfinished replies, merges same-role turns and starts with the owner", () => {
    expect(chatHistory([row("assistant", "hi"), row("user", "a"), row("assistant", "oops", "failed"), row("user", "b"), row("assistant", "ok")])).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "ok" },
    ]);
  });
});
