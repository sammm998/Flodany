// Hjälpfunktioner från ENG i legacy/apps/akarkassan och tripkassan, oförändrade.
// Tider tolkas och skrivs i svensk tid (Europe/Stockholm) via ../tid, oberoende av datorns tidszon (fas 2).
import { franStockholm, isoVecka, stockholmDatum, stockholmKlockslag } from '../tid';

export const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;
export const pad = (n: number): string => String(n).padStart(2, '0');
export const normReg = (s: unknown): string => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const toDate = (s: unknown): Date | null => { const m = String(s).match(/(\d{4})-(\d\d)-(\d\d)[ T]+(\d\d):(\d\d)(?::(\d\d))?/); return m ? franStockholm(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] || 0)) : null; };
export const dstr = (d: Date): string => stockholmDatum(d);
export const tstr = (d: Date): string => stockholmKlockslag(d);
export const isoWeek = (d: Date): number => isoVecka(stockholmDatum(d));

/** Läser en textfil som UTF-8, annars Windows-1252 (Megtax). */
export function decode(buf: ArrayBuffer | Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
