"use client";

import { useTransition } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog, type Field } from "@/components/app/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { removeIssueTracker, saveIssueTracker } from "./actions";

export type TrackerView = {
  provider: "github" | "gitlab";
  baseUrl: string;
  repo: string;
  labels: string[];
  autoMinImpact: string | null;
  autoMinSecurity: string | null;
  closeWhenFixed: boolean;
  status: "untested" | "ok" | "error";
  lastError: string | null;
  issueCount: number;
};

const NAMES = { github: "GitHub", gitlab: "GitLab" };
const AUTO_LABEL: Record<string, string> = { critical: "critical ", serious: "serious and critical ", moderate: "moderate, serious and critical ", minor: "" };

const link = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-foreground underline underline-offset-4">
    {text}
    <ExternalLinkIcon className="size-3" aria-hidden />
  </a>
);

const STEPS = [
  <>
    <strong>GitHub:</strong> create a {link("https://github.com/settings/personal-access-tokens/new", "fine-grained token")} with access to only this
    repository and the permission <strong>Issues: Read and write</strong>.
  </>,
  <>
    <strong>GitLab:</strong> in the project, <strong>Settings → Access tokens</strong>: add a token with the role <strong>Reporter</strong> and the
    scope <strong>api</strong>.
  </>,
];

const fields = (saved: boolean): Field[] => [
  {
    name: "provider",
    label: "Service",
    type: "select",
    options: [
      { value: "github", label: "GitHub" },
      { value: "gitlab", label: "GitLab" },
    ],
  },
  { name: "repo", label: "Repository", type: "text", required: true, placeholder: "owner/name or group/project", hint: "Or paste its web address." },
  {
    name: "token",
    label: "Access token",
    type: "password",
    placeholder: "github_pat_… or glpat-…",
    hint: saved ? "Leave empty to keep the saved token." : "Stored encrypted on this computer and only sent to that service.",
  },
  { name: "labels", label: "Labels for new issues", type: "text", placeholder: "accessibility", hint: "Comma-separated." },
  {
    name: "auto_min_impact",
    label: "Open issues automatically after each scan",
    type: "select",
    options: [
      { value: "", label: "No, only when I click Create issue" },
      { value: "critical", label: "For new critical issues" },
      { value: "serious", label: "For new serious and critical issues" },
      { value: "moderate", label: "For new moderate, serious and critical issues" },
      { value: "minor", label: "For every new issue" },
    ],
  },
  {
    name: "auto_min_security",
    label: "Open issues automatically for security findings (use only with a private repository)",
    type: "select",
    options: [
      { value: "", label: "No, only when I click Create issue" },
      { value: "critical", label: "For critical findings" },
      { value: "high", label: "For high and critical findings" },
      { value: "medium", label: "For medium, high and critical findings" },
      { value: "low", label: "For every finding except FYI" },
    ],
  },
  { name: "close_when_fixed", label: "Close the issue when Startica sees it fixed, and reopen it if it comes back", type: "checkbox" },
  {
    name: "base_url",
    label: "Server (only for GitHub Enterprise or self-hosted GitLab)",
    type: "url",
    placeholder: "https://gitlab.example.com",
  },
];

/** Settings → Products → Issue tracker: the product's GitHub or GitLab repository. */
export function IssueTracker({ productId, tracker }: { productId: string; tracker: TrackerView | null }) {
  const [pending, start] = useTransition();
  const defaultBase = (p: string) => (p === "github" ? "https://api.github.com" : "https://gitlab.com");
  const dialog = (
    <FormDialog
      trigger={<Button size="sm" variant={tracker ? "outline" : "default"}>{tracker ? "Change" : "Connect"}</Button>}
      title="Connect GitHub or GitLab"
      description="Startica opens an issue in the repository for each problem its checks find: by hand from an issue's page, or automatically after each scan."
      steps={STEPS}
      fields={fields(Boolean(tracker))}
      values={{
        provider: tracker?.provider ?? "github",
        repo: tracker?.repo ?? "",
        labels: (tracker?.labels ?? ["accessibility"]).join(", "),
        auto_min_impact: tracker?.autoMinImpact ?? "",
        auto_min_security: tracker?.autoMinSecurity ?? "",
        close_when_fixed: !tracker || tracker.closeWhenFixed ? "on" : "",
        base_url: tracker && tracker.baseUrl !== defaultBase(tracker.provider) ? tracker.baseUrl : "",
      }}
      footnote="Startica checks the token can see the repository when you save."
      submitLabel="Save and check"
      action={(fd) => saveIssueTracker(productId, fd)}
    />
  );
  if (!tracker) return <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">Not connected. {dialog}</div>;
  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {NAMES[tracker.provider]}: {tracker.repo}
        </span>
        {tracker.status === "ok" ? <Badge variant="secondary">Connected</Badge> : tracker.status === "error" ? <Badge variant="destructive">Error</Badge> : <Badge variant="outline">Checking…</Badge>}
        <div className="ml-auto flex gap-1">
          {dialog}
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Disconnect the repository? Issues already opened stay in it.")) return;
              start(async () => {
                const { error } = await removeIssueTracker(productId);
                if (error) toast.error(error);
              });
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground">
        {tracker.autoMinImpact ? `Opens issues automatically after each scan for new ${AUTO_LABEL[tracker.autoMinImpact] ?? ""}issues (at most 10 a scan)` : "Opens issues when you click Create issue"}
        {tracker.autoMinSecurity ? `; opens issues for ${tracker.autoMinSecurity} and worse security findings` : ""}
        {tracker.closeWhenFixed ? "; closes them when fixed" : ""}. {tracker.issueCount} opened so far.
      </p>
      {tracker.lastError && <p className="text-destructive">{tracker.lastError}</p>}
    </div>
  );
}
