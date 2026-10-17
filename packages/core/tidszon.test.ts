// Fas 2: motorerna ska ge samma resultat oavsett datorns tidszon (krav från fas 1b).
// Indata skapas i svensk tid. Sedan körs hela kedjan (parsrar och motor) i flera tidszoner,
// och resultatet ska vara exakt detsamma som i svensk tid.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as lon from './lon/index';
import * as fol from './foliering/index';
import { ANTAL_SCENARIER, genereraLon } from './lon/fixtures/generera';
import { LON_SCENARIER } from './lon/fixtures/scenarier';
import { lasText } from './avrakning/fixtures/las';

const ZONER = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
const APPAR = ['akarkassan', 'tripkassan'] as const;

/** Kör fn med datorns tidszon satt till tz. */
function iZon<T>(tz: string, fn: () => T): T {
  const fore = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = fore; }
}

const las = (fil: string) => lasText(join('..', '..', 'lon', 'fixtures', fil));
type Skatt = 'packad' | 'objekt' | 'ingen';
interface Indata { period: string | null; ldl: string; bro: string[]; sturup: string[]; settings: Record<string, unknown>; month: Record<string, unknown>; skatt: Skatt; skattAr?: number | string; demo: boolean }

/** Hela kedjan från text till lönebesked, som JSON. */
function lonKedja(app: typeof APPAR[number], o: Indata): string {
  try {
    const T = lon.parseSkattetabell(las('skattetabell.txt'));
    const skatt = o.skatt === 'ingen' ? null : o.skatt === 'objekt' ? T : Object.fromEntries(Object.entries(T).map(([k, t]) => [k, lon.packTabell(t)]));
    const S = {
      settings: o.settings, period: o.period, month: o.month, shifts: lon.parseLDL(o.ldl).shifts,
      passages: { bro: lon.parseBro(o.bro).rows, stu: lon.parseSturup(o.sturup).rows },
      skatt, demo: o.demo, ...(o.skattAr !== undefined ? { skattAr: o.skattAr } : {}),
    } as unknown as lon.LonState;
    return JSON.stringify(lon.lonEngine.compute(S, { variant: app, idag: '2026-10-11' }));
  } catch (e) { return 'fel: ' + (e instanceof Error ? e.message : String(e)); }
}

const handIndata = (namn: string): Indata => {
  const sc = LON_SCENARIER[namn]!;
  return { period: sc.period, ldl: las('ldl.txt'), bro: las('bro.txt').split('\n'), sturup: las('sturup.txt').split('\n'),
    settings: { cfg: sc.cfg ?? {}, forare: sc.forare, lonHist: sc.lonHist ?? {} }, month: { forare: sc.manad ?? {} }, skatt: sc.skatt ?? 'packad', skattAr: sc.skattAr, demo: !!sc.demo };
};

// Pass och passager kring sommartid (2026-03-29 02:00) och vintertid (2026-10-25 03:00).
const DST_LDL = [
  '01;1;2026-03-28 20:00;2026-03-29 04:30;0;1001;650;ABC 12A;559000-0001;DEMO ÅKERI AB;;;5;100;80;50000;50000;0;0;;0;0;50000;0;0;0;0;50000;0;0',
  '01;2;2026-03-29 01:30;2026-03-29 03:30;0;1002;651;ABC 34B;559000-0001;DEMO ÅKERI AB;;;2;100;80;10000;10000;0;0;;0;0;10000;0;0;0;0;10000;0;0',
  '01;3;2026-03-29 02:30;2026-03-29 05:00;0;1003;652;ABC 56C;559000-0001;DEMO ÅKERI AB;;;2;100;80;10000;10000;0;0;;0;0;10000;0;0;0;0;10000;0;0',
  '01;4;2026-10-24 21:00;2026-10-25 03:30;0;1001;650;ABC 12A;559000-0001;DEMO ÅKERI AB;;;5;100;80;50000;50000;0;0;;0;0;50000;0;0;0;0;50000;0;0',
  '01;5;2026-10-25 01:30;2026-10-25 02:30;0;1002;651;ABC 34B;559000-0001;DEMO ÅKERI AB;;;2;100;80;10000;10000;0;0;;0;0;10000;0;0;0;0;10000;0;0',
  '01;6;2026-10-25 02:30;2026-10-25 04:00;0;1003;652;ABC 56C;559000-0001;DEMO ÅKERI AB;;;2;100;80;10000;10000;0;0;;0;0;10000;0;0;0;0;10000;0;0',
].join('\r\n');
const DST_BRO = ['2026-03-29 02:15:00 ABC 12A / SV/DK Klass 1 SEK 201,00', '2026-10-25 02:15:00 ABC 34B / SV/DK Klass 1 SEK 201,00'];
const DST_STU = ['Bil 652 ABC 56C (2)', '29.03.26 02:40 29.03.26 03:10 P5 Korttid 35,00 SEK', '25.10.26 02:40 25.10.26 03:10 P5 Korttid 35,00 SEK'];
const dstIndata = (period: string): Indata => ({ period, ldl: DST_LDL, bro: DST_BRO, sturup: DST_STU, settings: { cfg: {}, forare: {}, lonHist: {} }, month: { forare: {} }, skatt: 'ingen', demo: false });

describe.each(APPAR)('lön (%s): samma resultat i alla tidszoner', (app) => {
  const fall: [string, () => Indata][] = [
    ...Object.keys(LON_SCENARIER).map(n => ['hand ' + n, () => handIndata(n)] as [string, () => Indata]),
    ['sommartid', () => dstIndata('2026-03')], ['vintertid', () => dstIndata('2026-10')],
    ...Array.from({ length: ANTAL_SCENARIER }, (_, i) => ['slump ' + i, () => genereraLon(i) as unknown as Indata] as [string, () => Indata]),
  ];
  it('alla scenarier', () => {
    const fel: string[] = [];
    for (const [namn, skapa] of fall) {
      const indata = skapa(); // indata skapas i svensk tid
      const facit = lonKedja(app, indata);
      for (const tz of ZONER) if (iZon(tz, () => lonKedja(app, indata)) !== facit) fel.push(namn + ' i ' + tz);
    }
    expect(fel).toEqual([]);
  }, 120_000);
});

describe('foliering: samma resultat i alla tidszoner', () => {
  it('månadens namn i nyckeltalen följer dagens datum', () => {
    const S = { arenden: new Map(), fordon: new Map(), forsakring: new Map(), kostnader: new Map(), bokforing: new Map(), inst: {} } as unknown as fol.FolieringState;
    for (const idag of ['2026-08-01', '2026-08-31', '2026-01-01', '2026-12-31']) {
      const tid = { idag, nu: idag + 'T10:00:00.000Z', nuMs: 0, slump: () => 0 };
      const facit = fol.foliering(S, tid).oversikt().nyckeltal.at(-1)!.lbl;
      for (const tz of ZONER) expect(iZon(tz, () => fol.foliering(S, tid).oversikt().nyckeltal.at(-1)!.lbl), idag + ' i ' + tz).toBe(facit);
    }
  });
});
