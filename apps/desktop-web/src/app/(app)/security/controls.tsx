"use client";

import { useState, useTransition, type ReactNode } from "react";
import { BugIcon, CheckIcon, CopyIcon, Loader2Icon, MapIcon, PlusIcon, RefreshCwIcon, ShieldCheckIcon, SparklesIcon, UploadIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FormDialog } from "@/components/app/form-dialog";
import { refreshScanActivity } from "@/components/app/scan-activity";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  addSecurityReport,
  addToRoadmap,
  createSecurityIssue,
  decide,
  explainFinding,
  generatePolicy,
  generateSecurityTxt,
  importReport,
  markFixed,
  recheckFinding,
  reopen,
  reportFinding,
  runMonitorNow,
  setReportStatus,
  triageReport,
  verifyOwnership,
} from "./actions";

type Attempt = { method: string; ok: boolean; note: string; details: { label: string; value: string }[] };

const METHOD: Record<string, string> = { search_console: "Search Console", dns: "DNS record", file: "File", local: "This computer or network", demo: "Demo" };

/** Verify, then Recheck: tries every method and shows what each one found; Details shows the raw values each check saw. */
export function VerifyButton({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const check = (openDetails = false) =>
    start(async () => {
      const result = await verifyOwnership(siteId);
      if (result.error) return void toast.error(result.error);
      setAttempts(result.attempts ?? null);
      setCheckedAt(new Date());
      if (openDetails) setDetailsOpen(true);
      if (result.verified) toast.success("Verified. The next scan checks the site for security problems too.");
      else toast.error("Not verified yet. See below for what each check found.");
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || pending} onClick={() => check()}>
          {pending ? <Loader2Icon className="animate-spin" /> : attempts ? <RefreshCwIcon /> : <ShieldCheckIcon />}
          {attempts ? "Recheck" : "Verify"}
        </Button>
        <Button variant="outline" disabled={disabled || pending} onClick={() => (attempts ? setDetailsOpen(true) : check(true))}>
          <BugIcon />
          Details
        </Button>
      </div>
      {attempts && (
        <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
          {attempts.map((a) => (
            <li key={a.method} className={a.ok ? "text-foreground" : "text-muted-foreground"}>
              <span className="font-medium">{METHOD[a.method] ?? a.method}:</span> {a.ok ? "✓ " : ""}
              {a.note}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>What the checks saw</DialogTitle>
            <DialogDescription>
              The values each method expected and got back{checkedAt ? `, checked at ${checkedAt.toLocaleTimeString()}` : ""}. The first one that matches
              verifies the site.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            {attempts?.map((a) => (
              <section key={a.method} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <h3 className="font-medium">
                  {METHOD[a.method] ?? a.method}: <span className={a.ok ? "text-foreground" : "text-muted-foreground"}>{a.ok ? "✓ matched" : "no match"}</span>
                </h3>
                <p className="text-muted-foreground">{a.note}</p>
                <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-[max-content_1fr]">
                  {a.details.map((d, i) => (
                    <div key={i} className="contents">
                      <dt className="text-xs text-muted-foreground">{d.label}</dt>
                      <dd className="min-w-0">
                        <pre className="whitespace-pre-wrap break-all rounded bg-muted px-2 py-1 font-mono text-xs">{d.value}</pre>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
            <Button disabled={disabled || pending} onClick={() => check()}>
              {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Recheck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A value to paste somewhere else (a DNS record, a file's contents). */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs" title={value}>
        {value}
      </code>
      <Button
        size="icon-sm"
        variant="outline"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy; select the text and copy it instead.");
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}

/** Accept the risk / Not a problem (each asks why), or Reopen. */
export function DecisionButtons({ findingId, status }: { findingId: string; status: string }) {
  const [pending, start] = useTransition();
  if (status === "accepted" || status === "false_positive") {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const { error } = await reopen(findingId);
            if (error) toast.error(error);
          })
        }
      >
        Reopen
      </Button>
    );
  }
  if (status !== "open") return null;
  const dialog = (kind: "accepted" | "false_positive") => (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          {kind === "accepted" ? "Accept the risk" : "Not a problem"}
        </Button>
      }
      title={kind === "accepted" ? "Accept the risk" : "Mark as not a problem"}
      description={
        kind === "accepted"
          ? "The finding stays on record, stops counting against the score, and isn't raised again unless you reopen it."
          : "Use this when the check got it wrong for this site. Startica remembers it across scans."
      }
      fields={[{ name: "reason", label: "Why", type: "textarea", rows: 3, placeholder: kind === "accepted" ? "e.g. The analytics cookie has to be readable by its script" : "e.g. The header is set by our CDN for every page" }]}
      submitLabel={kind === "accepted" ? "Accept the risk" : "Mark as not a problem"}
      action={async (fd) => {
        fd.set("status", kind);
        return decide(findingId, fd);
      }}
    />
  );
  return (
    <>
      {dialog("accepted")}
      {dialog("false_positive")}
    </>
  );
}

export function RecheckFindingButton({ findingId, disabled }: { findingId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const { error } = await recheckFinding(findingId);
          refreshScanActivity();
          if (error) toast.error(error);
          else toast.success("Recheck started.");
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Recheck
    </Button>
  );
}

export function AddToRoadmapButton({ findingId }: { findingId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error } = await addToRoadmap(findingId);
          if (error) toast.error(error);
          else toast.success("Added to the Roadmap.");
        })
      }
    >
      <MapIcon />
      Add to Roadmap
    </Button>
  );
}

/** Opens a GitHub/GitLab issue. A public repository makes the finding public, so it asks first. */
export function CreateSecurityIssueButton({ findingId, provider }: { findingId: string; provider: "github" | "gitlab" }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const name = provider === "github" ? "GitHub" : "GitLab";
  if (confirming) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">If the repository is public, anyone can read this issue.</span>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { error, url } = await createSecurityIssue(findingId);
              setConfirming(false);
              if (error) toast.error(error);
              else if (url) toast.success("Issue opened.", { action: { label: "View", onClick: () => window.open(url, "_blank", "noopener,noreferrer") } });
            })
          }
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Open the issue
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </span>
    );
  }
  return (
    <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
      Create {name} issue
    </Button>
  );
}

// --- S4: AI help, imported reports, the disclosure kit and reported problems

/** A block of text to copy as a whole (a snippet, a file, a reply). */
export function CopyBlock({ text, label, language }: { text: string; label: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative min-w-0">
      <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 pr-12 font-mono text-xs whitespace-pre-wrap" data-language={language}>
        {text}
      </pre>
      <Button
        size="icon-sm"
        variant="outline"
        className="absolute top-2 right-2"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy; select the text and copy it instead.");
          }
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  );
}

