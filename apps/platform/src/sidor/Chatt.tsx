// Chatten, kundens startsida (ägarens uppdrag 2026-10-17): som Claude. Till vänster samtal och appar, i mitten
// samtalet och skrivrutan, och till höger en panel som öppnas när assistenten öppnar en app eller hämtar något.
// Panelen går att dra bredare eller smalare och förstora. På smal skärm täcker den chatten.
// Adresser: /:konto (nytt samtal) och /:konto/chatt/:samtal.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as TangentHandelse, type PointerEvent as PekarHandelse } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FORSLAG, type ChattMeddelande, type Del } from '@flodia/api';
import { Fellage, Knapp, Laddning, TomtLage, initialer } from '@flodia/ui';
import { taBortSamtal, useSamtalLista } from '../assistent';
import { useChatt } from '../chatt/ChattLage';
import { Markdown } from '../chatt/Markdown';
import { Panelyta, panelIkon } from '../chatt/Panel';
import { ROLL, TYP } from '../data';
import { useKonto } from './KontoSkal';
import { DEMO } from '../supabase';

const MAX_TEXT = 4000;
const BREDD = 'flodia:panelbredd';

const halsning = (nu = new Date()) => {
  const h = +new Intl.DateTimeFormat('sv-SE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Stockholm' }).format(nu);
  return h < 10 ? 'God morgon' : h < 18 ? 'Hej' : 'God kväll';
};

function VerktygKort({ del }: { del: Extract<Del, { typ: 'verktyg' }> }) {
  const c = useChatt();
  const panel = c.panelFor(del.panel);
  const p = c.paneler.find(x => x.id === panel);
  const { status, etikett } = del.verktyg;
  const innehall = (
    <>
      <span className={`fl-verktyg-status ${status}`} aria-hidden="true">{status === 'pagar' ? <span className="fl-snurra" /> : status === 'klar' ? '✓' : '!'}</span>
      <span className="fl-verktyg-text"><strong>{p?.rubrik ?? etikett}</strong>{p && <small>{etikett}</small>}</span>
      {p && <span className="fl-verktyg-ikon" aria-hidden="true">{panelIkon(p)}</span>}
      <span className="fl-dold">{status === 'pagar' ? ', pågår' : status === 'klar' ? ', klart' : ', gick inte'}</span>
    </>
  );
  return p
    ? <button type="button" className="fl-verktyg-kort" onClick={() => c.visaPanel(p.id)} aria-label={`${p.rubrik}. Visa i panelen`}>{innehall}</button>
    : <div className="fl-verktyg-kort fl-verktyg-rad">{innehall}</div>;
}

function Meddelande({ m, sista }: { m: ChattMeddelande; sista: boolean }) {
  const c = useChatt();
  if (m.roll === 'anvandare') return <div className="fl-meddelande fl-meddelande-du"><div className="fl-bubbla">{m.delar.map((d, i) => d.typ === 'text' ? <p key={i}>{d.text}</p> : null)}</div></div>;
  const sistaDel = m.delar.at(-1);
  const tankar = sista && c.arbetar && (!sistaDel || (sistaDel.typ === 'verktyg' && sistaDel.verktyg.status !== 'pagar'));
  return (
    <div className="fl-meddelande fl-meddelande-assistent">
      <span className="fl-assistent-ikon" aria-hidden="true">✳</span>
      <div className="fl-svar">
        {m.delar.map((d, i) => d.typ === 'text' ? <div key={i} className="fl-svar-text"><Markdown text={d.text} /></div> : <VerktygKort key={d.verktyg.id + i} del={d} />)}
        {tankar && <div className="fl-tanker" role="status" aria-label="Assistenten tänker"><span /><span /><span /></div>}
      </div>
    </div>
  );
}

function Skrivruta({ stor }: { stor?: boolean }) {
  const c = useChatt();
  const [text, setText] = useState('');
  const ruta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const r = ruta.current;
    if (!r) return;
    r.style.height = 'auto';
    r.style.height = Math.min(r.scrollHeight, 240) + 'px';
  }, [text]);
  useEffect(() => { ruta.current?.focus(); }, [c.samtal]);
  const skicka = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || c.arbetar) return;
    void c.skicka(text);
    setText('');
  };
  const tangent = (e: TangentHandelse<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); skicka(); } };
  return (
    <form className={stor ? 'fl-skrivruta stor' : 'fl-skrivruta'} onSubmit={skicka}>
      <label className="fl-dold" htmlFor="fraga">Skriv till assistenten</label>
      <textarea id="fraga" ref={ruta} rows={1} value={text} maxLength={MAX_TEXT} placeholder={stor ? 'Vad vill du göra i dag?' : 'Svara assistenten'} onChange={e => setText(e.target.value)} onKeyDown={tangent} />
      <div className="fl-skrivruta-rad">
        <span className="fl-hjalptext">Assistenten gör inget utan ditt godkännande.</span>
        <span className="fl-grow" />
        {c.arbetar
          ? <Knapp className="fl-skicka" onClick={c.stoppa} aria-label="Stoppa svaret">■</Knapp>
          : <Knapp variant="primar" type="submit" className="fl-skicka" disabled={!text.trim()} aria-label="Skicka">↑</Knapp>}
      </div>
    </form>
  );
}

