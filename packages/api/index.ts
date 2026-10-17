// Documents-API: samma gränssnitt som legacy/shared/claude-shim.js (doc, collection, get, set, update,
// delete, add, onSnapshot), men mot plattformens databas. Varje anrop gäller ett konto och en modul,
// och radsäkerheten i databasen avgör vad användaren får se och göra.
//
// Skillnader mot shimmen, som i claude.ai:s riktiga runtime:
// - data() ger fryst data (apparna klonar redan innan de ändrar).
// - Fel har code: 'not_granted' (ingen behörighet), 'invalid_argument' (ogiltig sökväg eller för stort
//   dokument) eller 'unavailable' (nätverk eller server).
// - onSnapshot ser ändringar från alla flikar och användare, inte bara den egna fliken.
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type Data = Record<string, unknown>;
export type FelKod = 'not_granted' | 'invalid_argument' | 'unavailable';

export class DbFel extends Error {
  readonly code: FelKod;
  constructor(code: FelKod, message: string) { super(message); this.name = 'DbFel'; this.code = code; }
}

export interface DocSnap { id: string; exists: boolean; data: () => Readonly<Data> | undefined; ref: DocRef }
export interface ColSnap { docs: DocSnap[]; size: number; empty: boolean; forEach: (f: (d: DocSnap) => void) => void }
export type Avsluta = () => void;
export interface DocRef {
  id: string; path: string;
  get(): Promise<DocSnap>;
  set(v: Data, opt?: { merge?: boolean }): Promise<void>;
  update(v: Data): Promise<void>;
  delete(): Promise<void>;
  collection(c: string): ColRef;
  onSnapshot(cb: (s: DocSnap) => void, err?: (e: DbFel) => void): Avsluta;
}
export interface ColRef {
  path: string;
  doc(id?: string): DocRef;
  get(): Promise<ColSnap>;
  add(v: Data): Promise<DocRef>;
  onSnapshot(cb: (s: ColSnap) => void, err?: (e: DbFel) => void): Avsluta;
}
export interface Db {
  doc(path: string): DocRef;
  collection(path: string): ColRef;
  /** Löses när livevisningen är ansluten (SUBSCRIBED), för tester och för en indikator i skärmen. Finns inte i shimmen. */
  redo?(): Promise<void>;
}

export interface DbVal {
  supabase: SupabaseClient;
  /** Kontots id (tenants.id). */
  konto: string;
  /** Modulens nyckel, till exempel avrakning eller foliering. */
  modul: string;
  /** Hur ofta allt läses om medan någon lyssnar (ms), standard OMLASNING_MS. Gäller från första Db på klienten. */
  omlasningMs?: number;
  /** Anropas vid varje omläsning, till exempel för "senast uppdaterad" i skärmen. */
  vidOmlasning?: () => void;
}

/** Samma regel som i databasen: allt utom snedstreck, blanksteg och styrtecken. */
const SEGMENT = /^[^/\s\p{Cc}]+$/u;

/**
 * Sökvägen som databasen lagrar. Kassans "data/users/<uid>/" tas bort: kontot är nyckeln (spec v3 s. 9).
 * En samling kan vara tom (toppnivån), till exempel kassans collection('data/users/' + uid).
 */
export function normalisera(p: string, samling = false): string {
  // NFC som i databasen: "å" skrivet som a plus ring blir samma sökväg som "å".
  let path = String(p).normalize('NFC').replace(/^\/+|\/+$/g, '');
  const m = path.match(/^data\/users\/[^/]+(?:\/(.*))?$/);
  if (m) path = m[1] ?? '';
  if (!path && samling) return '';
  const delar = path.split('/');
  if (!path || path.length > 512 || delar.some(d => !SEGMENT.test(d) || d === '.' || d === '..'))
    throw new DbFel('invalid_argument', `Ogiltig sökväg: ${p}`);
  return path;
}

function frys<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) frys(v); }
  return o;
}

/** Felet från databasen som DbFel. */
function fel(e: { code?: string; message?: string } | null | undefined): DbFel {
  const kod = e?.code ?? '';
  if (kod === '42501' || kod === 'PGRST301' || kod === '401' || /permission denied|row-level security|behörighet/i.test(e?.message ?? '')) return new DbFel('not_granted', 'Ingen behörighet');
  if (/^(22|23)/.test(kod)) return new DbFel('invalid_argument', e?.message ?? 'Ogiltigt värde');
  return new DbFel('unavailable', e?.message ?? 'Databasen svarar inte');
}

