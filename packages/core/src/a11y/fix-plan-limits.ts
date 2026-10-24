// Fix plan limits, without database imports so the Issues list's selection (a client component) can use them.

export const PLAN_MAX_ISSUES = 25;

/** Rough cost shown before the request (Sonnet prices: about 700 tokens in and 400 out an issue). */
export function planCostHint(issues: number): string {
  return `about $${Math.max(0.01, Math.round(issues * 0.8) / 100).toFixed(2)}`;
}
