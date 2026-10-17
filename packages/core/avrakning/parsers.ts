// Parsrar från legacy/apps/avrakning/index.html. Logiken är oförändrad, bara typer är tillagda.
import type { PdfItem } from '@flodia/kit';
import { groupLines } from './hjalp';
import type { AppBetalning, AppResultat, BamboraTrans, BilRegister, Konto, PassageResultat, Tc, Trip, TripTyp } from './types';

type Kolumner = { pass: number | null; rutt: number | null; bil: number | null; forare: number | null; betal: number | null };
type Rader = Record<string, unknown>[];

const UTLAND = ['danmark', 'denmark', 'kastrup', 'københavn', 'kobenhavn', 'copenhagen', 'köpenhamn'];

// pages: [[{str,x,y}]] med y nedåt
export function parseTaxiCaller(pages: PdfItem[][]): Tc {
  const trips: Trip[] = [], fakt: Record<string, number> = {}; let acct: Konto | null = null, col: Kolumner | null = null, cur: Trip | null = null, period: string | null = null, datum: string | null = null;
  const close = () => { if (cur) trips.push(cur); cur = null; };
  for (const items of pages) {
    for (const r of groupLines(items)) {
      const text = r.items.map(i => i.str).join(' ');
      const pm = text.match(/period:\s*(\d{4})-(\d\d)-\d\d/); if (pm && !period) period = pm[1] + '-' + pm[2];
      const m = text.match(/Konto #(\d+)\s*-\s*(.*)$/); if (m) { close(); acct = { nr: +m[1]!, namn: m[2]!.trim() }; continue; }
      const f = text.match(/Fakturabelopp\s+(-?[\d.]+)/); if (f && acct) fakt[acct.nr] = +f[1]!;
      if (/^Start\b/.test(r.items[0]!.str.trim()) && /Passagerare/.test(text)) {
        const x = (n: string) => { const it = r.items.find(i => i.str.trim().toLowerCase().startsWith(n)); return it ? it.x : null; };
        col = { pass: x('passagerare'), rutt: x('rutt'), bil: x('bil'), forare: x('förare'), betal: x('betal') }; continue;
      }
      if (!col) continue;
      // Legacy räknar med null i jämförelser (null blir 0). Samma beteende här.
      const c = col as unknown as Record<keyof Kolumner, number>;
      if (/^\d{4}-\d\d-\d\d$/.test(text.trim())) { close(); datum = text.trim(); continue; }
      if (/Totalt pris|Kostnadsställe|TaxiCaller|Sida \d/.test(text)) { close(); continue; }
      const first = r.items[0]!;
      const isTrip = /^\d\d:\d\d(\s|$)/.test(first.str.trim());
      if (isTrip && /#\d{6,}/.test(text)) {
        close();
        const nums = r.items.filter(i => /^-?\d+\.\d\d$/.test(i.str.trim()));
        const bilIt = r.items.find(i => i.x >= c.bil - 8 && i.x < c.forare - 3 && /^\d{1,6}$/.test(i.str.trim()));
        let bil: number | null = bilIt ? +bilIt.str.trim() : null;
        if (bil == null) { const mm = text.match(/\s(\d{1,6})\s+[^\d#]+?\s+[A-Z]{1,2}\s+-?[\d.]+\s/); if (mm) bil = +mm[1]!; }
        let pass = '', rutt = '';
        for (const i of r.items) {
          if (i === first) { pass += i.str.replace(/^\s*\d\d:\d\d\s*/, '') + ' '; continue; }
          if (i.x < c.rutt - 3 && !/#\d{6,}/.test(i.str)) pass += i.str + ' ';
          else if (i.x < c.bil - 3 || /#\d/.test(i.str)) rutt += i.str + ' ';
        }
        const inF = (i: PdfItem) => col!.forare != null && i.x >= col!.forare - 3 && i.x < (col!.betal ?? 1e9) - 3;
        const forare = r.items.filter(i => i !== first && inF(i)).map(i => i.str.trim()).join(' ');
        cur = { konto: acct, bil, belopp: nums.length ? +nums[nums.length - 1]!.str : 0, pass, rutt, datum, forare, tid: (first.str.match(/\d\d:\d\d/) || [''])[0] } as Trip;
        continue;
      }
      if (cur) {
        const t: Trip = cur;
        for (const i of r.items) {
          const s = i.str;
          if (i.x < c.rutt - 3) {
            const k = s.search(/\s(till:|från:|Info:)/);
            if (k >= 0) { t.pass += ' ' + s.slice(0, k); t.rutt += ' ' + s.slice(k); } else t.pass += ' ' + s;
          } else if (i.x < c.bil - 3) t.rutt += ' ' + s;
          else if (col.forare != null && i.x >= col.forare - 3 && i.x < (col.betal ?? 1e9) - 3 && t.forare) t.forare += ' ' + s.trim();
        }
      }
    }
  }
  close();
  for (const t of trips) {
    t.bud = t.pass.toUpperCase().replace(/\s/g, '').includes('BUD');
    const rr = t.rutt.split('Info:')[0]!.split('Id:')[0]!.toLowerCase();
    t.utland = UTLAND.some(k => rr.includes(k));
    t.typ = (t.utland ? 'utland' : (t.bud ? 'bud' : 'person')) as TripTyp;
    t.forare = String(t.forare || '').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();
  }
  // Förarnamn som bröts på två rader och tappade andra raden: ersätt med det längre namnet på samma bil
  const fn = [...new Set(trips.map(t => t.forare).filter(Boolean))] as string[];
  for (const t of trips) { if (!t.forare) continue; const m = fn.find(n => n !== t.forare && n.startsWith(t.forare + ' ') && trips.some(x => x.forare === n && x.bil === t.bil)); if (m) t.forare = m; }
  return { trips, fakt, period };
}

// Bambora: rader som objekt med rubriker från flik Sales
export function parseBambora(rows: Rader): BamboraTrans[] {
  // Bara transaktioner som gått igenom (STATE Cleared). Sale krediteras åkaren.
  // Refund (återbetalning till kunden) dras från åkaren på samma bil (beslut 10 okt 2026).
  return rows.filter(r => r['STATE'] === 'Cleared' && (r['TYPE'] == null || r['TYPE'] === 'Sale' || r['TYPE'] === 'Refund')).map(r => ({
    tid: String(r['TERMINAL ID'] ?? '').trim(), kassor: parseInt(r['CASHIER ID'] as string, 10),
    belopp: Math.abs(+(r['SALE AMOUNT'] as number) || 0), dricks: r['TYPE'] === 'Refund' ? 0 : (+(r['TIP'] as number) || 0), datum: String(r['TRANSACTION DATE'] ?? ''),
    ...(r['TYPE'] === 'Refund' ? { refund: true } : {})
  }));
}

// TaxiCaller debiteringskunder (CSV): Körnings-id, Vehicle number, konto Nr, Totalsumma, Passagerare, Lämnad, Upphämtningsplats, Avlämningsaddress
export function parseTcCsv(rows: Rader, namn: Record<string, string> = {}): Tc {
  const trips: Trip[] = [];
  for (const r of rows) {
    const nr = String(r['konto Nr'] ?? '').trim(); if (!nr) continue;
    const l = String(r['Lämnad'] || '').trim();
    trips.push({ konto: { nr: /^\d+$/.test(nr) ? +nr : nr, namn: namn[nr] || 'Konto ' + nr }, bil: parseInt(r['Vehicle number'] as string, 10), belopp: parseFloat(String(r['Totalsumma'] ?? '').replace(',', '.')) || 0,
      pass: String(r['Passagerare'] || '').trim(), rutt: 'från: ' + String(r['Upphämtningsplats'] || '').trim() + ' till: ' + String(r['Avlämningsaddress'] || '').trim(), datum: l.slice(0, 10), tid: l.slice(11, 16) } as Trip);
  }
  for (const t of trips) {
    t.bud = t.pass.toUpperCase().replace(/\s/g, '').includes('BUD');
    const rr = t.rutt.toLowerCase();
    t.utland = UTLAND.some(k => rr.includes(k));
    t.typ = t.utland ? 'utland' : (t.bud ? 'bud' : 'person');
  }
  const ds = trips.map(t => t.datum).filter((d): d is string => /^\d{4}-\d\d/.test(d as string)).sort();
  return { trips, fakt: {}, period: ds.length ? ds[Math.floor(ds.length / 2)]!.slice(0, 7) : null, csv: true };
}

// TaxiCaller appbetalningar (CSV)
export function parseApp(rows: Rader): AppResultat {
  const ut: AppBetalning[] = [], ej: AppBetalning[] = [];
  for (const r of rows) {
    const bil = parseInt(r['Vehicle number'] as string, 10), p = parseFloat(r['Price'] as string) || 0, typ = String(r['Payment'] || '');
    if (r['Skede'] && !/^(levererad|delivered)$/i.test(String(r['Skede']).trim())) continue;
    const col = (re: RegExp) => { const k = Object.keys(r).find(k => re.test(k)); return k ? String(r[k] ?? '').trim() : ''; };
    (/app/i.test(typ) ? ut : ej).push({ bil, belopp: p, typ, datum: r['Lämnad'] as string | undefined, id: String(r['id'] ?? r['\ufeffid'] ?? col(/^\W*id$/i)), forare: col(/förare|driver/i).replace(/\s+,/g, ','), fran: col(/upphämtning|pickup|från/i), till: col(/avlämning|dropoff|destination|till/i) });
  }
  return { app: ut, ejApp: ej };
}

// Öresundsbron / Sturup / CPH: räknar förekomster av reg nr eller "bil NNN" i text eller tabell
export function countPassages(text: string, bilar: BilRegister[]): PassageResultat {
  const reg: Record<string, number | string> = {}; bilar.forEach(b => { if (b.reg) reg[b.reg.replace(/\s/g, '').toUpperCase()] = b.bil; });
  const cnt: Record<string, number> = {}, okanda: Record<string, number> = {};
  const T = text.toUpperCase();
  const re = /\b([A-Z]{3})\s?(\d{2}[A-Z0-9])\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(T))) {
    const k = m[1]! + m[2]!;
    if (reg[k] != null) cnt[reg[k]] = (cnt[reg[k]] || 0) + 1; else okanda[k] = (okanda[k] || 0) + 1;
  }
  return { cnt, okanda };
}
