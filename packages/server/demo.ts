// Demoläget (ägarens önskan 2026-10-17): plattformen fungerar på Railway utan Supabase. Servern spelar Supabase
// för webbläsaren: REST-anropen (konton, licenser, dokument, samtal) och serverfunktionerna motor, assistent och
// legacy, med påhittad data i minnet. Allt nollställs när servern startas om. Ingen riktig kunddata hör hemma här.
//
// Motorerna och assistenten körs här på servern, som i drift (beslut 26). Utan ANTHROPIC_API_KEY svarar en
// enkel demoassistent som väljer verktyg efter nyckelord, så att chatten och panelen går att prova.
// Legacy-apparna (motorerna i klartext) lämnas bara ut med DEMO_NUVARANDE_APPAR=ja.
import { normalisera, type ColRef, type ColSnap, type Data, type Db, type DocRef, type DocSnap } from '@flodia/api';
import { assistentTjansterFranMiljo, claudeFranMiljo } from './assistent-tjanster';
import { hanteraAssistent, type AssistentTjanster, type Claude, type SamtalPost, type StromAnrop, type StromHandelse } from './assistent';
import { STANDARD_TAK, hantera, type Tjanster } from './motor';
import { fotolasareFranMiljo } from './tjanster';
import { hanteraLegacy, type LegacyApp } from './legacy';

export const DEMO_KONTO = '00000000-0000-4000-8000-0000000000d0';
export const DEMO_ANVANDARE = '00000000-0000-4000-8000-0000000000d1';
export const DEMO_SLUG = 'demo';
const APPAR = ['avrakning', 'akarkassan', 'foliering'];

// ============ Dokumenten i minnet ============

type Lager = Map<string, Data>;
const nyckel = (modul: string, path: string) => `${modul}|${path}`;
const forelder = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
function frys<T>(o: T): T { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) frys(v); } return o; }

/** Samma gränssnitt som documents-API:t (packages/api), mot lagret i minnet. */
export function minnesDb(lager: Lager, modul: string): Db {
  const snap = (path: string): DocSnap => {
    const d = lager.get(nyckel(modul, path));
    const data = d === undefined ? undefined : frys(structuredClone(d));
    return { id: path.split('/').pop()!, exists: data !== undefined, data: () => data, ref: doc(path) };
  };
  const samling = (path: string): ColSnap => {
    const docs = [...lager.keys()].filter(k => k.startsWith(modul + '|') && forelder(k.slice(modul.length + 1)) === path).map(k => snap(k.slice(modul.length + 1))).sort((a, b) => a.id.localeCompare(b.id));
    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
  };
  function doc(p: string): DocRef {
    const path = normalisera(p);
    return {
      id: path.split('/').pop()!, path,
      get: async () => snap(path),
      set: async (v, opt) => { lager.set(nyckel(modul, path), structuredClone(opt?.merge ? { ...(lager.get(nyckel(modul, path)) ?? {}), ...v } : v)); },
      update: async v => { lager.set(nyckel(modul, path), structuredClone({ ...(lager.get(nyckel(modul, path)) ?? {}), ...v })); },
      delete: async () => { lager.delete(nyckel(modul, path)); },
      collection: c => col(path + '/' + c),
      onSnapshot: cb => { cb(snap(path)); return () => {}; },
    };
  }
  function col(p: string): ColRef {
    const path = normalisera(p, true);
    return {
      path,
      doc: id => doc((path ? path + '/' : '') + (id ?? Math.random().toString(36).slice(2, 10))),
      get: async () => samling(path),
      add: async v => { const d = doc((path ? path + '/' : '') + Math.random().toString(36).slice(2, 10)); await d.set(v); return d; },
      onSnapshot: cb => { cb(samling(path)); return () => {}; },
    };
  }
  return { doc, collection: col };
}

// ============ Påhittad data ============

