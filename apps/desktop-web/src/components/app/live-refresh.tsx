"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Table =
  | "job_runs"
  | "ai_runs"
  | "products"
  | "opportunities"
  | "drafts"
  | "connections"
  | "metrics_snapshots"
  | "personas"
  | "competitors"
  | "keywords"
  | "communities"
  | "ai_models"
  | "roadmap_items"
  | "roadmap_replans"
  | "daily_moves"
  | "audits"
  | "jobs"
  | "voice_sources"
  | "voice_samples"
  | "voice_profiles"
  | "content_pieces"
  | "content_snapshots"
  | "publications"
  | "sites"
  | "site_scans"
  | "site_pages"
  | "a11y_issue_groups"
  | "a11y_images"
  | "security_findings"
  | "security_reports"
  | "issue_trackers"
  | "tracker_issues"
  | "ad_campaigns"
  | "ad_groups"
  | "ads"
  | "ad_creatives"
  | "ad_spend"
  | "search_stats"
  | "ai_prompts"
  | "ai_visibility_runs"
  | "ai_visibility_answers"
  | "seo_opportunities"
  | "agent_checks"
  | "offsite_pages";

// Re-renders the page when the server reports a change to one of the watched tables.
export function LiveRefresh({ tables }: { tables: Table[] }) {
  const router = useRouter();
  const key = tables.join(",");

  useEffect(() => {
    const watched = new Set(key.split(","));
    const source = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | null = null;
    source.onmessage = (message) => {
      const { table } = JSON.parse(message.data) as { table: string };
      if (!watched.has(table)) return;
      timer ??= setTimeout(() => {
        timer = null;
        router.refresh();
      }, 150);
    };
    return () => {
      source.close();
      if (timer) clearTimeout(timer);
    };
  }, [router, key]);

  return null;
}
