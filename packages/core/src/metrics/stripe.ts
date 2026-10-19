import Stripe from "stripe";
import { z } from "zod";
import { daysAgo, isoDay, SYNC_DAYS, type MetricRow } from "./types.ts";

export const stripeConfig = z.object({});

export type SubscriptionLike = {
  status: string;
  created: number;
  canceled_at: number | null;
  ended_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
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
// Never started: a first payment that failed or expired.
const NEVER_STARTED = new Set(["incomplete", "incomplete_expired"]);

export type InvoiceLike = { amount_paid: number; status_transitions?: { paid_at?: number | null } | null; created: number };

/**
 * Per day over the last `days` days (UTC days, like Stripe's dashboard): active subscriptions,
 * trials and MRR, rebuilt from each subscription's start and end, so the history is there from
 * the first sync; today's values follow the subscriptions' current status. Also new subscriptions,
 * cancellations (when the customer canceled), MRR gained and lost (subscriptions that started or
 * ended), and revenue (invoices paid). MRR uses each subscription's current price: upgrades and
 * downgrades show from today, not from when they happened.
 */
export function summarizeSubscriptions(subs: SubscriptionLike[], now = new Date(), days = SYNC_DAYS + 1, invoices: InvoiceLike[] = []): MetricRow[] {
  const today = isoDay(now);
  const started = subs.filter((s) => !NEVER_STARTED.has(s.status));
  const rows: MetricRow[] = [];
  const dayList: string[] = [];
  for (let i = days - 1; i >= 0; i--) dayList.push(isoDay(daysAgo(i, now)));
  const round = (n: number) => Math.round(n * 100) / 100;

  for (const day of dayList) {
    let active: SubscriptionLike[];
    let trials: number;
    if (day === today) {
      active = subs.filter((s) => COUNTS_AS_ACTIVE.has(s.status));
      trials = subs.filter((s) => s.status === "trialing").length;
    } else {
      const end = Date.parse(`${day}T00:00:00Z`) / 1000 + 86400;
      active = started.filter((s) => s.created < end && (s.ended_at == null || s.ended_at >= end));
      trials = active.filter((s) => s.trial_start != null && s.trial_end != null && s.trial_start < end && s.trial_end >= end).length;
    }
    rows.push(
      { day, metric: "active_subscriptions", value: active.length },
      { day, metric: "trials", value: trials },
      { day, metric: "mrr", value: round(active.reduce((sum, s) => sum + monthlyRevenue(s), 0)) },
    );
  }

  const perDay = (metric: string, items: { ts: number; value: number }[]) => {
    const totals = new Map(dayList.map((d) => [d, 0]));
    for (const { ts, value } of items) {
      const day = isoDay(new Date(ts * 1000));
      if (totals.has(day)) totals.set(day, totals.get(day)! + value);
    }
    for (const [day, value] of totals) rows.push({ day, metric, value: round(value) });
  };
  perDay("new_subscriptions", started.map((s) => ({ ts: s.created, value: 1 })));
  perDay("cancellations", started.flatMap((s) => (s.canceled_at ? [{ ts: s.canceled_at, value: 1 }] : [])));
  perDay("mrr_new", started.map((s) => ({ ts: s.created, value: monthlyRevenue(s) })));
  perDay("mrr_churned", started.flatMap((s) => (s.ended_at ? [{ ts: s.ended_at, value: monthlyRevenue(s) }] : [])));
  perDay("revenue", invoices.map((inv) => ({ ts: inv.status_transitions?.paid_at ?? inv.created, value: inv.amount_paid / 100 })));
  return rows;
}

export async function fetchStripeMetrics(_config: z.infer<typeof stripeConfig>, secret: string, opts: { days?: number } = {}): Promise<MetricRow[]> {
  if (!/^(rk|sk)_(live|test)_/.test(secret)) throw new Error("That doesn't look like a Stripe key (rk_live_… or rk_test_…)");
  const stripe = new Stripe(secret);
  const days = opts.days ?? SYNC_DAYS + 1;
  const subs: SubscriptionLike[] = [];
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100, expand: ["data.items.data.price"] })) {
    subs.push(sub as unknown as SubscriptionLike);
  }
  const invoices: InvoiceLike[] = [];
  const since = Math.floor(daysAgo(days, new Date()).getTime() / 1000);
  try {
    for await (const inv of stripe.invoices.list({ status: "paid", limit: 100, created: { gte: since - 86400 * 31 } })) invoices.push(inv as unknown as InvoiceLike);
  } catch (error) {
    // A key made before Startica read invoices: everything else still syncs.
    if (!(error instanceof Stripe.errors.StripePermissionError)) throw error;
  }
  return summarizeSubscriptions(subs, new Date(), days, invoices);
}