const klona = (v: Data): Data => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new DbFel('invalid_argument', 'Ett dokument ska vara ett objekt');
  return JSON.parse(JSON.stringify(v)) as Data;
};
const slumpId = () => Math.random().toString(36).slice(2, 12);
/** Kör hämtningarna i tur och ordning, så att ett äldre svar aldrig kommer efter ett nyare. */
function iTur(fn: () => Promise<void>): () => Promise<void> {
  let ko = Promise.resolve();
  return () => (ko = ko.then(fn));
}

interface Lyssnare { typ: 'doc' | 'col'; path: string; ny: () => Promise<void>; err?: (e: DbFel) => void }

/**
 * En privat kanal per klient och ämne (dok:<konto>:<modul>), öppen så länge någon lyssnar.
 * supabase.channel() ger tillbaka en befintlig kanal med samma ämne, även en som håller på att stängas,
 * så en ny kanal öppnas först när den gamla är helt stängd.
 */
interface Nav {
  lyssnare: Set<Lyssnare>; oppna: () => Promise<void>; stangOmTom: () => void; redo: () => Promise<void>;
  /** En ändring i dokumentet path (i samlingen parent): de lyssnare som berörs läser om. */
  andrat: (path: string, parent: string) => void;
}
/**
 * Hur ofta allt läses om medan någon lyssnar (ms). Säkerhetsnät om en händelse från Realtime tappas
 * (det hände en gång i CI strax efter att Realtime startat). Egna ändringar syns direkt utan Realtime.
 * Omläsningen är vanliga läsningar med användarens rättigheter, aldrig anrop till serverfunktionen motor,
 * så den räknas inte mot taket. Den pausas när fliken är dold och läser om direkt när fliken syns igen.
 */
export const OMLASNING_MS = 30_000;

/** Webbläsarens document, om det finns (inte i Node och Deno). */
const dokument = (): (EventTarget & { visibilityState?: string }) | undefined => (globalThis as { document?: EventTarget & { visibilityState?: string } }).document;
const synlig = () => dokument()?.visibilityState !== 'hidden';
const NAV = new WeakMap<SupabaseClient, Map<string, Nav>>();

function navFor(supabase: SupabaseClient, amne: string, val: { omlasningMs?: number; vidOmlasning?: () => void } = {}): Nav {
  let karta = NAV.get(supabase);
  if (!karta) NAV.set(supabase, karta = new Map());
  const finns = karta.get(amne);
  if (finns) return finns;
  const lyssnare = new Set<Lyssnare>();
  let kanal: RealtimeChannel | null = null, stangs: Promise<unknown> | null = null, oppnar = false, ansluten = false;
  let vantar: { ok: () => void; nej: (e: DbFel) => void }[] = [];
  let omlasning: ReturnType<typeof setInterval> | null = null;
  const andrat = (path: string, parent: string) => {
    for (const l of lyssnare) if ((l.typ === 'doc' && l.path === path) || (l.typ === 'col' && l.path === parent)) void l.ny();
  };
  const lasOm = () => { val.vidOmlasning?.(); for (const l of lyssnare) void l.ny(); };
  const startaOmlasning = () => { if (!omlasning && lyssnare.size && synlig()) omlasning = setInterval(lasOm, val.omlasningMs ?? OMLASNING_MS); };
  const stoppaOmlasning = () => { if (omlasning) { clearInterval(omlasning); omlasning = null; } };
  const synlighet = () => { if (synlig()) { lasOm(); startaOmlasning(); } else stoppaOmlasning(); };
  let lyssnarPaSynlighet = false;
  const nav: Nav = {
    lyssnare,
    andrat,
    redo: () => (ansluten ? Promise.resolve() : new Promise((ok, nej) => { vantar.push({ ok, nej }); })),
    async oppna() {
      if (kanal || oppnar) return;
      oppnar = true;
      try { if (stangs) await stangs; } finally { oppnar = false; }
      if (kanal || !lyssnare.size) return;
      startaOmlasning();
      if (!lyssnarPaSynlighet) { dokument()?.addEventListener('visibilitychange', synlighet); lyssnarPaSynlighet = true; }
      kanal = supabase.channel(amne, { config: { private: true } })
        .on('broadcast', { event: 'dok' }, ({ payload }) => { const p = payload as { path: string; parent: string }; andrat(p.path, p.parent); })
        .subscribe((status, e) => {
          ansluten = status === 'SUBSCRIBED';
          // Efter anslutning läses allt en gång till, så att inget som ändrats under tiden missas.
          if (status === 'SUBSCRIBED') { for (const l of lyssnare) void l.ny(); for (const w of vantar) w.ok(); vantar = []; }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            const f = () => new DbFel(/unauthorized|denied|behörighet/i.test(e?.message ?? '') ? 'not_granted' : 'unavailable', e?.message ?? 'Livevisningen avbröts');
            for (const l of lyssnare) l.err?.(f());
            for (const w of vantar) w.nej(f());
            vantar = [];
          }
        });
    },
    stangOmTom() {
      if (lyssnare.size || !kanal) return;
      stoppaOmlasning();
      if (lyssnarPaSynlighet) { dokument()?.removeEventListener('visibilitychange', synlighet); lyssnarPaSynlighet = false; }
      const k = kanal; kanal = null; ansluten = false;
      stangs = supabase.removeChannel(k).finally(() => { stangs = null; if (lyssnare.size) void nav.oppna(); });
    },
  };
  karta.set(amne, nav);
  return nav;
}

