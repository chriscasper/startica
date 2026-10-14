import Stripe from "stripe";
import { z } from "zod";
import { daysAgo, isoDay, SYNC_DAYS, type MetricRow } from "./types.ts";

export const stripeConfig = z.object({});

export type SubscriptionLike = {
  status: string;
  created: number;
  canceled_at: number | null;
  items: {
    data: {
      quantity?: number | null;
      price: { unit_amount: number | null; recurring: { interval: string; interval_count: number } | null };
    }[];
  };
};

const MONTHS_PER_INTERVAL: Record<string, number> = { day: 12 / 365, week: 12 / 52, month: 1, year: 12 };

/** Monthly recurring revenue of one subscription, in currency units (not cents). */
export function monthlyRevenue(sub: SubscriptionLike): number {
  let total = 0;
  for (const item of sub.items.data) {
    const recurring = item.price.recurring;
    if (!recurring || item.price.unit_amount == null) continue;
    const months = (MONTHS_PER_INTERVAL[recurring.interval] ?? 1) * recurring.interval_count;
    total += (item.price.unit_amount * (item.quantity ?? 1)) / months / 100;
  }
  return total;
}

const COUNTS_AS_ACTIVE = new Set(["active", "trialing", "past_due"]);

/** Today's MRR and active count, plus daily new subscriptions and cancellations. */
export function summarizeSubscriptions(subs: SubscriptionLike[], now = new Date()): MetricRow[] {
  const today = isoDay(now);
  const windowStart = daysAgo(SYNC_DAYS, now).getTime() / 1000;
  const active = subs.filter((s) => COUNTS_AS_ACTIVE.has(s.status));
  const rows: MetricRow[] = [
    { day: today, metric: "active_subscriptions", value: active.length },
    { day: today, metric: "mrr", value: Math.round(active.reduce((sum, s) => sum + monthlyRevenue(s), 0) * 100) / 100 },
  ];

  const perDay = (metric: string, timestamps: number[]) => {
    const counts = new Map<string, number>();
    for (let i = 0; i <= SYNC_DAYS; i++) counts.set(isoDay(daysAgo(i, now)), 0);
    for (const ts of timestamps) {
      if (ts < windowStart) continue;
      const day = isoDay(new Date(ts * 1000));
      if (counts.has(day)) counts.set(day, counts.get(day)! + 1);
    }
    for (const [day, value] of counts) rows.push({ day, metric, value });
  };
  perDay("new_subscriptions", subs.map((s) => s.created));
  perDay("cancellations", subs.flatMap((s) => (s.canceled_at ? [s.canceled_at] : [])));
  return rows;
}

export async function fetchStripeMetrics(_config: z.infer<typeof stripeConfig>, secret: string): Promise<MetricRow[]> {
  if (!/^(rk|sk)_(live|test)_/.test(secret)) throw new Error("That doesn't look like a Stripe key (rk_live_… or rk_test_…)");
  const stripe = new Stripe(secret);
  const subs: SubscriptionLike[] = [];
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price"] })) {
    subs.push(sub as unknown as SubscriptionLike);
  }
  return summarizeSubscriptions(subs);
}
