// Jämförelsetester: samma påhittade indata genom gamla motorn (legacy/apps/avrakning) och nya.
// Resultaten ska vara exakt lika (toStrictEqual: samma värden, samma fält, även -0 och undefined).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { valjParser } from '@flodia/kit';
import { laddaLegacyAvrakning } from '../../../tests/legacy-avrakning';
import * as ny from './index';
import type { Indata, Installningar } from './types';
import { ANTAL_SCENARIER, SEED, genereraScenario } from './fixtures/generera';
import { FIXTURES, lasCsv, lasJson, lasPdf, lasText } from './fixtures/las';
import { GRUND_S, SCENARIER, type HandScenario } from './fixtures/scenarier';

const gammal = laddaLegacyAvrakning() as unknown as typeof ny;

type Utfall = { varde: unknown } | { fel: string };
function kor(fn: () => unknown): Utfall {
  try {
    return { varde: fn() };
  } catch (e) {
    return { fel: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

function frys<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) frys(v);
  }
  return o;
}

/** Kör funktionen i båda motorerna med var sin kopia av indata. Nya motorn får frysta indata. */
function lika<A extends unknown[]>(namn: keyof typeof ny, ...args: A) {
  const g = kor(() => (gammal[namn] as unknown as (...a: A) => unknown)(...structuredClone(args)));
  const n = kor(() => (ny[namn] as unknown as (...a: A) => unknown)(...frys(structuredClone(args))));
  expect(n, namn).toStrictEqual(g);
  return n;
}
const varde = (u: Utfall) => ('varde' in u ? u.varde : undefined);
let kastar = 0, rader = 0, korningar = 0;
const kontrolltyper = new Set<string>();

// ===== Parsrarna på de handskrivna filerna =====

describe('avräkning: parsrar, gammal mot ny', () => {
  it('parseTaxiCaller (taxicaller.pdf.json)', () => {
    const tc = varde(lika('parseTaxiCaller', lasPdf('taxicaller.pdf.json'))) as ny.Tc;
    expect(tc.trips).toHaveLength(4);
    expect(tc.fakt).toEqual({ 9001: 1495.5, 9002: 300 });
  });
  it('parseTcCsv (taxicaller-deb.csv), med och utan kontonamn', () => {
    lika('parseTcCsv', lasCsv('taxicaller-deb.csv'));
    lika('parseTcCsv', lasCsv('taxicaller-deb.csv'), { 9001: 'Kundbolag A AB' });
  });
  it('parseBambora (bambora.sales.json)', () => {
    expect(varde(lika('parseBambora', lasJson('bambora.sales.json')))).toHaveLength(6);
  });
  it('parseApp (app.csv)', () => {
    lika('parseApp', lasCsv('app.csv'));
  });
  it('countPassages (passager.txt)', () => {
    expect(varde(lika('countPassages', lasText('passager.txt'), GRUND_S.bilar))).toEqual({ cnt: { 101: 2, 102: 2, 103: 1 }, okanda: { ABC99Z: 1 } });
  });
  it.each(['2026-01', '2026-10', '2026-11', '2026-12', '2027-06'])('monthLabels(%s)', (p) => {
    lika('monthLabels', p);
  });
});

// ===== compute på de handskrivna scenarierna, plus gyllene filer =====

function byggD(sc: HandScenario): Indata {
  const D: Indata = structuredClone(sc.D);
  if (sc.tc === 'pdf') D.tc = ny.parseTaxiCaller(lasPdf('taxicaller.pdf.json'));
  if (sc.tc === 'csv') D.tc = ny.parseTcCsv(lasCsv('taxicaller-deb.csv'), { 9001: 'Kundbolag A AB' });
  if (sc.filer) {
    D.bamb = ny.parseBambora(lasJson('bambora.sales.json'));
    D.app = ny.parseApp(lasCsv('app.csv'));
    D.bro = ny.countPassages(lasText('passager.txt'), GRUND_S.bilar).cnt;
  }
  return D;
}

const FACIT = join(FIXTURES, 'facit');

describe('avräkning: compute på handskrivna scenarier', () => {
  it.each(Object.keys(SCENARIER))('%s: gammal och ny ger samma resultat', (namn) => {
    const sc = SCENARIER[namn]!;
    const S: Installningar = { ...GRUND_S, bolag: sc.bolag ?? GRUND_S.bolag };
    const D = byggD(sc);
    const res = lika('compute', S, D);
    if (namn === 'utanPeriod') expect(res).toStrictEqual({ fel: "TypeError: Cannot read properties of null (reading 'slice')" });
    if (process.env.SKRIV_FACIT) {
      mkdirSync(FACIT, { recursive: true });
      writeFileSync(join(FACIT, namn + '.json'), JSON.stringify(res, null, 2) + '\n');
    }
  });

  it.each(Object.keys(SCENARIER))('%s: ny motor ger gyllene facit', (namn) => {
    const fil = join(FACIT, namn + '.json');
    expect(existsSync(fil), 'facit saknas, kör med SKRIV_FACIT=1').toBe(true);
    const sc = SCENARIER[namn]!;
    const res = kor(() => ny.avrakningEngine.compute(byggD(sc), { ...GRUND_S, bolag: sc.bolag ?? GRUND_S.bolag }));
    expect(JSON.parse(JSON.stringify(res))).toStrictEqual(lasJson(join('facit', namn + '.json')));
  });

  it('täcker kontrollerna i compute', () => {
    const typer = new Set<string>();
    for (const sc of Object.values(SCENARIER).filter(s => s.D.period)) {
      const res = ny.compute({ ...GRUND_S, bolag: sc.bolag ?? GRUND_S.bolag }, byggD(sc));
      for (const k of res.kontroll) typer.add(k.typ.replace(/:.*/, ''));
    }
    expect(typer.size).toBeGreaterThanOrEqual(30);
  });
});

