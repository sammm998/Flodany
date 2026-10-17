// Data som agenten hämtat, i panelen: en lista med poster blir en tabell, ett objekt blir fält och värden, och
// det som ligger djupare går att fälla ut. Belopp formateras sv-SE. Allt skrivs som text.
import type { ReactNode } from 'react';

const MAX_RADER = 500, MAX_KOLUMNER = 12;
const tal = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

const arObjekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const arEnkel = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Ett värde som kort text. */
export function text(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return tal.format(v);
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nej';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `${v.length} st`;
  return `${Object.keys(v as object).length} fält`;
}

/** Kolumnerna i en tabell: nycklarna med enkla värden, i den ordning de först förekommer. */
export function kolumner(rader: Record<string, unknown>[]): string[] {
  const ut: string[] = [];
  for (const r of rader.slice(0, 50)) for (const [k, v] of Object.entries(r)) if (!ut.includes(k) && (arEnkel(v) || Array.isArray(v))) ut.push(k);
  return ut.slice(0, MAX_KOLUMNER);
}

/** Tabellen som CSV (semikolon, som svensk Excel läser). */
export function csv(rader: Record<string, unknown>[]): string {
  const k = kolumner(rader);
  const cellText = (v: unknown) => { const s = typeof v === 'number' ? String(v).replace('.', ',') : text(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [k.join(';'), ...rader.map(r => k.map(c => cellText(r[c])).join(';'))].join('\r\n');
}

/** En tabell. namn ger rubriker för kända kolumner, och då visas bara de. */
export function Tabell({ rader, rubrik, namn }: { rader: Record<string, unknown>[]; rubrik?: string; namn?: Record<string, string> }) {
  const k = namn ? Object.keys(namn).filter(c => rader.some(r => c in r)) : kolumner(rader);
  if (!k.length) return <Falt data={rader} />;
  return (
    <div className="fl-tabell-yta">
      <table className="fl-tabell">
        {rubrik && <caption className="fl-dold">{rubrik}</caption>}
        <thead><tr>{k.map(c => <th key={c} scope="col" className={typeof rader[0]?.[c] === 'number' ? 'fl-tal' : undefined}>{namn?.[c] ?? c}</th>)}</tr></thead>
        <tbody>
          {rader.slice(0, MAX_RADER).map((r, i) => (
            <tr key={i}>{k.map(c => <td key={c} className={typeof r[c] === 'number' ? 'fl-tal' : undefined}>{text(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {rader.length > MAX_RADER && <p className="fl-hjalptext">Visar {MAX_RADER} av {rader.length} rader.</p>}
    </div>
  );
}

function Falt({ data, djup = 0 }: { data: unknown; djup?: number }): ReactNode {
  if (arEnkel(data)) return <span>{text(data)}</span>;
  if (Array.isArray(data)) {
    if (data.length && data.every(arObjekt)) return <Tabell rader={data} />;
    if (data.every(arEnkel)) return <span>{data.map(text).join(', ') || 'Tom lista'}</span>;
    return <ol className="fl-data-lista">{data.slice(0, MAX_RADER).map((x, i) => <li key={i}><Falt data={x} djup={djup + 1} /></li>)}</ol>;
  }
  const poster = Object.entries(data as Record<string, unknown>);
  if (!poster.length) return <span className="fl-hjalptext">Tomt</span>;
  return (
    <dl className="fl-data-falt">
      {poster.map(([k, v]) => arEnkel(v) || (Array.isArray(v) && v.every(arEnkel)) ? (
        <div key={k}><dt>{k}</dt><dd className={typeof v === 'number' ? 'fl-tal' : undefined}><Falt data={v} /></dd></div>
      ) : (
        <details key={k} open={djup < 1}>
          <summary><span>{k}</span> <small>{text(v)}</small></summary>
          <Falt data={v} djup={djup + 1} />
        </details>
      ))}
    </dl>
  );
}

export function DataVisning({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <p className="fl-hjalptext">Inget att visa.</p>;
  return <div className="fl-data"><Falt data={data} /></div>;
}
