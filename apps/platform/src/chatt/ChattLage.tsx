// Chattens tillstånd: samtalet, meddelandena, panelerna och strömmen från assistenten. Ligger i kontots skal,
// så att det inte nollställs när adressen byts från /konto till /konto/chatt/<id> mitt i ett svar.
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { Beslut, ChattMeddelande, Panel } from '@flodia/api';
import { AssistentFel, fraga, hamtaSamtal } from '../assistent';
import { laggTillPanel, tillampa } from './handelser';

export interface ChattLage {
  samtal: string | null;
  meddelanden: ChattMeddelande[];
  paneler: Panel[];
  aktivPanel: string | null;
  panelOppen: boolean;
  arbetar: boolean;
  laddar: boolean;
  fel: string | null;
  /** Panelen som ett verktyg i ett meddelande pekar på (samma app öppnas bara en gång). */
  panelFor: (id: string | undefined) => string | undefined;
  skicka: (text: string, beslut?: Beslut) => Promise<void>;
  stoppa: () => void;
  nytt: () => void;
  ladda: (id: string) => Promise<void>;
  visaPanel: (id: string) => void;
  stangPanel: (id: string | null) => void;
  setPanelOppen: (pa: boolean) => void;
  /** Öppnar en app i panelen direkt, utan att fråga assistenten. */
  oppnaApp: (app: string, rubrik: string) => void;
  /** Uppdaterar ett förslag i panelen efter användarens beslut och berättar det för assistenten. */
  beslut: (b: Beslut, text: string) => void;
}

const Kontext = createContext<ChattLage | null>(null);
export const useChatt = () => useContext(Kontext)!;

const STROM = 'strommar';

