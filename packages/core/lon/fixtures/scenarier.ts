// Handskrivna, påhittade scenarier för lönemotorn. Körpassen kommer från ldl.txt (mars 2026),
// passagerna från bro.txt och sturup.txt. Personnummer har månad och dag 0000 och finns inte på riktigt.
import type { ForareInst, LonHist } from '../lonebesked';
import type { ForareManad } from '../types';

export interface LonHandScenario {
  period: string | null;
  cfg?: Record<string, unknown>;
  forare: Record<string, ForareInst>;
  manad?: Record<string, ForareManad>;
  lonHist?: Record<string, Record<string, LonHist>>;
  /** Index i bro.txt (passagerna) som flyttas manuellt till en förare, eller tas bort från förare (''). */
  overrides?: Record<number, string>;
  skatt?: 'packad' | 'objekt' | 'ingen';
  /** Året för inlästa skattetabeller (S.skattAr). */
  skattAr?: number | string;
  demo?: boolean;
}

const pers = (personnr: string, ovrigt: Record<string, unknown> = {}) => ({ personnr, tabell: 33, bank: '1234-5678901', ...ovrigt });

const GRUNDFORARE: Record<string, ForareInst> = {
  1001: { namn: 'Förare 1', modell: 'procent', person: pers('19800000-0000') },
  1002: { namn: 'Förare 2', person: pers('8500000000', { tabell: 34 }) },
  1003: { namn: 'Förare 3', modell: 'procent', person: pers('19920000-0000') },
  1004: { namn: 'Förare 4', modell: 'procent', person: pers('19750000-0000', { bank: undefined }) },
};