function ActionButton({ label, run, success, disabled, variant = "outline", icon }: { label: string; run: () => Promise<{ error: string | null }>; success: string; disabled?: boolean; variant?: "outline" | "default" | "ghost"; icon?: ReactNode }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const { error } = await run();
          if (error) toast.error(error);
          else toast.success(success);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : icon}
      {label}
    </Button>
  );
}

export function ExplainButton({ findingId, again, disabled }: { findingId: string; again: boolean; disabled: boolean }) {
  return (
    <ActionButton
      label={again ? "Explain again" : "Explain and fix"}
      run={() => explainFinding(findingId)}
      success="Working on it. The steps appear here in a minute."
      disabled={disabled}
      icon={<SparklesIcon />}
      variant={again ? "outline" : "default"}
    />
  );
}

export function MarkFixedButton({ findingId }: { findingId: string }) {
  return <ActionButton label="Mark fixed" run={() => markFixed(findingId)} success="Marked fixed." icon={<CheckIcon />} />;
}

export function ImportReportButton({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          <UploadIcon />
          Import a report
        </Button>
      }
      title="Import another report's findings"
      description="Paste a pentest or scanner report (or choose a text file) and your AI key reads its findings into this list, next to Startica's own. They're kept until you mark them fixed. About $0.10 for a long report."
      fields={[
        { name: "label", label: "Where it's from", type: "text", required: true, placeholder: "e.g. Pentest, March 2026" },
        { name: "text", label: "Report text", type: "textarea", rows: 10, placeholder: "Paste the report here", fileAccept: ".txt,.md,.csv,.json,.html,text/*" },
      ]}
      submitLabel="Read the report"
      footnote="The report's text goes to your AI provider. Exploit details and credentials in it are left out of the findings."
      action={async (fd) => {
        const result = await importReport(siteId, fd);
        if (!result.error) toast.success("Reading the report. Its findings appear here in a minute or two.");
        return result;
      }}
    />
  );
}

