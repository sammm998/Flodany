// Panelen till höger om chatten, som i Claude: det agenten öppnar eller hämtar visas här, en flik per sak.
// Apparna ligger kvar i panelen när man byter flik, så att ett påbörjat arbete inte laddas om.
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { anropaMotor, MotorSvarFel, skapaDb, tillampaAndringar, type Beslut, type Panel } from '@flodia/api';
import { Fellage, Knapp, Laddning } from '@flodia/ui';
import { supabase } from '../supabase';
import { LegacyRam } from '../sidor/Brygga';
import { ModulInnehall } from '../sidor/Modul';
import { useKonto } from '../sidor/KontoSkal';
import { DataVisning, Tabell, csv, text } from './DataVisning';
import { useChatt } from './ChattLage';

const IKON: Record<Panel['typ'], string> = { app: '▣', data: '▤', berakning: '∑', atgard: '✓', hjalp: '?', andring: '✎' };
export const panelIkon = (p: Panel) => IKON[p.typ];

/** Sparar en fil i webbläsaren. data är text, eller { base64 } från motor. */
function laddaNer(namn: string, data: unknown, typ = 'application/octet-stream') {
  const del = typeof data === 'string' ? data : data && typeof data === 'object' && typeof (data as { base64?: unknown }).base64 === 'string'
    ? Uint8Array.from(atob((data as { base64: string }).base64), c => c.charCodeAt(0)) : JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(new Blob([del], { type: typ }));
  const a = document.createElement('a');
  a.href = url; a.download = namn;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const filnamn = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'data';
const tabellrader = (d: unknown): Record<string, unknown>[] | null => (Array.isArray(d) && d.length && d.every(x => x && typeof x === 'object' && !Array.isArray(x)) ? d as Record<string, unknown>[] : null);

function AppPanel({ p }: { p: Extract<Panel, { typ: 'app' }> }) {
  const k = useKonto();
  if (k.medlemskap.konto.intern) return <div className="fl-panel-ram"><LegacyRam modul={p.app} /></div>;
  return <div className="fl-panel-sida"><ModulInnehall nyckel={p.app} startvy={p.vy} iPanel /></div>;
}

function DataPanel({ p }: { p: Extract<Panel, { typ: 'data' }> }) {
  const rader = tabellrader(p.data);
  return (
    <div className="fl-panel-sida">
      <p className="fl-hjalptext">Källa: {p.kalla}{p.avkortad ? '. Visar en del av datan.' : ''}</p>
      <div className="fl-panel-verktyg">
        {rader && <Knapp variant="diskret" onClick={() => laddaNer(filnamn(p.rubrik) + '.csv', '﻿' + csv(rader), 'text/csv;charset=utf-8')}>Ladda ner CSV</Knapp>}
        <Knapp variant="diskret" onClick={() => laddaNer(filnamn(p.rubrik) + '.json', p.data, 'application/json')}>Ladda ner JSON</Knapp>
      </div>
      <DataVisning data={p.data} />
    </div>
  );
}

const FAKTURA_KOLUMNER = { typ: 'Typ', nr: 'Nr', till: 'Till', belopp: 'Belopp', datum: 'Datum', forfall: 'Förfaller', st: 'Status' };
const belopp = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
interface Verkstad { nyckeltal?: { lbl: string; belopp: number; text: string }[]; attGora?: { sev: string; reg: string; h: string; s: string }[]; fakturor?: Record<string, unknown>[]; bokforing?: { period: string; varningar: [string, string][]; summa: Record<string, number> } | null }

/** Verkstadens motor: nyckeltal, att göra, fakturor och periodens bokföring. Siffrorna kommer från motorn. */
function BerakningPanel({ p }: { p: Extract<Panel, { typ: 'berakning' }> }) {
  const d = p.data as Verkstad | null;
  if (!d || !Array.isArray(d.nyckeltal)) return <div className="fl-panel-sida"><p className="fl-hjalptext">Källa: {p.kalla}</p><DataVisning data={p.data} /></div>;
  return (
    <div className="fl-panel-sida">
      <p className="fl-hjalptext">Källa: {p.kalla}. Räknat av motorn.</p>
      <div className="fl-nyckeltal">
        {d.nyckeltal.map(n => <div key={n.lbl} className="fl-kort"><small>{n.lbl}</small><strong className="fl-tal">{belopp.format(n.belopp)}</strong><span className="fl-hjalptext">{n.text}</span></div>)}
      </div>
      {!!d.attGora?.length && (
        <section aria-label="Att göra">
          <h3>Att göra</h3>
          <ul className="fl-lista">
            {d.attGora.map((a, i) => <li key={i}><span className={`fl-status ${a.sev === 'bad' ? 'fl-status-avvikelse' : a.sev === 'warn' ? 'fl-status-vantar' : 'fl-status-klar'}`}>{a.reg}</span> <strong>{a.h}</strong> <span className="fl-hjalptext">{a.s}</span></li>)}
          </ul>
        </section>
      )}
      {!!d.fakturor?.length && <section aria-label="Fakturor"><h3>Fakturor</h3><Tabell rader={d.fakturor} rubrik="Fakturor" namn={FAKTURA_KOLUMNER} /></section>}
      {d.bokforing && (
        <section aria-label="Bokföring">
          <h3>Bokföring {d.bokforing.period}</h3>
          <DataVisning data={d.bokforing.summa} />
          {d.bokforing.varningar.map(([sev, t], i) => <p key={i} className={`fl-status ${sev === 'bad' ? 'fl-status-avvikelse' : 'fl-status-vantar'}`}>{t}</p>)}
        </section>
      )}
    </div>
  );
}

/** Ett förslag från agenten. Inget händer förrän användaren godkänner. Då körs åtgärden mot motor med användarens rättigheter. */
function AtgardPanel({ p, beslut }: { p: Extract<Panel, { typ: 'atgard' }>; beslut: (b: Beslut, text: string) => void }) {
  const k = useKonto();
  const [arbetar, setArbetar] = useState(false), [fel, setFel] = useState<string | null>(null);
  const kanGora = k.medlemskap.roll === 'admin' || k.medlemskap.roll === 'ekonomi';
  const a = p.atgard;

  async function godkann() {
    setArbetar(true); setFel(null);
    try {
      const svar = await anropaMotor<{ meddelanden?: string[]; filer?: { namn: string; data: unknown }[] }>(supabase, { konto: k.medlemskap.konto.id, modul: 'foliering', operation: 'atgard', data: { namn: a.namn, arende: a.arende, args: a.args } });
      for (const f of svar.filer ?? []) laddaNer(f.namn, f.data);
      const meddelanden = svar.meddelanden ?? [];
      beslut({ panel: p.id, utfall: 'utford', meddelanden }, `Jag godkände förslaget: ${a.beskrivning}${meddelanden.length ? ' Resultat: ' + meddelanden.join(' ') : ' Det är utfört.'}`);
    } catch (e) {
      const t = e instanceof MotorSvarFel ? e.message : 'Åtgärden kunde inte utföras. Försök igen.';
      setFel(t);
      beslut({ panel: p.id, utfall: 'misslyckad', meddelanden: [t] }, `Jag försökte godkänna förslaget, men det gick inte: ${t}`);
    } finally { setArbetar(false); }
  }

  return (
    <div className="fl-panel-sida">
      <section className="fl-kort fl-forslag" aria-labelledby={p.id + '-r'}>
        <h3 id={p.id + '-r'}>{p.rubrik}</h3>
        <p>{a.beskrivning}</p>
        <dl className="fl-data-falt">
          {a.arende && <div><dt>Ärende</dt><dd>{a.arende}</dd></div>}
          {a.args.length > 0 && <div><dt>Uppgifter</dt><dd>{a.args.map(text).join(', ')}</dd></div>}
          <div><dt>Krav</dt><dd>{a.krav}</dd></div>
        </dl>
        {p.beslut ? (
          <p role="status" className={`fl-status ${p.beslut.utfall === 'utford' ? 'fl-status-klar' : p.beslut.utfall === 'avbojd' ? 'fl-status-vantar' : 'fl-status-avvikelse'}`}>
            {p.beslut.utfall === 'utford' ? 'Godkänt och utfört' : p.beslut.utfall === 'avbojd' ? 'Avböjt' : 'Gick inte att utföra'} {p.beslut.tid.slice(0, 16).replace('T', ' ')}
          </p>
        ) : kanGora ? (
          <>
            <p className="fl-hjalptext">Assistenten gör inget själv. Granska och godkänn om det stämmer.</p>
            {arbetar && <Laddning text="Utför" />}
            {fel && <Fellage text={fel} />}
            <div className="fl-dialog-knappar">
              <Knapp variant="diskret" disabled={arbetar} onClick={() => beslut({ panel: p.id, utfall: 'avbojd', meddelanden: [] }, 'Jag avböjde förslaget.')}>Avböj</Knapp>
              <Knapp variant="primar" disabled={arbetar} onClick={() => void godkann()}>Godkänn och utför</Knapp>
            </div>
          </>
        ) : <p className="fl-hjalptext">Din roll kan inte godkänna åtgärder. Be en admin eller ekonomi.</p>}
      </section>
    </div>
  );
}

/** Ett värde i jämförelsen: text som den är, annat som kort JSON. */
const visaVarde = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? text(v) : JSON.stringify(v, null, 1));

