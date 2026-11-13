/**
 * The accessibility statement as HTML to paste into a CMS (ARCHITECTURE.md section 9.5). The
 * statement is written as Markdown by fixed templates (`buildStatement`), using only headings,
 * paragraphs and bullet lists, so this converts exactly that subset: no Markdown library, and
 * anything else stays plain, escaped text.
 */

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Links the owner typed (an address or a web link in the contact field) become links. */
function inline(text: string): string {
  return escape(text)
    .replace(/\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (_, before: string, email: string) => `${before}<a href="mailto:${email}">${email}</a>`);
}

/** The statement's Markdown as an HTML fragment: `<h1>`/`<h2>`, `<p>` and `<ul>`, with `heading` levels shifted for a page that has its own title. */
export function statementHtml(markdown: string, options: { topLevel?: 1 | 2 } = {}): string {
  const top = options.topLevel ?? 1;
  const out: string[] = [];
  let list: string[] | null = null;
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
    if (list) out.push(`<ul>\n${list.map((li) => `  <li>${inline(li)}</li>`).join("\n")}\n</ul>`);
    list = null;
  };
  for (const raw of markdown.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(6, heading[1]!.length + top - 1);
      out.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (line.startsWith("- ")) {
      if (paragraph.length) {
        out.push(`<p>${inline(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
      (list ??= []).push(line.slice(2));
    } else if (!line.trim()) {
      flush();
    } else if (list) {
      // A wrapped list item.
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return `${out.join("\n")}\n`;
}
