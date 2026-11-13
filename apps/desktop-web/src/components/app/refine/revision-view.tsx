import type { ChatSubjectKind } from "@startica/db/schema";
import { CopyBlock } from "@/components/app/copy-block";

/**
 * A revision in its subject's shape (the AI output schema: security `explainOutput`, a11y
 * `fixOutput`, Inbox `draftOutput`, Content Studio `contentOutput` / `campaignOutput`, an ad
 * platform's `adSchema`, an SEO draft's `DRAFT_OUTPUTS`, `auditFindingOutput`,
 * `roadmapItemRevision`), shown under the reply that proposed it and in Versions.
 */

type SecurityRevision = { summary: string; steps: string[]; snippets: { label: string; language: string; code: string }[]; verify: string };
type A11yRevision = { explanation: string; fixed_html: string; steps: string[]; confidence: string };
type DraftRevision = { reply: string; mentions_product: boolean; rationale: string };
type SeoDraftRevision = { pages?: { url: string; title: string; description: string }[]; json_ld?: string; text?: string; question?: string; answer?: string; where?: string };
type AuditFindingRevision = { severity: string; title: string; detail: string; fix: string };
type RoadmapRevision = { stage: string; title: string; why: string; playbook: string; success_metric: string; next_step: string; priority: number };
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

function SeoDraftView({ v }: { v: SeoDraftRevision }) {
  if (v.pages) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        {v.pages.map((p) => (
          <div key={p.url} className="flex min-w-0 flex-col gap-0.5 rounded-md border p-2">
            <span className="truncate font-mono text-xs text-muted-foreground">{p.url}</span>
            <span className="font-medium">
              {p.title} <Length text={p.title} />
            </span>
            <span className="text-muted-foreground">
              {p.description} <Length text={p.description} />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (v.question !== undefined) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-medium">{v.question}</p>
        <Text>{v.answer ?? ""}</Text>
        {v.where && <p className="text-xs text-muted-foreground">{v.where}</p>}
      </div>
    );
  }
  return <CopyBlock text={v.json_ld ?? v.text ?? ""} label={v.json_ld !== undefined ? "the JSON-LD" : "llms.txt"} />;
}

export function RevisionView({ kind, value }: { kind: ChatSubjectKind; value: Record<string, unknown> }) {
  if (kind === "seo_draft") return <SeoDraftView v={value as SeoDraftRevision} />;
  if (kind === "audit_finding") {
    const v = value as AuditFindingRevision;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p>
          <span className="font-medium">{v.title}</span> <span className="text-xs text-muted-foreground">({v.severity})</span>
        </p>
        <p className="text-muted-foreground">{v.detail}</p>
        <p>
          <span className="font-medium">Fix: </span>
          {v.fix}
        </p>
      </div>
    );
  }
  if (kind === "roadmap_item") {
    const v = value as RoadmapRevision;
    return (
      <dl className="flex min-w-0 flex-col gap-1.5">
        <p className="font-medium">
          {v.title} <span className="text-xs font-normal text-muted-foreground">({v.stage}, P{v.priority}{v.playbook ? `, ${v.playbook}` : ""})</span>
        </p>
        {[
          ["Why", v.why],
          ["Success", v.success_metric],
          ["Next", v.next_step],
        ].map(([label, text]) =>
          text ? (
            <div key={label}>
              <dt className="inline text-xs font-medium">{label}: </dt>
              <dd className="inline">{text}</dd>
            </div>
          ) : null,
        )}
      </dl>
    );
  }
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
    seo_draft: (first(value.pages) as { title?: string } | undefined)?.title ?? value.question ?? value.text ?? value.json_ld,
    audit_finding: value.title,
    roadmap_item: value.title,
    // Ask-only chats have no versions.
    security_triage: "",
    a11y_review: "",
    visibility_answer: "",
  }[kind];
  const text = String(field ?? "");
  return text.length > 140 ? `${text.slice(0, 139)}…` : text;
}
