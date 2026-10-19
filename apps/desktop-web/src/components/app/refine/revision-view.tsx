import type { ChatSubjectKind } from "@startica/db/schema";
import { CopyBlock } from "@/components/app/copy-block";

/**
 * A revision in its subject's shape (the AI output schema: security `explainOutput`, a11y
 * `fixOutput`), shown under the reply that proposed it and in Versions.
 */

type SecurityRevision = { summary: string; steps: string[]; snippets: { label: string; language: string; code: string }[]; verify: string };
type A11yRevision = { explanation: string; fixed_html: string; steps: string[]; confidence: string };

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-5">
      {steps.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  );
}

export function RevisionView({ kind, value }: { kind: ChatSubjectKind; value: Record<string, unknown> }) {
  if (kind === "security_help") {
    const v = value as SecurityRevision;
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <p>{v.summary}</p>
        <Steps steps={v.steps} />
        {v.snippets.map((snip, i) => (
          <div key={i} className="flex min-w-0 flex-col gap-1">
            <span className="text-xs font-medium">{snip.label}</span>
            <CopyBlock text={snip.code} label={snip.label} />
          </div>
        ))}
        <p>
          <span className="font-medium">Check it worked:</span> {v.verify}
        </p>
      </div>
    );
  }
  const v = value as A11yRevision;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p>{v.explanation}</p>
      <CopyBlock text={v.fixed_html} label="the corrected HTML" />
      <Steps steps={v.steps} />
      <p className="text-xs text-muted-foreground">Confidence: {v.confidence}</p>
    </div>
  );
}

/** One line to recognize a revision by (Versions list). */
export function revisionHeadline(kind: ChatSubjectKind, value: Record<string, unknown>): string {
  const text = String((kind === "security_help" ? value.summary : value.explanation) ?? "");
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
