import { eq } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { products, type AnalyticsSummaryBody } from "@startica/db/schema";
import { loadAnalyticsReport, type AnalyticsReport } from "./report.ts";
import { latestReadySummary } from "./summary.ts";

/**
 * The Analytics report to share (ARCHITECTURE.md section 8.2, "Report export"): the selected
 * period's Overview numbers, what changed, the latest weekly read-out, traffic, conversions,
 * revenue and what Startica did, as Markdown or as a printable page (Save as PDF in the desktop
 * app). Built from `loadAnalyticsReport` by fixed templates: deterministic, no AI call.
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "note"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  | { kind: "table"; head: string[]; rows: string[][]; numeric?: number[] };
export type ReportSection = { title: string; blocks: Block[] };
export type ReportDoc = { title: string; subtitle: string; sections: ReportSection[]; footer: string };

type Summary = { periodStart: string; periodEnd: string; model: string | null; body: AnalyticsSummaryBody };
type Pair = { now: number | null; before: number | null };

const longDay = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const num = (n: number | null | undefined) => (n == null ? "–" : Math.round(n).toLocaleString("en-US"));
const dec = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const money = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const percent = (n: number | null | undefined) => (n == null ? "–" : `${(n * 100).toFixed(1)}%`);
const changeOf = (p: Pair, fmt: "count" | "rate" = "count") => {
  if (p.now == null || p.before == null) return "–";
  if (fmt === "rate") {
    const d = (p.now - p.before) * 100;
    return `${d > 0 ? "+" : ""}${d.toFixed(1)} pts`;
  }
  if (p.before === 0) return p.now > 0 ? "new" : "0%";
  const c = (p.now - p.before) / p.before;
  return `${c > 0 ? "+" : ""}${Math.round(c * 100)}%`;
};

/** The report's content, from a loaded Analytics report (pure: no database, no clock). */
export function buildAnalyticsDoc(input: { productName: string; report: AnalyticsReport; summary: Summary | null; generatedAt: Date }): ReportDoc {
  const { report: r, summary } = input;
  const days = r.current.days;
  const sections: ReportSection[] = [];
  const cmp = r.previousComplete;

  // Overview tiles.
  type Row = { label: string; pair: Pair; show: (n: number | null) => string; fmt?: "count" | "rate" };
  const rows: Row[] = [];
  if (r.traffic.has) {
    rows.push({ label: `Visits (${days}d)`, pair: r.traffic.sessions, show: num });
    rows.push({ label: `Key events (${days}d)`, pair: r.conversions.keyEvents, show: num });
    rows.push({ label: "Key events per visit", pair: r.conversions.rate, show: percent, fmt: "rate" });
  }
  if (r.conversions.signups) rows.push({ label: `Signups (${days}d)`, pair: r.conversions.signups, show: num });
  if (r.product.activeUsers.has) rows.push({ label: "Active users (latest)", pair: r.product.activeUsers, show: num });
  if (r.revenue.has) {
    rows.push({ label: "MRR", pair: r.revenue.mrr, show: money });
    rows.push({ label: "Subscriptions", pair: r.revenue.activeSubs, show: num });
    rows.push({ label: `Cancellations (${days}d)`, pair: r.revenue.cancellations, show: num });
  }
  sections.push({
    title: "Overview",
    blocks: rows.length
      ? [
          {
            kind: "table",
            head: cmp ? ["Metric", "This period", "Period before", "Change"] : ["Metric", "This period"],
            rows: rows.map((x) => (cmp ? [x.label, x.show(x.pair.now), x.show(x.pair.before), changeOf(x.pair, x.fmt)] : [x.label, x.show(x.pair.now)])),
            numeric: cmp ? [1, 2, 3] : [1],
          },
        ]
      : [{ kind: "p", text: "Nothing connected yet: connect web analytics, Stripe or the product database in Settings → Products." }],
  });

  sections.push({
    title: "What changed",
    blocks: [
      r.highlights.length
        ? { kind: "list", items: r.highlights.map((h) => h.text) }
        : { kind: "p", text: cmp ? "No big changes: everything moved less than about 15%." : "There isn't a full period before this one to compare with yet." },
    ],
  });

  if (summary) {
    const b = summary.body;
    sections.push({
      title: "Weekly read-out",
      blocks: [
        { kind: "note", text: `Written by AI${summary.model ? ` (${summary.model})` : ""} from the numbers for ${longDay(summary.periodStart)} to ${longDay(summary.periodEnd)}; check anything surprising against the tables.` },
        { kind: "p", text: `**${b.headline}** ${b.summary}` },
        ...(b.wins.length ? [{ kind: "p" as const, text: "**Worked**" }, { kind: "list" as const, items: b.wins }] : []),
        ...(b.concerns.length ? [{ kind: "p" as const, text: "**Watch**" }, { kind: "list" as const, items: b.concerns }] : []),
        ...(b.tryNext.length ? [{ kind: "p" as const, text: "**Try next**" }, { kind: "list" as const, ordered: true, items: b.tryNext.map((t) => `${t.title}: ${t.why}`) }] : []),
      ],
    });
  }

  // Traffic.
  const t = r.traffic;
  if (t.has) {
    const facts = [
      `${num(t.sessions.now)} visits${cmp ? ` (${num(t.sessions.before)} the period before)` : ""}, ${num(t.avgDailyUsers.now)} users a day on average`,
      t.engagedRate?.now != null ? `${percent(t.engagedRate.now)} of visits engaged` : null,
      t.pagesPerSession?.now != null ? `${dec(t.pagesPerSession.now)} pages per visit` : null,
    ].filter(Boolean);
    const blocks: Block[] = [{ kind: "p", text: `${facts.join("; ")}. From ${r.webLabel}.` }];
    const channels = t.channels.filter((c) => c.sessions > 0).slice(0, 8);
    if (channels.length) {
      blocks.push({
        kind: "table",
        head: cmp ? ["Channel", "Visits", "Period before", "Key events"] : ["Channel", "Visits", "Key events"],
        rows: channels.map((c) => (cmp ? [c.group, num(c.sessions), num(c.before), num(c.keyEvents)] : [c.group, num(c.sessions), num(c.keyEvents)])),
        numeric: cmp ? [1, 2, 3] : [1, 2],
      });
    }
    if (t.aiAssistants.length) blocks.push({ kind: "p", text: `AI assistants: ${t.aiAssistants.slice(0, 5).map((a) => `${a.name} (${num(a.sessions)})`).join(", ")}.` });
    const landing = t.landing.slice(0, 8);
    if (landing.length) {
      blocks.push({ kind: "p", text: "**Top landing pages**" });
      blocks.push({ kind: "table", head: ["Page", "Visits", "Key events"], rows: landing.map((l) => [l.key, num(l.sessions), num(l.keyEvents ?? 0)]), numeric: [1, 2] });
    }
    sections.push({ title: "Traffic", blocks });
  }

  // Conversions.
  const c = r.conversions;
  if (t.has || c.signups) {
    const blocks: Block[] = [];
    const facts = [
      t.has ? `${num(c.keyEvents.now)} key events (${percent(c.rate.now)} of visits)` : null,
      c.signups ? `${num(c.signups.now)} signups${cmp && c.signups.before != null ? ` (${num(c.signups.before)} the period before)` : ""}` : null,
    ].filter(Boolean);
    blocks.push({ kind: "p", text: `${facts.join("; ")}.` });
    if (c.events.length) blocks.push({ kind: "table", head: ["Event", "Count"], rows: c.events.slice(0, 8).map((e) => [e.key, num(e.count)]), numeric: [1] });
    sections.push({ title: "Conversions", blocks });
  }

  // Revenue.
  const v = r.revenue;
  if (v.has) {
    const lines = [
      `MRR ${money(v.mrr.now)}${v.mrr.before != null ? ` (${money(v.mrr.before)} at the end of the period before)` : ""}`,
      `${num(v.paying.now)} paying subscriptions${v.trials ? `, ${num(v.trials.now)} in trial` : ""}`,
      `${num(v.newSubs.now)} new subscriptions, ${num(v.cancellations.now)} cancellations${v.churnRate != null ? ` (${percent(v.churnRate)} of subscriptions at the start)` : ""}`,
      v.arpa != null ? `${money(v.arpa)} MRR per paying customer` : null,
      v.mrrNew || v.mrrChurned ? `MRR movement: ${money(v.mrrNew?.now ?? 0)} new, ${money(v.mrrChurned?.now ?? 0)} churned` : null,
      v.revenue ? `${money(v.revenue.now)} paid invoices` : null,
    ].filter((x): x is string => Boolean(x));
    sections.push({ title: "Revenue", blocks: [{ kind: "list", items: lines }, { kind: "note", text: "From Stripe." }] });
  }

  // What Startica did.
  const s = r.startica;
  const did: Block[] = [];
  if (s.posts.length === 0 && !s.ads?.length) {
    did.push({ kind: "p", text: "No replies or posts recorded in this period." });
  } else {
    const replies = s.posts.filter((p) => p.kind === "reply").length;
    did.push({ kind: "p", text: `${num(replies)} replies and ${num(s.posts.length - replies)} posts, bringing ${num(s.fromPosts.visits)} visits and ${num(s.fromPosts.keyEvents)} key events through their links.` });
    if (s.places.length) {
      did.push({
        kind: "table",
        head: ["Where", "Posts", "Replies to them", "Visits", "Key events"],
        rows: s.places.slice(0, 12).map((p) => [p.where, num(p.posts), num(p.replies), num(p.visits), num(p.keyEvents)]),
        numeric: [1, 2, 3, 4],
      });
    }
    const removed = s.posts.filter((p) => p.removed).length;
    if (removed) did.push({ kind: "p", text: `${removed} removed by moderators or deleted.` });
    if (s.ads?.length) {
      did.push({ kind: "p", text: "**Ads**" });
      did.push({ kind: "table", head: ["Campaign", "Platform", "Spend", "Visits", "Results"], rows: s.ads.map((a) => [a.name, a.platform, money(a.spend), num(a.visits), num(a.results)]), numeric: [2, 3, 4] });
    }
  }
  sections.push({ title: "What Startica did", blocks: did });

  return {
    title: `Analytics report: ${input.productName}`,
    subtitle: `${longDay(r.current.start)} to ${longDay(r.current.end)} (${days} days)${cmp ? `, compared with the ${days} days before` : ""}. Exported ${input.generatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`,
    sections,
    footer: "Made with Startica. Numbers come from the product's own connections (web analytics, Stripe, product database) and Startica's records; only the weekly read-out is written by AI.",
  };
}

