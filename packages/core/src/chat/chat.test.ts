import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { a11yIssueGroups, adCampaigns, adGroups, ads, chatMessages, chatThreads, contentPieces, drafts, jobs, opportunities, securityFindings } from "@startica/db/schema";
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
const { saveOwnerDraft } = await import("../distribution/jobs.ts");
const { saveOwnerPiece } = await import("../content/jobs.ts");
const { saveAd } = await import("../ads/campaigns.ts");
const { CHAT_SUBJECTS } = await import("./subjects.ts");

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
    await expect(sendChatMessage(workspaceId, "security_help", findingId, "Shorter please")).rejects.toThrow(/ask for the fix steps first/);
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

describe("refining writing", () => {
  it("revises an Inbox reply draft as a new draft version, next to the owner's edits", async () => {
    const [opp] = await getDb().select().from(opportunities).where(eq(opportunities.status, "drafted")).limit(1);
    const latest = async () => (await getDb().select().from(drafts).where(eq(drafts.opportunityId, opp!.id)).orderBy(desc(drafts.version)).limit(1))[0]!;
    const before = await latest();

    const { messageId } = await sendChatMessage(workspaceId, "reply_draft", opp!.id, "Mention the free plan, they asked about price.");
    ai.reply = { text: "Added the free plan.", proposal: { reply: "There's a free plan, full disclosure: I built it.", mentions_product: true, rationale: "They asked about price." }, proposalError: null };
    await reply(messageId);
    const call = ai.calls.at(-1)!;
    expect(call.system).toMatch(/You write replies to online conversations/);
    expect(call.system).toContain("<conversation url=");
    expect(call.system).toContain(`"reply": ${JSON.stringify(before.body)}`);

    await applyRevision(workspaceId, messageId);
    const after = await latest();
    expect(after).toMatchObject({ version: before.version + 1, body: "There's a free plan, full disclosure: I built it.", mentionsProduct: true, source: "ai" });
    expect(after.utmUrl).toMatch(/utm_source=/);

    await saveOwnerDraft(workspaceId, opp!.id, "My own words.");
    const versions = await listVersions({ workspaceId, kind: "reply_draft", subjectId: opp!.id });
    expect(versions.map((v) => [v.source, v.current])).toEqual([
      ["edited", true],
      ["chat", false],
      ["suggested", false],
    ]);
    // Restoring the first draft writes it again as the newest version.
    await restoreVersion(workspaceId, versions[2]!.id);
    expect(await latest()).toMatchObject({ version: before.version + 3, body: before.body, mentionsProduct: before.mentionsProduct });
  });

  it("revises a Content Studio piece and refuses one that's posted", async () => {
    const [piece] = await getDb().select().from(contentPieces).where(eq(contentPieces.status, "draft")).limit(1);
    await saveOwnerPiece(piece!, { title: piece!.title, body: `${piece!.body}\n\nEdited.` });
    const { messageId } = await sendChatMessage(workspaceId, "content_piece", piece!.id, "Shorter, no product.");
    ai.reply = { text: "Cut it down.", proposal: { title: "Shorter", body: "Short body.", mentions_product: false, rationale: "Plain and short." }, proposalError: null };
    await reply(messageId);
    expect(ai.calls.at(-1)!.system).toContain(`<channel name="${piece!.channel}"`);
    await applyRevision(workspaceId, messageId);
    const [after] = await getDb().select().from(contentPieces).where(eq(contentPieces.id, piece!.id));
    expect(after).toMatchObject({ title: "Shorter", body: "Short body.", utmUrl: null, status: "draft" });
    expect((await listVersions({ workspaceId, kind: "content_piece", subjectId: piece!.id })).map((v) => v.source)).toEqual(["chat", "edited", "suggested"]);

    await getDb().update(contentPieces).set({ status: "posted" }).where(eq(contentPieces.id, piece!.id));
    const posted = await sendChatMessage(workspaceId, "content_piece", piece!.id, "Again?");
    ai.reply = { text: "Sure.", proposal: { title: "", body: "Other.", mentions_product: false, rationale: "." }, proposalError: null };
    await reply(posted.messageId);
    await expect(applyRevision(workspaceId, posted.messageId)).rejects.toThrow(/posted/);
    await startOver(workspaceId, "content_piece", piece!.id);
    await getDb().update(contentPieces).set({ status: "draft" }).where(eq(contentPieces.id, piece!.id));
  });

  it("revises an email campaign as its separate emails", () => {
    const subject = CHAT_SUBJECTS.content_piece;
    const current = { format: "campaign" as const, title: "Welcome", body: "## Email 1 · Day 0\nSubject: Hi\nPreview: Start here\n\nHello.", rationale: "Warm.", mentionsProduct: false, link: null };
    expect(subject.toRevision(current)).toEqual({ title: "Welcome", mentions_product: false, rationale: "Warm.", emails: [{ subject: "Hi", preview: "Start here", send_day: 0, body: "Hello." }] });
    const emails = [
      { subject: "Hi", preview: "Start here", send_day: 0, body: "Hello." },
      { subject: "Tip", preview: "One thing", send_day: 3, body: "Try this." },
    ];
    expect(subject.toStored({ title: "Welcome", emails, mentions_product: false, rationale: "Two now." }, "m", current)).toMatchObject({ format: "campaign", body: "## Email 1 · Day 0\nSubject: Hi\nPreview: Start here\n\nHello.\n\n## Email 2 · Day 3\nSubject: Tip\nPreview: One thing\n\nTry this." });
  });

  it("revises an ad in its platform's shape and lists the checks' problems under the reply", async () => {
    const [row] = await getDb()
      .select({ ad: ads })
      .from(ads)
      .innerJoin(adGroups, eq(adGroups.id, ads.groupId))
      .innerJoin(adCampaigns, eq(adCampaigns.id, adGroups.campaignId))
      .where(eq(adCampaigns.platform, "google"))
      .limit(1);
    const ad = row!.ad;
    const headlines = ["A headline that is far too long to fit in thirty", ...Array.from({ length: 9 }, (_, i) => `Short headline ${i + 1}`)];
    const { messageId } = await sendChatMessage(workspaceId, "ad_copy", ad.id, "Lead with offline mode.");
    ai.reply = { text: "Led with offline mode.", proposal: { headlines, descriptions: ["One.", "Two.", "Three.", "Four."], path1: "offline", path2: "" }, proposalError: null };
    await reply(messageId);
    expect(ai.calls.at(-1)!.system).toContain('"headlines": [');
    const [msg] = await getDb().select().from(chatMessages).where(eq(chatMessages.id, messageId));
    expect(msg!.body).toMatch(/Startica's checks on this revision:\*\*\n- headlines 1:/);

    await applyRevision(workspaceId, messageId);
    const [after] = await getDb().select().from(ads).where(eq(ads.id, ad.id));
    expect(after).toMatchObject({ copy: { headlines, path1: "offline" }, source: "ai" });
    expect(after!.copy).not.toHaveProperty("path2");

    await saveAd(workspaceId, ad.id, ad.copy);
    const versions = await listVersions({ workspaceId, kind: "ad_copy", subjectId: ad.id });
    expect(versions.map((v) => v.source)).toEqual(["edited", "chat", "suggested"]);
    expect(versions[0]!.value).toMatchObject({ platform: "google", source: "owner" });
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