export function SecurityTxtForm({ siteId, defaultPolicy }: { siteId: string; defaultPolicy: string }) {
  const [pending, start] = useTransition();
  const [out, setOut] = useState<{ text: string; problems: string[] } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid gap-3 sm:grid-cols-2"
        action={(fd) =>
          start(async () => {
            const r = await generateSecurityTxt(siteId, fd);
            if (r.error) toast.error(r.error);
            else setOut({ text: r.text!, problems: r.problems ?? [] });
          })
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          Contact (email or form address)
          <Input id="sectxt-contact" name="contact" required placeholder="security@fieldnote.example" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Policy address
          <Input id="sectxt-policy" name="policy" defaultValue={defaultPolicy} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Valid for (months, at most 12)
          <Input id="sectxt-months" name="expires_months" type="number" min={1} max={12} defaultValue={12} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Languages
          <Input id="sectxt-languages" name="languages" defaultValue="en" />
        </label>
        <div>
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Make security.txt
          </Button>
        </div>
      </form>
      {out && (
        <>
          <CopyBlock text={out.text} label="security.txt" />
          <p className="text-xs text-muted-foreground">
            Publish it at <code className="font-mono">/.well-known/security.txt</code>. Make a new one before it expires; the next scan checks it.
            {out.problems.length ? ` Problems: ${out.problems.join("; ")}` : ""}
          </p>
        </>
      )}
    </div>
  );
}

export function PolicyForm({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid gap-3 sm:grid-cols-2"
        action={(fd) =>
          start(async () => {
            const r = await generatePolicy(productId, fd);
            if (r.error) toast.error(r.error);
            else setText(r.text!);
          })
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          Where reports go
          <Input id="policy-contact" name="contact" required placeholder="security@fieldnote.example" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reply within (working days)
          <Input id="policy-days" name="response_days" type="number" min={1} max={30} defaultValue={5} />
        </label>
        <div>
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : null}
            Make the policy
          </Button>
        </div>
      </form>
      {text && (
        <>
          <CopyBlock text={text} label="the policy" language="markdown" />
          <p className="text-xs text-muted-foreground">A starting point in Markdown. Edit it to fit, and have whoever handles legal questions read it before you publish.</p>
        </>
      )}
    </div>
  );
}

export function AddReportButton({ productId, aiReady }: { productId: string; aiReady: boolean }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <PlusIcon />
          Add a report
        </Button>
      }
      title="Add a reported problem"
      description={
        aiReady
          ? "Paste what someone sent you. Your AI key triages it: how serious, whether it looks real, whether you already know about it, and a reply to send. About $0.02."
          : "Paste what someone sent you. Add an AI key in Settings to have it triaged."
      }
      fields={[
        { name: "reporter", label: "From", type: "text", placeholder: "Their name or address (optional)" },
        { name: "body", label: "What they sent", type: "textarea", rows: 10 },
      ]}
      submitLabel="Add"
      action={(fd) => addSecurityReport(productId, fd)}
    />
  );
}

export function ReportActions({ reportId, status, siteId, hasFinding, canTriage, triaged }: { reportId: string; status: string; siteId: string | null; hasFinding: boolean; canTriage: boolean; triaged: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {canTriage && <ActionButton label={triaged ? "Triage again" : "Triage"} run={() => triageReport(reportId)} success="Triaging." icon={<SparklesIcon />} />}
      {siteId && !hasFinding && <ActionButton label="Track as a finding" run={() => reportFinding(reportId, siteId)} success="Added to Findings." />}
      {status === "new" ? (
        <>
          <ActionButton label="Resolved" run={() => setReportStatus(reportId, "resolved")} success="Marked resolved." />
          <ActionButton label="Dismiss" variant="ghost" run={() => setReportStatus(reportId, "dismissed")} success="Dismissed." />
        </>
      ) : (
        <ActionButton label="Reopen" variant="ghost" run={() => setReportStatus(reportId, "new")} success="Reopened." />
      )}
    </div>
  );
}

// --- S2: exposure monitoring

export function RunMonitorButton({ siteId, disabled }: { siteId: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const { error } = await runMonitorNow(siteId);
          if (error) toast.error(error);
          else toast.success("Checking. Results appear here in a minute or two.");
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Check now
    </Button>
  );
}
