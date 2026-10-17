// Vad varje modul kan göra på servern: tolka filer, räkna och (Verkstad) utföra åtgärder.
// Webbläsaren läser filen med pdf.js eller SheetJS och skickar bara texten eller raderna hit (SPEC-v3.1 16.1.1).
import type { Db } from '@flodia/api';
import { valjParser, type FileInput, type FileParser } from '@flodia/kit';
import * as avr from '@flodia/core/avrakning';
import * as lon from '@flodia/core/lon';
import * as fol from '@flodia/core/foliering';
import { MotorFel } from './fel';

export type Roll = 'admin' | 'ekonomi' | 'las';

export interface Kontext {
  /** Dokumenten i kontot och modulen, med användarens rättigheter. */
  db: () => Db;
  /** Tiden räknas på servern i svensk tid. Klienten skickar aldrig tid. */
  tid: fol.Tid;
  logga: (handelse: string, mal: string | null, detalj?: Record<string, unknown>) => Promise<void>;
}

export interface Modul {
  /** Personuppgifter om anställda (lön). Läs-rollen har ingen åtkomst, som modules.kanslig i databasen. */
  kanslig?: boolean;
  parsrar: FileParser<unknown>[];
  tolka: (data: unknown, ctx: Kontext) => unknown;
  berakna: (data: unknown, ctx: Kontext) => unknown;
  atgard?: (data: unknown, ctx: Kontext) => Promise<unknown>;
}

const objekt = (x: unknown, namn: string): Record<string, unknown> => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) throw new MotorFel(400, 'ogiltigt', `${namn} saknas.`);
  return x as Record<string, unknown>;
};

/** Filigenkänning och tolkning. Under 0,6 i säkerhet frågar skärmen vilken fil det skulle vara (spec v3 s. 11). */
function tolkaMed(parsrar: FileParser<unknown>[]) {
  return (data: unknown) => {
    const d = objekt(data, 'Filen');
    const fil = objekt(d.fil, 'Filen') as unknown as FileInput;
    if (typeof fil.name !== 'string' || typeof fil.kind !== 'string') throw new MotorFel(400, 'ogiltigt', 'Filen saknar namn eller typ.');
    const p = typeof d.parser === 'string' ? parsrar.find(x => x.key === d.parser) ?? null : valjParser(parsrar, fil);
    if (!p) throw new MotorFel(422, 'okand_fil', 'Filen kändes inte igen. Vilken fil skulle det vara?');
    return { parser: p.key, etikett: p.label, ...p.parse(fil, d.kontext as never) };
  };
}

const LON_PARSRAR = [lon.ldlParser, lon.broParser, lon.sturupParser, lon.avrakningParser, lon.skattetabellParser] as FileParser<unknown>[];

/** Lönens tillstånd byggs på servern från filernas text, som i appen (parsrarna körs här). */
function lonBerakna(variant: 'akarkassan' | 'tripkassan') {
  return (data: unknown, ctx: Kontext) => {
    const d = objekt(data, 'Underlaget');
    const rader = (x: unknown) => (Array.isArray(x) ? x.map(String) : typeof x === 'string' ? x.split(/\r?\n/) : []);
    const S = {
      settings: objekt(d.settings ?? {}, 'Inställningarna'), period: (d.period as string | null) ?? null, month: objekt(d.month ?? {}, 'Månaden'),
      shifts: lon.parseLDL(String(d.ldl ?? '')).shifts,
      passages: { bro: lon.parseBro(rader(d.bro)).rows, stu: lon.parseSturup(rader(d.sturup)).rows },
      skatt: (d.skatt as lon.LonState['skatt']) ?? null, demo: !!d.demo, ...(d.skattAr !== undefined ? { skattAr: d.skattAr as number } : {}),
    } as unknown as lon.LonState;
    return lon.lonEngine.compute(S, { variant, idag: ctx.tid.idag });
  };
}

/** Verkstadens tillstånd ur dokumenten, som legacy läser dem (boot i legacy/apps/foliering). */
export async function lasFolieringState(db: Db): Promise<fol.FolieringState> {
  const samling = async (namn: string, medId: boolean) => new Map((await db.collection(namn).get()).docs.map(d => [d.id, (medId ? { ...structuredClone(d.data()), id: d.id } : structuredClone(d.data())) as never]));
  const inst = Object.fromEntries((await db.collection('installningar').get()).docs.map(d => [d.id, structuredClone(d.data())]));
  return {
    arenden: await samling('arenden', true), fordon: await samling('fordon', true), forsakring: await samling('forsakring', true),
    kostnader: await samling('kostnader', true), bokforing: await samling('bokforing', true), inst,
  } as fol.FolieringState;
}

/** Åtgärder som inte gäller ett ärende. Övriga får ärendets id i data.arende. */
const UTAN_ARENDE = new Set(['nyttArende', 'manuellVerifikation', 'exporteraPeriod']);

async function folieringAtgard(data: unknown, ctx: Kontext) {
  const d = objekt(data, 'Åtgärden');
  const namn = String(d.namn ?? '');
  const args = Array.isArray(d.args) ? d.args : [];
  const db = ctx.db();
  const S = await lasFolieringState(db);
  const A = fol.foliering(S, ctx.tid).atgarder as unknown as Record<string, (...a: unknown[]) => fol.Utfall>;
  if (!Object.hasOwn(fol.FORKRAV, namn) || typeof A[namn] !== 'function') throw new MotorFel(400, 'ogiltigt', 'Okänd åtgärd.');
  const forsta = UTAN_ARENDE.has(namn) ? [] : [S.arenden.get(String(d.arende ?? ''))];
  const u = A[namn]!(...forsta, ...args);
  for (const [path, obj] of u.spara) await db.doc(path).set(obj as Record<string, unknown>);
  for (const path of u.taBort ?? []) await db.doc(path).delete();
  await ctx.logga('atgard.' + namn, UTAN_ARENDE.has(namn) ? (u.spara[0]?.[0] ?? null) : 'arenden/' + String(d.arende), {});
  return { meddelanden: u.meddelanden, filer: u.filer, sparat: u.spara.map(s => s[0]), borttaget: u.taBort ?? [] };
}

async function folieringBerakna(data: unknown, ctx: Kontext) {
  const d = (data ?? {}) as { period?: unknown };
  const period = typeof d.period === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(d.period) ? d.period : undefined;
  const S = await lasFolieringState(ctx.db());
  return fol.folieringEngine.compute({ S, period }, ctx.tid);
}

export const MODULER = {
  avrakning: {
    parsrar: avr.parsrar,
    tolka: tolkaMed(avr.parsrar),
    berakna: (data: unknown) => { const d = objekt(data, 'Underlaget'); return avr.avrakningEngine.compute(objekt(d.indata, 'Indata') as never, objekt(d.installningar, 'Inställningarna') as never); },
  },
  akarkassan: { kanslig: true, parsrar: LON_PARSRAR, tolka: tolkaMed(LON_PARSRAR), berakna: lonBerakna('akarkassan') },
  tripkassan: { kanslig: true, parsrar: LON_PARSRAR, tolka: tolkaMed(LON_PARSRAR), berakna: lonBerakna('tripkassan') },
  foliering: { parsrar: [], tolka: tolkaMed([]), berakna: folieringBerakna, atgard: folieringAtgard },
} satisfies Record<string, Modul>;
