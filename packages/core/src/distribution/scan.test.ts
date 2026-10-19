import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ensureWorkspace } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { jobs, keywords, products, secrets } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { adapters } from "../channels/index.ts";
import type { RawConversation } from "../channels/types.ts";
import { x, X_TOKEN_SECRET, xLastError } from "../channels/x.ts";
import { replyRequest } from "../posting/requests.ts";
import { matchCommunity, runListenScan } from "./jobs.ts";
import { listeningState, setChannelPaused, setListeningPaused } from "./listening.ts";

let workspaceId = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-scan-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
  workspaceId = (await ensureWorkspace()).id;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await getDb().delete(secrets);
});
afterAll(() => closeDatabase());

const hn = (id: string): RawConversation => ({
  channel: "hackernews",
  externalId: id,
  url: `https://news.ycombinator.com/item?id=${id}`,
  kind: "post",
  community: null,
  author: "a",
  title: `Ask HN ${id}`,
  threadTitle: null,
  body: "body",
  postedAt: new Date(),
  score: 1,
  numComments: 0,
});

describe("listen_scan", () => {
  it("keeps scanning when one source fails, and queues what the others found", async () => {
    const [p] = await getDb()
      .insert(products)
      .values({ workspaceId, name: "Fieldnote", brief: { summary: "s", category: "", audience: "", problem: "", value_props: [], differentiators: [], positioning: "", pricing_notes: "", open_questions: [] } })
      .returning();
    await getDb().insert(keywords).values({ workspaceId, productId: p!.id, keyword: "field notes", useFor: "listening" });
    for (const adapter of Object.values(adapters)) vi.spyOn(adapter, "discover").mockResolvedValue([]);
    vi.spyOn(adapters.hackernews!, "discover").mockResolvedValue([hn("1"), hn("2")]);
    vi.spyOn(adapters.bluesky!, "discover").mockRejectedValue(new Error("bluesky down"));

    const summary = await runListenScan({ workspaceId }, { workspaceId, productId: p!.id });
    expect(summary[p!.id]).toEqual({ found: 2, new: 2, errors: { bluesky: "bluesky down" } });
    const queued = await getDb().select().from(jobs);
    expect(queued.map((j) => j.queue)).toEqual(["opportunity_score"]);
    expect((queued[0]!.payload as { opportunityIds: string[] }).opportunityIds).toHaveLength(2);
  });

  it("skips paused sources in every scan, and a paused product in the hourly one", async () => {
    await getDb().delete(jobs);
    const [p] = await getDb()
      .insert(products)
      .values({ workspaceId, name: "Paused", brief: { summary: "s", category: "", audience: "", problem: "", value_props: [], differentiators: [], positioning: "", pricing_notes: "", open_questions: [] } })
      .returning();
    for (const adapter of Object.values(adapters)) vi.spyOn(adapter, "discover").mockResolvedValue([]);
    const reddit = vi.spyOn(adapters.reddit!, "discover").mockResolvedValue([]);
    const hnFind = vi.spyOn(adapters.hackernews!, "discover").mockResolvedValue([hn("p1")]);

    await setChannelPaused(p!.id, "reddit", true);
    expect(await runListenScan({ workspaceId }, { workspaceId, productId: p!.id })).toMatchObject({ [p!.id]: { found: 1, skipped: ["reddit"] } });
    expect(reddit).not.toHaveBeenCalled();

    // Paused for a day: the hourly run passes it over, Scan now still searches (without Reddit).
    const now = new Date();
    await setListeningPaused(p!.id, "day", now);
    hnFind.mockClear();
    const hourly = await runListenScan({ workspaceId }, { workspaceId });
    expect(hourly[p!.id]).toMatchObject({ paused: true, found: 0 });
    // (The hourly run searched the other test product; count from here.)
    hnFind.mockClear();
    reddit.mockClear();
    await runListenScan({ workspaceId }, { workspaceId, productId: p!.id });
    expect(hnFind).toHaveBeenCalledTimes(1);
    expect(reddit).not.toHaveBeenCalled();

    // A timed pause runs out on its own; resuming keeps the paused sources.
    expect((await listeningState(p!.id, new Date(now.getTime() + 2 * 86400_000))).paused).toBe(false);
    await setListeningPaused(p!.id, "forever");
    expect(await listeningState(p!.id, new Date(now.getTime() + 365 * 86400_000))).toEqual({ paused: true, until: null, channels: ["reddit"] });
    expect(await setListeningPaused(p!.id, "resume")).toEqual({ paused: false, until: null, channels: ["reddit"] });
    await expect(setChannelPaused(p!.id, "linkedin", true)).rejects.toThrow(/doesn't search/);
  });

  it("an X API error is recorded for Settings instead of failing the scan", async () => {
    await putSecret(X_TOKEN_SECRET, "t");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 402 })));
    expect(await x.discover({ keywords: ["field notes"], communities: [], since: new Date(Date.now() - 3600_000) })).toEqual([]);
    expect((await xLastError())?.message).toBe("No X API credits left");
  });
});

describe("matching a conversation to its watched community", () => {
  const forum = { name: "Fieldnote Forum", url: "https://forum.example.com", promoRules: "no ads" };
  const tag = { name: "#fieldnotes", url: null, promoRules: "be nice" };

  it("matches Discourse by forum address, even for a pasted link whose community is the host", () => {
    expect(matchCommunity("discourse", { community: "forum.example.com", url: "https://forum.example.com/t/a/12/3" }, [forum])).toBe(forum);
    expect(matchCommunity("discourse", { community: "other.example.com", url: "https://other.example.com/t/a/1" }, [forum])).toBeNull();
  });

  it("matches a Mastodon hashtag with or without its server", () => {
    expect(matchCommunity("mastodon", { community: "#fieldnotes@mastodon.social", url: "u" }, [tag])).toBe(tag);
    expect(matchCommunity("mastodon", { community: "#fieldnotes@fosstodon.org", url: "u" }, [tag])).toBeNull();
  });

  it("matches other channels by name, ignoring case", () => {
    expect(matchCommunity("reddit", { community: "AskPhotography", url: "u" }, [{ name: "askphotography", url: null }])).toBeTruthy();
  });
});

describe("Mastodon reply length", () => {
  it("counts the @author mention Mastodon puts in front", () => {
    const conv = { channel: "mastodon", url: "https://mastodon.social/@a/1", externalId: "https://m.example/users/a/statuses/1", author: "someone@mastodon.world" };
    const ctx = { mastodonServer: "mastodon.social" };
    expect(replyRequest(conv, { id: "d", body: "x".repeat(476) }, "o", ctx)).not.toBeNull(); // 476 + 24 = 500
    expect(replyRequest(conv, { id: "d", body: "x".repeat(477) }, "o", ctx)).toBeNull();
  });
});
