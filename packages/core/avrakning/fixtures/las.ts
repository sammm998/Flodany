// Läser fixtures från disk. CSV läses som SheetJS gör med raw: false: allt blir text och tomma celler utelämnas.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PdfItem } from '@flodia/kit';

export const FIXTURES = dirname(fileURLToPath(import.meta.url));
export const lasText = (fil: string) => readFileSync(join(FIXTURES, fil), 'utf8');
export const lasJson = <T>(fil: string): T => JSON.parse(lasText(fil)) as T;
export const lasPdf = (fil: string) => lasJson<PdfItem[][]>(fil);

function celler(rad: string): string[] {
  const ut: string[] = [];
  let cell = '', citat = false;
  for (let i = 0; i < rad.length; i++) {
    const c = rad[i]!;
    if (citat) {
      if (c === '"' && rad[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') citat = false; else cell += c;
    } else if (c === '"') citat = true;
    else if (c === ',') { ut.push(cell); cell = ''; } else cell += c;
  }
  ut.push(cell);
  return ut;
}

export function lasCsv(fil: string): Record<string, string>[] {
  const [rubrik, ...rader] = lasText(fil).split(/\r?\n/).filter(r => r.trim());
  const namn = celler(rubrik!);
  return rader.map(r => {
    const v = celler(r), o: Record<string, string> = {};
    namn.forEach((n, i) => { if (v[i] !== undefined && v[i] !== '') o[n] = v[i]!; });
    return o;
  });
}
