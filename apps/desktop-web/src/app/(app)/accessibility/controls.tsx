"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, RefreshCwIcon, ScanSearchIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type Field } from "@/components/app/form-dialog";
import { refreshScanActivity, StopButton, useScanActivity } from "@/components/app/scan-activity";
import { Button } from "@/components/ui/button";
import { addContentRule, addSite, checkContentNow, checkPage, createTrackerIssue, criterionRoadmap, deleteContentRule, ignoreIssue, ignoreSpelling, issueToRoadmap, openHighlights, recheckGroup, recheckPage, removeSite, reviewAltText, reviewCriterion, reviewItem, saveReadabilityTarget, saveReportPdf, saveSite, saveStatement, scanSite, setCriterionStatus, suggestFix, suggestReview, summarize, unignoreIssue } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string | null }>, success: string) =>
    start(async () => {
      const { error } = await fn();
      refreshScanActivity();
      if (error) toast.error(error);
      else toast.success(success);
    });
  return [pending, run] as const;
}

/** Scan now, showing the scan's progress while one runs for this site. */
export function ScanSiteButton({ siteId, productId, canScan }: { siteId: string; productId: string; canScan: boolean }) {
  const [pending, run] = useAction();
  const { siteScan } = useScanActivity(productId);
  const scanning = siteScan?.siteId === siteId && siteScan.scope === "full" ? siteScan : null;
  return (
    <>
      <Button size="sm" disabled={!canScan || pending || Boolean(scanning)} onClick={() => run(() => scanSite(siteId), "Scan started. Results appear as each page is checked.")}>
        {pending || scanning ? <Loader2Icon className="animate-spin" /> : <ScanSearchIcon />}
        {scanning ? (scanning.running ? `Scanning… ${scanning.pagesDone} of ${scanning.pagesTotal}` : "Scan queued") : "Scan now"}
      </Button>
      {siteScan?.siteId === siteId && <StopButton target={{ siteScan: siteScan.scanId }} label={siteScan.scope === "full" ? "Stop scan" : "Stop check"} />}
    </>
  );
}

export function CheckPageButton({ siteId, canScan }: { siteId: string; canScan: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={!canScan}>
          Check a page
        </Button>
      }
      title="Check a page"
      description="Checks one page now, without waiting for a full scan. Useful right after you fix something."
      fields={[{ name: "url", label: "Page address", type: "text", required: true, placeholder: "https://… or /pricing" }]}
      submitLabel="Check"
      action={async (fd) => {
        const result = await checkPage(siteId, fd);
        refreshScanActivity();
        if (!result.error) toast.success("Checking the page…");
        return result;
      }}
    />
  );
}

const siteFields = (adding: boolean): Field[] => [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "start_url", label: "Start address", type: "url", required: true, placeholder: "https://" },
  { name: "max_pages", label: "Most pages per scan", type: "number", required: true },
  ...(adding
    ? []
    : ([
        { name: "target_score", label: "Target score (1–100; the Overview colors the score against it)", type: "number" },
        {
          name: "scan_interval_days",
          label: "Scan again automatically",
          type: "select",
          options: [
            { value: "1", label: "Every day" },
            { value: "7", label: "Every week" },
            { value: "14", label: "Every two weeks" },
            { value: "30", label: "Every month" },
            { value: "0", label: "Never (only when I press Scan now)" },
          ],
        },
        { name: "include", label: "Only pages matching (e.g. /docs/*; empty = the whole site)", type: "lines", rows: 2 },
        { name: "exclude", label: "Skip pages matching (e.g. /blog/*; sign-out and delete links are always skipped)", type: "lines", rows: 2 },
        { name: "include_aaa", label: "Also check WCAG level AAA", type: "checkbox" },
        { name: "include_best_practice", label: "Also check best practices (shown separately, not WCAG failures)", type: "checkbox" },
      ] satisfies Field[])),
  { name: "respect_robots", label: "Follow the site's robots.txt (turn off only for your own site)", type: "checkbox" },
  ...(adding ? [{ name: "owner", label: "I own this site or am allowed to test it", type: "checkbox", required: true } satisfies Field] : []),
];

export function AddSiteButton({ productId, suggested, first }: { productId: string; suggested: { name: string; url: string | null }; first: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant={first ? "default" : "outline"}>
          <PlusIcon />
          {first ? "Add the site" : "Add a site"}
        </Button>
      }
      title="Add a site"
      description="Startica crawls the site from its start address and sitemap, one page a second, and checks each page against WCAG 2.2 A and AA."
      fields={siteFields(true)}
      values={first ? { name: suggested.name, start_url: suggested.url ?? "", max_pages: "250", respect_robots: "on" } : { max_pages: "250", respect_robots: "on" }}
      submitLabel="Add site"
      action={(fd) => addSite(productId, fd)}
    />
  );
}

