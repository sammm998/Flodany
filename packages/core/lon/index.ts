// Lönemotorn (åkarkassan och tripkassan) enligt modulkitets kontrakt (SPEC-v3.1 avsnitt 3).
import type { Engine, FileInput, FileParser, ParseResult } from '@flodia/kit';
import { VARIANTER, type Variant } from './compute';
import { lon, type LonState, type Lonebesked } from './lonebesked';
import { parseAvrakning, parseBro, parseLDL, parseSkattetabell, parseSturup } from './parsers';
import type { LonRegler } from './regler';
import type { AvrakningFaktura, LdlResultat, LonResultat, Passage, Skattetabell } from './types';

export { AKARKASSAN, TRIPKASSAN, VARIANTER, compute, exkl, markPeriods, matchBro, passPerioder, periodOf, shiftPeriod, type Perioder, type Variant } from './compute';
export { decode, dstr, isoWeek, normReg, pad, r2, toDate, tstr } from './hjalp';
export { LA, LA_VER, laRader, lonearter, type EgenArt, type EgenLoneart, type ExtraRad, type Loneart, type LoneartSida, type LoneartTyp, type ManuellRad } from './lonearter';
export { lon, type ForareInst, type LoneVarning, type LonHist, type LonOpts, type LonState, type Lonebesked, type LoneRad, type Person } from './lonebesked';
export { compactTabell, packTabell, parseAvrakning, parseBro, parseLDL, parseSkattetabell, parseSturup, unpackTabell } from './parsers';
export { LON_REGLER, reglerFor, type AgSats, type AgUngdom, type LonRegler } from './regler';
export { agAvgift, fodelsear, skattekolumn, tabellSkatt, type AgAvgift } from './skatt';
export type * from './types';

export interface LonKonfig {
  variant: 'akarkassan' | 'tripkassan' | Variant;
  /** Dagens datum (ÅÅÅÅ-MM-DD). Motorn läser aldrig klockan. */
  idag: string;
  /** Skatte- och avgiftsregler med giltighetsdatum. Standard: LON_REGLER. */
  regler?: LonRegler[];
}

export interface LonUtdata {
  resultat: LonResultat;
  /** Lönebesked per förare (nyckel: förarens id). */
  lon: Record<string, Lonebesked>;
  utbetalning: Record<string, string>;
}

/** Motorn: månadens tillstånd in, avräkning per förare, kassaredovisning och lönebesked ut. */
export const lonEngine: Engine<LonState, LonKonfig, LonUtdata> = {
  key: 'lon',
  version: '1.3.0',
  compute: (S, konfig) => {
    const variant = typeof konfig.variant === 'string' ? VARIANTER[konfig.variant] : konfig.variant;
    const L = lon(S, variant, { idagAr: +konfig.idag.slice(0, 4), regler: konfig.regler });
    const resultat = L.result(), c = L.cfg();
    const besked: Record<string, Lonebesked> = {}, utbetalning: Record<string, string> = {};
    for (const r of resultat.rows) { besked[r.id] = L.lonOf(r, c); utbetalning[r.id] = L.utbDatum(c, r.modell); }
    return { resultat, lon: besked, utbetalning };
  },
};

// ===== Parsrar enligt kontraktet. PDF-filer kommer in som text, en rad per rad i PDF:en. =====

const nf0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const rader = (f: FileInput) => (f.text ?? '').split(/\r?\n/);

export const ldlParser: FileParser<LdlResultat> = {
  key: 'ldl',
  label: 'Megtax, löneunderlag (LDL.txt)',
  accepts: ['txt', 'csv'],
  detect: (f) => (rader(f).some(l => l.startsWith('01;') && l.split(';').length >= 30) ? 0.95 : 0),
  parse: (f): ParseResult<LdlResultat> => {
    const r = parseLDL(f.text ?? '');
    const forare = new Set(r.shifts.map(s => s.forare)).size, bilar = new Set(r.shifts.map(s => s.reg)).size;
    const varn = [...r.warn, ...(r.shifts.length ? [] : ['Filen innehöll inga körpass. Välj LDL-filen från Megtax-portalen.'])];
    return { data: r, summary: `${nf0.format(r.shifts.length)} körpass, ${forare} förare, ${bilar} bilar`, warnings: varn };
  },
  fixtures: ['ldl.txt'],
};

export const broParser: FileParser<{ rows: Passage[]; kurs: number | null }> = {
  key: 'bro',
  label: 'Øresundsbron, samlingsfaktura (PDF)',
  accepts: ['pdf'],
  detect: (f) => (/SV\/DK Klass|DK\/SV Klass|Pick-up fee/i.test(f.text ?? '') ? 0.9 : 0),
  parse: (f) => {
    const r = parseBro(rader(f));
    return { data: r, summary: `${nf0.format(r.rows.length)} passager`, warnings: r.rows.length ? [] : ['Hittade inga passager. Är det Øresundsbrons samlingsfaktura?'] };
  },
  fixtures: ['bro.txt'],
};

export const sturupParser: FileParser<{ rows: Passage[] }> = {
  key: 'sturup',
  label: 'Swedavia, Sturup (PDF)',
  accepts: ['pdf'],
  detect: (f) => (/\b[A-Z]{3}\s?\d{2}[A-Z0-9]\s+\(\d+\)/.test(f.text ?? '') && /\d\d\.\d\d\.\d\d\s+\d\d:\d\d/.test(f.text ?? '') ? 0.85 : 0),
  parse: (f) => {
    const r = parseSturup(rader(f));
    return { data: r, summary: `${nf0.format(r.rows.length)} passager`, warnings: r.rows.length ? [] : ['Hittade inga passager. Är det Swedavias Sturupfaktura?'] };
  },
  fixtures: ['sturup.txt'],
};

export const avrakningParser: FileParser<AvrakningFaktura> = {
  key: 'avr',
  label: 'Avräkning från taxicentralen (PDF)',
  accepts: ['pdf'],
  detect: (f) => (/ATT BETALA/.test(f.text ?? '') && /Fakturanummer|Fakturadatum/.test(f.text ?? '') ? 0.9 : 0),
  parse: (f) => {
    const r = parseAvrakning(rader(f));
    return { data: r, summary: `Faktura ${r.nr || 'utan nummer'}, ${r.rows.length} rader`, warnings: r.rows.length ? [] : ['Hittade inga rader. Är det avräkningen från taxicentralen?'] };
  },
  fixtures: ['avrakning.txt'],
};

export const skattetabellParser: FileParser<Record<string, Skattetabell>> = {
  key: 'skatt',
  label: 'Skatteverket, månadstabeller (txt)',
  accepts: ['txt'],
  detect: (f) => (/^30[B%]\d\d/m.test(f.text ?? '') ? 0.95 : 0),
  parse: (f) => {
    const T = parseSkattetabell(f.text ?? ''), n = Object.keys(T).length;
    return { data: T, summary: `${n} skattetabeller`, warnings: n ? [] : ['Filen ser inte ut som Skatteverkets månadstabeller.'] };
  },
  fixtures: ['skattetabell.txt'],
};

export const parsrar: FileParser<unknown>[] = [ldlParser, broParser, sturupParser, avrakningParser, skattetabellParser];
