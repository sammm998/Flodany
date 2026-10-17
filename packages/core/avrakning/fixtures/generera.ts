// Slumpade, påhittade testdata för avräkningen. Fast seed: samma scenarier vid varje körning.
// Inga riktiga uppgifter: bolag heter "Åkeri N AB", förare "Förare N", regnummer ABCnnX.
import type { PdfItem } from '@flodia/kit';
import type { Bolag, BilRegister, Indata, Installningar, Kassa, Terminal } from '../types';

export const SEED = 20261011;
export const ANTAL_SCENARIER = 300;

/** mulberry32: liten deterministisk slumpgenerator. */
export function slump(seed: number) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const heltal = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const val = <T>(lista: readonly T[]): T => lista[Math.floor(r() * lista.length)]!;
  const chans = (p: number) => r() < p;
  const ore = (min: number, max: number) => Math.round((min + r() * (max - min)) * 100) / 100;
  return { r, heltal, val, chans, ore };
}
export type Slump = ReturnType<typeof slump>;

const pad = (n: number) => String(n).padStart(2, '0');
const ymAdd = (p: string, n: number) => { const [y, m] = p.split('-').map(Number) as [number, number]; const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1); };

// ===== TaxiCaller-PDF som textobjekt =====

export interface PdfKorning {
  datum: string;
  tid: string;
  pass: string;
  ruttFran: string;
  ruttTill: string;
  id: string;
  bil: number | null;
  forare: string;
  forare2?: string; // namnet bryts på två rader
  pris: number;
}

export interface PdfKonto {
  nr: number;
  namn: string;
  fakturabelopp: number | null;
  korningar: PdfKorning[];
}

const KOL = { start: 10, pass: 40, rutt: 200, bil: 380, forare: 420, betal: 500, pris: 560 };

/** Ritar TaxiCallers fakturor som pdf.js-textobjekt (y nedåt), en ny sida var 45:e rad. */
export function ritaTaxiCaller(period: string, konton: PdfKonto[]): PdfItem[][] {
  const sidor: PdfItem[][] = [];
  let sida: PdfItem[] = [], y = 40, nr = 1;
  const rad = (...items: [string, number][]) => {
    if (y > 40 + 45 * 12) { sida.push({ str: 'Sida ' + nr++, x: 280, y: y + 20 }); sidor.push(sida); sida = []; y = 40; }
    for (const [str, x] of items) sida.push({ str, x, y });
    y += 12;
  };
  rad(['TaxiCaller', 10], ['period: ' + period + '-01 - ' + period + '-28', 300]);
  for (const k of konton) {
    rad(['Konto #' + k.nr + ' - ' + k.namn, 10]);
    rad(['Start', KOL.start], ['Passagerare', KOL.pass], ['Rutt', KOL.rutt], ['Bil', KOL.bil], ['Förare', KOL.forare], ['Betal', KOL.betal], ['Pris', KOL.pris]);
    let datum = '';
    let summa = 0;
    for (const t of k.korningar) {
      if (t.datum !== datum) { datum = t.datum; rad([datum, KOL.start]); }
      const items: [string, number][] = [[t.tid, KOL.start], [t.pass, KOL.pass], ['#' + t.id, KOL.rutt], ['från: ' + t.ruttFran, KOL.rutt + 50]];
      if (t.bil != null) items.push([String(t.bil), KOL.bil]);
      items.push([t.forare, KOL.forare], ['Konto', KOL.betal], [t.pris.toFixed(2), KOL.pris]);
      rad(...items);
      const fortsattning: [string, number][] = [['till: ' + t.ruttTill, KOL.rutt]];
      if (t.forare2) fortsattning.push([t.forare2, KOL.forare]);
      rad(...fortsattning);
      summa += t.pris;
    }
    rad(['Totalt pris', 10], [summa.toFixed(2), KOL.pris]);
    if (k.fakturabelopp != null) rad(['Fakturabelopp ' + k.fakturabelopp.toFixed(2), 10]);
  }
  sida.push({ str: 'Sida ' + nr, x: 280, y: y + 20 });
  sidor.push(sida);
  return sidor;
}

// ===== Ett slumpat scenario =====

export interface Scenario {
  nr: number;
  S: Installningar;
  pdf: PdfItem[][] | null;
  tcCsv: Record<string, unknown>[] | null;
  bambora: Record<string, unknown>[];
  app: Record<string, unknown>[];
  passager: string;
  /** Resten av D (allt utom tc, bamb, app och bro som kommer från parsrarna). */
  D: Indata;
}

