// Parsrar från ENG i legacy/apps/akarkassan och tripkassan. Logiken är oförändrad, bara typer är tillagda.
import { franStockholm } from '../tid';
import { dstr, normReg, toDate, tstr } from './hjalp';
import type { AvrakningFaktura, AvrakningRad, LdlResultat, Pass, Passage, Skattetabell } from './types';

/* Megtax/FlexMate löneunderlag (LDL.txt). Belopp i öre. */
export function parseLDL(text: string): LdlResultat {
  const shifts: Pass[] = []; let cur: Pass | null = null; const warn: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const f = line.split(';');
    if (f[0] === '01' && f.length >= 30) {
      const n = (k: number) => (+f[k]! || 0) / 100;
      const s = {
        id: f[6] + '-' + f[1] + '-' + f[2], rap: f[1], start: f[2], slut: f[3], rast: +f[4]! || 0,
        forare: f[5], bilId: f[6], regnr: (f[7] || '').trim(), reg: normReg(f[7]), orgnr: f[8], foretag: f[9],
        turer: +f[12]! || 0, passKm: (+f[13]! || 0) / 10, betKm: (+f[14]! || 0) / 10,
        kont: n(15), kred: n(16), kontDricks: n(17), kredDricks: n(18),
        kontKl: [n(20), n(21), n(22), n(23), n(24)], kredKl: [n(25), n(26), n(27), n(28), n(29)], pay: []
      } as unknown as Pass;
      const a = toDate(s.start), b = toDate(s.slut);
      if (!a || !b) { warn.push('Rad ' + (i + 1) + ': kunde inte läsa tider'); cur = null; return; }
      s.a = a; s.b = b; s.tim = Math.max(0, (+b - +a) / 36e5 - s.rast / 60);
      if (s.kont + s.kred === 0 && s.turer === 0) { cur = null; return; } // tomma testpass
      shifts.push(s); cur = s;
    } else if (f[0] === '02' && cur) {
      const c: Pass = cur;
      const vals = f.slice(1).map(x => x.trim()).filter(x => x !== '');
      const count = +vals[vals.length - 1]! || 0, amount = (+vals[vals.length - 2]! || 0) / 100;
      c.pay.push({ kod: vals[0]!, namn: vals.slice(1, vals.length - 2).join(' ') || vals[0]!, belopp: amount, antal: count });
      if (vals[0] === '999') c.bom = (c.bom || 0) + amount;
    }
  });
  return { shifts, warn };
}