// ===== 300 slumpade scenarier med fast seed =====

describe(`avräkning: ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED})`, () => {
  const nummer = Array.from({ length: ANTAL_SCENARIER }, (_, i) => i);
  it.each(nummer)('scenario %i', (i) => {
    const sc = genereraScenario(i);
    const D: Indata = structuredClone(sc.D);
    if (sc.pdf) D.tc = varde(lika('parseTaxiCaller', sc.pdf)) as ny.Tc;
    if (sc.tcCsv) D.tc = varde(lika('parseTcCsv', sc.tcCsv, i % 2 ? { 9000: 'Kundbolag 0 AB' } : undefined)) as ny.Tc;
    D.bamb = varde(lika('parseBambora', sc.bambora)) as ny.BamboraTrans[];
    D.app = varde(lika('parseApp', sc.app)) as ny.AppResultat;
    D.bro = (varde(lika('countPassages', sc.passager, sc.S.bilar)) as ny.PassageResultat).cnt;
    const u = lika('compute', sc.S, D);
    if ('fel' in u) { kastar++; return; }
    const res = u.varde as ny.Resultat;
    rader += res.bolag.reduce((a, b) => a + b.rows.length, 0);
    korningar += res.kpi.korningar;
    for (const k of res.kontroll) kontrolltyper.add(k.typ);
  });

  it('sammanställning', () => {
    console.log(`Avräkning: ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED}), gammal och ny motor gav samma resultat i alla. ${kastar} kastar samma fel i båda. Övriga gav ${korningar} körningar, ${rader} fakturarader och ${kontrolltyper.size} olika kontrolltyper.`);
    expect(kastar).toBeLessThan(ANTAL_SCENARIER / 4);
    expect(kontrolltyper.size).toBeGreaterThanOrEqual(25);
  });

  it('generatorn är deterministisk', () => {
    expect(genereraScenario(7)).toStrictEqual(genereraScenario(7));
  });
});

// ===== Kontrakten =====

describe('avräkning: kitets kontrakt', () => {
  it('motorn har nyckel och version', () => {
    expect(ny.avrakningEngine.key).toBe('avrakning');
    expect(ny.avrakningEngine.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('varje parser har sina fixtures', () => {
    for (const p of ny.parsrar) for (const f of p.fixtures) expect(existsSync(join(FIXTURES, f)), f).toBe(true);
  });

  it('filigenkänningen väljer rätt parser', () => {
    const rubrik = (fil: string) => lasText(fil).split('\n')[0];
    expect(valjParser(ny.parsrar, { name: 'tc.pdf', kind: 'pdf', pages: lasPdf('taxicaller.pdf.json') })?.key).toBe('tc');
    expect(valjParser(ny.parsrar, { name: 'deb.csv', kind: 'csv', text: rubrik('taxicaller-deb.csv') })?.key).toBe('tc-csv');
    expect(valjParser(ny.parsrar, { name: 'app.csv', kind: 'csv', text: rubrik('app.csv') })?.key).toBe('app');
    expect(valjParser(ny.parsrar, { name: 'b.xlsx', kind: 'xlsx', sheets: ['Sales'], rows: [] })?.key).toBe('bamb');
    expect(valjParser(ny.parsrar, { name: 'okand.csv', kind: 'csv', text: 'a,b,c' })).toBeNull();
  });

  it('parsrarna ger period och sammanfattning på svenska', () => {
    const r = ny.tcPdfParser.parse({ name: 'tc.pdf', kind: 'pdf', pages: lasPdf('taxicaller.pdf.json') });
    expect(r.period).toBe('2026-09');
    expect(r.summary).toBe('4 körningar, 2 konton, september 2026');
    const b = ny.bamboraParser.parse({ name: 'b.xlsx', kind: 'xlsx', sheets: ['Sales'], rows: lasJson('bambora.sales.json') });
    expect(b.summary).toMatch(/^5 köp, 1 återbetalningar 150 kr, netto .* kr, september 2026$/);
    expect(ny.appParser.parse({ name: 'a.csv', kind: 'csv', rows: [] }).warnings).toHaveLength(1);
  });

  it('tc-csv får kontonamn via context och ger samma resultat som gamla motorn', () => {
    const rows = lasCsv('taxicaller-deb.csv'), kontonamn = { 9001: 'Kundbolag A AB', 9002: 'Kundbolag B AB' };
    const med = ny.tcCsvParser.parse({ name: 'deb.csv', kind: 'csv', rows }, { kontonamn });
    expect(med.data).toStrictEqual(gammal.parseTcCsv(structuredClone(rows), kontonamn));
    expect(med.data.trips.filter(t => t.konto?.nr === 9001).every(t => t.konto?.namn === 'Kundbolag A AB')).toBe(true);
    const utan = ny.tcCsvParser.parse({ name: 'deb.csv', kind: 'csv', rows });
    expect(utan.data).toStrictEqual(gammal.parseTcCsv(structuredClone(rows)));
    expect(utan.data.trips[0]!.konto?.namn).toBe('Konto 9001');
  });

  it('nya motorn ändrar inte indata', () => {
    const sc = genereraScenario(1);
    const D = frys({ ...structuredClone(sc.D), bamb: ny.parseBambora(sc.bambora), app: ny.parseApp(sc.app) });
    expect(() => ny.compute(frys(structuredClone(sc.S)), D)).not.toThrow();
  });
});
