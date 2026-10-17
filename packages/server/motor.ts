// Serverfunktionen motor (beslut 26): parsrar, motorer och regler körs bara här, aldrig i webbläsaren.
// Anrop: POST { konto, modul, operation, data } med användarens token. Svar: { resultat } eller { fel: { kod, text } }.
// Allt som läses och skrivs i databasen går med användarens egna rättigheter, så radsäkerheten gäller.
import { DbFel, FOTOLASNING, type Db } from '@flodia/api';
import { AtgardsFel } from '@flodia/core/foliering';
import { franStockholm, stockholmDatum } from '@flodia/core/tid';
import { MotorFel } from './fel';
import { fotolasning, type Fotolasare } from './fotolasning';
import { MODULER, type Kontext, type Modul, type Roll } from './moduler';

export { MotorFel };

export type Operation = 'tolka' | 'berakna' | 'atgard' | 'fotolasning';

/** Det motor behöver av omvärlden. I drift Supabase (tjanster.ts), i testerna påhittat. */
export interface Tjanster {
  /** Användarens id för token, eller null om token inte gäller. */
  anvandare(token: string): Promise<string | null>;
  /** Användarens roll i kontot (läst med användarens rättigheter), eller null. */
  roll(token: string, anvandare: string, konto: string): Promise<Roll | null>;
  /** Är kontot internt (tenants.intern)? Bara interna konton får legacy-bryggan. */
  intern(token: string, konto: string): Promise<boolean>;
  /** Är funktionen (paket eller tillval) påslagen i kontot? Läst med användarens rättigheter. */
  funktion(token: string, konto: string, nyckel: string): Promise<boolean>;
  /** Antal AI-anrop (usage med typen ai) i kontot sedan tidpunkten. */
  aiAnrop(konto: string, sedan: string): Promise<number>;
  /** Anthropic från servern, eller null om nyckeln eller modellen saknas i konfigurationen. */
  fotolasare: Fotolasare | null;
  /** Har kontot aktiv licens för modulen? */
  licens(token: string, konto: string, modul: string): Promise<boolean>;
  /** Antal anrop den senaste minuten (användaren) och timmen (kontot). */
  anvandning(konto: string, anvandare: string): Promise<{ minut: number; timme: number }>;
  /** Kontots tak ur tabellen tak (eget eller standard), eller null om ingen rad finns. */
  tak(konto: string): Promise<Tak | null>;
  /** Taket har nåtts: händelse i granskningsloggen (en per användare och minut). */
  takNatt(konto: string, anvandare: string, detalj: Record<string, unknown>): Promise<void>;
  /** Registrerar anropet för fakturaunderlag och tak. */
  registrera(konto: string, anvandare: string, modul: string, typ?: 'motor' | 'ai'): Promise<void>;
  /** Händelse i granskningsloggen, med användarens rättigheter. */
  logga(token: string, konto: string, handelse: string, mal: string | null, detalj: Record<string, unknown>): Promise<void>;
  /** Dokumenten i kontot och modulen, med användarens rättigheter. */
  dokument(token: string, konto: string, modul: string): Db;
  /** Klockan (ms). */
  nu(): number;
  /** Slumptal 0 till 1, för id. */
  slump(): number;
}

export interface Tak { perAnvandareMinut: number; perKontoTimme: number; /** Fotoläsningar per konto och dag (svensk tid). */ fotoPerDag?: number }
/**
 * Tak för anrop (SPEC-v3.1 16.1.4, ägarens beslut efter 2d). Gränserna läses ur tabellen tak per konto.
 * Det här används bara om tabellen saknar rad, vilket inte ska hända (migrationen lägger in standarden).
 */
export const STANDARD_TAK: Required<Tak> = { perAnvandareMinut: 60, perKontoTimme: 3000, fotoPerDag: 20 };
export const MAX_STORLEK = 10 * 1024 * 1024;

