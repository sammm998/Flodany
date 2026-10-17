// Slumpade, påhittade testdata för lönemotorn. Fast seed: samma scenarier vid varje körning.
// Inga riktiga uppgifter: förare har nummer, regnummer är ABCnnX, personnummer har månad och dag 0000
// (ett datum som inte finns), så att de aldrig kan tillhöra en verklig person.
import { slump } from '../../avrakning/fixtures/generera';
import { LA } from '../lonearter';

export const SEED = 20261012;
export const ANTAL_SCENARIER = 300;

const pad = (n: number) => String(n).padStart(2, '0');

export interface LdlPass {
  rap: number; start: string; slut: string; rast: number; forare: string; bil: string; regnr: string;
  turer: number; km: number; bkm: number; kk: number[]; ck: number[]; kdr: number; cdr: number;
  pay: [string, string, number, number][];
}

/** En LDL-fil (Megtax). Belopp i öre, kont och kred är summan av momsklasserna. */
export function ldlText(pass: LdlPass[], extra: string[] = []): string {
  const rader: string[] = [];
  for (const p of pass) {
    const kont = p.kk.reduce((a, x) => a + x, 0), kred = p.ck.reduce((a, x) => a + x, 0);
    rader.push(['01', p.rap, p.start, p.slut, p.rast, p.forare, p.bil, p.regnr, '559000-0001', 'DEMO ÅKERI AB', '', '', p.turer, p.km * 10, p.bkm * 10, kont, kred, p.kdr, p.cdr, '', ...p.kk, ...p.ck].join(';'));
    for (const [kod, namn, belopp, antal] of p.pay) rader.push(['02', kod, namn, belopp, antal].join(';'));
  }
  return [...rader, ...extra].join('\r\n');
}

const sv = (x: number) => x.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/, ' ');
const tid = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

export interface LonScenario {
  nr: number;
  period: string | null;
  ldl: string;
  bro: string[];
  sturup: string[];
  avrakning: string[];
  skatt: string;
  /** Allt i S utom shifts och passages, som kommer från parsrarna. */
  settings: Record<string, unknown>;
  month: Record<string, unknown>;
  demo: boolean;
  personnr: string[];
  /** Året för inlästa skattetabeller (S.skattAr). */
  skattAr?: number | string;
}

