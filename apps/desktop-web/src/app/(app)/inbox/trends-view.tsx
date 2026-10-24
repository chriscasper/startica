"use client";

import { useState } from "react";
import { TrendingUpIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ListeningTrends, TrendSeries } from "@startica/core/distribution/trends";
import { MetricChart } from "../analytics/metric-chart";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Sentiment is polarity: blue for positive, red for negative, a neutral gray between, violet for
// mixed (dataviz reference palette; checked with its validator in light and dark, the gray is
// the intended neutral). Every segment is also labeled with its name and count.
const SENTIMENTS = [
  { key: "positive", label: "Positive", color: "bg-[#2a78d6] dark:bg-[#3987e5]" },
  { key: "neutral", label: "Neutral", color: "bg-[#8c8b85]" },
  { key: "mixed", label: "Mixed", color: "bg-[#4a3aa7] dark:bg-[#9085e9]" },
  { key: "negative", label: "Negative", color: "bg-[#e34948] dark:bg-[#e66767]" },
] as const;

function SeriesTable({ title, series, selected, onSelect }: { title: string; series: TrendSeries[]; selected: string; onSelect: (key: string) => void }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this period.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium">Name</th>
                <th className="text-right font-medium">Last 7 days</th>
                <th className="text-right font-medium">Period</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.key} className="border-t">
                  <td className="py-1.5">
                    <button type="button" onClick={() => onSelect(s.key)} className={cn("text-left hover:underline", selected === s.key && "font-medium underline")} aria-pressed={selected === s.key}>
                      {s.label}
                    </button>
                  </td>
                  <td className="text-right">{s.counts.slice(-7).reduce((a, b) => a + b, 0)}</td>
                  <td className="text-right">{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function TrendsView({ trends }: { trends: ListeningTrends }) {
  const all = [trends.total, ...trends.keywords, ...trends.communities];
  const [selected, setSelected] = useState(trends.total.key);
  const series = all.find((s) => s.key === selected) ?? trends.total;
  const points = trends.days.map((day, i) => ({ day, value: series.counts[i] ?? 0 }));
  const sentimentTotal = trends.sentiment.scored;
  const voiceTotal = trends.shareOfVoice.reduce((a, v) => a + v.mentions, 0);

  return (
    <div className="grid max-w-5xl gap-4">
      {trends.spikes.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUpIcon className="size-4" aria-hidden />
              Spikes
            </CardTitle>
            <CardDescription>Busier than usual: at least 5 in a day and 3× the 14 days before, or at least 10 in a week and 2× the 3 weeks before.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {trends.spikes.slice(0, 6).map((s) => (
                <li key={`${s.key}:${s.window}`}>
                  <button type="button" className="text-left hover:underline" onClick={() => setSelected(s.key)}>
                    <span className="font-medium">{s.kind === "keyword" ? `“${s.label}”` : s.label}</span>: {s.count} {s.window === "week" ? "in the last 7 days" : `on ${shortDay(s.day)}`}, usually {s.baseline} {s.window === "week" ? "a week" : "a day"}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Conversations found per day</CardTitle>
          <CardDescription>
            {series.label}: {series.total} in the last {trends.range} days. Pick a keyword or community below to see it on its own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {trends.total.total === 0 ? (
            <p className="text-sm text-muted-foreground">No conversations found in this period yet. Scans run every hour.</p>
          ) : (
            <MetricChart data={points} unit="conversations" label={series.label} />
          )}
          {series.key !== trends.total.key && (
            <button type="button" className="mt-2 text-xs underline" onClick={() => setSelected(trends.total.key)}>
              Show all conversations
            </button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SeriesTable title="By keyword" series={trends.keywords} selected={selected} onSelect={setSelected} />
        <SeriesTable title="By community" series={trends.communities} selected={selected} onSelect={setSelected} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Sentiment</CardTitle>
            <CardDescription>
              How the authors sound, from scoring. {trends.sentiment.unscored > 0 && `${trends.sentiment.unscored} not scored for it (older, duplicates or skipped as too old).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sentimentTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No scored conversations in this period.</p>
            ) : (
              <>
                <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={SENTIMENTS.map((s) => `${s.label} ${trends.sentiment.counts[s.key]}`).join(", ")}>
                  {SENTIMENTS.filter((s) => trends.sentiment.counts[s.key] > 0).map((s) => (
                    <div key={s.key} className={s.color} style={{ width: pct(trends.sentiment.counts[s.key] / sentimentTotal) }} />
                  ))}
                </div>
                <ul className="grid grid-cols-2 gap-1 text-sm tabular-nums">
                  {SENTIMENTS.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span aria-hidden className={cn("size-2.5 rounded-sm", s.color)} />
                      {s.label}
                      <span className="text-muted-foreground">
                        {trends.sentiment.counts[s.key]} ({pct(trends.sentiment.counts[s.key] / sentimentTotal)})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Share of voice</CardTitle>
            <CardDescription>Conversations naming your product or a competitor from Intel, by name.</CardDescription>
          </CardHeader>
          <CardContent>
            {voiceTotal === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody named your product or a competitor in this period.</p>
            ) : (
              <ul className="grid gap-2 text-sm tabular-nums">
                {trends.shareOfVoice.map((v) => (
                  <li key={v.id ?? "product"} className="grid gap-1">
                    <div className="flex justify-between gap-2">
                      <span className={cn(v.id === null && "font-medium")}>{v.name}{v.id === null && " (you)"}</span>
                      <span className="text-muted-foreground">
                        {v.mentions} · {pct(v.share)}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: pct(v.share) }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {trends.historyDays < 14 && <p className="text-xs text-muted-foreground">Spikes need two weeks of listening to compare against; this product has {trends.historyDays} days so far.</p>}
    </div>
  );
}