const ROLLER_FOR: Record<Operation, Roll[]> = {
  tolka: ['admin', 'ekonomi'],
  berakna: ['admin', 'ekonomi', 'las'],
  atgard: ['admin', 'ekonomi'],
  fotolasning: ['admin', 'ekonomi'],
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Kontrollerar anropet och kör operationen. Kastar MotorFel. */
export async function kor(token: string | null, kropp: unknown, t: Tjanster): Promise<unknown> {
  if (!token) throw new MotorFel(401, 'ej_inloggad', 'Logga in igen.');
  const anvandare = await t.anvandare(token);
  if (!anvandare) throw new MotorFel(401, 'ej_inloggad', 'Logga in igen.');

  const k = (kropp ?? {}) as { konto?: unknown; modul?: unknown; operation?: unknown; data?: unknown };
  if (typeof k.konto !== 'string' || !UUID.test(k.konto)) throw new MotorFel(400, 'ogiltigt', 'Kontot saknas.');
  if (typeof k.modul !== 'string' || !(k.modul in MODULER)) throw new MotorFel(400, 'ogiltigt', 'Okänd modul.');
  if (k.operation !== 'tolka' && k.operation !== 'berakna' && k.operation !== 'atgard' && k.operation !== 'fotolasning') throw new MotorFel(400, 'ogiltigt', 'Okänd operation.');
  const { konto, modul, operation } = k as { konto: string; modul: keyof typeof MODULER; operation: Operation };
  const m: Modul = MODULER[modul];

  const roll = await t.roll(token, anvandare, konto);
  // Känsliga moduler (kassorna: personnummer, bankkonton, löner): läs-rollen har ingen åtkomst alls.
  const tillatna = m.kanslig ? ROLLER_FOR[operation].filter(x => x !== 'las') : ROLLER_FOR[operation];
  if (!roll || !tillatna.includes(roll)) throw new MotorFel(403, 'ingen_behorighet', 'Du har inte behörighet till det här.');
  if (!(await t.licens(token, konto, modul))) throw new MotorFel(403, 'ingen_licens', 'Kontot har inte appen.');
  // Fotoläsningen är av tills ägaren slår på den för kontot (docs/fotolasning.md). Spärren gäller före allt annat.
  const foto = operation === 'fotolasning';
  if (foto && modul !== 'avrakning') throw new MotorFel(400, 'ogiltigt', 'Fotoläsningen finns bara i Avräkning.');
  if (foto && !(await t.funktion(token, konto, FOTOLASNING))) throw new MotorFel(403, 'ingen_funktion', 'Fotoläsningen är inte påslagen för kontot.');

  const [{ minut, timme }, tak] = await Promise.all([t.anvandning(konto, anvandare), t.tak(konto)]);
  const g = tak ?? STANDARD_TAK;
  if (minut >= g.perAnvandareMinut || timme >= g.perKontoTimme) {
    await t.takNatt(konto, anvandare, { modul, operation, minut, timme, perAnvandareMinut: g.perAnvandareMinut, perKontoTimme: g.perKontoTimme });
    throw new MotorFel(429, 'for_manga', minut >= g.perAnvandareMinut ? 'För många anrop. Vänta en minut och försök igen.' : 'Kontot har gjort för många anrop den senaste timmen. Försök igen senare.');
  }
  // Taket för fotoläsningar per konto och dag. Bara läsningen anropar Anthropic och räknas som ett AI-anrop.
  const ms = t.nu();
  const ai = foto && (k.data as { steg?: unknown } | null)?.steg === 'las';
  if (ai) {
    const perDag = g.fotoPerDag ?? STANDARD_TAK.fotoPerDag;
    const idag = await t.aiAnrop(konto, stockholmsMidnatt(ms));
    if (idag >= perDag) {
      await t.takNatt(konto, anvandare, { modul, operation, fotoIdag: idag, fotoPerDag: perDag });
      throw new MotorFel(429, 'for_manga', 'Kontot har nått taket för fotoläsningar i dag. Försök igen i morgon.');
    }
  }
  await t.registrera(konto, anvandare, modul, ai ? 'ai' : 'motor');

  const ctx: Kontext = {
    db: () => t.dokument(token, konto, modul),
    tid: { idag: stockholmDatum(ms), nu: new Date(ms).toISOString(), nuMs: ms, slump: t.slump },
    logga: (handelse, mal, detalj = {}) => t.logga(token, konto, handelse, mal, detalj),
  };
  try {
    switch (operation) {
      case 'tolka': return m.tolka(k.data, ctx);
      case 'berakna': return await m.berakna(k.data, ctx);
      case 'fotolasning': return await fotolasning(k.data, ctx, t.fotolasare);
      case 'atgard': {
        if (!m.atgard) throw new MotorFel(400, 'ogiltigt', 'Appen har inga åtgärder på servern.');
        return await m.atgard(k.data, ctx);
      }
    }
  } catch (e) {
    if (e instanceof MotorFel) throw e;
    if (e instanceof AtgardsFel) throw new MotorFel(e.kod === 'saknas' ? 404 : e.kod === 'ogiltigt' ? 400 : 409, e.kod, e.message);
    if (e instanceof DbFel) throw e.code === 'not_granted' ? new MotorFel(403, 'ingen_behorighet', 'Du har inte behörighet till det här.') : e.code === 'invalid_argument' ? new MotorFel(400, 'ogiltigt', e.message) : e;
    throw e;
  }
}

/** Midnatt i svensk tid för dagen ms ligger i, som ISO-tid (UTC). */
export function stockholmsMidnatt(ms: number): string {
  const [a, m, d] = stockholmDatum(ms).split('-').map(Number);
  return franStockholm(a!, m!, d!).toISOString();
}

const CORS_STANDARD = ['http://127.0.0.1:5173', 'http://localhost:5173'];

function cors(origin: string | null, tillatna: string[]): Record<string, string> {
  return origin && tillatna.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-region', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin' }
    : { Vary: 'Origin' };
}

