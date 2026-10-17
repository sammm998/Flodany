// Laddar lönemotorn ur legacy/apps/akarkassan och tripkassan, utan att ändra filerna.
// 1. ENG: skriptet från "const ENG = (() => {" till module.exports.
// 2. Lönefunktionerna i appens andra skript (result, utbMan, lonOf ...). De läser appens globala S,
//    så de körs med S och ENG som parametrar.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type LegacyApp = 'akarkassan' | 'tripkassan';
type Fn = (...args: never[]) => unknown;
export type LegacyEng = Record<string, Fn> & { DEF: Record<string, unknown>; LA: unknown[]; LA_VER: number };

const fil = (app: LegacyApp) => join(dirname(fileURLToPath(import.meta.url)), '..', 'legacy', 'apps', app, 'index.html');

export function laddaLegacyEng(app: LegacyApp): LegacyEng {
  const html = readFileSync(fil(app), 'utf8');
  const a = html.indexOf('const ENG = (() => {'), b = html.indexOf("if (typeof module !== 'undefined') module.exports = ENG;");
  if (a < 0 || b < a) throw new Error('Hittar inte ENG i ' + app);
  return new Function(html.slice(a, b) + '\nreturn ENG;')() as LegacyEng;
}

/** Källkoden för en funktion eller konstant på toppnivå i appens skript. */
function kalla(html: string, namn: string): string {
  const m = new RegExp(`\\n((?:function ${namn}\\(|const ${namn} = )[^\\n]*)`).exec(html);
  if (!m) throw new Error('Hittar inte ' + namn);
  const start = m.index + 1, forsta = m[1]!;
  const balans = (s: string) => (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
  if (balans(forsta) === 0) return forsta;
  const slut = html.indexOf('\n}\n', start);
  return html.slice(start, slut + 2);
}

const LONEFUNKTIONER = ['sum', 'cfg', 'ownRegs', 'result', 'utbMan', 'utbDatum', 'person', 'tabellFor', 'parseKr', 'ytd', 'lonOf'];

export interface LegacyLon {
  result(): unknown;
  utbMan(mod?: string): string;
  utbDatum(c: unknown, m?: string): string;
  ytd(id: string, brutto: number, skatt: number, mod?: string, utb?: string): unknown;
  lonOf(r: unknown, c: unknown): unknown;
  cfg(): Record<string, unknown>;
  ejAnstallda(R: unknown): unknown;
}

/** Lönefunktionerna ur appen, bundna till tillståndet S och appens ENG. */
export function laddaLegacyLon(app: LegacyApp): (S: unknown) => LegacyLon {
  const html = readFileSync(fil(app), 'utf8');
  // Sedan legacy 2026-10-13 har båda apparna anställningsperiod och varningen ejAnstallda. Åkarkassan kvittar
  // förra månadens kontanter mot fast lön (kontEfter, prevPer och månadsnamnen i MON).
  const namn = [...LONEFUNKTIONER, 'anstalld', 'ejAnstallda', ...(app === 'akarkassan' ? ['kontEfter', 'prevPer', 'MON'] : [])];
  const kod = namn.map(n => kalla(html, n)).join('\n');
  const ENG = laddaLegacyEng(app);
  const fabrik = new Function('S', 'ENG', `${kod}\nreturn { result, utbMan, utbDatum, ytd, lonOf, cfg, ejAnstallda };`) as (S: unknown, E: unknown) => LegacyLon;
  return (S) => fabrik(S, ENG);
}