export const LON_SCENARIER: Record<string, LonHandScenario> = {
  // Provision, bro och Sturup kopplade till pass, plattformsavgift, bomkörning, kontanter och förskott.
  grund: {
    period: '2026-03',
    forare: GRUNDFORARE,
    manad: { 1001: { boltProv: 350, ob: 400 }, 1002: { kontant: '', forskott: 1000 }, 1003: { kontant: 0, bonus: '500' } },
    overrides: { 2: '1002', 3: '' },
  },

  // Fast lön. Båda tar med fast anställda utan pass (åkarkassan sedan v33). Tripkassan kvittar inte kontanter.
  fastLon: {
    period: '2026-03',
    forare: {
      ...GRUNDFORARE,
      1004: { namn: 'Förare 4', modell: 'fast', manadslon: 26000, semFast: true, person: pers('19750000-0000') },
      2001: { namn: 'Kontor 1', modell: 'fast', manadslon: '31000', person: pers('19880000-0000') },
      2002: { namn: 'Kontor 2', modell: 'fast', manadslon: 29000, slutat: true, person: pers('19900000-0000') },
      2003: { namn: 'Kontor 3', modell: 'fast', manadslon: 30000, start: '2026-04-01', person: pers('19910000-0000') },
      2004: { namn: 'Kontor 4', modell: 'fast', manadslon: 30000, slut: '2026-02-28', person: pers('19930000-0000') },
    },
    manad: { 2001: { bonus: 2000 } },
  },

  // Skatt och arbetsgivaravgift: engångsskatt, jämkning, kolumn 3, född 1937, ungdomsnedsättning, saknad tabell.
  skatt: {
    period: '2026-05',
    forare: {
      1001: { modell: 'procent', person: pers('19500000-0000') },
      1002: { modell: 'procent', person: pers('19370000-0000', { engang: 30 }) },
      1003: { modell: 'procent', person: pers('20050000-0000', { jamkning: '1200' }) },
      1004: { modell: 'procent', person: pers('370000+0000', { tabell: 35 }) },
    },
  },

  // Hittills i år: ingående belopp och tidigare lönekörningar.
  ytd: {
    period: '2026-09',
    forare: {
      ...GRUNDFORARE,
      1001: { modell: 'procent', person: pers('19800000-0000', { ytd: { tom: '2026-05', lon: '150 000,50', skatt: 40000 } }) },
    },
    lonHist: {
      1001: { '2026-04': { utb: '2026-05', brutto: 30000, skatt: 8000 }, '2026-07': { utb: '2026-08', brutto: 32000, skatt: 8600 }, '2026-08': { brutto: 1, skatt: 1 } },
      1002: { '2026-08': { utb: '2026-09', brutto: 28000, skatt: 7200 } },
    },
  },

  // December: utbetalning i januari nästa år. Egna inställningar och utbetalning i samma månad.
  december: {
    period: '2026-12',
    cfg: { procent: 40, semester: 13, broAndel: 50, inklPickup: false, inklSturup: false, bomBortLon: false, dagStart: 6, dagSlut: 18, broMarginalMin: 45, utbSamma: false, utbetDag: 27, utbetDagProv: 3 },
    forare: { ...GRUNDFORARE, 1003: { modell: 'fast', manadslon: 30000, person: pers('20060000-0000') } },
    skatt: 'objekt',
  },

  // Ingen period och inga skattetabeller.
  utanPeriod: { period: null, forare: GRUNDFORARE, skatt: 'ingen' },

  // Demoläge: tripkassan tar inte med fast anställda utan pass.
  demo: { period: '2026-03', forare: { ...GRUNDFORARE, 2001: { modell: 'fast', manadslon: 30000 } }, demo: true },

  // Lönearter av alla sidor (fas 1b2): lön, förmån, skattefritt, extra skatt och justering efter skatt.
  // Förare 1002 har fast lön med faktorarter. Förare 1003 har lönemodell "ingen" med rader, som ingen av apparna räknar.
  // Skattetabellen gäller fel år.
  lonearter: {
    period: '2026-03',
    cfg: { lonearter: { '004': { aktiv: true, apris: 165 }, '201': { apris: 30 } } },
    forare: {
      ...GRUNDFORARE,
      1002: { namn: 'Förare 2', modell: 'fast', manadslon: 30000, semFast: true, person: pers('8500000000', { tabell: 34 }) },
      1003: { namn: 'Förare 3', modell: 'ingen', person: pers('19920000-0000') },
      2001: { namn: 'Förare 5', modell: 'fast', manadslon: 28000, person: pers('19900000-0000') },
    },
    manad: {
      1001: { rader: [{ nr: '201', antal: 10 }, { nr: '004', antal: 4 }, { nr: '090', belopp: 1200 }, { nr: '091', belopp: 240 }, { nr: '530', belopp: 1500 }, { nr: '510', antal: 2 }, { nr: '915', belopp: 500 }, { nr: '991', belopp: -150, text: 'Rättelse' }, { nr: '020', belopp: 999 }, { nr: '999', belopp: 1 }] },
      1003: { rader: [{ nr: '410', belopp: 2000 }] },
      1002: { rader: [{ nr: '480', antal: 2 }, { nr: '485', antal: 3 }, { nr: '088', antal: 8, apris: '' }, { nr: '511', belopp: 900 }] },
      2001: { rader: [{ nr: '082', antal: 20 }] },
    },
    skattAr: 2025,
  },

  // Hittills i år över årsskiftet med utbSamma: provision för december betalas ut i januari.
  ytdUtbetalning: {
    period: '2026-12',
    cfg: { utbSamma: true },
    forare: {
      ...GRUNDFORARE,
      2001: { namn: 'Förare 5', modell: 'fast', manadslon: 30000, person: pers('19900000-0000') },
    },
    lonHist: {
      1001: { '2026-10': { utb: '2026-11-07', brutto: 30000, skatt: 8000 }, '2026-11': { utb: '2026-12-07', brutto: 31000, skatt: 8300 }, '2027-01': { utb: '2027-02-07', brutto: 1, skatt: 1 } },
      1002: { '2026-11': { utb: '2026-12-07', brutto: 28000, skatt: 7200 }, '2026-12': { utb: '2027-01-07', brutto: 5, skatt: 5 } },
      2001: { '2026-11': { utb: '2026-11-25', brutto: 30000, skatt: 7900 }, '2026-12': { utb: '2026-12-25', brutto: 7, skatt: 7 } },
    },
  },
};
