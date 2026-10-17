// Skatt och arbetsgivaravgift från ENG i legacy. Två ändringar mot legacy, båda utan ändrat resultat:
// 1. Satser och åldersgränser kommer från LonRegler (regler.ts) i stället för att stå i koden.
// 2. Dagens år skickas in (idagAr) i stället för att läsas från klockan.
import { r2 } from './hjalp';
import { reglerFor, type LonRegler } from './regler';
import type { Skattetabell } from './types';

export function tabellSkatt(t: Skattetabell | null | undefined, kol: number, brutto: number): number {
  if (!t || brutto <= 0) return 0; const k = Math.min(6, Math.max(1, kol || 1)); const b = Math.floor(brutto);
  if (t.B.length && b <= t.B[t.B.length - 1]![0]!) { const r = t.B.find(r => b <= r[0]!); return r ? r[k]! : 0; }
  const r = t.P.find(r => r[0] === 0 || b <= r[0]!) || t.P[t.P.length - 1]; return r ? Math.floor(b * r[k]! / 100) : 0;
}

/** Födelseår ur personnummer. Tiosiffrigt nummer utan "+" tolkas som 1900-tal om åren är fler än innevarande års två sista siffror. */
export function fodelsear(pnr: unknown, idagAr: number): number | null {
  const m = String(pnr || '').replace(/\D/g, '');
  if (m.length === 12) return +m.slice(0, 4);
  if (m.length === 10) { const yy = +m.slice(0, 2); const sekel = String(pnr).includes('+') ? 1900 : (yy > (idagAr % 100) ? 1900 : 2000); return sekel + yy; }
  return null;
}

export function skattekolumn(pnr: unknown, ar: number, idagAr: number, regler: LonRegler = reglerFor(ar + '-12')): number {
  const f = fodelsear(pnr, idagAr); return f && f <= ar - regler.skatt.kolumn3FranAlder ? 3 : 1;
}

export interface AgAvgift {
  belopp: number;
  sats: string;
}

/** Arbetsgivaravgift efter ålder vid årets ingång och utbetalningsmånad (ÅÅÅÅ-MM). */
export function agAvgift(pnr: unknown, brutto: number, utbMan: string, idagAr: number, regler: LonRegler = reglerFor(utbMan)): AgAvgift {
  const R = regler.ag;
  const ar = +utbMan.slice(0, 4), f = fodelsear(pnr, idagAr);
  if (!f) return { belopp: r2(brutto * R.full.sats), sats: R.full.text };
  if (f <= R.ingenTomFodelsear) return { belopp: 0, sats: R.ingen.text };
  if (f <= ar - R.aldre.franAlder) return { belopp: r2(brutto * R.aldre.sats), sats: R.aldre.text };
  const ung = R.ungdom.find(u => f >= ar - u.maxAlder && f <= ar - u.minAlder && utbMan >= u.fran && utbMan <= u.till);
  if (ung) { const lag = Math.min(brutto, ung.tak); return { belopp: r2(lag * ung.sats + (brutto - lag) * R.full.sats), sats: ung.text }; }
  return { belopp: r2(brutto * R.full.sats), sats: R.full.text };
}