export function genereraLon(nr: number): LonScenario {
  const g = slump(SEED + nr);
  const ar = g.heltal(2025, 2027), mo = g.heltal(1, 12);
  const period = ar + '-' + pad(mo);
  const bilar = Array.from({ length: g.heltal(1, 5) }, (_, i) => ({ bil: String(650 + i), regnr: 'ABC ' + pad(10 + i) + String.fromCharCode(65 + i) }));
  const forare = Array.from({ length: g.heltal(1, 8) }, (_, i) => String(1001 + i));

  // Körpass: ibland tar en annan förare över samma bil direkt efter
  const pass: LdlPass[] = [];
  const nPass = g.heltal(0, 50);
  for (let i = 0; i < nPass; i++) {
    const b = g.val(bilar);
    const prev = pass.filter(p => p.bil === b.bil).at(-1);
    let start: Date;
    if (prev && g.chans(0.4)) { const s = new Date(prev.slut.replace(' ', 'T')); start = new Date(s.getTime() + g.heltal(-20, 200) * 6e4); }
    else start = new Date(ar, mo - 1 + (g.chans(0.05) ? g.val([-1, 1]) : 0), g.heltal(1, 28), g.heltal(0, 23), g.val([0, 15, 30, 45]));
    const slut = new Date(start.getTime() + g.heltal(30, 14 * 60) * 6e4);
    const kk = [g.chans(0.1) ? g.heltal(0, 50000) : 0, g.chans(0.05) ? g.heltal(0, 20000) : 0, g.heltal(0, 300000), g.chans(0.1) ? g.heltal(0, 40000) : 0, g.chans(0.05) ? g.heltal(0, 10000) : 0];
    const ck = [g.chans(0.1) ? g.heltal(0, 50000) : 0, 0, g.heltal(0, 400000), g.chans(0.1) ? g.heltal(0, 60000) : 0, g.chans(0.05) ? g.heltal(0, 10000) : 0];
    const tom = g.chans(0.05);
    const pay: LdlPass['pay'] = [];
    if (g.chans(0.3)) pay.push(['101', g.val(['Bolt', 'Uber', 'Kort']), g.heltal(0, 90000), g.heltal(1, 9)]);
    if (g.chans(0.15)) pay.push(['999', 'Bomkörning', g.heltal(0, 20000), 1]);
    pass.push({ rap: i + 1, start: g.chans(0.02) ? 'fel tid' : tid(start), slut: tid(slut), rast: g.val([0, 0, 15, 30, 45]), forare: g.val(forare), bil: b.bil, regnr: b.regnr,
      turer: tom ? 0 : g.heltal(0, 25), km: g.heltal(0, 400), bkm: g.heltal(0, 300), kk: tom ? [0, 0, 0, 0, 0] : kk, ck: tom ? [0, 0, 0, 0, 0] : ck, kdr: g.heltal(0, 5000), cdr: g.heltal(0, 5000), pay });
  }
  const ldl = ldlText(pass, g.chans(0.1) ? ['02;101;Rad utan pass;100;1', 'skräp'] : []);

  // Passager nära passen (inom, strax före och efter) och ibland långt bort
  const nara = () => {
    const p = pass.length && g.chans(0.85) ? g.val(pass) : null;
    const t0 = p && p.start !== 'fel tid' ? new Date(p.start.replace(' ', 'T')) : new Date(ar, mo - 1, g.heltal(1, 28), g.heltal(0, 23));
    return { t: new Date(t0.getTime() + g.heltal(-90, 15 * 60) * 6e4), regnr: p ? p.regnr : 'ABC 99Z', bil: p ? p.bil : '999' };
  };
  const ts = (d: Date) => tid(d) + ':' + pad(g.heltal(0, 59));
  const bro: string[] = ['Øresundsbro Konsortiet, påhittad'];
  if (g.chans(0.5)) bro.push('DKK 1 234,00 ' + g.val(['1,47', '1,52']) + ' 25,00');
  for (let i = 0, n = g.heltal(0, 25); i < n; i++) {
    const x = nara(), reg = g.chans(0.5) ? x.regnr : x.regnr.replace(' ', '');
    bro.push(g.chans(0.75) ? `${ts(x.t)} ${reg} / ${g.val(['SV/DK', 'DK/SV'])} Klass 1 SEK ${sv(g.val([201, 215.5, 1201]))}`
      : `${ts(x.t)} ${pad(x.t.getHours())}:${pad(x.t.getMinutes())}:00 ${reg} Pick-up fee Zone${g.heltal(1, 3)} SEK ${sv(g.val([17.04, 21.3]))}`);
  }
  const sturup: string[] = ['Swedavia Malmö Airport, påhittad'];
  for (const b of bilar) {
    if (!g.chans(0.5)) continue;
    sturup.push((g.chans(0.7) ? 'Bil ' + b.bil + ' ' : '') + b.regnr + ' (' + g.heltal(1, 9) + ')');
    for (let i = 0, n = g.heltal(0, 6); i < n; i++) {
      const x = nara(), u = new Date(x.t.getTime() + 20 * 6e4);
      const d = (t: Date) => pad(t.getDate()) + '.' + pad(t.getMonth() + 1) + '.' + String(t.getFullYear()).slice(2) + ' ' + pad(t.getHours()) + ':' + pad(t.getMinutes());
      sturup.push(`${d(x.t)} ${d(u)} ${g.chans(0.2) ? 'Förbokad' : 'P5 Korttid'} ${sv(g.val([28, 35, 42.5]))} SEK`);
    }
  }
  const avrakning = ['Fakturanummer ' + g.heltal(10000, 99999), 'Fakturadatum ' + period + '-05',
    `1 Växelavgift Åkare ${g.heltal(1, 3)} ${sv(8900)} 25 ${sv(8900 * g.heltal(1, 3))}`,
    `16 Oresundsbron ${period.replace('-', '')} ${bilar[0]!.bil} ${g.heltal(1, 9)} 201,00 25 ${sv(201 * g.heltal(1, 9))}`,
    `52 Kontokort bil ${bilar[0]!.bil} 1 -${sv(g.ore(100, 9000))} 0 -${sv(g.ore(100, 9000))}`,
    'ATT BETALA SEK ' + sv(g.ore(-9000, 9000))];

  // Förare och personuppgifter (påhittade)
  const personnr: string[] = [];
  const pnr = () => {
    const y = g.heltal(1930, 2009); const typ = g.val(['12', '12', '10', '10+', 'saknas', 'fel']);
    const v = typ === '12' ? y + '0000-0000' : typ === '10' ? String(y).slice(2) + '0000-0000' : typ === '10+' ? String(y).slice(2) + '0000+0000' : typ === 'fel' ? '123' : undefined;
    if (v) personnr.push(v);
    return v;
  };
  const inst: Record<string, unknown> = {};
  const fasta = Array.from({ length: g.heltal(0, 3) }, (_, i) => String(2001 + i));
  for (const id of [...forare, ...fasta]) {
    const fast = fasta.includes(id) || g.chans(0.15);
    inst[id] = {
      namn: 'Förare ' + id,
      ...(fast ? { modell: 'fast', manadslon: g.val([28000, 31500.5, '30000', 0]), semFast: g.chans(0.5) } : g.chans(0.8) ? { modell: 'procent' } : {}),
      ...(g.chans(0.1) ? { slutat: true } : {}),
      ...(g.chans(0.15) ? { start: period + '-' + pad(g.heltal(1, 28)) } : g.chans(0.1) ? { start: (ar + 1) + '-01-01' } : {}),
      ...(g.chans(0.1) ? { slut: (ar - 1) + '-12-31' } : {}),
      person: {
        personnr: pnr(),
        ...(g.chans(0.1) ? { kolumn: g.heltal(1, 6) } : {}),
        ...(g.chans(0.1) ? { engang: g.val([30, '34', 0]) } : g.chans(0.1) ? { jamkning: g.val([2500, '1800', '', null]) } : {}),
        ...(g.chans(0.8) ? { tabell: g.val([33, 34, '33', 35]) } : {}),
        ...(g.chans(0.8) ? { bank: '1234-5678901' } : {}),
        ...(g.chans(0.3) ? { ytd: { tom: g.val([(ar) + '-' + pad(Math.max(1, mo - 1)), (ar - 1) + '-11', period]), lon: g.val([120000, '95 000,50', 0]), skatt: g.val([35000, '28 000']) } } : {}),
      },
    };
  }
  const cfg: Record<string, unknown> = {};
  if (g.chans(0.3)) cfg.procent = g.val([33, 37.5, 40]);
  if (g.chans(0.2)) cfg.semester = g.val([12, 13]);
  if (g.chans(0.2)) cfg.broAndel = g.val([0, 50]);
  if (g.chans(0.15)) cfg.inklPickup = false;
  if (g.chans(0.15)) cfg.inklSturup = false;
  if (g.chans(0.15)) cfg.bomBortLon = false;
  if (g.chans(0.15)) { cfg.dagStart = g.val([5, 6]); cfg.dagSlut = g.val([15, 17]); }
  if (g.chans(0.15)) cfg.broMarginalMin = g.val([0, 10, 45]);
  if (g.chans(0.2)) cfg.utbSamma = g.chans(0.5);
  if (g.chans(0.15)) cfg.utbetDag = g.val([5, 27]);
  if (g.chans(0.1)) cfg.utbetDagProv = g.val([3, 12]);
  if (g.chans(0.1)) cfg.redovForarandel = g.val([35, 45]);
  if (g.chans(0.1)) cfg.agAvgift = g.val([31.42, 10.21]);

  const lonHist: Record<string, Record<string, unknown>> = {};
  for (const id of forare) if (g.chans(0.3)) lonHist[id] = Object.fromEntries(Array.from({ length: g.heltal(1, 4) }, (_, i) => {
    const per = ar + '-' + pad(Math.max(1, mo - 1 - i));
    return [per, { utb: g.chans(0.9) ? per : undefined, brutto: g.ore(5000, 40000), skatt: g.ore(1000, 12000) }];
  }));

  const manad: Record<string, unknown> = {};
  for (const id of [...forare, ...fasta]) if (g.chans(0.4)) manad[id] = {
    ...(g.chans(0.3) ? { boltProv: g.val([500, '250,5', 0]) } : {}), ...(g.chans(0.2) ? { uberProv: g.ore(0, 800) } : {}),
    ...(g.chans(0.2) ? { ob: g.ore(0, 2000) } : {}), ...(g.chans(0.2) ? { bonus: g.val([1000, '500']) } : {}),
    ...(g.chans(0.3) ? { kontant: g.val([0, 1500, '', null, '2000', undefined]) } : {}), ...(g.chans(0.2) ? { forskott: g.val([1000, '1500']) } : {}),
    ...(g.chans(0.1) ? { modell: 'fast' } : {}),
  };

  const sc: LonScenario = {
    nr, period: g.chans(0.95) ? period : null, ldl, bro, sturup, avrakning,
    skatt: g.val(['packad', 'objekt', 'ingen']),
    settings: { cfg, forare: inst, lonHist }, month: { forare: manad }, demo: g.chans(0.1), personnr,
  };
  lonearterTill(sc, nr, ar, mo, [...forare, ...fasta]);
  return sc;
}

