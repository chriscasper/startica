import Link from "next/link";

const TABS = [
  { key: "plan", label: "Plan and ads", href: (id: string) => `/ads/${id}` },
  { key: "creatives", label: "Creatives", href: (id: string) => `/ads/${id}/creatives` },
  { key: "results", label: "Results", href: (id: string) => `/ads/${id}/results` },
] as const;

/** The campaign's pages: the plan and copy (AD1), images (AD2), results and next steps (AD3–AD4). */
export function CampaignNav({ campaignId, current }: { campaignId: string; current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Campaign" className="flex gap-1 border-b text-sm">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(campaignId)}
          aria-current={t.key === current ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 ${t.key === current ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