export function skapaDb({ supabase, konto, modul, omlasningMs, vidOmlasning }: DbVal): Db {
  const nyckel = { tenant_id: konto, module_key: modul };

  function snap(path: string, data: Data | undefined): DocSnap {
    const d = data === undefined ? undefined : frys(data);
    return { id: path.split('/').pop()!, exists: d !== undefined, data: () => d, ref: docRef(path) };
  }
  async function hamtaDoc(path: string): Promise<DocSnap> {
    const { data, error } = await supabase.from('documents').select('data').match({ ...nyckel, path }).maybeSingle();
    if (error) throw fel(error);
    return snap(path, data?.data as Data | undefined);
  }
  async function hamtaSamling(path: string): Promise<ColSnap> {
    const { data, error } = await supabase.from('documents').select('path, doc_id, data').match({ ...nyckel, parent: path });
    if (error) throw fel(error);
    const docs = (data ?? []).map(r => snap(r.path as string, r.data as Data)).sort((a, b) => a.id.localeCompare(b.id));
    return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
  }
  /** Samlingen som dokumentet ligger i ('' på toppnivå), som kolumnen parent i databasen. */
  const samlingFor = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
  async function skriv(path: string, v: Data, lage: 'ersatt' | 'sammanfoga') {
    const { error } = await supabase.rpc('dok_skriv', { konto, modul, sokvag: path, innehall: klona(v), lage });
    if (error) throw fel(error);
    // Egna ändringar syns direkt för lyssnarna på samma klient, som i shimmen. Andras kommer via Realtime.
    nav.andrat(path, samlingFor(path));
  }

  /** Händelserna för kontot och modulen. Kanalen delas av alla Db på samma klient (navFor). */
  const nav = navFor(supabase, `dok:${konto}:${modul}`, { omlasningMs, vidOmlasning });
  foljToken(supabase);
  function lyssna(l: Lyssnare): Avsluta {
    nav.lyssnare.add(l);
    void l.ny();
    void nav.oppna();
    return () => { nav.lyssnare.delete(l); nav.stangOmTom(); };
  }

  function docRef(p: string): DocRef {
    const path = normalisera(p);
    return {
      id: path.split('/').pop()!, path,
      get: () => hamtaDoc(path),
      set: (v, opt) => skriv(path, v, opt?.merge ? 'sammanfoga' : 'ersatt'),
      update: v => skriv(path, v, 'sammanfoga'),
      async delete() {
        const { error } = await supabase.rpc('dok_ta_bort', { konto, modul, sokvag: path });
        if (error) throw fel(error);
        nav.andrat(path, samlingFor(path));
      },
      collection: c => colRef(path + '/' + c),
      onSnapshot(cb, err) {
        let senast = '';
        return lyssna({ typ: 'doc', path, err, ny: iTur(async () => {
          try { const s = await hamtaDoc(path); const k = JSON.stringify(s.data() ?? null); if (k !== senast) { senast = k; cb(s); } }
          catch (e) { err?.(e as DbFel); }
        }) });
      },
    };
  }
  function colRef(p: string): ColRef {
    const path = normalisera(p, true);
    return {
      path,
      doc: id => docRef((path ? path + '/' : '') + (id || slumpId())),
      get: () => hamtaSamling(path),
      async add(v) { const r = docRef((path ? path + '/' : '') + slumpId()); await r.set(v); return r; },
      onSnapshot(cb, err) {
        let senast = '';
        return lyssna({ typ: 'col', path, err, ny: iTur(async () => {
          try { const s = await hamtaSamling(path); const k = JSON.stringify(s.docs.map(d => [d.id, d.data()])); if (k !== senast) { senast = k; cb(s); } }
          catch (e) { err?.(e as DbFel); }
        }) });
      },
    };
  }

  return { doc: docRef, collection: colRef, redo: () => nav.redo() };
}