export type SiteSettings = {
  id: string;
  name: string;
  startUrl: string;
  maxPages: number;
  targetScore: number;
  scanIntervalDays: number;
  include: string[];
  exclude: string[];
  respectRobots: boolean;
  includeAaa: boolean;
  includeBestPractice: boolean;
};

export function SiteSettingsButton({ site }: { site: SiteSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const on = (b: boolean) => (b ? "on" : "");
  return (
    <div className="flex gap-2">
      <FormDialog
        trigger={
          <Button size="sm" variant="ghost">
            <SettingsIcon />
            Site settings
          </Button>
        }
        title={`Settings for ${site.name}`}
        description="Changes apply from the next scan."
        fields={siteFields(false)}
        values={{
          name: site.name,
          start_url: site.startUrl,
          max_pages: String(site.maxPages),
          target_score: String(site.targetScore),
          scan_interval_days: String(site.scanIntervalDays),
          include: site.include,
          exclude: site.exclude,
          respect_robots: on(site.respectRobots),
          include_aaa: on(site.includeAaa),
          include_best_practice: on(site.includeBestPractice),
        }}
        action={(fd) => saveSite(site.id, fd)}
      />
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${site.name} and all its scan results?`)) return;
          start(async () => {
            const { error } = await removeSite(site.id);
            if (error) toast.error(error);
            else router.push("/accessibility");
          });
        }}
      >
        Remove site
      </Button>
    </div>
  );
}

export function RecheckButton({ kind, id, canScan, label }: { kind: "page" | "group"; id: string; canScan: boolean; label: string }) {
  const [pending, run] = useAction();
  return (
    <Button size="sm" variant="outline" disabled={!canScan || pending} onClick={() => run(() => (kind === "page" ? recheckPage(id) : recheckGroup(id)), "Recheck started.")}>
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      {label}
    </Button>
  );
}

/** Opens a GitHub/GitLab issue for this accessibility issue, then links to it. */
export function CreateTrackerIssueButton({ groupId, provider }: { groupId: string; provider: "github" | "gitlab" }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error, url } = await createTrackerIssue(groupId);
          if (error) toast.error(error);
          else if (url) toast.success("Issue opened.", { action: { label: "View", onClick: () => window.open(url, "_blank", "noopener,noreferrer") } });
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      Create {provider === "github" ? "GitHub" : "GitLab"} issue
    </Button>
  );
}

// --- A2: ignore, review, roadmap, highlights

/** Ignore an issue on the whole site, with a reason; remembered across scans. */
export function IgnoreIssueButton({ groupId }: { groupId: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Ignore
        </Button>
      }
      title="Ignore this issue"
      description="It stays on record, stops counting in the lists and compliance views, and isn't raised again by later scans unless you undo it."
      fields={[
        {
          name: "reason",
          label: "Why",
          type: "select",
          options: [
            { value: "false_positive", label: "False positive: the check got it wrong" },
            { value: "wont_fix", label: "Won't fix (say why below)" },
            { value: "not_applicable", label: "Not applicable to this site" },
          ],
        },
        { name: "note", label: "Note (optional)", type: "textarea", rows: 3 },
      ]}
      submitLabel="Ignore"
      action={(fd) => ignoreIssue(groupId, fd)}
    />
  );
}

function SmallAction({ label, run, success, variant = "outline", disabled }: { label: string; run: () => Promise<{ error: string | null }>; success: string; variant?: "outline" | "ghost" | "default"; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const { error } = await run();
          if (error) toast.error(error);
          else toast.success(success);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : null}
      {label}
    </Button>
  );
}

export function UnignoreButton({ groupId }: { groupId: string }) {
  return <SmallAction label="Stop ignoring" run={() => unignoreIssue(groupId)} success="It counts again." />;
}

export function IssueToRoadmapButton({ groupId }: { groupId: string }) {
  return <SmallAction label="Add to Roadmap" run={() => issueToRoadmap(groupId)} success="Added to the Roadmap." />;
}

/** Pass / Fail / Skip for a check axe couldn't decide (Fail makes it an issue). */
export function ReviewButtons({ groupId, decided }: { groupId: string; decided: string | null }) {
  if (decided) return <SmallAction label="Undo" variant="ghost" run={() => reviewItem(groupId, "undo")} success="Back in Needs review." />;
  return (
    <div className="flex flex-wrap gap-2">
      <SmallAction label="Pass" run={() => reviewItem(groupId, "pass")} success="Marked as passing." />
      <SmallAction label="Fail" run={() => reviewItem(groupId, "fail")} success="It's an issue now: see Issues." />
      <SmallAction label="Skip" variant="ghost" run={() => reviewItem(groupId, "skip")} success="Skipped." />
    </div>
  );
}

/** Desktop app: the live page in a viewer window with each failing element outlined. */
export function OpenHighlightsButton({ pageId, available }: { pageId: string; available: boolean }) {
  return (
    <SmallAction
      label="Open with highlights"
      run={() => (available ? openHighlights(pageId) : Promise.resolve({ error: "Open with highlights works in the Startica desktop app" }))}
      success="Opening the page with its issues outlined."
    />
  );
}

// --- A3: AI help

/** Suggest a fix (or again, with guidance such as "we use React"). */
export function SuggestFixButton({ groupId, again, disabled }: { groupId: string; again: boolean; disabled: boolean }) {
  if (!again) return <SmallAction label="Suggest a fix" variant="default" disabled={disabled} run={() => suggestFix(groupId)} success="Working on it. The fix appears here in a minute." />;
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          Suggest again
        </Button>
      }
      title="Suggest the fix again"
      description="Optionally tell it more: your framework, a component name, or what was wrong with the last suggestion."
      fields={[{ name: "guidance", label: "Guidance (optional)", type: "textarea", rows: 3, placeholder: "e.g. The logo is the <Logo> React component in Header.tsx" }]}
      submitLabel="Suggest again"
      action={(fd) => suggestFix(groupId, fd)}
    />
  );
}

export function SuggestReviewButton({ groupId, again, disabled }: { groupId: string; again: boolean; disabled: boolean }) {
  return (
    <SmallAction
      label={again ? "Ask again" : "Ask AI"}
      variant="ghost"
      disabled={disabled}
      run={() => suggestReview(groupId)}
      success="Looking at it."
    />
  );
}

export function ReviewAltTextButton({ siteId, count, cost, disabled }: { siteId: string; count: number; cost: string; disabled: boolean }) {
  return (
    <SmallAction
      label={count > 0 ? `Review ${count} ${count === 1 ? "image" : "images"} (about $${cost})` : "Nothing new to review"}
      variant="default"
      disabled={disabled || count === 0}
      run={() => reviewAltText(siteId)}
      success="Reviewing. Verdicts appear as each image is done."
    />
  );
}

export function SummarizeButton({ siteId, again, disabled }: { siteId: string; again: boolean; disabled: boolean }) {
  return (
    <SmallAction
      label={again ? "Summarize again" : "Summarize"}
      variant="outline"
      disabled={disabled}
      run={() => summarize(siteId)}
      success="Writing the summary."
    />
  );
}

// --- A4: manual checklist, statement, report

const MANUAL_OPTIONS = [
  ["pass", "Passes"],
  ["fail", "Fails"],
  ["not_applicable", "N/A"],
] as const;

/** Pass / Fails / N/A for one criterion, a note, and Add to Roadmap when it fails. */
export function CriterionReview({ siteId, criterion, status, note, failing }: { siteId: string; criterion: string; status: string; note: string | null; failing: boolean }) {
  const [pending, start] = useTransition();
  const set = (next: "pass" | "fail" | "not_applicable" | "not_tested") =>
    start(async () => {
      const { error } = await setCriterionStatus(siteId, criterion, next, note ?? "");
      if (error) toast.error(error);
    });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex gap-1 rounded-md bg-muted p-0.5" role="group" aria-label={`Manual result for ${criterion}`}>
        {MANUAL_OPTIONS.map(([value, label]) => (
          <Button
            key={value}
            size="xs"
            variant={status === value ? "default" : "ghost"}
            aria-pressed={status === value}
            disabled={pending}
            onClick={() => set(status === value ? "not_tested" : value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <FormDialog
        trigger={
          <Button size="xs" variant="ghost">
            {note ? "Edit note" : "Note"}
          </Button>
        }
        title={`Notes for ${criterion}`}
        description="What you checked and what you found. The note appears in the report, the statement (for failures) and the conformance draft."
        fields={[
          {
            name: "status",
            label: "Result",
            type: "select",
            options: [
              { value: "pass", label: "Passes" },
              { value: "fail", label: "Fails" },
              { value: "not_applicable", label: "Not applicable" },
              { value: "not_tested", label: "Not tested" },
            ],
          },
          { name: "note", label: "Note", type: "textarea", rows: 3 },
          { name: "remark", label: "Remark for the conformance draft (optional; replaces the generated one)", type: "textarea", rows: 2 },
        ]}
        values={{ status, note: note ?? "" }}
        action={(fd) => reviewCriterion(siteId, criterion, fd)}
      />
      {(status === "fail" || failing) && <SmallAction label="Add to Roadmap" variant="ghost" run={() => criterionRoadmap(siteId, criterion)} success="Added to the Roadmap." />}
    </div>
  );
}

export function StatementForm({ siteId, values, saved }: { siteId: string; values: Record<string, string>; saved: boolean }) {
  return (
    <FormDialog
      trigger={<Button size="sm">{saved ? "Edit the details" : "Fill in the details"}</Button>}
      title="Accessibility statement"
      description="Startica writes the statement from these details and the latest results: what you aim for, how you check, the known problems and how to contact you. It never claims the site is compliant."
      fields={[
        { name: "organization", label: "Organization or product name", type: "text", required: true },
        { name: "contact", label: "How people can report problems (email or page address)", type: "text", required: true },
        {
          name: "target",
          label: "The standard you aim for",
          type: "select",
          options: [
            { value: "wcag22aa", label: "WCAG 2.2 level AA (recommended)" },
            { value: "wcag21aa", label: "WCAG 2.1 level AA" },
            { value: "wcag22a", label: "WCAG 2.2 level A" },
          ],
        },
        { name: "approach", label: "Anything else you do (optional)", type: "textarea", rows: 2, placeholder: "e.g. We test new features with a screen reader before release." },
        { name: "limitations", label: "Other known limitations (optional)", type: "textarea", rows: 3, placeholder: "e.g. Older PDFs in the archive aren't tagged; ask us for an accessible copy." },
      ]}
      values={values}
      action={(fd) => saveStatement(siteId, fd)}
    />
  );
}

export function SavePdfButton({ siteId, available }: { siteId: string; available: boolean }) {
  return (
    <SmallAction
      label="Save as PDF"
      disabled={!available}
      run={() => saveReportPdf(siteId)}
      success="Choose where to save the PDF."
    />
  );
}

// --- A5: content quality and documents

export function AddRuleButton({ siteId }: { siteId: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add a rule
        </Button>
      }
      title="Add a content rule"
      description="Checked on every page from the next scan. Text matches ignore case; write /pattern/ for a regular expression."
      fields={[
        { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. No placeholder text" },
        {
          name: "kind",
          label: "What to look for",
          type: "select",
          options: [
            { value: "text_contains", label: "Text that shouldn't appear" },
            { value: "text_missing", label: "Text every page should have" },
            { value: "selector_exists", label: "Element that shouldn't appear (CSS selector)" },
            { value: "selector_missing", label: "Element every page should have (CSS selector)" },
            { value: "links_to", label: "Links to a domain" },
          ],
        },
        { name: "value", label: "Text, selector or domain", type: "text", required: true, placeholder: "lorem ipsum · footer · old-cdn.example" },
      ]}
      submitLabel="Add rule"
      action={(fd) => addContentRule(siteId, fd)}
    />
  );
}

export function RemoveRuleButton({ siteId, ruleId }: { siteId: string; ruleId: string }) {
  return <SmallAction label="Remove" variant="ghost" run={() => deleteContentRule(siteId, ruleId)} success="Rule removed." />;
}

export function IgnoreWordButton({ siteId, word }: { siteId: string; word: string }) {
  return <SmallAction label="Not a mistake" variant="ghost" run={() => ignoreSpelling(siteId, word)} success={`"${word}" won't be flagged again on this site.`} />;
}

export function ReadabilityTargetButton({ siteId, target }: { siteId: string; target: number }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          Target: grade {target}
        </Button>
      }
      title="Readability target"
      description="Pages whose text needs a higher reading level are listed. Plain-language guidance usually aims for grade 8 or 9 for a general audience."
      fields={[{ name: "target", label: "Grade (4–16)", type: "number", required: true }]}
      values={{ target: String(target) }}
      action={(fd) => saveReadabilityTarget(siteId, fd)}
    />
  );
}

export function CheckContentButton({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  return <SmallAction label="Check documents and links now" disabled={disabled} run={() => checkContentNow(siteId)} success="Checking. Results appear as each one is done." />;
}
