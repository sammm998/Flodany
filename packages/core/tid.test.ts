// tid.ts ska ge exakt samma svar som JavaScripts lokala tid när datorn går i svensk tid,
// även för tider som inte finns eller finns två gånger när klockan ställs om.
import { describe, expect, it } from 'vitest';
import { franStockholm, isoVecka, laggTillDagar, manadsnamn, stockholmDatum, stockholmDelar, stockholmKlockslag, veckodag } from './tid';

function iZon<T>(tz: string, fn: () => T): T {
  const fore = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = fore; }
}
const sth = <T>(fn: () => T) => iZon('Europe/Stockholm', fn);
const pad = (n: number) => String(n).padStart(2, '0');

describe('tid: svensk tid utan datorns tidszon', () => {
  it('franStockholm ger samma tidpunkt som new Date i svensk tid, var 15:e minut 2024 till 2027', () => {
    const fel: string[] = [];
    for (let ar = 2024; ar <= 2027; ar++) for (let m = 1; m <= 12; m++) for (let d = 1; d <= 31; d++) {
      // Hela dygn kring omställningarna, annars några stickprov per dygn
      const minuter = (m === 3 || m === 10) && d >= 24 ? 15 : 175;
      for (let x = 0; x < 24 * 60; x += minuter) {
        const h = Math.floor(x / 60), mi = x % 60;
        const vant = sth(() => new Date(ar, m - 1, d, h, mi).getTime());
        for (const tz of ['UTC', 'America/New_York']) {
          const fick = iZon(tz, () => franStockholm(ar, m, d, h, mi).getTime());
          if (fick !== vant) fel.push(`${ar}-${pad(m)}-${pad(d)} ${pad(h)}:${pad(mi)} i ${tz}`);
        }
      }
    }
    expect(fel).toEqual([]);
  }, 60_000);

  it('tid som inte finns flyttas fram, tid som finns två gånger blir sommartid', () => {
    expect(franStockholm(2026, 3, 29, 2, 30).toISOString()).toBe('2026-03-29T01:30:00.000Z'); // 03:30 sommartid
    expect(franStockholm(2026, 10, 25, 2, 30).toISOString()).toBe('2026-10-25T00:30:00.000Z'); // första 02:30
    expect(franStockholm(2026, 10, 25, 3, 0).toISOString()).toBe('2026-10-25T02:00:00.000Z');
    expect(franStockholm(2026, 1, 15, 12, 0).toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(franStockholm(2026, 7, 15, 12, 0).toISOString()).toBe('2026-07-15T10:00:00.000Z');
  });

  it('stockholmDelar ger samma som de lokala get-funktionerna i svensk tid', () => {
    const fel: string[] = [];
    const start = Date.UTC(2024, 0, 1), slut = Date.UTC(2028, 0, 1);
    for (let t = start; t < slut; t += 7 * 36e5 + 13 * 6e4) {
      const vant = sth(() => { const d = new Date(t); return { ar: d.getFullYear(), man: d.getMonth() + 1, dag: d.getDate(), tim: d.getHours(), min: d.getMinutes(), sek: d.getSeconds(), veckodag: d.getDay() }; });
      const fick = iZon('Asia/Tokyo', () => stockholmDelar(t));
      if (JSON.stringify(fick) !== JSON.stringify(vant)) fel.push(new Date(t).toISOString());
    }
    // Varje minut kring omställningarna
    for (const u of [Date.UTC(2026, 2, 28, 22), Date.UTC(2026, 9, 24, 22)]) for (let t = u; t < u + 6 * 36e5; t += 6e4) {
      const vant = sth(() => { const d = new Date(t); return d.getHours() + ':' + d.getMinutes() + ' ' + d.getDate(); });
      const p = iZon('UTC', () => stockholmDelar(t));
      if (p.tim + ':' + p.min + ' ' + p.dag !== vant) fel.push(new Date(t).toISOString());
    }
    expect(fel).toEqual([]);
  }, 60_000);

  it('datum, klockslag, veckodag, vecka och månadsnamn', () => {
    expect(stockholmDatum(Date.UTC(2026, 11, 31, 23, 30))).toBe('2027-01-01');
    expect(stockholmKlockslag(Date.UTC(2026, 6, 1, 22, 5))).toBe('00:05');
    expect(laggTillDagar('2026-03-01', -1)).toBe('2026-02-28');
    expect(laggTillDagar('2026-03-30', -1)).toBe('2026-03-29');
    expect(veckodag('2026-10-11')).toBe(0);
    expect(isoVecka('2026-01-01')).toBe(1);
    expect(isoVecka('2027-01-01')).toBe(53);
    expect(isoVecka('2026-12-28')).toBe(53);
    for (let m = 1; m <= 12; m++) {
      const d = `2026-${pad(m)}-15`;
      expect(manadsnamn(d)).toBe(new Date(d + 'T12:00:00Z').toLocaleDateString('sv-SE', { month: 'long', timeZone: 'UTC' }));
    }
  });
});