/** HTTP runt kor: läser anropet, svarar med JSON. Interna fel visas aldrig för klienten. */
export async function hantera(req: Request, t: Tjanster, opt: { tillatnaUrsprung?: string[]; logg?: (e: unknown) => void } = {}): Promise<Response> {
  const huvud = { 'Content-Type': 'application/json; charset=utf-8', ...cors(req.headers.get('origin'), opt.tillatnaUrsprung ?? CORS_STANDARD) };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: huvud });
  const svar = (status: number, kropp: unknown) => new Response(JSON.stringify(kropp, (_k, v) => (v instanceof ArrayBuffer ? { base64: base64(new Uint8Array(v)) } : v)), { status, headers: huvud });
  if (req.method !== 'POST') return svar(405, { fel: { kod: 'ogiltigt', text: 'Bara POST.' } });
  try {
    const langd = Number(req.headers.get('content-length') ?? 0);
    if (langd > MAX_STORLEK) throw new MotorFel(413, 'for_stor', 'Filen är för stor.');
    const text = await req.text();
    if (text.length > MAX_STORLEK) throw new MotorFel(413, 'for_stor', 'Filen är för stor.');
    let kropp: unknown;
    try { kropp = JSON.parse(text); } catch { throw new MotorFel(400, 'ogiltigt', 'Anropet kunde inte läsas.'); }
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
    return svar(200, { resultat: await kor(token, kropp, t) });
  } catch (e) {
    if (e instanceof MotorFel) return svar(e.status, { fel: { kod: e.kod, text: e.message } });
    (opt.logg ?? console.error)(e);
    return svar(500, { fel: { kod: 'serverfel', text: 'Något gick fel på servern. Försök igen om en stund.' } });
  }
}

function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
