// Jämförelsetester: samma påhittade indata genom gamla motorn (legacy/apps/akarkassan och tripkassan) och nya.
// Resultaten ska vara exakt lika (toStrictEqual). Varje scenario körs för båda apparna.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { valjParser } from '@flodia/kit';
import { laddaLegacyEng, laddaLegacyLon, type LegacyApp } from '../../../tests/legacy-lon';
import * as ny from './index';
import { ANTAL_SCENARIER, SEED, genereraLon } from './fixtures/generera';
import { LON_SCENARIER, type LonHandScenario } from './fixtures/scenarier';
import { FIXTURES, lasJson, lasText } from '../avrakning/fixtures/las';

const LON_FIXTURES = join(FIXTURES, '..', '..', 'lon', 'fixtures');
const las = (fil: string) => lasText(join('..', '..', 'lon', 'fixtures', fil));
const APPAR: LegacyApp[] = ['akarkassan', 'tripkassan'];
/**
 * Varianterna utan avvikelserna från legacy (ägarens beslut 2026-10-13: lönemodell "ingen" ger ingen utbetalning).
 * Jämförelsen mot legacy körs med dessa. Avvikelserna testas för sig sist i filen.
 */
const SOM_LEGACY: Record<LegacyApp, ny.Variant> = {
  akarkassan: { ...ny.AKARKASSAN, ingenUtanUtbetalning: false },
  tripkassan: { ...ny.TRIPKASSAN, ingenUtanUtbetalning: false },
};
/** Legacy läser klockan för att tolka tiosiffriga personnummer. Nya motorn får året som indata. */
const IDAG_AR = new Date().getFullYear();

type Utfall = { varde: unknown } | { fel: string };
function kor(fn: () => unknown): Utfall {
  try { return { varde: fn() }; } catch (e) { return { fel: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }; }
}
const varde = (u: Utfall) => ('varde' in u ? u.varde : undefined);
function frys<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) frys(v); }
  return o;
}

const gammalEng = { akarkassan: laddaLegacyEng('akarkassan'), tripkassan: laddaLegacyEng('tripkassan') };
const gammalLon = { akarkassan: laddaLegacyLon('akarkassan'), tripkassan: laddaLegacyLon('tripkassan') };

/** Samma funktion i gammal och ny parser, var sin kopia av indata. */
function likaParser(app: LegacyApp, namn: string, ...args: unknown[]) {
  const g = kor(() => gammalEng[app][namn]!(...(structuredClone(args) as never[])));
  const n = kor(() => (ny as unknown as Record<string, (...a: unknown[]) => unknown>)[namn]!(...frys(structuredClone(args))));
  expect(n, app + ': ' + namn).toStrictEqual(g);
  return varde(n);
}

const skattetabeller = (typ: LonHandScenario['skatt']) => {
  const T = ny.parseSkattetabell(las('skattetabell.txt'));
  if (typ === 'ingen') return null;
  if (typ === 'objekt') return T;
  return Object.fromEntries(Object.entries(T).map(([k, t]) => [k, ny.packTabell(t)]));
};

/** Bygger appens tillstånd S. Overrides pekar på passager i bro-filen. */
function byggS(o: { period: string | null; ldl: string; bro: string[]; sturup: string[]; settings: Record<string, unknown>; month: Record<string, unknown>; skatt: LonHandScenario['skatt']; skattAr?: number | string; demo: boolean; overrides: (i: number) => string | undefined }): ny.LonState {
  const shifts = ny.parseLDL(o.ldl).shifts;
  const bro = ny.parseBro(o.bro).rows, stu = ny.parseSturup(o.sturup).rows;
  const overrides: Record<string, string> = {};
  bro.forEach((p, i) => { const v = o.overrides(i); if (v !== undefined) overrides[p.ts + '|' + p.reg + '|' + p.typ] = v; });
  return {
    settings: o.settings as ny.LonState['settings'], period: o.period, month: { ...o.month, overrides }, shifts, passages: { bro, stu },
    skatt: skattetabeller(o.skatt), demo: o.demo, ...(o.skattAr !== undefined ? { skattAr: o.skattAr } : {}),
  };
}