function Valkomst() {
  const k = useKonto(), c = useChatt();
  const forslag = [...new Set([...k.moduler.flatMap(m => FORSLAG[m.modul.nyckel] ?? []), ...FORSLAG.allmant!])].slice(0, 6);
  return (
    <div className="fl-valkomst">
      <h1><span className="fl-assistent-ikon stor" aria-hidden="true">✳</span>{halsning()}, {k.anvandare.namn.split(' ')[0]}</h1>
      {!k.moduler.length && <TomtLage rubrik="Inga appar än" text="Kontot har inga appar. Kontakta Flödia för att komma igång. Du kan ändå fråga assistenten hur plattformen fungerar." />}
      <Skrivruta stor />
      {DEMO && <p className="fl-hjalptext fl-demo-rad">Demo med påhittad data. Allt nollställs när servern startas om.</p>}
      <ul className="fl-forslag-lista" aria-label="Förslag">
        {forslag.map(f => <li key={f}><button type="button" className="fl-forslag-knapp" onClick={() => void c.skicka(f)}>{f}</button></li>)}
      </ul>
    </div>
  );
}

function Sidomeny({ stang }: { stang: () => void }) {
  const k = useKonto(), c = useChatt(), nav = useNavigate();
  const lista = useSamtalLista(k.medlemskap.konto.id);
  const bas = `/${k.medlemskap.konto.slug}`;
  const ta = async (id: string) => {
    if (!confirm('Ta bort samtalet?')) return;
    await taBortSamtal(id).catch(() => {});
    await lista.refetch();
    if (c.samtal === id) void nav({ to: '/$konto', params: { konto: k.medlemskap.konto.slug } });
  };
  return (
    <>
      <button type="button" className="fl-kontoblock" onClick={k.bytKonto} aria-label={`Konto: ${k.medlemskap.konto.name}. Byt konto`}>
        <span className="fl-avatar" aria-hidden="true">{initialer(k.medlemskap.konto.name)}</span>
        <span><strong>{k.medlemskap.konto.name}</strong><small>{TYP[k.medlemskap.konto.type]} · {ROLL[k.medlemskap.roll]}</small></span>
      </button>
      <Link to={bas as never} className="fl-knapp fl-ny-chatt" onClick={() => { c.nytt(); stang(); }}>+ Nytt samtal</Link>

      <nav aria-label="Appar" className="fl-menygrupp">
        <h2>Appar</h2>
        <ul>
          {k.moduler.map(m => (
            <li key={m.modul.nyckel}><button type="button" className="fl-menyknapp-post" onClick={() => { c.oppnaApp(m.modul.nyckel, m.modul.varianter[m.variant]!.namn); stang(); }}>{m.modul.varianter[m.variant]!.namn}</button></li>
          ))}
          {!k.moduler.length && <li className="fl-hjalptext">Inga appar än.</li>}
        </ul>
      </nav>

      <nav aria-label="Samtal" className="fl-menygrupp fl-samtal-lista">
        <h2>Senaste</h2>
        {lista.isLoading ? <Laddning /> : lista.isError ? <p className="fl-hjalptext">Samtalen kunde inte hämtas.</p> : !lista.data?.length ? <p className="fl-hjalptext">Inga samtal än.</p> : (
          <ul>
            {lista.data.map(s => (
              <li key={s.id} className={s.id === c.samtal ? 'aktiv' : undefined}>
                <Link to="/$konto/chatt/$samtal" params={{ konto: k.medlemskap.konto.slug, samtal: s.id }} aria-current={s.id === c.samtal ? 'page' : undefined} onClick={stang}>{s.titel}</Link>
                <button type="button" className="fl-ta-bort" aria-label={`Ta bort ${s.titel}`} onClick={() => void ta(s.id)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div className="fl-sidomeny-fot">
        <Link to={`${bas}/hem` as never} className="fl-lanklik">Översikt och guider</Link>
        <button type="button" className="fl-lanklik" onClick={k.oppnaHjalp}>Hjälp</button>
        <details className="fl-anvandare">
          <summary aria-label={`Inloggad som ${k.anvandare.namn}`}><span className="fl-avatar" aria-hidden="true">{initialer(k.anvandare.namn)}</span><span>{k.anvandare.namn}</span></summary>
          <div><Knapp onClick={k.loggaUt}>Logga ut</Knapp></div>
        </details>
      </div>
    </>
  );
}

export function Chatt() {
  const k = useKonto(), c = useChatt();
  const { samtal } = useParams({ strict: false }) as { samtal?: string };
  const [menyOppen, setMenyOppen] = useState(false);
  const [helskarm, setHelskarm] = useState(false);
  const [bredd, setBredd] = useState(() => { try { return Number(localStorage.getItem(BREDD)) || 0; } catch { return 0; } });
  const flode = useRef<HTMLDivElement>(null), yta = useRef<HTMLDivElement>(null);
  const nederst = useRef(true);

  // Adressen styr samtalet: ett annat samtal läses in, och /konto utan samtal är ett nytt.
  useEffect(() => {
    if (samtal && samtal !== c.samtal) void c.ladda(samtal);
    else if (!samtal && c.samtal && !c.arbetar) c.nytt();
    // Bara när adressen ändras, inte när samtalet i chatten byts av ett svar.
  }, [samtal]);

  useEffect(() => {
    const fore = document.title;
    document.title = `${k.medlemskap.konto.name} · Assistenten`;
    return () => { document.title = fore; };
  }, [k.medlemskap.konto.name]);
  useEffect(() => { if (!c.panelOppen) setHelskarm(false); }, [c.panelOppen]);

  // Följer svaret nedåt medan det skrivs, om användaren inte själv har rullat upp.
  useEffect(() => { const f = flode.current; if (f && nederst.current) f.scrollTop = f.scrollHeight; }, [c.meddelanden]);
  const rullad = () => { const f = flode.current; if (f) nederst.current = f.scrollHeight - f.scrollTop - f.clientHeight < 80; };

  // Dra i kanten mellan chatten och panelen för att ändra panelens bredd.
  const dra = (e: PekarHandelse<HTMLDivElement>) => {
    const y = yta.current;
    if (!y) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const ruta = y.getBoundingClientRect();
    const flytta = (ev: PointerEvent) => setBredd(Math.round(Math.min(Math.max(ruta.right - ev.clientX, 360), ruta.width - 360)));
    const slapp = () => {
      window.removeEventListener('pointermove', flytta); window.removeEventListener('pointerup', slapp);
      setBredd(b => { try { localStorage.setItem(BREDD, String(b)); } catch { /* lagringen är avstängd */ } return b; });
    };
    window.addEventListener('pointermove', flytta); window.addEventListener('pointerup', slapp);
  };
  const tangentKant = (e: TangentHandelse<HTMLDivElement>) => {
    const steg = e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0;
    if (steg) { e.preventDefault(); setBredd(b => Math.max(360, (b || (yta.current?.clientWidth ?? 1000) / 2) + steg)); }
  };

  const tomt = !c.meddelanden.length && !c.laddar;
  const klasser = ['fl-chatt', c.panelOppen && c.paneler.length ? 'med-panel' : '', helskarm ? 'panel-helskarm' : '', menyOppen ? 'meny-oppen' : ''].filter(Boolean).join(' ');
  const lista = useSamtalLista(k.medlemskap.konto.id);
  const titel = c.samtal ? lista.data?.find(s => s.id === c.samtal)?.titel ?? '' : 'Nytt samtal';

  return (
    <div className={klasser} ref={yta} style={bredd ? { ['--panel-bredd' as string]: bredd + 'px' } : undefined}>
      <a className="fl-hoppa" href="#fraga">Hoppa till skrivrutan</a>
      <aside className="fl-chatt-meny" aria-label="Sidomeny">
        <Sidomeny stang={() => setMenyOppen(false)} />
      </aside>
      {menyOppen && <div className="fl-chatt-skymning" onClick={() => setMenyOppen(false)} aria-hidden="true" />}

      <main id="innehall" className="fl-chatt-yta" tabIndex={-1}>
        <header className="fl-chatt-topp">
          <Knapp variant="diskret" className="fl-chatt-menyknapp" aria-expanded={menyOppen} onClick={() => setMenyOppen(!menyOppen)}>Meny</Knapp>
          <span className="fl-chatt-titel">{titel}</span>
          <span className="fl-grow" />
          {!c.panelOppen && c.paneler.length > 0 && <Knapp variant="diskret" onClick={() => c.setPanelOppen(true)}>Visa panelen ({c.paneler.length})</Knapp>}
        </header>
        {c.laddar ? <Laddning text="Hämtar samtalet" /> : tomt ? (c.fel ? <div className="fl-valkomst"><Fellage text={c.fel} /><Valkomst /></div> : <Valkomst />) : (
          <>
            <div className="fl-chatt-flode" ref={flode} onScroll={rullad} aria-live="polite" aria-busy={c.arbetar}>
              <div className="fl-chatt-kolumn">
                {c.meddelanden.map((m, i) => <Meddelande key={m.id} m={m} sista={i === c.meddelanden.length - 1} />)}
              </div>
            </div>
            <div className="fl-chatt-kolumn fl-chatt-nere"><Skrivruta /></div>
          </>
        )}
      </main>

      {c.panelOppen && c.paneler.length > 0 && (
        <>
          <div className="fl-panel-kant" role="separator" aria-orientation="vertical" aria-label="Ändra panelens bredd" tabIndex={0} onPointerDown={dra} onKeyDown={tangentKant} />
          <Panelyta paneler={c.paneler} aktiv={c.aktivPanel} setAktiv={c.visaPanel} stang={c.stangPanel} beslut={c.beslut} helskarm={helskarm} setHelskarm={setHelskarm} />
        </>
      )}
    </div>
  );
}