const rader = [{ pid: 'sf-fram', text: 'Foliering stötfångare fram', antal: 1, apris: 4000 }, { text: 'Foliering extra', antal: 2, apris: 750 }];
function arende(id: string, reg: string, o: { status: string; nr?: number; fdatum?: string; forfall?: string; betald?: string; forsakring?: string }): Data {
  return {
    id, reg, skadenr: 'SK-' + id.toUpperCase(), forsakring: o.forsakring ?? 'f1', agare: 'Ägare ' + reg, bil: null, storlek: 'vanlig', skadedatum: '', notering: '', status: o.status,
    offert: { datum: '2026-09-15', giltigTom: '2026-10-15', rader, godkandAv: '' },
    faktura: o.nr ? { nr: o.nr, datum: o.fdatum ?? '2026-10-01', forfall: o.forfall ?? '2026-10-11', utfort: o.fdatum ?? '2026-10-01', rader, betald: !!o.betald, betaldDatum: o.betald ?? '', paminnelse: '' } : null,
    moms: null, logg: [{ d: '2026-09-15', t: 'Ärendet skapat' }], skapad: '2026-09-15',
  };
}

export function demoData(): Lager {
  const l: Lager = new Map();
  const satt = (modul: string, path: string, d: Data) => l.set(nyckel(modul, path), d);
  // Avräkning: bilar, åkerier och två månader räknade av motorn.
  satt('avrakning', 'settings/bolag', { list: [{ namn: 'Demoåkeriet 1 AB', orgnr: '559000-0001' }, { namn: 'Demoåkeriet 2 AB', orgnr: '559000-0002' }] });
  satt('avrakning', 'settings/bilar', { list: [{ bil: 101, avr: 'Demoåkeriet 1 AB' }, { bil: 102, avr: 'Demoåkeriet 1 AB' }, { bil: 103, avr: 'Demoåkeriet 2 AB' }, { bil: 104, avr: 'Demoåkeriet 2 AB' }] });
  satt('avrakning', 'settings/params', { provision: 12.5, kortavgift: 1.9, bro: 290 });
  const manad = (k: number, f: number): Data => ({
    summary: {
      kpi: { korningar: k, oms: Math.round(k * 312.5), kort: Math.round(k * 190), app: Math.round(k * 60) },
      bolag: [
        { namn: 'Demoåkeriet 1 AB', bilar: [101, 102], korningar: Math.round(k * 0.55), oms: Math.round(k * 0.55 * 312.5), utbetalning: Math.round(k * 0.55 * 312.5 * f) },
        { namn: 'Demoåkeriet 2 AB', bilar: [103, 104], korningar: Math.round(k * 0.45), oms: Math.round(k * 0.45 * 312.5), utbetalning: Math.round(k * 0.45 * 312.5 * f) },
      ],
      kund: [{ nr: 1001, namn: 'Demokund Sjukresor', korn: 120, belopp: 41200 }, { nr: 1002, namn: 'Demokund Skola', korn: 64, belopp: 18650 }],
      kontroll: [],
    },
    last: true,
  });
  satt('avrakning', 'months/2026-08', manad(1840, 0.82));
  satt('avrakning', 'months/2026-09', manad(1975, 0.81));
  // Verkstad: försäkringsbolag och ärenden i olika lägen.
  satt('foliering', 'forsakring/f1', { id: 'f1', namn: 'Demoförsäkring 1 AB', kort: 'D1', kontakt: '', epost: 'skador@example.se' });
  satt('foliering', 'forsakring/f2', { id: 'f2', namn: 'Demoförsäkring 2 AB', kort: 'D2', kontakt: '', epost: 'skada@example.com' });
  satt('foliering', 'arenden/a1', arende('a1', 'DEM101', { status: 'fakturerad', nr: 1041, fdatum: '2026-09-20', forfall: '2026-09-30' }));
  satt('foliering', 'arenden/a2', arende('a2', 'DEM202', { status: 'fakturerad', nr: 1042, fdatum: '2026-10-05', forfall: '2026-10-25', forsakring: 'f2' }));
  satt('foliering', 'arenden/a3', arende('a3', 'DEM303', { status: 'fakturerad', nr: 1040, fdatum: '2026-09-10', forfall: '2026-09-20', betald: '2026-09-18' }));
  satt('foliering', 'arenden/a4', arende('a4', 'DEM404', { status: 'skickad' }));
  satt('foliering', 'arenden/a5', arende('a5', 'DEM505', { status: 'utkast' }));
  return l;
}

