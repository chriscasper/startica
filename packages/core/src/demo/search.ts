import type { Db } from "@startica/db/client";
import * as s from "@startica/db/schema";
import { sitemapsSettingKey, type SavedSitemaps } from "../search/sync.ts";

/**
 * The demo's Search Console data (ARCHITECTURE.md section 10.2): 90 days for fieldnote.example,
 * growing, with queries in striking distance and a page with a weak click-through rate,
 * so every part of the Search screen has something to show.
 */

const QUERIES: { q: string; position: number; ctr: number; impressions: number }[] = [
  { q: "fieldnote", position: 1.2, ctr: 0.42, impressions: 22 },
  { q: "fieldnote app", position: 1.1, ctr: 0.38, impressions: 9 },
  { q: "field notes app", position: 8.4, ctr: 0.025, impressions: 64 },
  { q: "offline field notebook", position: 6.1, ctr: 0.04, impressions: 31 },
  { q: "digital field notebook for ecology", position: 11.8, ctr: 0.012, impressions: 26 },
  { q: "how to take field notes", position: 3.2, ctr: 0.018, impressions: 90 },
  { q: "transect data collection app", position: 14.5, ctr: 0.008, impressions: 18 },
  { q: "field notes template", position: 5.4, ctr: 0.05, impressions: 40 },
  { q: "gps notes app offline", position: 17.2, ctr: 0.004, impressions: 22 },
  { q: "qualitative interview notes app", position: 9.6, ctr: 0.02, impressions: 14 },
];

const PAGES: { path: string; share: number; position: number }[] = [
  { path: "/", share: 0.46, position: 4.2 },
  { path: "/blog/how-to-take-field-notes", share: 0.22, position: 3.4 },
  { path: "/templates", share: 0.14, position: 6.8 },
  { path: "/pricing", share: 0.1, position: 2.9 },
  { path: "/blog/offline-data-collection", share: 0.08, position: 11.2 },
];

export async function seedDemoSearch(db: Db, workspaceId: string, productId: string, ago: (days: number, hours?: number) => Date): Promise<number> {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const rows: (typeof s.searchStats.$inferInsert)[] = [];
  const base = { workspaceId, productId, source: "google" as const };
  for (let i = 89; i >= 0; i--) {
    const date = ago(i);
    const d = day(date);
    const growth = 1 + (89 - i) * 0.008;
    const weekend = [0, 6].includes(date.getUTCDay()) ? 0.75 : 1;
    const wobble = 0.9 + ((i * 37) % 21) / 100;
    let clicks = 0;
    let impressions = 0;
    let weighted = 0;
    for (const q of QUERIES) {
      const imp = Math.round(q.impressions * growth * weekend * wobble);
      const c = Math.round(imp * q.ctr * (1 + (i % 3) * 0.1));
      // Positions improve a little over the 90 days.
      const position = Math.max(1, q.position - (89 - i) * 0.01);
      rows.push({ ...base, day: d, kind: "query", key: q.q, clicks: c, impressions: imp, position: Math.round(position * 10) / 10 });
      clicks += c;
      impressions += imp;
      weighted += position * imp;
    }
    // Rare queries Google hides for privacy: in the totals, not in any query row.
    const hiddenImp = Math.round(impressions * 0.18);
    const hiddenClicks = Math.round(clicks * 0.12);
    const totalImp = impressions + hiddenImp;
    const totalClicks = clicks + hiddenClicks;
    const position = Math.round(((weighted + hiddenImp * 12) / totalImp) * 10) / 10;
    rows.push({ ...base, day: d, kind: "total", key: "", clicks: totalClicks, impressions: totalImp, position });
    for (const p of PAGES)
      rows.push({ ...base, day: d, kind: "page", key: `https://fieldnote.example${p.path}`, clicks: Math.round(totalClicks * p.share), impressions: Math.round(totalImp * p.share * (p.path === "/blog/how-to-take-field-notes" ? 1.8 : 1)), position: p.position });
    for (const [key, share] of [["usa", 0.48], ["gbr", 0.14], ["can", 0.11], ["aus", 0.08], ["deu", 0.06]] as const)
      rows.push({ ...base, day: d, kind: "country", key, clicks: Math.round(totalClicks * share), impressions: Math.round(totalImp * share), position });
    for (const [key, share] of [["desktop", 0.58], ["mobile", 0.39], ["tablet", 0.03]] as const)
      rows.push({ ...base, day: d, kind: "device", key, clicks: Math.round(totalClicks * share), impressions: Math.round(totalImp * share), position });
  }
  for (let i = 0; i < rows.length; i += 200) await db.insert(s.searchStats).values(rows.slice(i, i + 200));
  const sitemaps: SavedSitemaps = {
    checkedAt: ago(0, 2).toISOString(),
    sitemaps: [{ path: "https://fieldnote.example/sitemap.xml", lastSubmitted: ago(60).toISOString(), lastDownloaded: ago(1).toISOString(), isPending: false, errors: 0, warnings: 0, submitted: 7 }],
  };
  await db
    .insert(s.settings)
    .values({ key: sitemapsSettingKey(productId), value: sitemaps })
    .onConflictDoUpdate({ target: s.settings.key, set: { value: sitemaps } });
  return rows.length;
}
