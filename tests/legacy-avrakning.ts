// Laddar avräkningens gamla motor direkt ur legacy/apps/avrakning/index.html, utan att ändra filen.
// Allt i skriptet före första DOM-anropet är ren JS och körs med new Function, i samma realm som
// testerna, så att toStrictEqual kan jämföra objekt från gammal och ny motor.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIL = join(dirname(fileURLToPath(import.meta.url)), '..', 'legacy', 'apps', 'avrakning', 'index.html');
const START = '// ===== Kärnlogik: avräkning';
const SLUT = 'const $ = s => document.querySelector(s);';
const FUNKTIONER = ['compute', 'parseTaxiCaller', 'parseBambora', 'parseTcCsv', 'parseApp', 'countPassages', 'monthLabels', 'groupLines'] as const;

type Fn = (...args: never[]) => unknown;
export type LegacyAvrakning = Record<(typeof FUNKTIONER)[number], Fn>;

export function laddaLegacyAvrakning(): LegacyAvrakning {
  const html = readFileSync(FIL, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(SLUT);
  if (a < 0 || b < a) throw new Error('Hittar inte motorn i ' + FIL);
  const kod = html.slice(a, b);
  const fabrik = new Function('module', `${kod}\nreturn { ${FUNKTIONER.join(', ')} };`) as (m: { exports: object }) => LegacyAvrakning;
  return fabrik({ exports: {} });
}