// ============ Demoassistenten (utan AI-nyckel) ============

/** Väljer verktyg efter nyckelord och svarar med en kort text. Bara för att prova chatten och panelen. */
export function demoClaude(): Claude {
  const verktyg = (fraga: string): { name: string; input: Record<string, unknown> } | null => {
    const q = fraga.toLocaleLowerCase('sv');
    const app = /verkstad|ärende|faktur|offert/.test(q) ? 'foliering' : /lön|kassa/.test(q) ? 'akarkassan' : 'avrakning';
    if (/öppna|starta|gå till/.test(q)) return { name: 'oppna_app', input: { app, vy: null } };
    if (/hjälp|hur |vad betyder|var hittar/.test(q)) return { name: 'hjalp', input: { app } };
    if (/bil/.test(q)) return { name: 'hamta_data', input: { app: 'avrakning', typ: 'dokument', sokvag: 'settings/bilar', del: null } };
    if (/åker|bolag/.test(q) && app === 'avrakning') return { name: 'hamta_data', input: { app: 'avrakning', typ: 'dokument', sokvag: 'settings/bolag', del: null } };
    if (/avräkning|månad|september|augusti/.test(q) && app === 'avrakning') return { name: 'hamta_data', input: { app: 'avrakning', typ: 'dokument', sokvag: /augusti/.test(q) ? 'months/2026-08' : 'months/2026-09', del: 'summary' } };
    if (/betald|påminn/.test(q) && /1041|dem101/.test(q)) return { name: 'foresla_atgard', input: { namn: /påminn/.test(q) ? 'paminnelseNoterad' : 'betald', arende: 'a1', args: [], beskrivning: /påminn/.test(q) ? 'Påminnelse noteras för faktura 1041 (DEM101).' : 'Faktura 1041 (DEM101) markeras som betald.' } };
    if (app === 'foliering') return { name: 'berakna', input: { app: 'foliering', period: null } };
    if (/ärende/.test(q)) return { name: 'hamta_data', input: { app: 'foliering', typ: 'samling', sokvag: 'arenden', del: null } };
    return null;
  };
  const text = (t: string): StromHandelse[] => [
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...t.match(/.{1,24}/gs)!.map(d => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: d } })),
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
  ];
  return {
    modell: 'demo', insats: 'low',
    async *strom(anrop: StromAnrop) {
      const sista = anrop.messages.at(-1)!;
      const vantan = () => new Promise(r => setTimeout(r, 25));
      if (sista.content.some(b => b.type === 'tool_result')) {
        const fel = sista.content.find(b => b.is_error);
        const svar = fel ? `Det gick inte: ${String(fel.content)}` : 'Klart, du ser det i panelen till höger.\n\n*Demoläge: svaren är förinställda. Lägg in `ANTHROPIC_API_KEY` på servern för riktiga svar från Claude.*';
        for (const h of text(svar)) { await vantan(); yield h; }
        return;
      }
      const fraga = String(sista.content.find(b => b.type === 'text')?.text ?? '').replace(/^\[[^\]]*\]\n/, '');
      const v = verktyg(fraga);
      if (!v) {
        for (const h of text('Det här är en demo av assistenten. Prova till exempel "Vilka fakturor är obetalda?", "Visa septembers avräkning", "Vilka bilar finns?", "Markera faktura 1041 som betald" eller "Öppna Verkstad".')) { await vantan(); yield h; }
        return;
      }
      for (const h of text('Jag tittar på det.')) { await vantan(); yield h; }
      const json = JSON.stringify(v.input);
      yield { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_demo_' + Math.random().toString(36).slice(2), name: v.name, input: {} } };
      yield { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json } };
      yield { type: 'message_delta', delta: { stop_reason: 'tool_use' } };
    },
  };
}