/**
 * Realtime får den nya token vid varje förnyelse (TOKEN_REFRESHED) och inloggning. supabase-js gör det
 * också själv, men livevisningen ska inte hänga på bibliotekets inre: servern stänger en kanal när
 * token går ut. Klienter som skapats med accessToken har ingen auth och sköter token själva.
 */
const FOLJER = new WeakSet<SupabaseClient>();
function foljToken(supabase: SupabaseClient) {
  if (FOLJER.has(supabase)) return;
  FOLJER.add(supabase);
  try {
    supabase.auth.onAuthStateChange((handelse, session) => {
      if ((handelse === 'TOKEN_REFRESHED' || handelse === 'SIGNED_IN') && session) void supabase.realtime.setAuth(session.access_token);
    });
  } catch {
    // Klienten är skapad med accessToken: ingen auth, token kommer från den funktionen.
  }
}

/** Samma som window.claude.use i claude.ai och i shimmen: db, downloads och user. */
export function skapaClaude(val: DbVal & { anvandare: { id: string; namn: string } }) {
  const db = skapaDb(val);
  const user = { id: async () => val.anvandare.id, name: async () => val.anvandare.namn, profile: async () => ({ id: val.anvandare.id, name: val.anvandare.namn }) };
  const downloads = {
    async save({ filename, data, mimeType }: { filename?: string; data: string | Uint8Array | Blob; mimeType?: string }) {
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mimeType || 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = filename || 'fil';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return { ok: true };
    },
  };
  const caps: Record<string, unknown> = { db, downloads, user };
  return { use: async (name: string) => (name in caps ? caps[name] : null) };
}

/** Fel från serverfunktionen motor, med kod och svensk text (packages/server/motor.ts). */
export class MotorSvarFel extends Error {
  constructor(readonly kod: string, text: string, readonly status: number) { super(text); this.name = 'MotorSvarFel'; }
}

/**
 * Anropar serverfunktionen motor: tolka filer, räkna och utföra åtgärder. Motorerna körs bara där (beslut 26).
 * Funktionen körs i Stockholm (eu-north-1), så att kundens data stannar i Sverige under beräkningen.
 */
export async function anropaMotor<T = unknown>(supabase: SupabaseClient, anrop: { konto: string; modul: string; operation: 'tolka' | 'berakna' | 'atgard' | 'fotolasning'; data?: unknown }): Promise<T> {
  const { data, error } = await supabase.functions.invoke('motor', { body: anrop, headers: { 'x-region': 'eu-north-1' } });
  if (error) {
    const svar = (error as { context?: Response }).context;
    const kropp = svar ? await svar.json().catch(() => null) as { fel?: { kod?: string; text?: string } } | null : null;
    throw new MotorSvarFel(kropp?.fel?.kod ?? 'serverfel', kropp?.fel?.text ?? 'Servern svarar inte. Försök igen om en stund.', svar?.status ?? 0);
  }
  return (data as { resultat: T }).resultat;
}
export { FOTOLASNING, KLAD_STATUS, PLAGG, type FotoAnrop, type FotoLast, type FotoMediaTyp, type FotoTillagt, type GranskadRad, type KladRad, type KladStatus, type Plagg } from './fotolasning';
export { EU_INGEST, arEuDsn, sentryVal, startaFellogg, tvattaHandelse, tvattaText, type Fellogg, type SentrySdk } from './fellogg';
export { FORSLAG, type AssistentAnrop, type AssistentHandelse, type Atgardsforslag, type Beslut, type ChattMeddelande, type Del, type Kolumn, type Panel, type SamtalRad, type SparatSamtal, type VerktygRad } from './assistent';