/** Kör hela lönen i gammal och ny motor och jämför resultat, lönebesked, utbetalningsdag och hittills i år. */
function likaLon(app: LegacyApp, S: ny.LonState) {
  const G = gammalLon[app](structuredClone(S));
  const N = ny.lon(frys(structuredClone(S)), SOM_LEGACY[app], { idagAr: IDAG_AR });
  const gr = kor(() => G.result()), nr = kor(() => N.result());
  expect(nr, app + ': result').toStrictEqual(gr);
  expect(N.cfg(), app + ': cfg').toStrictEqual(G.cfg());
  if (!('varde' in nr)) return { gammal: gr, rader: 0 };
  expect(N.ejAnstallda(nr.varde as ny.LonResultat), app + ': ejAnstallda').toStrictEqual(G.ejAnstallda(varde(gr)));
  const grows = (varde(gr) as ny.LonResultat).rows, nrows = (nr.varde as ny.LonResultat).rows;
  const lon: Record<string, unknown> = {}, utbetalning: Record<string, unknown> = {};
  grows.forEach((r, i) => {
    const gl = kor(() => G.lonOf(r, G.cfg())), nl = kor(() => N.lonOf(nrows[i]!, N.cfg()));
    expect(nl, app + ': lonOf ' + r.id).toStrictEqual(gl);
    expect(kor(() => N.utbDatum(N.cfg(), r.modell)), app + ': utbDatum').toStrictEqual(kor(() => G.utbDatum(G.cfg(), r.modell)));
    expect(N.utbMan(r.modell), app + ': utbMan').toBe(G.utbMan(r.modell));
    expect(kor(() => N.ytd(r.id, r.brutto, 1000)), app + ': ytd').toStrictEqual(kor(() => G.ytd(r.id, r.brutto, 1000)));
    expect(kor(() => N.ytd(r.id, r.brutto, 1000, r.modell)), app + ': ytd med lönemodell').toStrictEqual(kor(() => G.ytd(r.id, r.brutto, 1000, r.modell)));
    lon[r.id] = varde(gl); utbetalning[r.id] = varde(kor(() => G.utbDatum(G.cfg(), r.modell)));
  });
  return { gammal: { varde: { resultat: varde(gr), lon, utbetalning } }, rader: grows.length };
}

// ===== Parsrar och skatt på de handskrivna filerna =====

describe.each(APPAR)('lön (%s): parsrar och skatt, gammal mot ny', (app) => {
  it('parseLDL (ldl.txt)', () => {
    const r = likaParser(app, 'parseLDL', las('ldl.txt')) as ny.LdlResultat;
    expect(r.shifts).toHaveLength(7);
    expect(r.warn).toEqual(['Rad 13: kunde inte läsa tider']);
  });
  it('parseBro (bro.txt)', () => { expect((likaParser(app, 'parseBro', las('bro.txt').split('\n')) as { rows: unknown[] }).rows).toHaveLength(7); });
  it('parseSturup (sturup.txt)', () => { expect((likaParser(app, 'parseSturup', las('sturup.txt').split('\n')) as { rows: unknown[] }).rows).toHaveLength(4); });
  it('parseAvrakning (avrakning.txt)', () => { expect((likaParser(app, 'parseAvrakning', las('avrakning.txt').split('\n')) as ny.AvrakningFaktura).rows).toHaveLength(9); });
  it('parseSkattetabell, packTabell, unpackTabell, compactTabell', () => {
    const T = likaParser(app, 'parseSkattetabell', las('skattetabell.txt')) as Record<string, ny.Skattetabell>;
    expect(Object.keys(T)).toEqual(['33', '34']);
    const p = likaParser(app, 'packTabell', T['33']) as string;
    likaParser(app, 'unpackTabell', p);
    likaParser(app, 'unpackTabell', '');
    likaParser(app, 'compactTabell', '2000:200,190,120,200,280,280;%0:30,29,20,30,40,40');
  });
  it('tabellSkatt för många inkomster och alla kolumner', () => {
    const T = ny.parseSkattetabell(las('skattetabell.txt'))['33']!;
    for (const brutto of [-5, 0, 1, 1999.99, 2000, 2000.5, 15000, 80000, 80001, 100000, 250000]) for (const kol of [0, 1, 3, 6, 7]) likaParser(app, 'tabellSkatt', T, kol, brutto);
    likaParser(app, 'tabellSkatt', null, 1, 30000);
  });
  it('fodelsear, skattekolumn och agAvgift för påhittade personnummer', () => {
    const pnr = ['19800000-0000', '19370000-0000', '19380000-0000', '20050000-0000', '20070000-0000', '8500000000', '0500000000', '370000+0000', '123', '', undefined, null];
    const N = ny as unknown as Record<string, (...a: unknown[]) => unknown>, G = gammalEng[app];
    for (const p of pnr) {
      expect(N.fodelsear!(p, IDAG_AR), 'fodelsear ' + p).toStrictEqual(G.fodelsear!(p as never));
      for (const ar of [2025, 2026, 2027]) expect(N.skattekolumn!(p, ar, IDAG_AR), 'kolumn ' + p).toBe(G.skattekolumn!(p as never, ar as never));
      for (const um of ['', '2025-12', '2026-03', '2026-04', '2027-09', '2027-10']) for (const brutto of [0, 18000, 25000, 40000.5, -100])
        expect(N.agAvgift!(p, brutto, um, IDAG_AR), `agAvgift ${p} ${um} ${brutto}`).toStrictEqual(G.agAvgift!(p as never, brutto as never, um as never));
    }
  });
});

