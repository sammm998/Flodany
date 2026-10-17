// Handskrivna, påhittade scenarier för avräkningen. Varje scenario täcker ett område i compute.
import type { Bolag, Indata, Installningar } from '../types';

export type TcKalla = 'pdf' | 'csv' | null;

export interface HandScenario {
  /** Varifrån tc kommer: taxicaller.pdf.json, taxicaller-deb.csv eller ingen. */
  tc: TcKalla;
  /** Läs in bambora.sales.json, app.csv och passager.txt. */
  filer: boolean;
  bolag?: Bolag[];
  D: Indata;
}

export const GRUND_S: Installningar = {
  params: { vx: 8900, tl: 250, sa: 0.03, m6: 0.06, m25: 0.25, bro: 201, sturup: 32.6, cph: 15, fs: 99 },
  bilar: [
    { bil: 101, reg: 'ABC11A', avr: 'Åkeri Ett AB' },
    { bil: '102', reg: 'ABC 22B', avr: 'Åkeri Ett AB' },
    { bil: 103, reg: 'ABC33C', bolag: ' Åkeri Två AB ' },
    { bil: 104, reg: 'ABC44D', avr: 'Okänt Åkeri AB' },
    { bil: 105, reg: 'ABC55E', avr: 'IGNORERA' },
  ],
  terminaler: [
    { id: 'T10000001', bil: 101 },
    { id: 'T10000002', bil: '102' },
    { id: 'T10000003', bil: 103 },
    { id: 'T77777777', bil: null },
  ],
  kassor: [{ kassor: 7, bil: 105 }],
  bolag: [
    { namn: 'Åkeri Ett AB', kn: 91190001, vx: 2, tl: 2 },
    { namn: 'Åkeri Två AB', kn: '91190002', kn2: '91199002', vx: 1, tl: 1, fsFrom: '2026-01' },
  ],
};

const prevRader = (vx: number, tl: number) => [
  { art: 1, text: 'Växelavgift Åkare OKT26', antal: vx },
  { art: 1, text: 'Växelavgift Åkare SEP26 (efterdebitering)', antal: 1 },
  { art: 8, text: 'Taklampa hyra', antal: tl },
  { art: 8, text: 'Taklampa hyra OKT26 saknades', antal: 1 },
];

