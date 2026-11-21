import Link from "next/link";
import { Fragment } from "react";

/**
 * Minimal, safe Markdown for operator-edited pages: ## / ### headings, paragraphs,
 * "- " lists, **bold**, *italic* and [links](/path | https://… | mailto:…).
 * Builds React elements directly — no HTML injection path.
 */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("*")) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t) ?? [];
      if (href && href.startsWith("/")) out.push(<Link key={k} href={href} className="link">{label}</Link>);
      else if (href && /^(https?:|mailto:)/.test(href)) out.push(<a key={k} href={href} className="link" rel="noreferrer">{label}</a>);
      else out.push(t);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Prose({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-aha">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim() !== "");
        if (!lines.length) return null;
        const nodes: React.ReactNode[] = [];
        let list: string[] = [];
        const flush = () => {
          if (list.length) {
            const items = list;
            nodes.push(
              <ul key={`${bi}-ul-${nodes.length}`}>
                {items.map((li, j) => (
                  <li key={j}>{inline(li, `${bi}-li-${j}`)}</li>
                ))}
              </ul>,
            );
            list = [];
          }
        };
        let para: string[] = [];
        const flushPara = () => {
          if (para.length) {
            nodes.push(<p key={`${bi}-p-${nodes.length}`}>{inline(para.join(" "), `${bi}-p-${nodes.length}`)}</p>);
            para = [];
          }
        };
        for (const l of lines) {
          if (/^###\s+/.test(l)) {
            flush();
            flushPara();
            nodes.push(<h3 key={`${bi}-h3-${nodes.length}`}>{l.replace(/^###\s+/, "")}</h3>);
          } else if (/^##\s+/.test(l)) {
            flush();
            flushPara();
            nodes.push(<h2 key={`${bi}-h2-${nodes.length}`}>{l.replace(/^##\s+/, "")}</h2>);
          } else if (/^\s*[-*]\s+/.test(l)) {
            flushPara();
            list.push(l.replace(/^\s*[-*]\s+/, ""));
          } else {
            flush();
            para.push(l.trim());
          }
        }
        flush();
        flushPara();
        return <Fragment key={bi}>{nodes}</Fragment>;
      })}
    </div>
  );
}