// ===== Handskrivna scenarier, plus gyllene filer =====

const FACIT = join(LON_FIXTURES, 'facit');
const IDAG_FACIT = '2026-10-11';

function handS(sc: LonHandScenario): ny.LonState {
  return byggS({
    period: sc.period, ldl: las('ldl.txt'), bro: las('bro.txt').split('\n'), sturup: las('sturup.txt').split('\n'),
    settings: { cfg: sc.cfg ?? {}, forare: sc.forare, lonHist: sc.lonHist ?? {} }, month: { forare: sc.manad ?? {} },
    skatt: sc.skatt ?? 'packad', skattAr: sc.skattAr, demo: !!sc.demo, overrides: i => sc.overrides?.[i],
  });
}

describe.each(APPAR)('lön (%s): handskrivna scenarier', (app) => {
  it.each(Object.keys(LON_SCENARIER))('%s: gammal och ny ger samma resultat', (namn) => {
    const { gammal } = likaLon(app, handS(LON_SCENARIER[namn]!));
    if (process.env.SKRIV_FACIT) {
      expect(IDAG_AR, 'facit skrivs med legacy, som läser klockan').toBe(+IDAG_FACIT.slice(0, 4));
      mkdirSync(FACIT, { recursive: true });
      writeFileSync(join(FACIT, `${app}-${namn}.json`), JSON.stringify(gammal, null, 2) + '\n');
    }
  });

  it.each(Object.keys(LON_SCENARIER))('%s: lonEngine ger gyllene facit', (namn) => {
    const fil = join(FACIT, `${app}-${namn}.json`);
    expect(existsSync(fil), 'facit saknas, kör med SKRIV_FACIT=1').toBe(true);
    // Facit kommer från legacy. Avvikelsen för lönemodell "ingen" testas för sig.
    const res = kor(() => ny.lonEngine.compute(handS(LON_SCENARIER[namn]!), { variant: SOM_LEGACY[app], idag: IDAG_FACIT }));
    expect(JSON.parse(JSON.stringify(res))).toStrictEqual(lasJson(join('..', '..', 'lon', 'fixtures', 'facit', `${app}-${namn}.json`)));
  });
});

it('apparna skiljer sig bara där de ska: fast lön', () => {
  const S = handS(LON_SCENARIER.fastLon!);
  const a = ny.lonEngine.compute(S, { variant: 'akarkassan', idag: IDAG_FACIT }), t = ny.lonEngine.compute(S, { variant: 'tripkassan', idag: IDAG_FACIT });
  // Sedan Åkarkassan v33 tar båda med fast anställda utan pass, inom anställningsperioden.
  expect(Object.keys(a.lon).sort()).toEqual(['1001', '1002', '1003', '1004', '2001']);
  expect(Object.keys(t.lon).sort()).toEqual(['1001', '1002', '1003', '1004', '2001']);
  expect(a.resultat.rows.find(r => r.id === '1004')!.kontant).toBeGreaterThan(0);
  expect(t.resultat.rows.find(r => r.id === '1004')!.kontant).toBe(0);
});