// ============ Tjänsterna ============

export interface DemoMiljo { anthropic?: string; modell?: string; insats?: string; fotoModell?: string; legacy: boolean }

export function demo(m: DemoMiljo) {
  const lager = demoData();
  const samtal = new Map<string, SamtalPost & { andrad: string }>();
  const anvandning: { at: number; typ: string; modul: string }[] = [];
  const guidesteg = new Set<string>();
  const dbFor = new Map<string, Db>();
  const db = (modul: string) => { let d = dbFor.get(modul); if (!d) dbFor.set(modul, d = minnesDb(lager, modul)); return d; };

  const motor: Tjanster = {
    anvandare: async () => DEMO_ANVANDARE,
    roll: async (_t, _a, konto) => (konto === DEMO_KONTO ? 'admin' : null),
    intern: async () => m.legacy,
    funktion: async () => false,
    aiAnrop: async (_k, sedan) => anvandning.filter(x => x.typ === 'ai' && x.at >= Date.parse(sedan)).length,
    fotolasare: fotolasareFranMiljo({ anthropic: m.anthropic, fotoModell: m.fotoModell }),
    licens: async (_t, konto, modul) => konto === DEMO_KONTO && APPAR.includes(modul),
    anvandning: async () => ({ minut: anvandning.filter(x => x.at > Date.now() - 60_000).length, timme: anvandning.filter(x => x.at > Date.now() - 3_600_000).length }),
    tak: async () => STANDARD_TAK,
    takNatt: async () => {},
    registrera: async (_k, _a, modul, typ = 'motor') => { anvandning.push({ at: Date.now(), typ, modul }); if (anvandning.length > 10_000) anvandning.splice(0, 5000); },
    logga: async () => {},
    dokument: (_t, _k, modul) => db(modul),
    nu: () => Date.now(),
    slump: () => Math.random(),
  };
  const riktig = m.anthropic ? claudeFranMiljo({ anthropic: m.anthropic, modell: m.modell || 'claude-opus-5-5', insats: m.insats }) : null;
  const assistent: AssistentTjanster = {
    ...assistentTjansterFranMiljo({ url: 'http://demo.invalid', anon: 'demo', service: 'demo' }, motor),
    claude: riktig ?? demoClaude(),
    samtal: {
      hamta: async (_t, konto, id) => { const p = samtal.get(id); return p && p.konto === konto ? structuredClone(p) : null; },
      spara: async (_t, _a, p) => { samtal.set(p.id, { ...structuredClone(p), andrad: new Date().toISOString() }); },
      rensa: async (_t, fore) => { for (const [id, p] of samtal) if (p.andrad < fore) samtal.delete(id); },
    },
    kontonamn: async () => 'Demobolaget AB',
    fragor: async (_k, sedan) => anvandning.filter(x => x.modul === 'assistent' && x.at >= Date.parse(sedan)).length,
    perDag: async () => 500,
  };
  const konto = { id: DEMO_KONTO, name: 'Demobolaget AB', slug: DEMO_SLUG, type: 'main', brand: {}, intern: m.legacy };

  /** Svarar som PostgREST på det plattformen frågar efter. Filtren läses bara så långt demon behöver. */
  async function rest(req: Request, tabell: string, url: URL): Promise<Response> {
    const lika = (k: string) => url.searchParams.get(k)?.replace(/^eq\./, '') ?? null;
    const ett = req.headers.get('accept')?.includes('vnd.pgrst.object');
    const svar = (data: unknown, antal?: number) => {
      const huvud: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
      if (antal !== undefined) huvud['Content-Range'] = `0-${Math.max(antal - 1, 0)}/${antal}`;
      if (req.method === 'HEAD') return new Response(null, { status: 200, headers: huvud });
      return new Response(JSON.stringify(ett && Array.isArray(data) ? data[0] ?? null : data), { status: 200, headers: huvud });
    };
    switch (tabell) {
      case 'memberships': return svar([{ role: 'admin', tenant: konto }]);
      case 'tenants': return svar([{ ...konto, intern: m.legacy }]);
      case 'licenses': return svar(APPAR.map(module_key => ({ module_key, variant: 'main', status: 'aktiv', ended_at: null })));
      case 'konto_funktioner': return svar([]);
      case 'periods': case 'invites': return svar([], 0);
      case 'guide_progress': {
        const modul = lika('module_key') ?? '';
        if (req.method === 'POST') { const r = await req.json() as { module_key: string; step_key: string } | { module_key: string; step_key: string }[]; for (const x of [r].flat()) guidesteg.add(`${x.module_key}|${x.step_key}`); return svar([]); }
        if (req.method === 'DELETE') { guidesteg.delete(`${modul}|${lika('step_key')}`); return svar([]); }
        return svar([...guidesteg].filter(x => x.startsWith(modul + '|')).map(x => ({ step_key: x.split('|')[1] })));
      }
      case 'documents': {
        const modul = lika('module_key') ?? '', path = lika('path'), parent = url.searchParams.get('parent')?.replace(/^eq\./, '');
        if (path !== null) { const d = lager.get(nyckel(modul, path)); return svar(d === undefined ? [] : [{ data: d }]); }
        const p = parent ?? '';
        return svar([...lager.entries()].filter(([k]) => k.startsWith(modul + '|') && forelder(k.slice(modul.length + 1)) === p).map(([k, data]) => { const path = k.slice(modul.length + 1); return { path, doc_id: path.split('/').pop(), data }; }));
      }
      case 'assistent_samtal': {
        const id = lika('id');
        if (req.method === 'DELETE') { if (id) samtal.delete(id); return svar([]); }
        const lista = [...samtal.values()].sort((a, b) => b.andrad.localeCompare(a.andrad));
        if (id) { const p = samtal.get(id); return svar(p ? [{ id: p.id, titel: p.titel, andrad: p.andrad, visning: p.visning, paneler: p.paneler }] : []); }
        return svar(lista.map(p => ({ id: p.id, titel: p.titel, andrad: p.andrad })));
      }
    }
    return svar([]);
  }

  async function rpc(req: Request, namn: string): Promise<Response> {
    const a = await req.json() as { modul: string; sokvag: string; innehall?: Data; lage?: string };
    const k = nyckel(a.modul, normalisera(a.sokvag));
    if (namn === 'dok_skriv') lager.set(k, a.lage === 'sammanfoga' ? { ...(lager.get(k) ?? {}), ...a.innehall } : structuredClone(a.innehall ?? {}));
    else if (namn === 'dok_ta_bort') lager.delete(k);
    return new Response(namn === 'dok_skriv' ? '1' : 'null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  /** Allt under /_demo: REST, RPC och serverfunktionerna. */
  return async function hanteraDemo(req: Request, filer: Record<LegacyApp, string> | null): Promise<Response> {
    const url = new URL(req.url);
    const vag = url.pathname.replace(/^\/_demo/, '');
    if (vag === '/functions/v1/motor') return hantera(req, motor, { tillatnaUrsprung: [url.origin] });
    if (vag === '/functions/v1/assistent') return hanteraAssistent(req, assistent, { tillatnaUrsprung: [url.origin] });
    if (vag === '/functions/v1/legacy') {
      if (!m.legacy || !filer) return new Response(JSON.stringify({ fel: { kod: 'inte_internt', text: 'De nuvarande apparna är avstängda i demon.' } }), { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      return hanteraLegacy(req, motor, filer, { tillatnaUrsprung: [url.origin] });
    }
    const r = vag.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (r) return rpc(req, r[1]!);
    const t = vag.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (t) return rest(req, t[1]!, url);
    if (vag.startsWith('/auth/v1/')) return new Response(JSON.stringify({ id: DEMO_ANVANDARE }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ message: 'Finns inte i demon' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  };
}