/* Lönearter (fas 1b2) med en egen slumpström, så att resten av scenariot är detsamma som i fas 1b. */
const LA_NR = LA.map(a => a.nr);
function lonearterTill(sc: LonScenario, nr: number, ar: number, mo: number, ider: string[]) {
  const g = slump(SEED + 1_000_000 + nr);
  if (!g.chans(0.7)) return;
  const cfg = sc.settings.cfg as Record<string, unknown>, inst = sc.settings.forare as Record<string, Record<string, unknown>>;
  const manad = sc.month.forare as Record<string, Record<string, unknown>>, lonHist = sc.settings.lonHist as Record<string, Record<string, unknown>>;
  // Bolagets val i registret: slå av och på, eget à-pris
  if (g.chans(0.6)) cfg.lonearter = Object.fromEntries(Array.from({ length: g.heltal(1, 8) }, () => [g.val(LA_NR),
    { ...(g.chans(0.6) ? { aktiv: g.chans(0.5) } : {}), ...(g.chans(0.4) ? { apris: g.val([0, 1.5, 25, 199.99]) } : {}) }]));
  for (const id of ider) {
    if (g.chans(0.1)) inst[id] = { ...inst[id], modell: 'ingen' };
    if (!g.chans(0.5)) continue;
    const rader = Array.from({ length: g.heltal(1, 6) }, () => {
      const r: Record<string, unknown> = { nr: g.chans(0.03) ? '999' : g.val(LA_NR) };
      if (g.chans(0.8)) r.antal = g.val([1, 2.5, 8, 22, '3', '', 0, -1]);
      if (g.chans(0.4)) r.apris = g.val([undefined, '', 0, 12.34, '50', 180]);
      if (g.chans(0.7)) r.belopp = g.val([500, 1234.56, '750', '', -300, 0]);
      if (g.chans(0.2)) r.text = 'Egen text ' + g.heltal(1, 9);
      return r;
    });
    manad[id] = { ...(manad[id] || {}), rader, ...(g.chans(0.15) ? { manadslon: g.val([25000, '30000']) } : {}) };
  }
  // Hittills i år: tidigare utbetalningar med fullständigt datum, före och efter periodens utbetalning
  for (const id of ider) if (g.chans(0.3)) {
    const h = lonHist[id] = { ...(lonHist[id] || {}) };
    for (let i = 0, n = g.heltal(1, 4); i < n; i++) {
      const m = g.heltal(-3, 2), y = ar + Math.floor((mo - 1 + m) / 12), mm = ((mo - 1 + m) % 12 + 12) % 12 + 1;
      const per = y + '-' + pad(mm), um = g.chans(0.5) ? (mm === 12 ? (y + 1) + '-01' : y + '-' + pad(mm + 1)) : per;
      h[per] = { utb: g.chans(0.9) ? um + '-' + pad(g.val([7, 10, 25, 27])) : undefined, brutto: g.ore(5000, 40000), skatt: g.ore(1000, 12000) };
    }
  }
  if (g.chans(0.5)) sc.skattAr = g.val([ar, ar + 1, String(ar - 1), String(ar)]);
}