export const SCENARIER: Record<string, HandScenario> = {
  // Alla filer, TaxiCaller som PDF. Refund, okänd terminal, bil som saknas, bud och utland, kundfaktura som avviker.
  grund: { tc: 'pdf', filer: true, D: { period: '2026-09', cph: { 101: 3, 103: '2' }, sturup: { 102: 4 } } },

  // TaxiCaller som CSV (konto utan nummer, bil 999 saknas i registret).
  csv: { tc: 'csv', filer: true, D: { period: '2026-09' } },

  // Växelavgift: innevarande, rabatt, gratisperioder, efterdebitering och manuella överstyrningar.
  vaxel: {
    tc: 'pdf', filer: true,
    bolag: [
      { namn: 'Åkeri Ett AB', kn: 91190001, vx: 3, tl: 3, vxRab: 20, fsFrom: '2026-09' },
      { namn: 'Åkeri Två AB', kn: '91190002', vx: '2', tl: '2', vxInn: '1' },
      { namn: 'Åkeri Tre AB', kn: 91190003, vx: 1, tl: 1, gratisTom: '2026-12' },
      { namn: 'Åkeri Fyra AB', kn: 91190004, vx: 2, tl: 0, gratisTom: 'alltid' },
      { namn: 'Åkeri Fem AB', kn: 91190005, vx: 0, gratisTom: '2026-06' },
      { namn: 'Åkeri Sex AB', kn: 91190006, vx: 4, tl: 2 },
    ],
    D: {
      period: '2026-09',
      prevSummary: { bolag: [
        { kn: 91190001, namn: 'Åkeri Ett AB', rows: prevRader(1, 1) },
        { kn: '91190002', namn: 'Åkeri Två AB', rows: prevRader(2, 2) },
        { namn: 'Åkeri Sex AB', rows: prevRader(2, 0) },
      ] },
      manuellt: {
        'Åkeri Ett AB': { rabatt: 500 },
        'Åkeri Två AB': { vxBak: '1', tlBak: '' },
        'Åkeri Sex AB': { ejBak: 1, tlBak: 1 },
      },
    },
  },

  // Öresundsbron, CPH och Sturup med priser per bil, okända reg nr, kontorets brickor och fel månad.
  broSturup: {
    tc: null, filer: true,
    D: {
      period: '2026-09',
      cph: { 101: 4, 102: 2 },
      broRad: { 101: { '201': 2, '215.5': 1 }, 102: { '201': 5 } },
      sturup: { 101: 3 },
      sturupRad: { 101: { '32.60': 9 }, 102: { '35.00': 2, '32.60': 1 }, 103: { '32.60': 4 } },
      sturupInfo: {
        okanda: [{ bil: 1500, reg: 'ABC97X', antal: 3, belopp: 97.8 }],
        avvik: [{ bil: 101, bilFil: 109, regFil: 'ABC96W' }, { bil: 102, bilFil: null, regFil: 'ABC95V', regReg: 'ABC22B' }],
        period: '2026-08',
      },
      oresund: {
        kostBro: 1000, kostCph: 133.33, nCph: 7,
        okandaBro: { ABC99Z: 1 }, okandaCph: { ABC98Y: 2 },
        manader: ['2026-08'], fakturadatum: '2026-10-05',
        ovriga: { 'bro|Bricka 1': 2, 'cph|Bricka 2': 1 },
        prisAndring: { fran: 201, till: 215.5 },
      },
    },
  },

  // Skulder: reskontra med kundnr, kn2 och namnmatchning, gammal åkare, skuldgräns, förskott och extra rader.
  skuld: {
    tc: 'pdf', filer: true,
    D: {
      period: '2026-09',
      skuldMed: true,
      reskontra: { datum: '2026-09-30', poster: [
        { kn: 91190001, nr: 10001, fdat: '2026-08-31', saldo: 42000, namn: 'Åkeri Ett AB' },
        { kn: '91190001', nr: 10002, fdat: '2026-07-31', saldo: 12000.5, namn: 'Åkeri Ett AB' },
        { kn: '91199002', nr: 10003, fdat: '2026-08-31', saldo: -800, namn: 'Åkeri Två AB' },
        { kn: '5555', nr: 10004, fdat: '2026-06-30', saldo: 300, namn: 'ÅKERI TVÅ AKTIEBOLAG' },
        { kn: '91198888', nr: 10005, fdat: '2025-12-31', saldo: 2500, namn: 'Tidigare Åkeri AB' },
        { kn: '91198888', nr: 10006, fdat: '2026-01-31', saldo: -100, namn: 'Tidigare Åkeri AB' },
        { kn: '91197777', nr: 10007, fdat: '2026-02-28', saldo: -450, namn: 'Annat Åkeri AB' },
      ] },
      prevSummary: { bolag: [{ namn: 'Åkeri Ett AB', skuld: 30000 }, { namn: 'Åkeri Två AB', skuld: -2000 }] },
      forskottRad: [
        { med: true, bolag: 'Åkeri Ett AB', datum: '2026-09-15', belopp: -2000 },
        { med: true, bolag: 'Åkeri Ett AB', datum: '2026-09-02', belopp: '-500.5' },
        { med: false, bolag: 'Åkeri Två AB', datum: '2026-09-10', belopp: -999 },
      ],
      manuellt: {
        'Åkeri Ett AB': { forskott: '-1000', oppna: 250.75 },
        'Åkeri Två AB': { extra: [
          null, { text: '  ' },
          { text: 'Skadeavgift', art: '', antal: '', apris: 1500, moms: 12 },
          { text: 'Gammal skuld', art: null, antal: 1, apris: 400, moms: 0, skuld: true },
          { text: 'Felaktig art', art: 'x', antal: 2, apris: 10, moms: '6' },
          { text: 'Noll', art: 57, antal: 1, apris: 0, moms: 25 },
        ] },
      },
    },
  },

  // Avstämning mot Visma: stämmer, avviker per artikel, saknas, finns bara i Visma. Reskontra inläst men inte med.
  visma: {
    tc: 'pdf', filer: true,
    bolag: [
      { namn: 'Åkeri Ett AB', kn: 91190001, vx: 2, tl: 2 },
      { namn: 'Åkeri Två AB', kn: '91190002', vx: 1, tl: 1 },
      { namn: 'Åkeri Tre AB', kn: 91190003, vx: 1, tl: 0 },
    ],
    D: {
      period: '2026-09',
      skuldMed: false,
      reskontra: { datum: '2026-09-30', poster: [{ kn: 91190001, nr: 10001, fdat: '2026-08-31', saldo: 1000, namn: 'Åkeri Ett AB' }] },
      visma: { bolag: [
        { kn: '91190001', nr: 70001, namn: 'Åkeri Ett AB', att: 0, rows: [{ art: 1, text: 'Växelavgift', summa: 17800 }, { art: null, text: 'F10001 (2026-08-31)', summa: '1000' }, { art: null, text: 'Övrigt', summa: 'x' }] },
        { kn: 91190002, nr: 70002, namn: 'Åkeri Två AB', att: 11346 },
        { kn: 99999, nr: 79999, namn: 'Bara i Visma AB', att: 1234 },
      ] },
    },
  },

  // Ingen data alls och ingen period, inga bolag.
  tom: { tc: null, filer: false, bolag: [], D: {} },

  // Ingen period men bolag med växelavgift. Legacy kastar TypeError här (lab(null)). Den nya motorn ska göra likadant.
  utanPeriod: { tc: null, filer: false, D: {} },
};