/* Rader från en Øresundsbro-faktura (text per rad). */
export function parseBro(lines: string[]): { rows: Passage[]; kurs: number | null } {
  let kurs: number | null = null; const rows: Passage[] = [];
  for (const l of lines) {
    const k = l.match(/DKK\s+[\d\s]+,\d\d\s+(\d{1,3},\d{2})\s+25,00/);
    if (k && !kurs) kurs = parseFloat(k[1]!.replace(',', '.'));
    const m = l.match(/(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)(?:\s+(\d\d:\d\d:\d\d))?\s+(.+?)\s+(SEK|DKK)\s+([\d\s]*\d,\d\d)\s*$/);
    if (!m) continue;
    const rest = m[3]!;
    const regM = rest.match(/\b([A-Z]{3}\s?\d{2}[A-Z0-9])\s*\//) || rest.match(/\b([A-Z]{3}\s?\d{2}[A-Z0-9])\b/);
    const typ = /Klass|SV\/DK|DK\/SV/i.test(rest) ? 'bro' : 'avgift';
    const desc = (rest.match(/(SV\/DK Klass \d|DK\/SV Klass \d|Pick-up fee[^A-Z]*Zone\d|Pick-up fee)/i) || [typ === 'bro' ? 'Bro' : 'Avgift'])[0];
    rows.push({ ts: m[1]!, ts2: m[2] || null, t: toDate(m[1]), desc, reg: regM ? normReg(regM[1]) : '', typ, valuta: m[4]!, belopp: parseFloat(m[5]!.replace(/\s/g, '').replace(',', '.')), text: l.trim() });
  }
  return { rows, kurs: kurs || null };
}

/* Swedavia Malmö Airport (Sturup): block per bil, rader med in- och utpassage. Pris inkl moms. */
export function parseSturup(lines: string[]): { rows: Passage[] } {
  const rows: Passage[] = []; let reg = '', bil = '';
  for (const l of lines) {
    const h = l.match(/(?:Bil\s+(\d+)\s+)?\b([A-Z]{3}\s?\d{2}[A-Z0-9])\s+\(\d+\)/);
    if (h) { reg = normReg(h[2]); bil = h[1] || ''; continue; }
    const m = l.match(/(\d\d)\.(\d\d)\.(\d\d)\s+(\d\d):(\d\d)\s+(\d\d)\.(\d\d)\.(\d\d)\s+(\d\d):(\d\d).*?\s(\d+,\d\d)\s/);
    if (!m || !reg) continue;
    const t = franStockholm(2000 + +m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!);
    const ts = dstr(t) + ' ' + tstr(t) + ':00';
    rows.push({ ts, t, ts2: null, desc: 'Sturup ' + (/förbokad/i.test(l) ? 'förbokad' : 'P5'), reg, bil, typ: 'sturup', valuta: 'SEK', belopp: parseFloat(m[11]!.replace(',', '.')), text: l.trim() });
  }
  return { rows };
}

/* Avräkning (faktura) från taxicentralen till åkeriet. */
export function parseAvrakning(lines: string[]): AvrakningFaktura {
  const money = (t: string) => { const m = t.match(/(-?\d{1,3}(?: \d{3})*,\d\d)$/); return m ? parseFloat(m[1]!.replace(/\s/g, '').replace(',', '.')) : null; };
  const rows: AvrakningRad[] = []; let nr = '', datum = '', attBetala: number | null = null;
  for (const l0 of lines) {
    const l = l0.trim();
    const fn = l.match(/^(?:Fakturanummer\s+)?(\d{5})\s+\d{7}\s+(\d{4}-\d\d-\d\d)/) || l.match(/^Fakturanummer\s+(\d{5})$/); if (fn && !nr) nr = fn[1]!;
    const fd = l.match(/Fakturadatum\s+(\d{4}-\d\d-\d\d)/); if (fd) datum = fd[1]!; if (fn && fn[2]) datum = fn[2];
    const ab = l.match(/^ATT BETALA(?: SEK)?\s+(-?[\d ]+,\d\d)$/); if (ab) attBetala = parseFloat(ab[1]!.replace(/\s/g, '').replace(',', '.'));
    const m = l.match(/^(\d{1,2})\s+(.*)$/); if (!m) continue;
    const art = +m[1]!; if (![1, 8, 15, 16, 17, 50, 51, 52, 53, 54, 55, 59].includes(art)) continue;
    let sum = money(m[2]!); if (sum == null) continue;
    const bil = (m[2]!.match(/[Bb]il (\d{3})/) || m[2]!.match(/^\D*\d{4}\s(\d{3})\s/) || [])[1] || '';
    let antal: number | null = null;
    if ([1, 8, 15, 16, 17].includes(art)) {
      const ap = art <= 8 ? m[2]!.match(/(?:^|\s)(\d+) (\d{1,2} \d{3},\d\d|\d{1,3},\d\d) /) : m[2]!.match(/(?:^|\s)(\d+) (\d{1,3},\d\d) /);
      if (ap) { antal = +ap[1]!; const apris = parseFloat(ap[2]!.replace(/\s/g, '').replace(',', '.'));
        const mm = m[2]!.match(/\s(\d) (\d{1,3}(?: \d{3})*,\d\d)$/); // en ensam momskod före summan
        if (mm && Math.abs(antal * apris - sum) > 1) { const alt = parseFloat(mm[2]!.replace(/\s/g, '').replace(',', '.')); if (Math.abs(antal * apris - alt) < Math.abs(antal * apris - sum)) sum = alt; } }
    }
    const text = ({ 1: 'Växelavgift', 8: 'Taklampa hyra', 15: 'Sturup passeringar', 16: 'Øresundsbron', 17: 'CPH parkering', 50: 'Krediter persontransport', 51: 'Krediter bud', 52: 'Kontokort', 53: 'Serviceavgifter', 54: 'Krediter utland', 55: 'Appbetalningar', 59: 'Förskottsbetalning' } as Record<number, string>)[art]!;
    rows.push({ art, text, bil, antal, summa: sum });
  }
  return { nr, datum, attBetala, rows };
}

/* ===== Skattetabeller ===== */
// Skatteverkets textfil allmanna-tabeller-manad.txt: "30B33  15201  15300 2279 2186 1215 2279 3832 3832"
export function parseSkattetabell(text: string): Record<string, Skattetabell> {
  const T: Record<string, Skattetabell> = {};
  text.split(/\r?\n/).forEach(l => {
    if (!/^30[B%]\d\d/.test(l)) return;
    const tab = l.slice(3, 5), typ = l[2], to = +l.slice(12, 19), cols = [0, 1, 2, 3, 4, 5].map(i => +l.slice(19 + i * 5, 24 + i * 5));
    const t = T[tab] = T[tab] || { B: [], P: [] }; (typ === 'B' ? t.B : t.P).push([to, ...cols]);
  });
  return T;
}
export function packTabell(t: Skattetabell): string { return t.B.map(r => r.join(',')).join(';') + '|' + t.P.map(r => r.join(',')).join(';'); }
export function unpackTabell(s: string | null | undefined): Skattetabell | null { if (!s) return null; const [b, p] = s.split('|'); const f = (x: string | undefined) => x ? x.split(';').map(r => r.split(',').map(Number)) : []; return { B: f(b), P: f(p) }; }
export function compactTabell(s: string): Skattetabell { // "to:c1,..;%to:.." till {B,P}
  const t: Skattetabell = { B: [], P: [] }; s.trim().split(';').forEach(x => { const pct = x[0] === '%'; const [to, c] = x.replace('%', '').split(':'); (pct ? t.P : t.B).push([+to!, ...c!.split(',').map(Number)]); }); return t;
}
