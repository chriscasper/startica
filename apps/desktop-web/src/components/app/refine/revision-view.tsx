import type { ChatSubjectKind } from "@startica/db/schema";
import { CopyBlock } from "@/components/app/copy-block";

/**
 * A revision in its subject's shape (the AI output schema: security `explainOutput`, a11y
 * `fixOutput`, Inbox `draftOutput`, Content Studio `contentOutput` / `campaignOutput`, an ad
 * platform's `adSchema`), shown under the reply that proposed it and in Versions.
 */

type SecurityRevision = { summary: string; steps: string[]; snippets: { label: string; language: string; code: string }[]; verify: string };
type A11yRevision = { explanation: string; fixed_html: string; steps: string[]; confidence: string };
type DraftRevision = { reply: string; mentions_product: boolean; rationale: string };
type PieceRevision = { title: string; body?: string; emails?: { subject: string; preview: string; send_day: number; body: string }[]; mentions_product: boolean; rationale: string };

/** Ad copy fields in the order the platforms show them (google, meta, reddit). */
const AD_FIELDS: [key: string, label: string][] = [
  ["headlines", "Headlines"],
  ["descriptions", "Descriptions"],
  ["path1", "Path 1"],
  ["path2", "Path 2"],
  ["primary_text", "Primary text"],
  ["title", "Title"],
  ["headline", "Headline"],
  ["description", "Description"],
  ["body", "Body"],
  ["call_to_action", "Call to action"],
];

const Text = ({ children }: { children: string }) => <div className="rounded-md bg-muted/50 px-3 py-2 break-words whitespace-pre-wrap">{children}</div>;
const Rationale = ({ mentions, why }: { mentions: boolean; why: string }) => (
  <p className="text-xs text-muted-foreground">
    {mentions ? "Mentions the product." : "No product mention."} {why}
  </p>
);
const Length = ({ text }: { text: string }) => <span className="text-xs text-muted-foreground tabular-nums">{text.length}</span>;

function AdCopyView({ value }: { value: Record<string, unknown> }) {
  return (
    <dl className="flex min-w-0 flex-col gap-2">
      {AD_FIELDS.filter(([key]) => key in value && (Array.isArray(value[key]) ? (value[key] as string[]).length > 0 : Boolean(value[key]))).map(([key, label]) => {
        const v = value[key];
        return (
          <div key={key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs font-medium">{label}</dt>
            {Array.isArray(v) ? (
              <dd>
                <ol className="flex list-decimal flex-col gap-0.5 pl-5">
                  {(v as string[]).map((line, i) => (
                    <li key={i}>
                      {line} <Length text={line} />
                    </li>
                  ))}
                </ol>
              </dd>
            ) : (
              <dd className="break-words whitespace-pre-wrap">
                {String(v)} {key !== "call_to_action" && <Length text={String(v)} />}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}

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
  if (kind === "reply_draft") {
    const v = value as DraftRevision;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Text>{v.reply}</Text>
        <Rationale mentions={v.mentions_product} why={v.rationale} />
      </div>
    );
  }
  if (kind === "content_piece") {
    const v = value as PieceRevision;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {v.title && <p className="font-medium">{v.title}</p>}
        {v.emails ? (
          v.emails.map((e, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium">
                Email {i + 1} · Day {e.send_day}: {e.subject}
              </span>
              {e.preview && <span className="text-xs text-muted-foreground">{e.preview}</span>}
              <Text>{e.body}</Text>
            </div>
          ))
        ) : (
          <Text>{v.body ?? ""}</Text>
        )}
        <Rationale mentions={v.mentions_product} why={v.rationale} />
      </div>
    );
  }
  if (kind === "ad_copy") return <AdCopyView value={value} />;
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
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const field = {
    security_help: value.summary,
    a11y_fix: value.explanation,
    reply_draft: value.reply,
    content_piece: value.title || value.body || first(value.emails && (value.emails as { subject: string }[]).map((e) => e.subject)),
    ad_copy: first(value.headlines) ?? value.headline ?? value.title,
  }[kind];
  const text = String(field ?? "");
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