// ===== 300 slumpade scenarier per app, fast seed =====

const statistik = { akarkassan: { kastar: 0, rader: 0, pass: 0, arterIn: new Set<string>(), arterUt: new Set<string>() }, tripkassan: { kastar: 0, rader: 0, pass: 0, arterIn: new Set<string>(), arterUt: new Set<string>() } };

describe.each(APPAR)(`lön (%s): ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED})`, (app) => {
  const nummer = Array.from({ length: ANTAL_SCENARIER }, (_, i) => i);
  it.each(nummer)('scenario %i', (i) => {
    const sc = genereraLon(i);
    const ldl = likaParser(app, 'parseLDL', sc.ldl) as ny.LdlResultat;
    likaParser(app, 'parseBro', sc.bro);
    likaParser(app, 'parseSturup', sc.sturup);
    likaParser(app, 'parseAvrakning', sc.avrakning);
    const forare = Object.keys((sc.settings.forare as object) ?? {});
    const S = byggS({ ...sc, skatt: sc.skatt as LonHandScenario['skatt'], overrides: (k) => ((k + i) % 6 === 0 ? (k % 2 ? forare[0] : '') : undefined) });
    const { gammal, rader } = likaLon(app, S);
    const st = statistik[app]; st.pass += ldl.shifts.length; st.rader += rader; if ('fel' in gammal) st.kastar++;
    Object.values(sc.month.forare as Record<string, ny.ForareManad>).forEach(m => (m.rader || []).forEach(x => st.arterIn.add(x.nr)));
    if ('varde' in gammal) ((gammal.varde as { resultat: ny.LonResultat }).resultat.rows).forEach(r => r.extra.forEach(x => st.arterUt.add(x.kod)));
  });

  it('sammanställning', () => {
    const st = statistik[app];
    console.log(`Lön (${app}): ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED}), gammal och ny motor gav samma resultat i alla. ${st.kastar} kastar samma fel i båda. ${st.pass} körpass och ${st.rader} lönebesked jämförda. ${ny.LA.filter(a => st.arterIn.has(a.nr)).length} av ${ny.LA.length} lönearter i indata, ${st.arterUt.size} av ${ny.LA.filter(a => a.typ !== 'auto').length} manuella lönearter på lönebesked.`);
    expect(st.rader).toBeGreaterThan(ANTAL_SCENARIER);
    expect(ny.LA.filter(a => !st.arterIn.has(a.nr)).map(a => a.nr), 'lönearter som aldrig förekom').toEqual([]);
    expect(st.arterUt.size).toBe(ny.LA.filter(a => a.typ !== 'auto').length);
  });
});

// ===== Löneartsregistret =====

it.each(APPAR)('löneartsregistret är identiskt med legacy (%s)', (app) => {
  expect(ny.LA).toStrictEqual(gammalEng[app].LA);
  expect(ny.LA_VER).toBe(gammalEng[app].LA_VER);
});

// ===== Kontrakten =====

