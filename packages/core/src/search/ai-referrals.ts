import { and, eq, gte, like, lte } from "drizzle-orm";
import { getDb } from "@startica/db/client";
import { metricsSnapshots } from "@startica/db/schema";
import { webSource } from "../metrics/web.ts";

/**
 * Visits from AI assistants and from organic search, read from the GA4 sessions by
 * source and medium that metrics_sync already stores (ARCHITECTURE.md section 10.2). Hostnames
 * change; keep AI_ASSISTANTS_CHECKED current when editing.
 */
export const AI_ASSISTANTS_CHECKED = "2026-10-12";

export const AI_ASSISTANTS: { name: string; hosts: string[] }[] = [
  { name: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  { name: "Perplexity", hosts: ["perplexity.ai", "www.perplexity.ai"] },
  { name: "Claude", hosts: ["claude.ai"] },
  { name: "Gemini", hosts: ["gemini.google.com", "bard.google.com"] },
  { name: "Copilot", hosts: ["copilot.microsoft.com", "edgeservices.bing.com"] },
  { name: "Meta AI", hosts: ["meta.ai", "www.meta.ai"] },
  { name: "Grok", hosts: ["grok.com"] },
  { name: "DeepSeek", hosts: ["chat.deepseek.com", "deepseek.com"] },
  { name: "Mistral Le Chat", hosts: ["chat.mistral.ai"] },
  { name: "You.com", hosts: ["you.com"] },
];

const byHost = new Map(AI_ASSISTANTS.flatMap((a) => a.hosts.map((h) => [h, a.name] as const)));

/** The assistant a GA4 session source belongs to, or null. */
export function aiAssistantOf(source: string): string | null {
  const host = source.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return byHost.get(host) ?? byHost.get(host.replace(/^www\./, "")) ?? null;
}

/** "source:chatgpt.com / referral" → ["chatgpt.com", "referral"]. */
export function parseSourceDimension(dimension: string): { source: string; medium: string } {
  const [source = "", medium = ""] = dimension.replace(/^source:/, "").split(" / ");
  return { source, medium };
}

export type TrafficDay = { day: string; organic: number; ai: number };
export type AiTraffic = {
  days: TrafficDay[];
  organic: number;
  ai: number;
  assistants: { name: string; sessions: number }[];
  /** Organic sessions per search engine (source with medium "organic"). */
  engines: { source: string; sessions: number }[];
  /** Whether there is web analytics data (GA4 or Umami) in the period, and from which. */
  hasData: boolean;
  source: "ga4" | "umami";
};

export async function aiAndOrganicTraffic(productId: string, start: string, end: string): Promise<AiTraffic> {
  const source = (await webSource(productId)) ?? "ga4";
  const rows = await getDb()
    .select({ day: metricsSnapshots.day, dimension: metricsSnapshots.dimension, value: metricsSnapshots.value })
    .from(metricsSnapshots)
    .where(
      and(
        eq(metricsSnapshots.productId, productId),
        eq(metricsSnapshots.source, source),
        eq(metricsSnapshots.metric, "sessions"),
        like(metricsSnapshots.dimension, "source:%"),
        gte(metricsSnapshots.day, start),
        lte(metricsSnapshots.day, end),
      ),
    );
  const days = new Map<string, TrafficDay>();
  const assistants = new Map<string, number>();
  const engines = new Map<string, number>();
  for (const r of rows) {
    const { source, medium } = parseSourceDimension(r.dimension);
    const day = days.get(r.day) ?? { day: r.day, organic: 0, ai: 0 };
    // GA4's AI Assistant channel (May 2026) tags these sessions with medium "ai-assistant";
    // hostnames cover data from before it, and assistants GA4 doesn't know.
    const assistant = aiAssistantOf(source) ?? (medium === "ai-assistant" ? source : null);
    if (assistant) {
      day.ai += r.value;
      assistants.set(assistant, (assistants.get(assistant) ?? 0) + r.value);
    } else if (medium === "organic") {
      day.organic += r.value;
      engines.set(source, (engines.get(source) ?? 0) + r.value);
    }
    days.set(r.day, day);
  }
  const sorted = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return {
    days: sorted,
    organic: sorted.reduce((n, d) => n + d.organic, 0),
    ai: sorted.reduce((n, d) => n + d.ai, 0),
    assistants: list(assistants).map(([name, sessions]) => ({ name, sessions })),
    engines: list(engines).map(([source, sessions]) => ({ source, sessions })),
    hasData: rows.length > 0,
    source,
  };
}