const PLATS = ['Exempelgatan 4', 'Testvägen 12', 'Centralstationen', 'Sjukhusentrén', 'Hamnplan 1', 'Kastrup Lufthavn', 'Köpenhamn H', 'Flygplatsen', 'Storplan 3'];
const STATE = ['Cleared', 'Cleared', 'Cleared', 'Cleared', 'Declined', 'Pending'];
const TYPE = ['Sale', 'Sale', 'Sale', 'Sale', 'Refund', 'Void', undefined];

export function genereraScenario(nr: number): Scenario {
  const g = slump(SEED + nr);
  const period = g.heltal(2025, 2027) + '-' + pad(g.heltal(1, 12));

  // Bolag
  const nBolag = g.heltal(1, 5);
  const bolag: Bolag[] = [];
  for (let j = 1; j <= nBolag; j++) {
    const b: Bolag = { namn: 'Åkeri ' + j + ' AB', kn: g.chans(0.8) ? 91190000 + nr * 10 + j : String(5000 + j) };
    if (g.chans(0.2)) b.kn2 = String(91199000 + j);
    b.vx = g.val([0, 1, 1, 2, 3, 5, '2', '']);
    if (g.chans(0.2)) b.vxInn = g.val([1, '1', 0]);
    if (g.chans(0.25)) b.vxRab = g.val([10, 25, 50, 120, -5, '15']);
    b.tl = g.val([0, 1, 2, 4, '1', undefined]);
    if (g.chans(0.2)) b.gratisTom = g.chans(0.3) ? 'alltid' : ymAdd(period, g.heltal(-3, 4));
    if (g.chans(0.3)) b.fsFrom = ymAdd(period, g.heltal(-6, 2));
    bolag.push(b);
  }
  const bolagsnamn = [...bolag.map(b => b.namn), 'IGNORERA', 'Okänt Åkeri AB', ''];

  // Bilar, terminaler och kassor
  const nBilar = g.heltal(1, 15);
  const nummer = new Set<number>();
  while (nummer.size < nBilar) nummer.add(g.heltal(100, 999));
  const bilnr = [...nummer];
  const bilar: BilRegister[] = bilnr.map((b, i) => {
    const avr = g.chans(0.85) ? g.val(bolag).namn : g.val(bolagsnamn);
    const reg = 'ABC' + pad(i % 100) + String.fromCharCode(65 + (i % 26));
    const x: BilRegister = { bil: g.chans(0.9) ? b : String(b), reg: g.chans(0.9) ? reg : '' };
    if (g.chans(0.8)) x.avr = avr; else x.bolag = ' ' + avr + ' ';
    return x;
  });
  const terminaler: Terminal[] = bilnr.map((b, i) => ({ id: 'T' + (10000000 + nr * 100 + i), bil: g.chans(0.9) ? b : g.val([null, '', String(b)]) }));
  const kassor: Kassa[] = bilnr.filter(() => g.chans(0.3)).map(b => ({ kassor: g.heltal(1, 99), bil: b }));
  const params = { vx: g.val([8900, 7500, 9250.5]), tl: g.val([250, 300]), sa: g.val([0.03, 0.025]), m6: 0.06, m25: 0.25, bro: g.val([201, 215.5]), sturup: g.val([32.6, 35]), cph: g.val([15, 18.75]), fs: g.val([99, 149]) } as Installningar['params'];
  if (g.chans(0.3)) params.skuldGrans = g.val([1000, 20000]);
  const S: Installningar = { params, bilar, terminaler, kassor, bolag };

  // Okända bilar dyker också upp i filerna
  const allaBilar = [...bilnr, ...(g.chans(0.3) ? [g.heltal(1000, 1999)] : [])];
  const dag = () => period + '-' + pad(g.heltal(1, 28));
  const klocka = () => pad(g.heltal(0, 23)) + ':' + pad(g.heltal(0, 59));

  // TaxiCaller: PDF eller CSV
  const nKonton = g.heltal(0, 6);
  let pdf: PdfItem[][] | null = null, tcCsv: Record<string, unknown>[] | null = null;
  const korningar = (n: number) => Array.from({ length: n }, (): PdfKorning => {
    const bud = g.chans(0.15);
    return {
      datum: dag(), tid: klocka(), pass: (bud ? 'BUD ' : '') + 'Passagerare ' + g.heltal(1, 40), ruttFran: g.val(PLATS), ruttTill: g.val(PLATS),
      id: String(g.heltal(1000000, 9999999)), bil: g.chans(0.97) ? g.val(allaBilar) : null,
      forare: 'Förare ' + g.heltal(1, 30), ...(g.chans(0.1) ? { forare2: 'Efternamn' } : {}),
      pris: g.chans(0.05) ? -g.ore(10, 300) : g.ore(50, 2500),
    };
  });
  if (g.chans(0.6)) {
    const konton: PdfKonto[] = Array.from({ length: nKonton }, (_, j) => {
      const k = korningar(g.heltal(0, 12)).sort((a, b) => a.datum.localeCompare(b.datum));
      const tot = k.reduce((a, t) => a + t.pris, 0);
      return { nr: 9000 + j, namn: 'Kundbolag ' + j + ' AB', fakturabelopp: g.chans(0.2) ? null : Math.round((tot + (g.chans(0.2) ? g.ore(-50, 50) : 0)) * 100) / 100, korningar: k };
    });
    pdf = ritaTaxiCaller(period, konton);
  } else {
    tcCsv = [];
    for (let j = 0; j < nKonton; j++) for (const t of korningar(g.heltal(0, 12))) {
      tcCsv.push({ 'Körnings-id': t.id, 'Vehicle number': t.bil == null ? '' : String(t.bil), 'konto Nr': g.chans(0.95) ? String(9000 + j) : g.val(['', ' ', 'K' + j]),
        'Totalsumma': t.pris.toFixed(2).replace('.', ','), 'Passagerare': t.pass, 'Lämnad': t.datum + ' ' + t.tid, 'Upphämtningsplats': t.ruttFran, 'Avlämningsaddress': t.ruttTill });
    }
  }

  // Bambora (flik Sales)
  const bambora = Array.from({ length: g.heltal(0, 40) }, () => {
    const b = g.chans(0.9) ? g.val(bilnr) : g.heltal(1, 99);
    const tIdx = bilnr.indexOf(b);
    const rad: Record<string, unknown> = {
      'STATE': g.val(STATE), 'TERMINAL ID': tIdx >= 0 && g.chans(0.85) ? terminaler[tIdx]!.id : 'T' + g.heltal(90000000, 99999999),
      'CASHIER ID': g.chans(0.5) ? b : String(b), 'SALE AMOUNT': g.chans(0.1) ? -g.ore(10, 500) : g.ore(10, 1500),
      'TIP': g.chans(0.2) ? g.ore(0, 100) : 0, 'TRANSACTION DATE': dag() + ' ' + klocka(),
    };
    const typ = g.val(TYPE);
    if (typ !== undefined) rad['TYPE'] = typ;
    return rad;
  });

  // Appbetalningar
  const app = Array.from({ length: g.heltal(0, 25) }, () => {
    const rad: Record<string, unknown> = {
      'id': String(g.heltal(100000, 999999)), 'Vehicle number': String(g.val(allaBilar)), 'Price': g.ore(40, 900).toFixed(2),
      'Payment': g.val(['app', 'App', 'card', 'invoice']), 'Lämnad': dag() + ' ' + klocka(), 'Förare': 'Förare ' + g.heltal(1, 30) + (g.chans(0.1) ? ' , B' : ''),
      'Upphämtningsplats': g.val(PLATS), 'Avlämningsaddress': g.val(PLATS),
    };
    if (g.chans(0.3)) rad['Skede'] = g.val(['Levererad', 'delivered', 'Avbokad']);
    return rad;
  });

  // Passager i brofakturan (text med regnummer)
  const regs = bilar.map(b => b.reg).filter(Boolean) as string[];
  const passager = Array.from({ length: g.heltal(0, 30) }, () => {
    const reg = g.chans(0.85) && regs.length ? g.val(regs) : 'ABC' + pad(g.heltal(0, 99)) + 'Z';
    return dag() + ' ' + (g.chans(0.5) ? reg.slice(0, 3) + ' ' + reg.slice(3) : reg.toLowerCase()) + ' Öresundsbron';
  }).join('\n');

  // Resten av D
  const D: Indata = { period: g.chans(0.9) ? period : null };
  const perBil = (max: number) => Object.fromEntries(bilnr.filter(() => g.chans(0.3)).map(b => [String(b), g.chans(0.8) ? g.heltal(0, max) : String(g.heltal(0, max))]));
  if (g.chans(0.4)) D.sturup = perBil(20);
  if (g.chans(0.4)) D.cph = perBil(10);
  if (g.chans(0.3)) D.sturupRad = Object.fromEntries(bilnr.filter(() => g.chans(0.3)).map(b => [String(b), { '32.60': g.heltal(1, 8), '35.00': g.heltal(0, 4) }]));
  if (g.chans(0.3)) D.broRad = Object.fromEntries(bilnr.filter(() => g.chans(0.4)).map(b => [String(b), { '201': g.heltal(0, 6), '215.5': g.heltal(0, 3) }]));
  if (g.chans(0.5)) {
    D.manuellt = {};
    for (const b of bolag) if (g.chans(0.5)) D.manuellt[b.namn] = {
      ...(g.chans(0.3) ? { forskott: g.val([-2000, -500.5, '-1000', 0]) } : {}),
      ...(g.chans(0.2) ? { oppna: g.ore(-3000, 3000) } : {}),
      ...(g.chans(0.2) ? { rabatt: g.val([100, '250', 0]) } : {}),
      ...(g.chans(0.15) ? { ejBak: g.val([1, '1', 0]) } : {}),
      ...(g.chans(0.15) ? { vxBak: g.val([0, 1, 2, '', null, '3', -1]) } : {}),
      ...(g.chans(0.15) ? { tlBak: g.val([0, 1, '', null, '2']) } : {}),
      ...(g.chans(0.3) ? { extra: [null, { text: '' }, { text: 'Extra rad ' + g.heltal(1, 9), art: g.val([1, '', null, '57', 'x']), antal: g.val([1, 2, '', '3']), apris: g.ore(-500, 500), moms: g.val([0, 6, 25, 12, '6']), skuld: g.chans(0.3) }] } : {}),
    };
  }
  if (g.chans(0.3)) D.forskottRad = bolag.filter(() => g.chans(0.5)).map(b => ({ med: g.chans(0.8), bolag: b.namn, datum: dag(), belopp: g.val([-1500, '-700.25', -3000]) }));
  if (g.chans(0.4)) {
    D.prevSummary = { bolag: bolag.filter(() => g.chans(0.7)).map(b => ({ kn: b.kn, namn: b.namn, skuld: g.chans(0.5) ? g.ore(-5000, 30000) : 0,
      rows: g.chans(0.8) ? [
        { art: 1, text: 'Växelavgift Åkare JAN26', antal: g.heltal(0, 4) },
        { art: 1, text: 'Växelavgift Åkare DEC25 (efterdebitering)', antal: 1 },
        { art: 8, text: 'Taklampa hyra', antal: g.val([0, 1, 2, '1']) },
        { art: 8, text: 'Taklampa hyra JAN26 saknades', antal: 1 },
      ] : [] })) };
  }
  if (g.chans(0.35)) {
    const mSlut = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0)).toISOString().slice(0, 10);
    const poster = Array.from({ length: g.heltal(0, 8) }, (_, i) => {
      const b = g.chans(0.8) ? g.val(bolag) : null;
      return { kn: b ? (g.chans(0.8) ? b.kn! : String(91198000 + i)) : String(91197000 + i), nr: 10000 + i, fdat: dag(), saldo: g.ore(-2000, 40000), namn: b ? (g.chans(0.5) ? b.namn.toUpperCase() : b.namn + ' aktiebolag') : 'Tidigare Åkeri ' + i + ' AB' };
    });
    D.reskontra = { datum: g.chans(0.7) ? mSlut : period + '-15', poster };
    D.skuldMed = g.chans(0.7);
  }
  if (g.chans(0.3)) {
    D.oresund = {
      kostBro: g.chans(0.8) ? g.ore(0, 20000) : null, kostCph: g.chans(0.6) ? g.ore(0, 2000) : null, nCph: g.heltal(0, 60),
      okandaBro: g.chans(0.4) ? { ABC99Z: g.heltal(1, 5) } : {}, okandaCph: g.chans(0.3) ? { ABC98Y: g.heltal(1, 3) } : {},
      manader: g.chans(0.7) ? [period] : [ymAdd(period, -1)], fakturadatum: ymAdd(period, 1) + '-05',
      ovriga: g.chans(0.3) ? { 'bro|Bricka 1': g.heltal(1, 4), 'cph|Bricka 2': g.heltal(1, 2) } : {},
      ...(g.chans(0.2) ? { prisAndring: { fran: 201, till: 215.5 } } : {}),
    };
  }
  if (g.chans(0.25)) {
    D.sturupInfo = {
      okanda: g.chans(0.5) ? [{ bil: g.heltal(1000, 1999), reg: 'ABC97X', antal: g.heltal(1, 5), belopp: g.ore(30, 200) }] : [],
      avvik: g.chans(0.5) ? [{ bil: g.val(bilnr), bilFil: g.chans(0.5) ? g.heltal(100, 999) : null, regFil: 'ABC96W', regReg: 'ABC95V' }] : [],
      period: g.chans(0.7) ? period : ymAdd(period, -1),
    };
  }
  if (g.chans(0.3)) {
    D.visma = { bolag: bolag.filter(() => g.chans(0.7)).map((b, i) => ({ kn: b.kn!, nr: 70000 + i, namn: b.namn, att: g.ore(-50000, 50000),
      rows: [{ art: 1, text: 'Växelavgift', summa: g.ore(0, 20000) }, { art: null, text: 'F12345 (2026-01-31)', summa: g.ore(0, 5000) }, { art: null, text: 'Övrigt', summa: '12,5' }] })) };
    if (g.chans(0.3)) D.visma.bolag!.push({ kn: '99999', nr: 79999, namn: 'Bara i Visma AB', att: 1234 });
  }
  return { nr, S, pdf, tcCsv, bambora, app, passager, D };
}
