// SIE-exporten i legacy/apps/tripkassan: #PROGRAM "Flödia Lön och bokföring" 1.0 (ägarens beslut 2026-10-15).
// Prövar raden mot SIE typ 4 (#PROGRAM programnamn version, text inom citattecken) och att appens egen
// PC8-kodning (CP437) tar med ö, så att inget tecken byts mot frågetecken i filen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(join(import.meta.dirname, '..', 'legacy', 'apps', 'tripkassan', 'index.html'), 'utf8');

/** En rad på toppnivå i appens skript, till exempel "const CP437 = {...};". */
const rad = (borjan: string) => {
  const r = html.split('\n').find(l => l.startsWith(borjan));
  if (!r) throw new Error('Hittar inte ' + borjan);
  return r;
};
// Appens egna CP437-tabell och kodning, oförändrade.
const CP437 = new Function(rad('const CP437 = ') + '\nreturn CP437;')() as Record<string, number>;
const cp437 = new Function('CP437', rad('function cp437(s)') + '\nreturn cp437;')(CP437) as (s: string) => Uint8Array;

describe('SIE-filen från Lön och bokföring', () => {
  const huvud = /const L = \['#FLAGGA 0', '#FORMAT PC8', '#SIETYP 4', '(#PROGRAM [^']*)', '#GEN '/.exec(html);

  it('huvudet börjar som SIE typ 4 kräver, med det nya programnamnet', () => {
    expect(huvud).not.toBeNull();
    expect(huvud![1]).toBe('#PROGRAM "Flödia Lön och bokföring" 1.0');
  });

  it('#PROGRAM följer formatet: programnamn inom citattecken och en version', () => {
    expect(huvud![1]).toMatch(/^#PROGRAM "[^"\r\n]+" \d+(\.\d+)*$/);
  });

  it('PC8 (CP437) tar med ö: inget tecken blir frågetecken, och raden går att läsa tillbaka', () => {
    const b = cp437(huvud![1]!);
    expect([...b]).not.toContain(63);
    const tillbaka = Object.fromEntries(Object.entries(CP437).map(([t, k]) => [k, t]));
    expect([...b].map(x => (x < 128 ? String.fromCharCode(x) : tillbaka[x])).join('')).toBe(huvud![1]);
    expect(b.length).toBe(huvud![1]!.length);
  });
});

describe('SIE-filens namn i Lön och bokföring', () => {
  // Appens egen sieNamn, med ett påhittat S. Bolaget tvättas som i Excel-filnamnet.
  const sieNamn = (foretag: string | undefined, p: string) =>
    (new Function('S', rad('const sieNamn = ') + '\nreturn sieNamn;')({ settings: { foretag } }) as (p: string) => string)(p);

  it('bolagets namn ur inställningarna, inte ett fast bolagsnamn', () => {
    expect(sieNamn('Åäö Exempel AB', '2026-09')).toBe('SIE_Åäö Exempel AB_2026-09.se');
    expect(sieNamn('Exempel/Åkeri & Co AB', '2026-10')).toBe('SIE_ExempelÅkeri  Co AB_2026-10.se');
    expect(html).not.toContain('SIE_TripTaxi_');
  });

  it('utan bolagsnamn: SIE_Lon_och_bokforing_<period>.se', () => {
    for (const foretag of [undefined, '', '   ', '?!']) expect(sieNamn(foretag, '2026-09'), String(foretag)).toBe('SIE_Lon_och_bokforing_2026-09.se');
  });

  it('tvätten är densamma som i Excel-filnamnet', () => {
    const tvatt = ".replace(/[^\\wåäöÅÄÖ ]/g, '')";
    expect(rad('const sieNamn = ')).toContain(tvatt);
    expect(html.split('\n').find(l => l.includes("const name = 'Lön och bokföring '"))).toContain(tvatt);
  });
});