describe('lön: kitets kontrakt', () => {
  it('motorn har nyckel och version', () => {
    expect(ny.lonEngine.key).toBe('lon');
    expect(ny.lonEngine.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('varje parser har sina fixtures', () => {
    for (const p of ny.parsrar) for (const f of p.fixtures) expect(existsSync(join(LON_FIXTURES, f)), f).toBe(true);
  });
  it('filigenkänningen väljer rätt parser', () => {
    const v = (kind: 'txt' | 'pdf', fil: string) => valjParser(ny.parsrar, { name: fil, kind, text: las(fil) })?.key;
    expect(v('txt', 'ldl.txt')).toBe('ldl');
    expect(v('txt', 'skattetabell.txt')).toBe('skatt');
    expect(v('pdf', 'bro.txt')).toBe('bro');
    expect(v('pdf', 'sturup.txt')).toBe('sturup');
    expect(v('pdf', 'avrakning.txt')).toBe('avr');
    expect(valjParser(ny.parsrar, { name: 'x.txt', kind: 'txt', text: 'hej' })).toBeNull();
  });
  it('sammanfattning på svenska', () => {
    expect(ny.ldlParser.parse({ name: 'ldl.txt', kind: 'txt', text: las('ldl.txt') }).summary).toBe('7 körpass, 4 förare, 2 bilar');
  });
  it('reglerna väljs efter utbetalningsmånad', () => {
    const tidig = { ...ny.LON_REGLER[0]!, giltigFran: '2020-01' };
    const ny2028 = { ...ny.LON_REGLER[0]!, giltigFran: '2028-01', ag: { ...ny.LON_REGLER[0]!.ag, full: { sats: 0.3, text: '30 %' } } };
    const R = [ny2028, tidig];
    expect(ny.reglerFor('2027-12', R)).toBe(tidig);
    expect(ny.reglerFor('2028-01', R)).toBe(ny2028);
    expect(ny.agAvgift('19800000-0000', 10000, '2028-02', 2026, ny.reglerFor('2028-02', R))).toEqual({ belopp: 3000, sats: '30 %' });
  });
  it('testerna körs i svensk tid', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-120);
  });
});

// ===== Fas 1b2: låsta beteenden (ägarens beslut 2026-10-11) =====

describe('lön: fas 1b2, låsta beteenden', () => {
  // Beslut 4 gällde till legacy 2026-10-13. Åkarkassan v33 betalar fast lön samma månad och provision månaden
  // efter, och räknar hittills i år efter utbetalningsdatum som tripkassan. Jämförs mot legacy för båda lönemodellerna.
  it('åkarkassan v33: hittills i år efter utbetalningsdatum, som legacy, även för december', () => {
    const utbFor = (per: string, dag: number) => { const y = +per.slice(0, 4), m = +per.slice(5); return (m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0')) + '-' + String(dag).padStart(2, '0'); };
    const perioder = Array.from({ length: 20 }, (_, i) => { const d = new Date(2025, 9 + i, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
    const DAGAR = [1, 10, 25, 28];
    const modellFor = (per: string) => +per.slice(5) % 2 ? 'procent' : 'fast';
    let jamforda = 0, december = 0; const summor = new Set<number>();
    for (const period of perioder.slice(2, -2)) for (const utbetDag of DAGAR) for (const bas of [undefined, { tom: period.slice(0, 4) + '-01', lon: 10000, skatt: 3000 }]) {
      const lonHist = { 1001: Object.fromEntries(perioder.map((per, i) => [per, { utb: utbFor(per, DAGAR[i % 4]!), brutto: 1000 + i, skatt: 100 + i }])) };
      const S = handS({ period, cfg: { utbetDag }, forare: { 1001: { modell: modellFor(period), person: { personnr: '19800000-0000', ...(bas ? { ytd: bas } : {}) } } }, lonHist });
      const N = ny.lon(S, ny.AKARKASSAN, { idagAr: IDAG_AR });
      for (const modell of ['procent', 'fast']) {
        const a = N.ytd('1001', 5000, 1500, modell);
        expect(a, 'legacy ' + period + ' dag ' + utbetDag + ' ' + modell).toEqual(gammalLon.akarkassan(structuredClone(S)).ytd('1001', 5000, 1500, modell));
        jamforda++; summor.add(a.lon); if (period.endsWith('-12')) december++;
      }
    }
    expect(december).toBeGreaterThan(0);
    expect(jamforda).toBe(16 * 4 * 2 * 2);
    expect(summor.size, 'olika summor hittills i år').toBeGreaterThan(10);
  });

  // Beslut 5 gällde till legacy 2026-10-13. Sedan Åkarkassan v33 räknar ingen av apparna lönearter för modell "ingen".
  it('lönemodell "ingen" med lönearter: ingen av apparna räknar dem', () => {
    const S = handS(LON_SCENARIER.lonearter!);
    for (const app of APPAR) {
      const rad = (r: ny.LonResultat) => r.rows.find(x => x.id === '1003')!;
      const n = rad(ny.lon(S, SOM_LEGACY[app], { idagAr: IDAG_AR }).result()), gl = rad(gammalLon[app](structuredClone(S)).result() as ny.LonResultat);
      expect(n.modell).toBe('ingen');
      expect(n).toStrictEqual(gl);
      expect(n.extra).toEqual([]); expect(n.brutto).toBe(0); expect(n.agAvg).toBe(0);
    }
  });

  // Beslut 6. laRader tittar inte på aktiv, och arter som appen räknar själv och okända nummer hoppas över utan varning.
  it('laRader: avslagen art räknas, auto-arter och okända nummer hoppas över', () => {
    const own = { 201: { aktiv: false }, '004': { aktiv: false, apris: 150 } };
    const rader = [{ nr: '201', antal: 2 }, { nr: '004', antal: 3 }, { nr: '020', belopp: 999 }, { nr: '912', belopp: 1 }, { nr: '999', belopp: 5 }];
    const n = ny.laRader(rader, own, 0);
    expect(n.map(x => [x.kod, x.belopp])).toEqual([['201', 48.54], ['004', 450]]);
    for (const app of APPAR) expect(n).toStrictEqual(gammalEng[app].laRader!(rader as never, own as never, 0 as never));
  });
});

// ===== Legacy 2026-10-13: Åkarkassan v33 och Tripkassan v25 (ägarens beslut 2026-10-13) =====

describe('lön: legacy 2026-10-13', () => {
  const EGNA = [
    { nr: '7001', namn: 'Egen ersättning', typ: 'belopp', sida: 'brutto', agi: '011', sem: 1, konto: '7090' },
    { nr: '201', namn: 'Krockar med registret och hoppas över' },
    { nr: '' },
  ] as ny.EgenArt[];
  const own = { '004': { aktiv: true, apris: 165 } };

  it.each(APPAR)('egna lönearter (%s): lonearter och laRader som legacy, och utan egna samma som förut', (app) => {
    const G = gammalEng[app];
    expect(ny.lonearter(own, EGNA)).toStrictEqual(G.lonearter!(own as never, EGNA as never));
    expect(ny.lonearter(own, EGNA).find(a => a.nr === '7001')).toMatchObject({ egen: 1, aktiv: true });
    expect(ny.lonearter(own, EGNA).filter(a => a.nr === '201')).toHaveLength(1);
    expect(ny.lonearter(own)).toStrictEqual(ny.lonearter(own, []));
    expect(ny.lonearter(own)).toStrictEqual(G.lonearter!(own as never));
    const rader = [{ nr: '7001', belopp: 500 }, { nr: '201', antal: 2 }];
    expect(ny.laRader(rader, own, 30000, EGNA)).toStrictEqual(G.laRader!(rader as never, own as never, 30000 as never, EGNA as never));
    expect(ny.laRader(rader, own, 30000, EGNA).map(x => x.kod)).toEqual(['7001', '201']);
    expect(ny.laRader(rader, own, 30000).map(x => x.kod), 'utan egna hoppas 7001 över').toEqual(['201']);
  });

  it.each(APPAR)('egna lönearter i hela lönen (%s)', (app) => {
    const sc = LON_SCENARIER.lonearter!;
    const S = handS({ ...sc, cfg: { ...sc.cfg, lonearterEgna: EGNA }, manad: { ...sc.manad, 1001: { rader: [...(sc.manad![1001]!.rader ?? []), { nr: '7001', belopp: 750 }] } } });
    likaLon(app, S);
    const r = ny.lon(S, ny.VARIANTER[app], { idagAr: IDAG_AR }).result().rows.find(x => x.id === '1001')!;
    expect(r.extra.find(x => x.kod === '7001')).toMatchObject({ belopp: 750, sida: 'brutto', sem: true });
  });

  it.each(APPAR)('anställningsperiod (%s): körpass utanför ger modell "ingen", inga lönearter, och listas som varning', (app) => {
    const sc = LON_SCENARIER.lonearter!;
    const S = handS({ ...sc, forare: { ...sc.forare, 1001: { ...sc.forare[1001], start: '2026-04-01' } } });
    likaLon(app, S);
    const L = ny.lon(S, ny.VARIANTER[app], { idagAr: IDAG_AR }), R = L.result();
    const r = R.rows.find(x => x.id === '1001')!;
    expect(r.pass).toBeGreaterThan(0);
    expect(r.modell).toBe('ingen');
    expect(r.extra).toEqual([]);
    expect(r.brutto).toBe(0);
    // 1003 har modell "ingen" i inställningarna och är ingen varning.
    expect(L.ejAnstallda(R).map(x => x.id)).toEqual(['1001']);
    const G = gammalLon[app](structuredClone(S));
    expect(L.ejAnstallda(R).map(x => x.id)).toStrictEqual((G.ejAnstallda(G.result()) as ny.ForareRad[]).map(x => x.id));
    expect(L.lonevarningar(R).filter(v => v.typ === 'ej_anstalld').map(v => v.id)).toEqual(['1001']);
    expect(ny.lon({ ...S, demo: true }, ny.VARIANTER[app], { idagAr: IDAG_AR }).ejAnstallda(R), 'demoläge').toEqual([]);
  });

  it('åkarkassan v33: förra månadens kontanter kvittas mot fast lön från 2026-10, tripkassan kvittar inte', () => {
    const sc = LON_SCENARIER.fastLon!;
    const fore = handS({ ...sc, period: '2026-09' }), efter = handS({ ...sc, period: '2026-10' });
    fore.prevKont = { 1004: 1234 }; efter.prevKont = { 1004: 1234 };
    for (const app of APPAR) { likaLon(app, fore); likaLon(app, efter); }
    const rad = (S: ny.LonState, app: LegacyApp) => { const L = ny.lon(S, ny.VARIANTER[app], { idagAr: IDAG_AR }); const r = L.result().rows.find(x => x.id === '1004')!; return { r, b: L.lonOf(r, L.cfg()) }; };
    const a = rad(efter, 'akarkassan');
    expect(a.r.kontant).toBe(1234);
    expect(a.b.rader.find(x => x.kod === '008')).toMatchObject({ text: 'Kontanter i bilen september, kvittas', belopp: -1234 });
    expect(rad(fore, 'akarkassan').r.kontant, 'före 2026-10: månadens kontanter som förut').not.toBe(1234);
    expect(rad(efter, 'tripkassan').r.kontant).toBe(0);
  });

  it('åkarkassan v33: standardinställningar och utbetalningsdagar', () => {
    expect(ny.AKARKASSAN.DEF).toMatchObject({ utbetDag: 25, utbetDagProv: 10, utbSamma: true, kontEfterFran: '2026-10' });
    const S = handS({ ...LON_SCENARIER.grund!, period: '2026-10' });
    const L = ny.lon(S, ny.AKARKASSAN, { idagAr: IDAG_AR }), G = gammalLon.akarkassan(structuredClone(S));
    expect(L.utbDatum(L.cfg(), 'fast')).toBe('2026-10-25');
    expect(L.utbDatum(L.cfg(), 'procent')).toBe('2026-11-10');
    for (const m of ['fast', 'procent', undefined]) expect(L.utbDatum(L.cfg(), m)).toBe(G.utbDatum(G.cfg(), m));
  });
});

// ===== Avvikelse från legacy: lönemodell "ingen" ger ingen utbetalning (ägarens beslut 2026-10-13) =====

describe('lön: lönemodell "ingen" får inga kvittade kontanter (avviker från legacy)', () => {
  it.each(APPAR)('%s: kontant 0, förskott 0, netto 0, och kontanterna listas som varning', (app) => {
    const sc = LON_SCENARIER.lonearter!;
    const S = handS({ ...sc, manad: { ...sc.manad, 1003: { ...sc.manad![1003], forskott: 500 } } });
    const L = ny.lon(S, ny.VARIANTER[app], { idagAr: IDAG_AR }), R = L.result();
    const r = R.rows.find(x => x.id === '1003')!;
    const legacy = (gammalLon[app](structuredClone(S)).result() as ny.LonResultat).rows.find(x => x.id === '1003')!;
    expect(r.modell).toBe('ingen');
    // Åkarkassan kvittar kontanterna i legacy. Tripkassan kvittar bara kontanter för provisionslön.
    if (app === 'akarkassan') expect(legacy.kontant, 'legacy kvittar kontanterna').toBeGreaterThan(0);
    expect(r.kontant).toBe(0);
    expect(r.forskott).toBe(0);
    expect(r.ejKvittat).toEqual({ kontant: legacy.kontant, forskott: 500 });
    const b = L.lonOf(r, L.cfg());
    expect(b.netto).toBe(0);
    expect(b.skatt).toBe(0);
    expect(b.rader).toEqual([]);
    const v = L.lonevarningar(R).filter(x => x.typ === 'kontanter_utan_lon');
    expect(v).toEqual([{ id: '1003', typ: 'kontanter_utan_lon', kontant: legacy.kontant, forskott: 500, text: expect.stringMatching(legacy.kontant ? /^Förare 1003 får ingen lön för månaden\. Kontanter .* kr och förskott 500 kr kvittas inte/ : /^Förare 1003 får ingen lön för månaden\. Förskott 500 kr kvittas inte/) }]);
    // Allt annat är som legacy.
    const somLegacy = ny.lon(S, SOM_LEGACY[app], { idagAr: IDAG_AR }).result();
    const utan = (x: ny.ForareRad) => Object.fromEntries(Object.entries(x).filter(([k]) => !['kontant', 'forskott', 'ejKvittat'].includes(k)));
    expect(R.rows.map(utan)).toStrictEqual(somLegacy.rows.map(utan));
    expect(R.rows.filter(x => x.id !== '1003')).toStrictEqual(somLegacy.rows.filter(x => x.id !== '1003'));
  });

  it.each(APPAR)('%s: utan kontanter och förskott blir det ingen varning, och jämkning ger ingen skatt', (app) => {
    const sc = LON_SCENARIER.lonearter!;
    const S = handS({ ...sc, forare: { ...sc.forare, 1003: { ...sc.forare[1003], person: { ...sc.forare[1003]!.person, jamkning: 300 } } }, manad: { ...sc.manad, 1003: { ...sc.manad![1003], kontant: 0 } } });
    const L = ny.lon(S, ny.VARIANTER[app], { idagAr: IDAG_AR }), R = L.result(), r = R.rows.find(x => x.id === '1003')!;
    expect(r.ejKvittat).toBeUndefined();
    expect(L.lonevarningar(R).filter(x => x.typ === 'kontanter_utan_lon')).toEqual([]);
    expect(L.lonOf(r, L.cfg())).toMatchObject({ skatt: 0, netto: 0 });
  });

  it('diffen mot legacy i de handskrivna scenarierna (skrivs ut i CI)', () => {
    const rader: string[] = [];
    for (const app of APPAR) for (const namn of Object.keys(LON_SCENARIER)) {
      const S = handS(LON_SCENARIER[namn]!);
      const ny1 = kor(() => ny.lonEngine.compute(S, { variant: app, idag: IDAG_FACIT })), gam = kor(() => ny.lonEngine.compute(S, { variant: SOM_LEGACY[app], idag: IDAG_FACIT }));
      if (!('varde' in ny1) || !('varde' in gam)) continue;
      const a = ny1.varde as ny.LonUtdata, g = gam.varde as ny.LonUtdata;
      for (const r of a.resultat.rows) {
        const gr = g.resultat.rows.find(x => x.id === r.id)!, gb = g.lon[r.id]!, nb = a.lon[r.id]!;
        if (gr.kontant !== r.kontant || gr.forskott !== r.forskott || gb.netto !== nb.netto || gb.skatt !== nb.skatt)
          rader.push(`${app} ${namn} förare ${r.id}: kontant ${gr.kontant} -> ${r.kontant}, förskott ${gr.forskott} -> ${r.forskott}, skatt ${gb.skatt} -> ${nb.skatt}, netto ${gb.netto} -> ${nb.netto}`);
      }
    }
    console.log('Avvikelse lönemodell "ingen":\n' + (rader.join('\n') || '(ingen skillnad)'));
    expect(rader.every(x => / -> 0, förskott .* -> 0, skatt .* -> 0, netto .* -> 0$/.test(x))).toBe(true);
  });
});