export function ChattLeverantor({ konto, slug, children }: { konto: string; slug: string; children: ReactNode }) {
  const nav = useNavigate(), qc = useQueryClient();
  const [samtal, setSamtal] = useState<string | null>(null);
  const [meddelanden, setMeddelanden] = useState<ChattMeddelande[]>([]);
  const [paneler, setPaneler] = useState<Panel[]>([]);
  const [alias, setAlias] = useState<Record<string, string>>({});
  const [aktivPanel, setAktivPanel] = useState<string | null>(null);
  const [panelOppen, setPanelOppen] = useState(false);
  const [arbetar, setArbetar] = useState(false), [laddar, setLaddar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const avbryt = useRef<AbortController | null>(null);
  // Samtalet och panelerna som de är just nu, för skicka (som anropas utanför renderingen).
  const nu = useRef({ samtal, paneler, aktivPanel });
  nu.current = { samtal, paneler, aktivPanel };

  const visaPanel = useCallback((id: string) => { setAktivPanel(id); setPanelOppen(true); }, []);
  const panelFor = useCallback((id: string | undefined) => (id ? alias[id] ?? id : undefined), [alias]);

  const nytt = useCallback(() => {
    avbryt.current?.abort();
    setSamtal(null); setMeddelanden([]); setPaneler([]); setAlias({}); setAktivPanel(null); setPanelOppen(false); setFel(null); setArbetar(false);
  }, []);

  const ladda = useCallback(async (id: string) => {
    avbryt.current?.abort();
    setLaddar(true); setFel(null);
    try {
      const s = await hamtaSamtal(konto, id);
      if (!s) { setFel('Samtalet finns inte längre.'); setSamtal(null); setMeddelanden([]); setPaneler([]); return; }
      let lista: Panel[] = [];
      const al: Record<string, string> = {};
      for (const p of s.paneler) { const r = laggTillPanel(lista, p); lista = r.paneler; if (r.id !== p.id) al[p.id] = r.id; }
      setSamtal(s.id); setMeddelanden(s.visning); setPaneler(lista); setAlias(al); setAktivPanel(lista.at(-1)?.id ?? null); setPanelOppen(false);
    } catch { setFel('Samtalet kunde inte hämtas.'); } finally { setLaddar(false); }
  }, [konto]);

  const skicka = useCallback(async (text: string, beslut?: Beslut) => {
    const t = text.trim();
    if (!t) return;
    avbryt.current?.abort();
    const ac = new AbortController();
    avbryt.current = ac;
    setFel(null); setArbetar(true);
    const { samtal: id, paneler: pl, aktivPanel: ap } = nu.current;
    const oppen = pl.find(p => p.id === ap);
    setMeddelanden(m => [...m, { id: 'du-' + Date.now(), roll: 'anvandare', delar: [{ typ: 'text', text: t }] }, { id: STROM, roll: 'assistent', delar: [] }]);
    const uppdatera = (f: (m: ChattMeddelande) => ChattMeddelande) => setMeddelanden(lista => lista.map(m => (m.id === STROM ? f(m) : m)));
    try {
      await fraga({ konto, ...(id ? { samtal: id } : {}), text: t, vy: oppen ? { app: oppen.app, ...(oppen.typ === 'app' && oppen.vy ? { vy: oppen.vy } : {}) } : null, ...(beslut ? { beslut } : {}) }, h => {
        if (ac.signal.aborted) return;
        if (h.typ === 'samtal') {
          if (h.id !== nu.current.samtal) { setSamtal(h.id); nu.current.samtal = h.id; void nav({ to: '/$konto/chatt/$samtal', params: { konto: slug, samtal: h.id }, replace: !id }); }
        } else if (h.typ === 'panel') {
          setPaneler(lista => {
            const r = laggTillPanel(lista, h.panel);
            if (r.id !== h.panel.id) setAlias(a => ({ ...a, [h.panel.id]: r.id }));
            return r.paneler;
          });
          setAktivPanel(h.panel.typ === 'app' ? (nu.current.paneler.find(x => x.typ === 'app' && x.app === h.panel.app)?.id ?? h.panel.id) : h.panel.id);
          setPanelOppen(true);
          uppdatera(m => tillampa(m, h));
        } else if (h.typ === 'klar') {
          setMeddelanden(lista => lista.map(m => (m.id === STROM ? h.meddelande : m)));
        } else {
          uppdatera(m => tillampa(m, h));
        }
      }, ac.signal);
    } catch (e) {
      if (ac.signal.aborted) { uppdatera(m => ({ ...m, id: 'avbrutet-' + Date.now(), delar: [...m.delar, { typ: 'text', text: (m.delar.length ? '\n\n' : '') + '(Avbrutet.)' }] })); return; }
      const text = e instanceof AssistentFel ? e.message : 'Assistenten kunde inte svara. Försök igen.';
      uppdatera(m => ({ ...m, delar: [...m.delar, { typ: 'text', text: (m.delar.length ? '\n\n' : '') + text }] }));
      setFel(text);
    } finally {
      // Ett meddelande som aldrig fick ett slut får ett eget id, så att nästa svar inte skriver i det.
      setMeddelanden(lista => lista.map(m => (m.id === STROM ? { ...m, id: 'svar-' + Date.now() } : m)));
      if (avbryt.current === ac) { avbryt.current = null; setArbetar(false); }
      void qc.invalidateQueries({ queryKey: ['samtal', konto] });
    }
  }, [konto, slug, nav, qc]);

  const stoppa = useCallback(() => { avbryt.current?.abort(); setArbetar(false); }, []);

  const stangPanel = useCallback((id: string | null) => {
    if (id === null) { setPanelOppen(false); return; }
    setPaneler(lista => {
      const kvar = lista.filter(p => p.id !== id);
      if (!kvar.length) setPanelOppen(false);
      setAktivPanel(a => (a === id ? kvar.at(-1)?.id ?? null : a));
      return kvar;
    });
  }, []);

  const oppnaApp = useCallback((app: string, rubrik: string) => {
    const p: Panel = { id: 'lokal-' + app, typ: 'app', rubrik, app, vy: null };
    setPaneler(lista => laggTillPanel(lista, p).paneler);
    setAktivPanel(nu.current.paneler.find(x => x.typ === 'app' && x.app === app)?.id ?? p.id);
    setPanelOppen(true);
  }, []);

  const beslut = useCallback((b: Beslut, text: string) => {
    setPaneler(lista => lista.map(p => (p.id === b.panel && p.typ === 'atgard' ? { ...p, beslut: { ...b, tid: new Date().toISOString() } } : p)));
    void skicka(text, b);
  }, [skicka]);

  const varde = useMemo<ChattLage>(() => ({
    samtal, meddelanden, paneler, aktivPanel, panelOppen, arbetar, laddar, fel, panelFor,
    skicka, stoppa, nytt, ladda, visaPanel, stangPanel, setPanelOppen, oppnaApp, beslut,
  }), [samtal, meddelanden, paneler, aktivPanel, panelOppen, arbetar, laddar, fel, panelFor, skicka, stoppa, nytt, ladda, visaPanel, stangPanel, oppnaApp, beslut]);

  return <Kontext.Provider value={varde}>{children}</Kontext.Provider>;
}
