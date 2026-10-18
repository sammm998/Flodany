// Påhittad demodata (ägarens önskan 2026-10-18: "lägg in demodata så det finns saker att göra"). Inga riktiga
// uppgifter: bolagen heter Demo..., förare "Förare N", regnummer DEM nnX och kunder Demokund. Allt är deterministiskt
// (fast seed), så demon ser likadan ut efter varje omstart.
//
// - Avräkning: åkerier, bilar och terminaler. Augusti och september är räknade av motorn och låsta (historik och
//   utskick). Oktober är öppen: exempelfilerna för oktober laddas ner och läses in i appen.
// - Lön och kassa: förare och september inläst (LDL). Oktober läses in med exempelfilerna (LDL, bro och Sturup).
// - Verkstad: ärenden i alla lägen (utkast, skickad offert, godkänd, fakturerad, förfallen, betald, moms att skicka).
import type { Data } from '@flodia/api';
import * as avr from '@flodia/core/avrakning';

/** mulberry32: liten deterministisk slumpgenerator. */
function slump(seed: number) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { r, heltal: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)), val: <T>(l: readonly T[]): T => l[Math.floor(r() * l.length)]!, chans: (p: number) => r() < p };
}
const pad = (n: number) => String(n).padStart(2, '0');
const dagar = (p: string) => { const [y, m] = p.split('-').map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// ============ Avräkning ============

const AKERIER = [
  { namn: 'Demoåkeriet Norr AB', kn: 91190001, vx: 3, tl: 3 },
  { namn: 'Demoåkeriet Syd AB', kn: 91190002, vx: 3, tl: 3 },
  { namn: 'Demotaxi Öst AB', kn: 91190003, vx: 3, tl: 2 },
  { namn: 'Demobil Väst AB', kn: 91190004, vx: 3, tl: 3 },
];
const BILAR = Array.from({ length: 12 }, (_, i) => ({ bil: 101 + i, reg: `DEM ${pad(10 + i)}${String.fromCharCode(65 + (i % 26))}`, avr: AKERIER[i % 4]!.namn }));
const TERMINALER = BILAR.map(b => ({ id: `T2000${b.bil}`, bil: b.bil }));
const KUNDER: Record<string, string> = { 9001: 'Demokund Sjukresor', 9002: 'Demokund Skolskjuts', 9003: 'Demokund Hotell AB', 9004: 'Demokund Bud AB', 9005: 'Demokund Kommunen' };
const PARAMS = { vx: 8900, tl: 250, sa: 0.03, m6: 0.06, m25: 0.25, bro: 201, sturup: 32.6, cph: 15, fs: 99 };
const PLATSER = ['Centralstationen', 'Storplan 3', 'Hamnplan 1', 'Exempelgatan 4', 'Testvägen 12', 'Sjukhusentrén', 'Flygplatsen', 'Stadshotellet', 'Torget 1', 'Idrottsplatsen'];

export const AVRAKNING_INSTALLNINGAR: avr.Installningar = { params: PARAMS, bilar: BILAR, terminaler: TERMINALER, kassor: [], bolag: AKERIER } as unknown as avr.Installningar;

const csv = (rader: (string | number)[][]) => rader.map(r => r.map(c => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(',')).join('\r\n') + '\r\n';
const tidpunkt = (g: ReturnType<typeof slump>, p: string) => `${p}-${pad(g.heltal(1, dagar(p)))} ${pad(g.heltal(5, 23))}:${pad(g.val([0, 5, 12, 20, 30, 41, 45, 55]))}`;
const ore = (g: ReturnType<typeof slump>, min: number, max: number) => Math.round((min + g.r() * (max - min)) * 2) / 2;

/** Månadens tre filer som CSV, i de format appen läser (TaxiCaller debiteringskunder, Bambora och appbetalningar). */
export function avrakningsfiler(period: string, seed: number): { tc: string; bambora: string; app: string } {
  const g = slump(seed);
  const tc: (string | number)[][] = [['Körnings-id', 'Vehicle number', 'konto Nr', 'Totalsumma', 'Passagerare', 'Lämnad', 'Upphämtningsplats', 'Avlämningsaddress']];
  for (let i = 0; i < 140; i++) {
    const konto = g.val(Object.keys(KUNDER)), bud = konto === '9004';
    tc.push([5100000 + seed % 1000 * 1000 + i, g.val(BILAR).bil, konto, ore(g, bud ? 180 : 220, bud ? 600 : 1400).toFixed(2).replace('.', ','), bud ? `BUD Paket ${g.heltal(1, 99)}` : `Passagerare ${g.heltal(1, 400)}`, tidpunkt(g, period), g.val(PLATSER), g.val(PLATSER)]);
  }
  const bamb: (string | number)[][] = [['STATE', 'TYPE', 'TERMINAL ID', 'CASHIER ID', 'SALE AMOUNT', 'TIP', 'TRANSACTION DATE']];
  for (let i = 0; i < 420; i++) {
    const t = g.val(TERMINALER), refund = g.chans(0.01);
    bamb.push([g.chans(0.97) ? 'Cleared' : 'Declined', refund ? 'Refund' : 'Sale', t.id, t.bil, ore(g, 95, 950).toFixed(2), refund || g.chans(0.75) ? 0 : g.val([10, 20, 30, 50]), tidpunkt(g, period)]);
  }
  const app: (string | number)[][] = [['id', 'Vehicle number', 'Price', 'Payment', 'Lämnad', 'Förare', 'Upphämtningsplats', 'Avlämningsaddress', 'Skede']];
  for (let i = 0; i < 360; i++) {
    app.push([700000 + seed % 1000 * 1000 + i, g.val(BILAR).bil, ore(g, 89, 690).toFixed(2), g.chans(0.9) ? 'app' : 'card', tidpunkt(g, period), `Förare ${g.heltal(1, 30)}`, g.val(PLATSER), g.val(PLATSER), g.chans(0.96) ? 'Levererad' : 'Avbokad']);
  }
  return { tc: csv(tc), bambora: csv(bamb), app: csv(app) };
}

/** CSV till rader som SheetJS ger (all text, tomma celler utelämnade). Bara för demofilerna ovan. */
export function lasCsv(text: string): Record<string, string>[] {
  const celler = (rad: string) => { const ut: string[] = []; let c = '', q = false; for (let i = 0; i < rad.length; i++) { const t = rad[i]!; if (q) { if (t === '"' && rad[i + 1] === '"') { c += '"'; i++; } else if (t === '"') q = false; else c += t; } else if (t === '"') q = true; else if (t === ',') { ut.push(c); c = ''; } else c += t; } ut.push(c); return ut; };
  const [rubrik, ...rader] = text.split(/\r?\n/).filter(r => r.trim());
  const namn = celler(rubrik!);
  return rader.map(r => { const v = celler(r), o: Record<string, string> = {}; namn.forEach((n, i) => { if (v[i]) o[n] = v[i]!; }); return o; });
}

/** En låst månad som appen sparar den: summeringen räknas av motorn ur månadens filer. */
function lastManad(period: string, seed: number): Data {
  const f = avrakningsfiler(period, seed);
  const D: avr.Indata = { period, tc: avr.parseTcCsv(lasCsv(f.tc), KUNDER), bamb: avr.parseBambora(lasCsv(f.bambora)), app: avr.parseApp(lasCsv(f.app)) };
  const R = avr.compute(AVRAKNING_INSTALLNINGAR, D) as unknown as {
    kpi: unknown; kontroll: unknown;
    bolag: Record<string, unknown>[]; kund: Record<string, unknown>[];
  };
  // Samma fält som appens queueSave (legacy/apps/avrakning, summary).
  const summary = {
    kpi: R.kpi,
    bolag: R.bolag.filter(b => b.aktiv).map(b => ({ namn: b.namn, kn: b.kn, att: b.att, kort: b.kort, deb: b.deb, app: b.app, forsk: b.forsk, skuld: b.skuld, manad: b.manad, bilar: b.bilar, rows: b.rows, netto: b.netto, moms25: b.moms25, moms6: b.moms6, oresavr: b.oresavr })),
    kund: R.kund.map(k => ({ nr: k.nr, namn: k.namn, n: k.n, r592: k.r592, r593: k.r593, r594: k.r594, total: k.total, taxicaller: k.taxicaller, diff: k.diff })),
    kontroll: R.kontroll,
  };
  return JSON.parse(JSON.stringify({ summary, files: { tc: `TaxiCaller_debitering_${period}.csv`, bamb: `Bambora_${period}.csv`, app: `TaxiCaller_app_${period}.csv` }, last: true, updatedAt: `${period}-${dagar(period)}T16:00:00.000Z` })) as Data;
}

// ============ Lön och kassa ============

/** LDL-fil (Megtax) för perioden: körpass med kontant- och kreditbelopp i öre, som appen läser. */
export function ldlFil(period: string, seed: number): string {
  const g = slump(seed);
  const bilar = [{ bil: '650', regnr: 'DEM 50A' }, { bil: '651', regnr: 'DEM 51B' }, { bil: '652', regnr: 'DEM 52C' }];
  const forare = ['1001', '1002', '1003', '1004', '1005'];
  const rader: string[] = [];
  for (let i = 0; i < 70; i++) {
    const b = g.val(bilar), dag = g.heltal(1, dagar(period)), h = g.heltal(5, 17), langd = g.heltal(5, 11);
    const start = `${period}-${pad(dag)} ${pad(h)}:${pad(g.val([0, 15, 30, 45]))}`, slut = `${period}-${pad(dag)} ${pad(Math.min(h + langd, 23))}:${pad(g.val([0, 15, 30, 45]))}`;
    const kk = [0, 0, g.heltal(20000, 180000), g.chans(0.1) ? g.heltal(0, 20000) : 0, 0], ck = [0, 0, g.heltal(60000, 320000), g.chans(0.15) ? g.heltal(0, 40000) : 0, 0];
    const turer = g.heltal(6, 24), km = g.heltal(80, 380), bkm = Math.round(km * (0.55 + g.r() * 0.2));
    rader.push(['01', i + 1, start, slut, g.val([30, 30, 45, 60]), g.val(forare), b.bil, b.regnr, '559000-0001', 'DEMO ÅKERI AB', '', '', turer, km * 10, bkm * 10, kk.reduce((a, x) => a + x, 0), ck.reduce((a, x) => a + x, 0), g.heltal(0, 3000), g.heltal(0, 3000), '', ...kk, ...ck].join(';'));
    if (g.chans(0.3)) rader.push(['02', '101', g.val(['Bolt', 'Uber', 'Kort']), g.heltal(5000, 60000), g.heltal(1, 6)].join(';'));
  }
  return rader.join('\r\n') + '\r\n';
}

export function broFil(period: string, seed: number): string {
  const g = slump(seed), ut = ['Øresundsbro Konsortiet, påhittad demofaktura', 'DKK 1 234,00 1,47 25,00'];
  for (let i = 0; i < 18; i++) ut.push(`${period}-${pad(g.heltal(1, dagar(period)))} ${pad(g.heltal(6, 20))}:${pad(g.heltal(0, 59))}:${pad(g.heltal(0, 59))} ${g.val(['DEM 50A', 'DEM51B', 'DEM 52C'])} / ${g.val(['SV/DK', 'DK/SV'])} Klass 1 SEK 201,00`);
  return ut.join('\r\n') + '\r\n';
}

export function sturupFil(period: string, seed: number): string {
  const g = slump(seed), ut = ['Swedavia Malmö Airport, påhittad demofaktura'];
  const d = (dag: number, h: number, m: number) => `${pad(dag)}.${period.slice(5)}.${period.slice(2, 4)} ${pad(h)}:${pad(m)}`;
  for (const b of [{ bil: '650', reg: 'DEM 50A' }, { bil: '652', reg: 'DEM 52C' }]) {
    ut.push(`Bil ${b.bil} ${b.reg} (${g.heltal(2, 6)})`);
    for (let i = 0; i < g.heltal(2, 5); i++) { const dag = g.heltal(1, dagar(period)), h = g.heltal(6, 20), m = g.heltal(0, 39); ut.push(`${d(dag, h, m)} ${d(dag, h, m + 20)} P5 Korttid ${g.val(['28,00', '35,00', '42,50'])} SEK`); }
  }
  return ut.join('\r\n') + '\r\n';
}

// ============ Verkstad ============

const PRISRADER = {
  fram: { pid: 'sf-fram', text: 'Foliering stötfångare fram', antal: 1, apris: 4000 },
  bak: { pid: 'sf-bak', text: 'Foliering stötfångare bak', antal: 1, apris: 3500 },
  dorr: { pid: 'dorr', text: 'Foliering 2 dörrar', antal: 2, apris: 1500 },
  spegel: { pid: 'spegel', text: 'Foliering backspegel', antal: 1, apris: 500 },
  dekal: { pid: 'dek-2', text: 'Dekalering, båda sidor', antal: 1, apris: 3000 },
};
type Rad = typeof PRISRADER[keyof typeof PRISRADER];

function arende(id: string, reg: string, o: { status: string; rader: Rad[]; forsakring?: string; skapad: string; nr?: number; fdatum?: string; forfall?: string; betald?: string; moms?: { skickad?: string; betald?: string } }): Data {
  const faktura = o.nr ? { nr: o.nr, datum: o.fdatum!, forfall: o.forfall!, utfort: o.fdatum!, rader: o.rader.map(r => ({ text: r.text, antal: r.antal, apris: r.apris })), betald: !!o.betald, betaldDatum: o.betald ?? '', paminnelse: '' } : null;
  const moms = o.moms && faktura ? { nr: 'M-' + o.nr, datum: o.betald!, forfall: o.betald!, till: 'Ägare ' + reg, betald: !!o.moms.betald, betaldDatum: o.moms.betald ?? '', skickad: o.moms.skickad ?? '' } : null;
  return {
    id, reg, skadenr: `SK-${id.toUpperCase()}-26`, forsakring: o.forsakring ?? 'f1', agare: 'Ägare ' + reg, bil: null, storlek: 'vanlig', skadedatum: o.skapad, notering: '', status: o.status,
    offert: { datum: o.skapad, giltigTom: o.skapad.slice(0, 8) + '28', rader: o.rader, godkandAv: o.status === 'utkast' || o.status === 'skickad' ? '' : 'Handläggare' },
    faktura, moms, logg: [{ d: o.skapad, t: 'Ärendet skapat' }], skapad: o.skapad,
  };
}

// ============ Allt ============

/** Demodatan som [modul, sökväg, dokument]. */
export function demodokument(): [string, string, Data][] {
  const ut: [string, string, Data][] = [];
  const satt = (m: string, p: string, d: Data) => ut.push([m, p, d]);

  satt('avrakning', 'settings/params', PARAMS);
  satt('avrakning', 'settings/bilar', { list: BILAR });
  satt('avrakning', 'settings/bolag', { list: AKERIER });
  satt('avrakning', 'settings/terminaler', { terminaler: TERMINALER, kassor: [] });
  satt('avrakning', 'months/2026-08', lastManad('2026-08', 2608));
  satt('avrakning', 'months/2026-09', lastManad('2026-09', 2609));
  satt('avrakning', 'utskick/2026-08', { sent: Object.fromEntries(AKERIER.map(a => [a.namn, '2026-09-03'])), updatedAt: '2026-09-03T10:00:00.000Z' });
  satt('avrakning', 'utskick/2026-09', { sent: { [AKERIER[0]!.namn]: '2026-10-02', [AKERIER[1]!.namn]: '2026-10-02' }, updatedAt: '2026-10-02T10:00:00.000Z' });
  // Oktober är startad men inte gjord: filerna läses in i appen (exempelfilerna).
  satt('avrakning', 'months/2026-10', { updatedAt: '2026-10-01T08:00:00.000Z' });

  // Lön och kassa: förarna och september inläst (LDL), så att lönerna räknas när appen öppnas. Oktober läses in med exempelfilen.
  const forare = { 1001: 'Förare Ett', 1002: 'Förare Två', 1003: 'Förare Tre', 1004: 'Förare Fyra', 1005: 'Förare Fem' };
  satt('akarkassan', 'settings', { foretag: 'Demo Åkeri AB', forare: Object.fromEntries(Object.entries(forare).map(([id, namn], i) => [id, { namn, modell: i === 4 ? 'fast' : 'procent', ...(i === 4 ? { manadslon: 28000 } : {}), start: '2026-01-01' }])) });
  satt('akarkassan', 'm-2026-09', { forare: {}, overrides: {}, ldl: ldlFil('2026-09', 3609), files: { ldl: 'LDL_2026-09.txt' } });

  satt('foliering', 'installningar/foretag', { namn: 'Demobolaget AB', orgnr: '559000-0000', bankgiro: '000-0000', adress1: 'Demogatan 1', adress2: '100 00 Demostad', epost: 'faktura@example.se', telefon: '000-000 00 00', villkorDagar: 10, giltighet: 30 });
  satt('foliering', 'installningar/serie', { nasta: 1050 });
  for (const [id, namn, kort] of [['f1', 'Demoförsäkring 1 AB', 'D1'], ['f2', 'Demoförsäkring 2 AB', 'D2'], ['f3', 'Demoförsäkring 3 AB', 'D3']] as const) satt('foliering', `forsakring/${id}`, { id, namn, kort, kontakt: 'Skadeavdelningen', epost: `skador-${id}@example.se`, adress1: 'Box 1', adress2: '100 00 Demostad' });
  const reg = ['DEM 01A', 'DEM 02B', 'DEM 03C', 'DEM 04D', 'DEM 05E', 'DEM 06F', 'DEM 07G', 'DEM 08H', 'DEM 09J', 'DEM 10K', 'DEM 11L', 'DEM 12M'];
  reg.forEach((r, i) => satt('foliering', `fordon/${r.replace(' ', '')}`, { reg: r.replace(' ', ''), bil: 650 + i, agare: 'Ägare ' + r, adress: 'Demovägen ' + (i + 1), epost: i % 3 ? `agare${i + 1}@example.se` : '' }));
  const A = (id: string, i: number, o: Parameters<typeof arende>[2]) => satt('foliering', `arenden/${id}`, arende(id, reg[i]!.replace(' ', ''), o));
  const P = PRISRADER;
  A('a01', 0, { status: 'utkast', rader: [P.fram, P.spegel], skapad: '2026-10-15' });
  A('a02', 1, { status: 'utkast', rader: [], skapad: '2026-10-17', forsakring: 'f2' });
  A('a03', 2, { status: 'skickad', rader: [P.bak], skapad: '2026-09-12' });
  A('a04', 3, { status: 'skickad', rader: [P.dorr, P.spegel], skapad: '2026-10-08', forsakring: 'f3' });
  A('a05', 4, { status: 'godkand', rader: [P.fram, P.bak], skapad: '2026-10-01' });
  A('a06', 5, { status: 'fakturerad', rader: [P.fram], skapad: '2026-09-02', nr: 1041, fdatum: '2026-09-15', forfall: '2026-09-25' });
  A('a07', 6, { status: 'fakturerad', rader: [P.dekal, P.spegel], skapad: '2026-09-20', nr: 1044, fdatum: '2026-10-03', forfall: '2026-10-13', forsakring: 'f2' });
  A('a08', 7, { status: 'fakturerad', rader: [P.dorr], skapad: '2026-10-02', nr: 1046, fdatum: '2026-10-10', forfall: '2026-10-20' });
  A('a09', 8, { status: 'fakturerad', rader: [P.bak, P.spegel], skapad: '2026-08-25', nr: 1039, fdatum: '2026-09-01', forfall: '2026-09-11', betald: '2026-09-10' });
  A('a10', 9, { status: 'fakturerad', rader: [P.fram, P.dorr], skapad: '2026-09-05', nr: 1042, fdatum: '2026-09-18', forfall: '2026-09-28', betald: '2026-10-06', forsakring: 'f3' });
  A('a11', 10, { status: 'fakturerad', rader: [P.fram], skapad: '2026-08-10', nr: 1036, fdatum: '2026-08-20', forfall: '2026-08-30', betald: '2026-08-28', moms: { skickad: '2026-09-01', betald: '2026-09-09' } });
  A('a12', 11, { status: 'fakturerad', rader: [P.bak], skapad: '2026-09-25', nr: 1045, fdatum: '2026-10-05', forfall: '2026-10-15', betald: '2026-10-14', moms: { skickad: '2026-10-15' } });
  satt('foliering', 'kostnader/k1', { id: 'k1', datum: '2026-10-04', typ: 'material', leverantor: 'Demofolie AB', beskrivning: 'Folie, 3 rullar', fakturanr: '7701', belopp: 4200, moms: 1050 });
  satt('foliering', 'kostnader/k2', { id: 'k2', datum: '2026-10-11', typ: 'material', leverantor: 'Demoverktyg AB', beskrivning: 'Skärverktyg', fakturanr: '7714', belopp: 890, moms: 222.5 });
  satt('foliering', 'kostnader/k3', { id: 'k3', datum: '2026-09-28', typ: 'hyra', leverantor: 'Demofastigheter AB', beskrivning: 'Lokalhyra oktober', fakturanr: '2026-10', belopp: 12000, moms: 3000 });
  return ut;
}

/** Exempelfilerna som kan laddas ner i demon: namn, beskrivning och innehåll. */
export function exempelfiler(): { namn: string; app: string; text: string; innehall: string }[] {
  const okt = avrakningsfiler('2026-10', 2610);
  return [
    { namn: 'TaxiCaller_debitering_2026-10.csv', app: 'Avräkning', text: 'TaxiCaller, debiteringskunder, oktober. Läses in i första rutan.', innehall: okt.tc },
    { namn: 'Bambora_2026-10.csv', app: 'Avräkning', text: 'Bambora, kortbetalningar, oktober.', innehall: okt.bambora },
    { namn: 'TaxiCaller_app_2026-10.csv', app: 'Avräkning', text: 'TaxiCaller, appbetalningar, oktober.', innehall: okt.app },
    { namn: 'LDL_2026-10.txt', app: 'Lön och kassa', text: 'Megtax löneunderlag (LDL), oktober.', innehall: ldlFil('2026-10', 3610) },
    { namn: 'Oresundsbron_2026-10.txt', app: 'Lön och kassa', text: 'Øresundsbron, passager i oktober.', innehall: broFil('2026-10', 4610) },
    { namn: 'Sturup_2026-10.txt', app: 'Lön och kassa', text: 'Swedavia Sturup, parkering i oktober.', innehall: sturupFil('2026-10', 5610) },
  ];
}