// --- Markdown ------------------------------------------------------------------------------------

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function reportMarkdown(doc: ReportDoc): string {
  const out = [`# ${doc.title}`, "", doc.subtitle, ""];
  for (const section of doc.sections) {
    out.push(`## ${section.title}`, "");
    for (const b of section.blocks) {
      if (b.kind === "p") out.push(b.text, "");
      else if (b.kind === "note") out.push(`> ${b.text}`, "");
      else if (b.kind === "list") out.push(...b.items.map((x, i) => `${b.ordered ? `${i + 1}.` : "-"} ${x}`), "");
      else {
        out.push(`| ${b.head.map(mdCell).join(" | ")} |`);
        out.push(`|${b.head.map((_, i) => (b.numeric?.includes(i) ? " ---: " : " --- ")).join("|")}|`);
        for (const row of b.rows) out.push(`| ${row.map(mdCell).join(" | ")} |`);
        out.push("");
      }
    }
  }
  out.push("---", "", doc.footer, "");
  return out.join("\n");
}

// --- Printable page --------------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escapes, then turns the templates' own **bold** into <strong>. */
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

export function reportHtml(doc: ReportDoc): string {
  const block = (b: Block) => {
    if (b.kind === "p") return `<p>${inline(b.text)}</p>`;
    if (b.kind === "note") return `<p class="note">${inline(b.text)}</p>`;
    if (b.kind === "list") {
      const tag = b.ordered ? "ol" : "ul";
      return `<${tag}>${b.items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`;
    }
    const cls = (i: number) => (b.numeric?.includes(i) ? ' class="num"' : "");
    return `<table><thead><tr>${b.head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
      .map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(doc.title)}</title>
<style>
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1d21; background: #fff; margin: 32px auto; padding: 0 16px; max-width: 900px; }
  h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 28px 0 8px; border-bottom: 1px solid #d8dbe0; padding-bottom: 4px; }
  .muted { color: #5b6370; } table { border-collapse: collapse; width: 100%; margin: 8px 0; } th, td { text-align: left; padding: 4px 8px 4px 0; border-bottom: 1px solid #eceef1; vertical-align: top; }
  th { font-weight: 600; } .num { text-align: right; font-variant-numeric: tabular-nums; } .note { background: #f4f5f7; padding: 10px 12px; border-radius: 6px; }
  ul, ol { padding-left: 20px; } li { margin: 2px 0; }
  .print { position: fixed; top: 12px; right: 12px; font: inherit; padding: 4px 12px; border: 1px solid #c4c8cf; border-radius: 6px; background: #fff; cursor: pointer; }
  @media print { body { margin: 12mm; max-width: none; padding: 0; } .print { display: none; } h2 { break-after: avoid; } tr, li { break-inside: avoid; } }
</style></head><body>
<button class="print" type="button" onclick="window.print()">Print or save as PDF</button>
<h1>${esc(doc.title)}</h1>
<p class="muted">${esc(doc.subtitle)}</p>
${doc.sections.map((s) => `<h2>${esc(s.title)}</h2>\n${s.blocks.map(block).join("\n")}`).join("\n")}
<p class="muted">${esc(doc.footer)}</p>
</body></html>`;
}

/** Loads the period and builds the report. Plain loader: reads the clock. */
export async function analyticsExport(productId: string, days: number, now = new Date()): Promise<{ doc: ReportDoc; fileBase: string }> {
  const [[product], report, summary] = await Promise.all([
    getDb().select({ name: products.name }).from(products).where(eq(products.id, productId)),
    loadAnalyticsReport(productId, days, now),
    latestReadySummary(productId),
  ]);
  if (!product) throw new Error("Product not found");
  const doc = buildAnalyticsDoc({ productName: product.name, report, summary: summary ? { ...summary, body: summary.body } : null, generatedAt: now });
  const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
  return { doc, fileBase: `${slug}-analytics-${report.current.start}-to-${report.current.end}` };
}
