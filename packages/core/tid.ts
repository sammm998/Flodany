// Svensk tid (Europe/Stockholm) uttryckligen, oberoende av datorns tidszon.
// Motorerna körs på servern, där tidszonen kan vara vad som helst (fas 1b, krav för fas 2).
// Tolkningen av väggtid följer JavaScripts regler för new Date(å, m, d, h, mi) i svensk tid,
// så att resultaten blir exakt desamma som i legacy:
//   tid som inte finns (klockan ställs fram) räknas med tiden före bytet, 02:30 blir 03:30 sommartid,
//   tid som finns två gånger (klockan ställs tillbaka) blir den första, alltså sommartid.

export const TIDSZON = 'Europe/Stockholm';

const H = 36e5;
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TIDSZON, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
});

/** Svensk tids avvikelse från UTC i millisekunder vid en tidpunkt. Cachas per timme. */
const cache = new Map<number, number>();
export function stockholmOffset(ms: number): number {
  const timme = Math.floor(ms / H);
  let o = cache.get(timme);
  if (o === undefined) {
    const t = timme * H, p: Record<string, number> = {};
    for (const x of fmt.formatToParts(t)) if (x.type !== 'literal') p[x.type] = +x.value;
    o = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!) - t;
    if (cache.size > 50000) cache.clear();
    cache.set(timme, o);
  }
  return o;
}

export interface Delar {
  ar: number;
  /** 1 till 12. */
  man: number;
  dag: number;
  tim: number;
  min: number;
  sek: number;
  /** 0 = söndag, som Date.getDay. */
  veckodag: number;
}

/** Datum och klockslag i svensk tid för en tidpunkt. */
export function stockholmDelar(d: Date | number): Delar {
  const ms = +d, v = new Date(ms + stockholmOffset(ms));
  return { ar: v.getUTCFullYear(), man: v.getUTCMonth() + 1, dag: v.getUTCDate(), tim: v.getUTCHours(), min: v.getUTCMinutes(), sek: v.getUTCSeconds(), veckodag: v.getUTCDay() };
}

/** Väggtid i svensk tid till tidpunkt. Månad 1 till 12. Värden utanför intervallen räknas om som i Date.UTC. */
export function franStockholm(ar: number, man: number, dag: number, tim = 0, min = 0, sek = 0): Date {
  const u = Date.UTC(ar, man - 1, dag, tim, min, sek);
  const fore = stockholmOffset(u - 864e5), efter = stockholmOffset(u + 864e5);
  if (fore === efter) return new Date(u - fore);
  const giltig = [u - fore, u - efter].filter((t, i) => stockholmOffset(t) === (i ? efter : fore));
  return new Date(giltig.length ? Math.min(...giltig) : u - fore);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ÅÅÅÅ-MM-DD i svensk tid. */
export function stockholmDatum(d: Date | number): string {
  const p = stockholmDelar(d);
  return p.ar + '-' + pad(p.man) + '-' + pad(p.dag);
}

/** hh:mm i svensk tid. */
export function stockholmKlockslag(d: Date | number): string {
  const p = stockholmDelar(d);
  return pad(p.tim) + ':' + pad(p.min);
}

/** Lägger till dagar på ett datum ÅÅÅÅ-MM-DD (kalenderdagar, ingen tidszon inblandad). */
export function laggTillDagar(datum: string, n: number): string {
  const t = new Date(datum + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** Veckodag för ett datum ÅÅÅÅ-MM-DD, 0 = söndag. */
export const veckodag = (datum: string): number => new Date(datum + 'T12:00:00Z').getUTCDay();

/** ISO-veckonummer för ett datum ÅÅÅÅ-MM-DD. */
export function isoVecka(datum: string): number {
  const t = new Date(datum + 'T00:00:00Z');
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((+t - y0) / 864e5 + 1) / 7);
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** Månadens namn på svenska för ett datum ÅÅÅÅ-MM-DD eller ÅÅÅÅ-MM. */
export const manadsnamn = (datum: string): string => MANADER[+datum.slice(5, 7) - 1]!;
