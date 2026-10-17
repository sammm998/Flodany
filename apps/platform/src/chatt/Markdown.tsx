// Assistentens svar som text med enkel formatering: stycken, rubriker, listor, tabeller, kod, fetstil, kursiv
// och länkar. Allt byggs som React-element, aldrig som HTML, så att text från modellen inte kan bli kod i sidan.
import { Fragment, type ReactNode } from 'react';

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

/** Länkar bara till plattformens egna sidor och till https. */
const sakerLank = (url: string) => url.startsWith('/') && !url.startsWith('//') ? url : /^https:\/\//.test(url) ? url : null;

export function inline(text: string): ReactNode[] {
  const ut: ReactNode[] = [];
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > i) ut.push(text.slice(i, m.index));
    const t = m[0], k = `${m.index}`;
    if (t.startsWith('**') || t.startsWith('__')) ut.push(<strong key={k}>{inline(t.slice(2, -2))}</strong>);
    else if (t.startsWith('`')) ut.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, namn, url] = t.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      const href = sakerLank(url!);
      ut.push(href ? <a key={k} href={href} {...(href.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}>{namn}</a> : namn);
    } else ut.push(<em key={k}>{inline(t.slice(1, -1))}</em>);
    i = m.index + t.length;
  }
  if (i < text.length) ut.push(text.slice(i));
  return ut;
}

type Block =
  | { typ: 'p'; rader: string[] }
  | { typ: 'h'; niva: number; text: string }
  | { typ: 'ul' | 'ol'; poster: string[] }
  | { typ: 'kod'; text: string }
  | { typ: 'tabell'; huvud: string[]; rader: string[][] };

const cell = (rad: string) => rad.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());

export function block(text: string): Block[] {
  const rader = text.replace(/\r\n/g, '\n').split('\n');
  const ut: Block[] = [];
  for (let i = 0; i < rader.length;) {
    const r = rader[i]!;
    if (!r.trim()) { i++; continue; }
    if (r.startsWith('```')) {
      const kod: string[] = [];
      for (i++; i < rader.length && !rader[i]!.startsWith('```'); i++) kod.push(rader[i]!);
      ut.push({ typ: 'kod', text: kod.join('\n') }); i++; continue;
    }
    const h = r.match(/^(#{1,4})\s+(.*)$/);
    if (h) { ut.push({ typ: 'h', niva: h[1]!.length, text: h[2]! }); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(r) && /^\s*\|?[\s:|-]+\|?\s*$/.test(rader[i + 1] ?? '') && (rader[i + 1] ?? '').includes('-')) {
      const huvud = cell(r), kropp: string[][] = [];
      for (i += 2; i < rader.length && /^\s*\|.*\|\s*$/.test(rader[i]!); i++) kropp.push(cell(rader[i]!));
      ut.push({ typ: 'tabell', huvud, rader: kropp }); continue;
    }
    const lista = (re: RegExp, typ: 'ul' | 'ol') => {
      const poster: string[] = [];
      while (i < rader.length && re.test(rader[i]!)) { poster.push(rader[i]!.replace(re, '')); i++; }
      ut.push({ typ, poster });
    };
    if (/^\s*[-*•]\s+/.test(r)) { lista(/^\s*[-*•]\s+/, 'ul'); continue; }
    if (/^\s*\d+[.)]\s+/.test(r)) { lista(/^\s*\d+[.)]\s+/, 'ol'); continue; }
    const p: string[] = [];
    while (i < rader.length && rader[i]!.trim() && !/^(```|#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*\|.*\|\s*$)/.test(rader[i]!)) { p.push(rader[i]!); i++; }
    if (!p.length) { p.push(r); i++; }
    ut.push({ typ: 'p', rader: p });
  }
  return ut;
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {block(text).map((b, i) => {
        switch (b.typ) {
          case 'p': return <p key={i}>{b.rader.map((r, j) => <Fragment key={j}>{j > 0 && <br />}{inline(r)}</Fragment>)}</p>;
          case 'h': return b.niva <= 2 ? <h3 key={i}>{inline(b.text)}</h3> : <h4 key={i}>{inline(b.text)}</h4>;
          case 'ul': return <ul key={i}>{b.poster.map((p, j) => <li key={j}>{inline(p)}</li>)}</ul>;
          case 'ol': return <ol key={i}>{b.poster.map((p, j) => <li key={j}>{inline(p)}</li>)}</ol>;
          case 'kod': return <pre key={i}><code>{b.text}</code></pre>;
          case 'tabell': return (
            <div key={i} className="fl-tabell-yta">
              <table className="fl-tabell">
                <thead><tr>{b.huvud.map((h, j) => <th key={j} scope="col">{inline(h)}</th>)}</tr></thead>
                <tbody>{b.rader.map((r, j) => <tr key={j}>{r.map((c, n) => <td key={n} className={/^-?[\d\s.,]+( kr| %)?$/.test(c) ? 'fl-tal' : undefined}>{inline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          );
        }
      })}
    </>
  );
}
