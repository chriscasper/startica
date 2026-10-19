import Link from "next/link";
import type { ReactNode } from "react";
import type { Pair } from "@startica/core/metrics/report";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatValue, type ValueFormat } from "./format";

export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const money = (n: number) => formatValue(n, "money");
export const pct = (n: number | null, digits = 1) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);
export const duration = (seconds: number | null) => {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

/** The change against the period before: a percentage, or points for rates. Green is good, so `invert` for cancellations. */
export function Change({ now, before, invert = false, points = false }: { now: number | null; before: number | null; invert?: boolean; points?: boolean }) {
  if (now == null || before == null) return null;
  if (points) {
    const diff = (now - before) * 100;
    if (Math.abs(diff) < 0.05) return <span className="text-xs font-normal text-muted-foreground">no change</span>;
    const good = invert ? diff < 0 : diff > 0;
    return <span className={cn("text-xs font-normal tabular-nums", good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>{`${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`}</span>;
  }
  if (!before) return now ? <span className="text-xs font-normal text-muted-foreground">new</span> : null;
  const change = (now - before) / before;
  if (Math.abs(change) < 0.005) return <span className="text-xs font-normal text-muted-foreground">no change</span>;
  const good = invert ? change < 0 : change > 0;
  return (
    <span className={cn("text-xs font-normal tabular-nums", good ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
      <span className="sr-only">{change > 0 ? "up" : "down"} </span>
      {`${change > 0 ? "+" : "−"}${Math.abs(Math.round(change * 100))}%`}
    </span>
  );
}

export function Tile({
  label,
  value,
  pair,
  format = "number",
  rate = false,
  invert = false,
  missing,
  hint,
}: {
  label: string;
  /** Shown as is; or give `pair` to show its value and the change. */
  value?: string;
  pair?: Pair | { now: number | null; before: number | null } | null;
  format?: ValueFormat | "percent" | "duration";
  rate?: boolean;
  invert?: boolean;
  missing?: ReactNode;
  hint?: string;
}) {
  const shown =
    value ??
    (pair?.now == null ? "—" : format === "percent" ? pct(pair.now) : format === "duration" ? duration(pair.now) : formatValue(pair.now, format));
  const empty = value == null && (pair == null || pair.now == null);
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription title={hint}>{label}</CardDescription>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 text-2xl tabular-nums">
          {shown}
          {pair && <Change now={pair.now} before={pair.before} invert={invert} points={rate || format === "percent"} />}
        </CardTitle>
        {empty && missing && <p className="text-xs text-muted-foreground">{missing}</p>}
      </CardHeader>
    </Card>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{children}</div>;
}

export function NotConnected({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      Connect {what} in{" "}
      <Link href="/settings?tab=products" className="underline">
        Settings → Products
      </Link>{" "}
      to see this.
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export type BarRow = { key: string; label: ReactNode; value: number; before?: number | null; extra?: ReactNode[] };

/**
 * A ranked table with a thin bar for each row's share of the largest (one hue: magnitude),
 * the value and its change. Extra columns follow.
 */
export function BarTable({ rows, label, valueLabel, extraLabels = [], format = "number", empty = "Nothing in this period." }: { rows: BarRow[]; label: string; valueLabel: string; extraLabels?: string[]; format?: ValueFormat; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">{valueLabel}</TableHead>
          {extraLabels.map((l) => (
            <TableHead key={l} className="text-right">
              {l}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="max-w-xs">
              <div className="truncate">{r.label}</div>
              <div aria-hidden className="mt-1 h-1 rounded-full bg-(--viz-series-1) [--viz-series-1:var(--module-chart,#2a78d6)] dark:[--viz-series-1:var(--module-chart,#3987e5)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </TableCell>
            <TableCell className="text-right whitespace-nowrap tabular-nums">
              {formatValue(r.value, format)} {r.before !== undefined && <Change now={r.value} before={r.before} />}
            </TableCell>
            {r.extra?.map((x, i) => (
              <TableCell key={i} className="text-right tabular-nums">
                {x}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SectionCard({ title, description, action, children, className }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
