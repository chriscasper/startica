import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "@startica/db/bootstrap";
import { closeDatabase, getDb, migrateDatabase, openDatabase } from "@startica/db/client";
import { secrets } from "@startica/db/schema";
import { fileKeyCipher, putSecret, setCipher } from "@startica/db/secrets";
import { fromTweet, x, X_SETTINGS, X_TOKEN_SECRET, xQuery, xUsage } from "./x.ts";

const since = new Date(Date.now() - 26 * 3600_000);
const query = { keywords: ["film scanner", "darkroom", "negative lab pro"], communities: [], since };
const tweets = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(1000 + i), text: `post ${i}`, created_at: new Date().toISOString(), public_metrics: { like_count: i, reply_count: 1 } }));

let calls: string[] = [];
function stubSearch(n: number) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const body = url.includes("/tweets/search/") ? { data: tweets(n), meta: { result_count: n, newest_id: String(1000 + n - 1) } } : { data: tweets(1)[0] };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
}

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "startica-x-"));
  openDatabase(join(dir, "test.db"));
  setCipher(fileKeyCipher(join(dir, "key")));
  await migrateDatabase(join(import.meta.dirname, "../../../db/migrations"));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await getDb().delete(secrets);
});
afterAll(() => closeDatabase());

describe("x helpers", () => {
  it("folds the top keywords into one query without reposts", () => {
    expect(xQuery(query.keywords)).toBe('("film scanner" OR darkroom OR "negative lab pro") -is:retweet');
    expect(xQuery([])).toBeNull();
  });

  it("maps posts without a user lookup", () => {
    expect(fromTweet({ id: "42", text: "hi", referenced_tweets: [{ type: "replied_to", id: "1" }], public_metrics: { like_count: 3, reply_count: 2 } })).toMatchObject({
      url: "https://x.com/i/status/42",
      kind: "comment",
      author: null,
      score: 3,
      numComments: 2,
    });
  });
});

describe("x rationing", () => {
  it("does nothing without a token", async () => {
    stubSearch(10);
    expect(await x.discover(query)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("scans at most every few hours, continues from since_id and stops at the daily cap", async () => {
    await putSecret(X_TOKEN_SECRET, "test-token");
    await setSetting(X_SETTINGS, { dailyReads: 40, scanHours: 6 });

    stubSearch(25);
    expect(await x.discover(query)).toHaveLength(25);
    const first = new URL(calls[0]!);
    expect(first.searchParams.get("max_results")).toBe("40");
    expect(first.searchParams.get("start_time")).toBeTruthy();
    expect(await xUsage()).toEqual({ reads: 25, cap: 40 });

    // Within the interval: no request at all.
    stubSearch(10);
    expect(await x.discover(query)).toEqual([]);
    expect(calls).toHaveLength(0);

    // Interval passed: continues from the newest post, asking only for what's left today.
    const key = `x_api_state:${xQuery(query.keywords)}`;
    await setSetting(key, { ...(await getSetting<{ sinceId: string }>(key))!, lastScanAt: 0 });
    stubSearch(10);
    await x.discover(query);
    const second = new URL(calls[0]!);
    expect(second.searchParams.get("since_id")).toBe("1024");
    expect(second.searchParams.get("max_results")).toBe("15");
    expect((await xUsage()).reads).toBe(35);

    // Fewer than 10 reads left today: X's minimum page, so no request.
    await setSetting(key, { ...(await getSetting<{ sinceId: string }>(key))!, lastScanAt: 0 });
    stubSearch(10);
    expect(await x.discover(query)).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(await x.fetchEngagement!("https://x.com/i/status/1000")).toMatchObject({ score: 0 });
    expect((await xUsage()).reads).toBe(36);
  });
});
