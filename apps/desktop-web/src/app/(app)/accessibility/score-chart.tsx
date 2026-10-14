"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ScorePoint = { at: string; score: number };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{shortDate(label)}</div>
      <div className="font-medium text-foreground tabular-nums">{Math.round(payload[0]?.value ?? 0)} / 100</div>
    </div>
  );
}

/**
 * The site score per full scan, with the target as a dashed line. One series on a fixed
 * 0–100 axis, dots because scans are few and far apart; a table for the exact values.
 */
export function ScoreChart({ data, target, label = "Accessibility score" }: { data: ScorePoint[]; target: number; label?: string }) {
  return (
    <figure className="grid gap-2 [--viz-series-1:var(--module-chart,#2a78d6)] dark:[--viz-series-1:var(--module-chart,#3987e5)]">
      <div className="h-48 w-full" role="img" aria-label={`${label} over the last ${data.length} scans, target ${target}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="at" tickFormatter={shortDate} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={24} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: `Target ${target}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }} content={<ChartTooltip />} />
            <Line type="linear" dataKey="score" stroke="var(--viz-series-1)" strokeWidth={2} dot={{ r: 3, fill: "var(--viz-series-1)", strokeWidth: 0 }} activeDot={{ r: 5, fill: "var(--viz-series-1)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full max-w-xs tabular-nums">
          <thead>
            <tr>
              <th className="text-left font-medium">Scan</th>
              <th className="text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.at}>
                <td>{shortDate(p.at)}</td>
                <td className="text-right">{Math.round(p.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