/**
 * En ändring av data som agenten föreslår, med före och efter. Godkänn: dokumentet läses på nytt, samma ändringar
 * görs och det sparas med användarens rättigheter (documents-API:t). Appen i panelen ser ändringen direkt.
 */
function AndringPanel({ p, beslut }: { p: Extract<Panel, { typ: 'andring' }>; beslut: (b: Beslut, text: string) => void }) {
  const k = useKonto();
  const [arbetar, setArbetar] = useState(false), [fel, setFel] = useState<string | null>(null);
  const kanGora = k.medlemskap.roll === 'admin' || k.medlemskap.roll === 'ekonomi';
  const a = p.andring;

  async function godkann() {
    setArbetar(true); setFel(null);
    try {
      const ref = skapaDb({ supabase, konto: k.medlemskap.konto.id, modul: p.app }).doc(a.sokvag);
      await ref.set(tillampaAndringar((await ref.get()).data(), a.andringar));
      beslut({ panel: p.id, utfall: 'utford', meddelanden: [`Sparat i ${a.sokvag}.`] }, `Jag godkände ändringen: ${a.beskrivning} Den är sparad.`);
    } catch (e) {
      const t = (e as { code?: string }).code === 'not_granted' ? 'Du har inte behörighet att ändra det här.' : 'Ändringen kunde inte sparas. Försök igen.';
      setFel(t);
      beslut({ panel: p.id, utfall: 'misslyckad', meddelanden: [t] }, `Jag försökte godkänna ändringen, men det gick inte: ${t}`);
    } finally { setArbetar(false); }
  }

  return (
    <div className="fl-panel-sida">
      <section className="fl-kort fl-forslag" aria-labelledby={p.id + '-r'}>
        <h3 id={p.id + '-r'}>{a.beskrivning}</h3>
        <p className="fl-hjalptext">{p.rubrik.replace(/^Ändring: /, '')}, {a.sokvag}{a.nytt ? ' (nytt dokument)' : ''}</p>
        <div className="fl-tabell-yta">
          <table className="fl-tabell fl-diff">
            <thead><tr><th scope="col">Fält</th><th scope="col">Före</th><th scope="col">Efter</th></tr></thead>
            <tbody>{a.rader.map(r => (
              <tr key={r.falt}><td>{r.falt}</td><td className="fl-diff-fore">{visaVarde(r.fore) || <span className="fl-hjalptext">tomt</span>}</td><td className="fl-diff-efter">{visaVarde(r.efter) || <span className="fl-hjalptext">tas bort</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
        {p.beslut ? (
          <p role="status" className={`fl-status ${p.beslut.utfall === 'utford' ? 'fl-status-klar' : p.beslut.utfall === 'avbojd' ? 'fl-status-vantar' : 'fl-status-avvikelse'}`}>
            {p.beslut.utfall === 'utford' ? 'Godkänt och sparat' : p.beslut.utfall === 'avbojd' ? 'Avböjt' : 'Gick inte att spara'} {p.beslut.tid.slice(0, 16).replace('T', ' ')}
          </p>
        ) : kanGora ? (
          <>
            {arbetar && <Laddning text="Sparar" />}
            {fel && <Fellage text={fel} />}
            <div className="fl-dialog-knappar">
              <Knapp variant="diskret" disabled={arbetar} onClick={() => beslut({ panel: p.id, utfall: 'avbojd', meddelanden: [] }, 'Jag avböjde ändringen.')}>Avböj</Knapp>
              <Knapp variant="primar" disabled={arbetar} onClick={() => void godkann()}>Godkänn och spara</Knapp>
            </div>
          </>
        ) : <p className="fl-hjalptext">Din roll kan inte ändra något. Be en admin eller ekonomi.</p>}
      </section>
    </div>
  );
}

function HjalpPanel({ p }: { p: Extract<Panel, { typ: 'hjalp' }> }) {
  return <div className="fl-panel-sida">{p.stycken.map((s, i) => <section key={i} className="fl-hjalp-stycke"><h3>{s.rubrik}</h3><p>{s.text}</p></section>)}</div>;
}

export function Panelyta({ paneler, aktiv, setAktiv, stang, beslut, helskarm, setHelskarm }: {
  paneler: Panel[]; aktiv: string | null; setAktiv: (id: string) => void; stang: (id: string | null) => void;
  beslut: (b: Beslut, text: string) => void; helskarm: boolean; setHelskarm: (pa: boolean) => void;
}) {
  const k = useKonto(), { version } = useChatt();
  const vald = paneler.find(p => p.id === aktiv) ?? paneler.at(-1);
  if (!vald) return null;
  const bas = `/${k.medlemskap.konto.slug}`;
  return (
    <aside className="fl-panelyta" aria-label="Panelen">
      <div className="fl-panel-huvud">
        <div role="tablist" aria-label="Öppnat" className="fl-flikar">
          {paneler.map(p => (
            <span key={p.id} className={p.id === vald.id ? 'fl-flik aktiv' : 'fl-flik'}>
              <button type="button" role="tab" ref={p.id === vald.id ? (el => { el?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }) : undefined} aria-selected={p.id === vald.id} aria-controls={'panel-' + p.id} onClick={() => setAktiv(p.id)} title={p.rubrik}>
                <span aria-hidden="true" className="fl-flik-ikon">{panelIkon(p)}</span><span className="fl-flik-namn">{p.rubrik}</span>
              </button>
              <button type="button" className="fl-flik-stang" aria-label={`Stäng ${p.rubrik}`} onClick={() => stang(p.id)}>×</button>
            </span>
          ))}
        </div>
        <span className="fl-grow" />
        {vald.typ === 'app' && <Link className="fl-knapp fl-knapp-diskret" to={(k.medlemskap.konto.intern ? `${bas}/${vald.app}/legacy` : `${bas}/${vald.app}`) as never} title="Öppna appen som egen sida">Helsida</Link>}
        <Knapp variant="diskret" className="fl-forstora" aria-pressed={helskarm} onClick={() => setHelskarm(!helskarm)}>{helskarm ? 'Förminska' : 'Förstora'}</Knapp>
        <Knapp variant="diskret" onClick={() => stang(null)} aria-label="Stäng panelen">Stäng</Knapp>
      </div>
      {paneler.map(p => (
        <div key={p.id} id={'panel-' + p.id} role="tabpanel" aria-label={p.rubrik} hidden={p.id !== vald.id} className="fl-panel-innehall">
          {p.typ === 'app' ? <AppPanel key={version[p.app] ?? 0} p={p} />
            : p.typ === 'data' ? <DataPanel p={p} />
            : p.typ === 'berakning' ? <BerakningPanel p={p} />
            : p.typ === 'atgard' ? <AtgardPanel p={p} beslut={beslut} />
            : p.typ === 'andring' ? <AndringPanel p={p} beslut={beslut} />
            : <HjalpPanel p={p} />}
        </div>
      ))}
    </aside>
  );
}
