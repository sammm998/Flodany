// Serverfunktionen motor med påhittade tjänster: behörighet, licens, tak, felkoder, tolkning, beräkning
// och Verkstadens åtgärder. Mot riktig databas och Edge Function: tests/db/motor.test.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@flodia/api';
import * as avr from '@flodia/core/avrakning';
import * as lon from '@flodia/core/lon';
import { GRUND_S } from '../core/avrakning/fixtures/scenarier';
import { lasCsv, lasJson, lasPdf, lasText } from '../core/avrakning/fixtures/las';
import { LON_SCENARIER } from '../core/lon/fixtures/scenarier';
import { hantera, kor, MotorFel, type Tak, type Tjanster } from './index';

const KONTO = '00000000-0000-4000-8000-00000000000a';
const ROT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Dokumenten i minnet: claude-shim.js med ett påhittat localStorage, samma gränssnitt som packages/api.
class Lagring {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as unknown as { window: { claude?: { use: (n: string) => Promise<unknown> } }; localStorage: Lagring };
g.window = {};
g.localStorage = new Lagring();
const info = console.info; console.info = () => {};
new Function(readFileSync(join(ROT, 'legacy', 'shared', 'claude-shim.js'), 'utf8'))();
console.info = info;
const minne = (await g.window.claude!.use('db')) as Db;

interface Falsk extends Tjanster { roller: Record<string, 'admin' | 'ekonomi' | 'las'>; licenser: Set<string>; anrop: number; logg: string[]; klocka: number; takTabell: Map<string | null, Tak>; takLogg: Record<string, unknown>[] }
function tjanster(): Falsk {
  const t: Falsk = {
    roller: { 'token-admin': 'admin', 'token-ekonomi': 'ekonomi', 'token-las': 'las' },
    licenser: new Set(['avrakning', 'akarkassan', 'tripkassan', 'foliering']),
    anrop: 0, logg: [], klocka: Date.UTC(2026, 9, 11, 10), takLogg: [],
    takTabell: new Map([[null, { perAnvandareMinut: 60, perKontoTimme: 3000 }]]),
    tak: async konto => t.takTabell.get(konto) ?? t.takTabell.get(null) ?? null,
    takNatt: async (_k, _a, d) => { t.takLogg.push(d); },
    anvandare: async tok => (tok.startsWith('token-') ? 'anv-' + tok.slice(6) : null),
    roll: async (tok, _a, konto) => (konto === KONTO ? t.roller[tok] ?? null : null),
    licens: async (_t, _k, m) => t.licenser.has(m),
    funktion: async () => false, aiAnrop: async () => 0, fotolasare: null,
    intern: async () => true,
    anvandning: async () => ({ minut: t.anrop, timme: t.anrop }),
    registrera: async () => { t.anrop++; },
    logga: async (_t, _k, h, mal) => { t.logg.push(`${h} ${mal ?? ''}`.trim()); },
    dokument: () => minne,
    nu: () => t.klocka,
    slump: () => Math.random(),
  };
  return t;
}
let t: Falsk;
beforeEach(() => { t = tjanster(); g.localStorage.m.clear(); });

const anrop = (op: string, modul: string, data: unknown, token = 'token-ekonomi') => kor(token, { konto: KONTO, modul, operation: op, data }, t);
async function fel(p: Promise<unknown>): Promise<[number, string, string]> {
  try { await p; return [200, 'ok', '']; } catch (e) { if (e instanceof MotorFel) return [e.status, e.kod, e.message]; throw e; }
}

describe('motor: behörighet, licens och tak', () => {
  it('utan inloggning, med fel token, i fel konto', async () => {
    expect(await fel(kor(null, {}, t))).toEqual([401, 'ej_inloggad', 'Logga in igen.']);
    expect((await fel(kor('falsk', {}, t)))[1]).toBe('ej_inloggad');
    expect((await fel(kor('token-admin', { konto: '00000000-0000-4000-8000-00000000000b', modul: 'avrakning', operation: 'berakna', data: {} }, t)))[1]).toBe('ingen_behorighet');
  });

  it('läs-rollen får räkna men inte tolka filer eller göra åtgärder', async () => {
    expect((await fel(anrop('tolka', 'akarkassan', { fil: { name: 'x', kind: 'txt', text: '' } }, 'token-las')))[1]).toBe('ingen_behorighet');
    expect((await fel(anrop('atgard', 'foliering', { namn: 'nyttArende' }, 'token-las')))[1]).toBe('ingen_behorighet');
    expect((await fel(anrop('berakna', 'foliering', {}, 'token-las')))[1]).toBe('ok');
  });

  it('utan licens, okänd modul, okänd operation, ogiltigt konto', async () => {
    t.licenser.delete('foliering');
    expect(await fel(anrop('berakna', 'foliering', {}))).toEqual([403, 'ingen_licens', 'Kontot har inte appen.']);
    expect((await fel(anrop('berakna', 'okand', {})))[1]).toBe('ogiltigt');
    expect((await fel(anrop('radera', 'avrakning', {})))[1]).toBe('ogiltigt');
    expect((await fel(kor('token-admin', { konto: 'inte-ett-id', modul: 'avrakning', operation: 'berakna' }, t)))[1]).toBe('ogiltigt');
  });

  it('taket läses ur tabellen per konto, och bara godkända anrop räknas', async () => {
    await fel(kor('falsk', {}, t));
    expect(t.anrop).toBe(0);
    t.anrop = 59;
    expect((await fel(anrop('berakna', 'foliering', {})))[1]).toBe('ok');
    expect(await fel(anrop('berakna', 'foliering', {}))).toEqual([429, 'for_manga', 'För många anrop. Vänta en minut och försök igen.']);
    expect(t.takLogg).toEqual([{ modul: 'foliering', operation: 'berakna', minut: 60, timme: 60, perAnvandareMinut: 60, perKontoTimme: 3000 }]);
    // Kontots egen rad ersätter standarden, utan driftsättning.
    t.takTabell.set(KONTO, { perAnvandareMinut: 100, perKontoTimme: 60 });
    expect(await fel(anrop('berakna', 'foliering', {}))).toEqual([429, 'for_manga', 'Kontot har gjort för många anrop den senaste timmen. Försök igen senare.']);
    t.takTabell.set(KONTO, { perAnvandareMinut: 100, perKontoTimme: 5000 });
    expect((await fel(anrop('berakna', 'foliering', {})))[1]).toBe('ok');
  });

  it('kassorna: läs-rollen har ingen åtkomst alls, ekonomi och admin har', async () => {
    for (const modul of ['akarkassan', 'tripkassan']) {
      expect((await fel(anrop('berakna', modul, {}, 'token-las')))[1], modul).toBe('ingen_behorighet');
      expect((await fel(anrop('tolka', modul, { fil: { name: 'x', kind: 'txt', text: '' } }, 'token-las')))[1], modul).toBe('ingen_behorighet');
      expect((await fel(anrop('tolka', modul, { fil: { name: 'x', kind: 'txt', text: '' } }, 'token-ekonomi')))[1], modul).toBe('okand_fil');
    }
    expect((await fel(anrop('berakna', 'foliering', {}, 'token-las')))[1], 'läs-rollen räknar i en modul som inte är känslig').toBe('ok');
  });
});

describe('motor: tolka och räkna på servern', () => {
  it('tolka: filen känns igen och tolkas, okänd fil ger en fråga', async () => {
    const r = await anrop('tolka', 'akarkassan', { fil: { name: 'LDL.txt', kind: 'txt', text: readFileSync(join(ROT, 'packages/core/lon/fixtures/ldl.txt'), 'utf8') } }) as { parser: string; data: lon.LdlResultat; summary: string };
    expect(r.parser).toBe('ldl');
    expect(r.data.shifts.length).toBeGreaterThan(0);
    expect(r.summary).toMatch(/pass/);
    expect(await fel(anrop('tolka', 'akarkassan', { fil: { name: 'x.txt', kind: 'txt', text: 'inget känt' } }))).toEqual([422, 'okand_fil', 'Filen kändes inte igen. Vilken fil skulle det vara?']);
    const pdf = await anrop('tolka', 'avrakning', { fil: { name: 'tc.pdf', kind: 'pdf', pages: lasPdf('taxicaller.pdf.json') } }) as { parser: string; data: unknown };
    expect(pdf.parser).toBe('tc');
    expect(pdf.data).toEqual(avr.parseTaxiCaller(lasPdf('taxicaller.pdf.json')));
  });

  it('räkna avräkning: samma som gyllene facit', async () => {
    const D = { period: '2026-09', cph: { 101: 3, 103: '2' }, sturup: { 102: 4 }, tc: avr.parseTaxiCaller(lasPdf('taxicaller.pdf.json')),
      bamb: avr.parseBambora(lasJson('bambora.sales.json')), app: avr.parseApp(lasCsv('app.csv')), bro: avr.countPassages(lasText('passager.txt'), GRUND_S.bilar).cnt };
    const r = await anrop('berakna', 'avrakning', { indata: D, installningar: GRUND_S });
    expect(JSON.parse(JSON.stringify(r))).toEqual(lasJson<{ varde: unknown }>('facit/grund.json').varde);
  });

  it('räkna lön: servern tolkar filerna, räknar med dagens datum i svensk tid och ger samma som motorn direkt', async () => {
    const las = (f: string) => readFileSync(join(ROT, 'packages/core/lon/fixtures', f), 'utf8');
    const sc = LON_SCENARIER.grund!;
    const settings = { cfg: sc.cfg ?? {}, forare: sc.forare, lonHist: sc.lonHist ?? {} }, month = { forare: sc.manad ?? {} };
    t.klocka = Date.UTC(2026, 11, 31, 23, 30); // 2027-01-01 i svensk tid
    const r = await anrop('berakna', 'akarkassan', { period: sc.period, ldl: las('ldl.txt'), bro: las('bro.txt'), sturup: las('sturup.txt'), settings, month, skatt: null });
    const S = { settings, period: sc.period, month, shifts: lon.parseLDL(las('ldl.txt')).shifts, passages: { bro: lon.parseBro(las('bro.txt').split(/\r?\n/)).rows, stu: lon.parseSturup(las('sturup.txt').split(/\r?\n/)).rows }, skatt: null, demo: false } as unknown as lon.LonState;
    expect(JSON.parse(JSON.stringify(r))).toEqual(JSON.parse(JSON.stringify(lon.lonEngine.compute(S, { variant: 'akarkassan', idag: '2027-01-01' }))));
  });
});

describe('motor: Verkstadens åtgärder', () => {
  const atgard = (namn: string, extra: Record<string, unknown> = {}, token?: string) => anrop('atgard', 'foliering', { namn, ...extra }, token) as Promise<{ sparat: string[]; borttaget: string[]; meddelanden: string[] }>;

  it('nytt ärende sparas med serverns tid, felaktig åtgärd ger tydligt fel och inget sparas', async () => {
    t.klocka = Date.UTC(2026, 11, 31, 23, 30);
    const r = await atgard('nyttArende');
    expect(r.sparat).toHaveLength(1);
    const id = r.sparat[0]!.split('/')[1]!;
    const a = (await minne.doc(r.sparat[0]!).get()).data() as { skapad: string; andrad: string; logg: { d: string }[] };
    expect(a.skapad).toBe('2027-01-01');
    expect(a.andrad).toBe('2026-12-31T23:30:00.000Z');
    expect(t.logg).toEqual([`atgard.nyttArende ${r.sparat[0]}`]);
    const fore = JSON.stringify([...g.localStorage.m]);
    expect(await fel(atgard('betald', { arende: id }))).toEqual([409, 'fel_lage', 'Ärendet har ingen faktura.']);
    expect(await fel(atgard('betald', { arende: 'finns-inte' }))).toEqual([404, 'saknas', 'Ärendet finns inte.']);
    expect(JSON.stringify([...g.localStorage.m])).toBe(fore);
  });

  it('ta bort ärende: går utan faktura, inte med', async () => {
    const id = (await atgard('nyttArende')).sparat[0]!.split('/')[1]!;
    await atgard('egenRad', { arende: id });
    await atgard('radFalt', { arende: id, args: [0, 'apris', '1000'] });
    const id2 = (await atgard('nyttArende')).sparat[0]!.split('/')[1]!;
    await atgard('skapaFaktura', { arende: id });
    expect(await fel(atgard('taBortArende', { arende: id }))).toEqual([409, 'fel_lage', 'Ett ärende med faktura kan inte tas bort.']);
    const r = await atgard('taBortArende', { arende: id2 });
    expect(r.borttaget).toEqual([`arenden/${id2}`]);
    expect((await minne.doc(`arenden/${id2}`).get()).exists).toBe(false);
    expect((await minne.doc(`arenden/${id}`).get()).exists).toBe(true);
  });

  it('okända namn och namn från objektets prototyp nekas', async () => {
    for (const namn of ['finnsInte', '__proto__', 'constructor', 'toString', 'hasOwnProperty'])
      expect((await fel(atgard(namn)))[1], namn).toBe('ogiltigt');
  });
});

describe('motor: HTTP', () => {
  const req = (kropp: string, huvud: Record<string, string> = {}, metod = 'POST') => new Request('http://x/motor', { method: metod, body: metod === 'POST' ? kropp : undefined, headers: { 'content-type': 'application/json', ...huvud } });

  it('svarar med JSON, fel med kod och svensk text, och interna fel visas aldrig', async () => {
    const ok = await hantera(req(JSON.stringify({ konto: KONTO, modul: 'foliering', operation: 'berakna', data: {} }), { authorization: 'Bearer token-ekonomi' }), t);
    expect(ok.status).toBe(200);
    expect(Object.keys(await ok.json() as object)).toEqual(['resultat']);
    expect((await (await hantera(req('{trasig', { authorization: 'Bearer token-ekonomi' }), t)).json())).toEqual({ fel: { kod: 'ogiltigt', text: 'Anropet kunde inte läsas.' } });
    const loggat: unknown[] = [];
    t.licens = async () => { throw new Error('hemlig intern detalj'); };
    const r = await hantera(req(JSON.stringify({ konto: KONTO, modul: 'foliering', operation: 'berakna' }), { authorization: 'Bearer token-ekonomi' }), t, { logg: e => loggat.push(e) });
    expect(r.status).toBe(500);
    const text = await r.text();
    expect(text).not.toContain('hemlig');
    expect(JSON.parse(text)).toEqual({ fel: { kod: 'serverfel', text: 'Något gick fel på servern. Försök igen om en stund.' } });
    expect(loggat).toHaveLength(1);
  });

  it('CORS bara för plattformens adresser, och bara POST', async () => {
    const tillaten = await hantera(req('', { origin: 'http://127.0.0.1:5173' }, 'OPTIONS'), t);
    expect(tillaten.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    const annan = await hantera(req('', { origin: 'https://exempel.se' }, 'OPTIONS'), t);
    expect(annan.headers.get('access-control-allow-origin')).toBeNull();
    expect((await hantera(req('', {}, 'GET'), t)).status).toBe(405);
  });

  it('för stort anrop', async () => {
    const r = await hantera(req('x', { 'content-length': String(20 * 1024 * 1024), authorization: 'Bearer token-ekonomi' }), t);
    expect(r.status).toBe(413);
  });
});
