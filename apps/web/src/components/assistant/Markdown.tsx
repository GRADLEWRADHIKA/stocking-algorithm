import { Fragment } from 'react';

/** Minimal, safe markdown: headings, bullets, numbered lists, tables, **bold**, `code`. No HTML injection. */
function inline(text: string, key: string | number) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <Fragment key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="num rounded bg-raised px-1 text-[12px]">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </Fragment>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^#{1,4}\s/.test(line)) {
      const level = line.match(/^#+/)![0].length;
      out.push(
        <p key={i} className={level <= 2 ? 'mt-3 text-[15px] font-semibold' : 'mt-3 text-[13px] font-semibold'}>
          {inline(line.replace(/^#+\s/, ''), i)}
        </p>,
      );
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={`t${i}`} className="my-2 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>{head?.map((h, k) => <th key={k} className={k > 0 ? 'r' : ''}>{inline(h, k)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} className={j > 0 ? 'r num' : ''}>
                      {inline(c, j)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s/, ''));
        i++;
      }
      const L = ordered ? 'ol' : 'ul';
      out.push(
        <L key={`l${i}`} className={ordered ? 'my-1 list-decimal space-y-1 pl-5' : 'my-1 space-y-1'}>
          {items.map((it, k) => (
            <li key={k} className={ordered ? '' : 'flex gap-2'}>
              {!ordered && <span className="mt-2 h-1 w-1 flex-none rounded-full bg-faint" />}
              <span>{inline(it, k)}</span>
            </li>
          ))}
        </L>,
      );
      continue;
    }
    out.push(
      <p key={i} className="my-1.5">
        {inline(line, i)}
      </p>,
    );
    i++;
  }
  return <div className="text-[13px] leading-relaxed text-ink/90">{out}</div>;
}
