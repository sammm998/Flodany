// Kontrollsummor för legacy/. Vakten som visar att originalapparna är orörda.
// npm run legacy:sha256 skriver om tests/legacy.sha256. Gör det bara om ägaren godkänt ändringen.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROT = fileURLToPath(new URL('..', import.meta.url));
export const LISTA = join(ROT, 'tests', 'legacy.sha256');

function filer(mapp) {
  return readdirSync(mapp, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? filer(join(mapp, d.name)) : [join(mapp, d.name)],
  );
}

/** Rad per fil: "<sha256>  legacy/<sökväg>", sorterat. Radslut räknas som LF. */
export function berakna() {
  return filer(join(ROT, 'legacy'))
    .map((fil) => {
      const text = readFileSync(fil).toString('latin1').replace(/\r\n/g, '\n');
      const summa = createHash('sha256').update(text, 'latin1').digest('hex');
      return `${summa}  ${relative(ROT, fil).split('\\').join('/')}`;
    })
    .sort((a, b) => (a.slice(66) < b.slice(66) ? -1 : 1));
}

if (process.argv.includes('--skriv')) {
  const rader = berakna();
  writeFileSync(LISTA, rader.join('\n') + '\n');
  console.log(`Skrev ${rader.length} kontrollsummor till tests/legacy.sha256`);
}
