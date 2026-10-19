import type { ReactNode } from "react";
import { CopyBlock } from "@/components/app/copy-block";

/**
 * The simple Markdown a Refine reply uses (the prompt asks for no more): paragraphs, lists,
 * fenced code blocks, `inline code`, **bold** and links. Rendered as React elements, never as
 * HTML, so nothing in a reply can inject markup. An unclosed code block (still streaming) shows
 * as code so far.
 */

type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] } | { kind: "code"; lang: string; code: string };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```\s*$/.test(lines[i]!); i++) code.push(lines[i]!);
      out.push({ kind: "code", lang: fence[1] ?? "", code: code.join("\n") });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const last = out.at(-1);
      const item = (bullet ?? numbered)![1]!;
      if (last && last.kind === kind) last.items.push(item);
      else out.push({ kind, items: [item] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      out.push({ kind: "p", text: `**${heading[1]}**` });
      continue;
    }
    // A line following a list item continues it.
    const last = out.at(-1);
    if (!para.length && last && (last.kind === "ul" || last.kind === "ol") && /^\s+/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > at) nodes.push(text.slice(at, m.index));
    const key = m.index;
    if (m[1] != null)
      nodes.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] break-all">
          {m[1]}
        </code>,
      );
    else if (m[2] != null) nodes.push(<strong key={key}>{m[2]}</strong>);
    else
      nodes.push(
        <a key={key} href={m[4]} target="_blank" rel="noopener noreferrer" className="underline">
          {m[3]}
        </a>,
      );
    at = m.index + m[0].length;
  }
  if (at < text.length) nodes.push(text.slice(at));
  return nodes;
}

export function ChatText({ text }: { text: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 leading-relaxed">
      {blocks(text).map((b, i) =>
        b.kind === "code" ? (
          <CopyBlock key={i} text={b.code} label={b.lang ? `the ${b.lang} code` : "the code"} />
        ) : b.kind === "p" ? (
          <p key={i} className="whitespace-pre-line">
            {inline(b.text)}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="flex list-decimal flex-col gap-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
