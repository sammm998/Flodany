// Fotoläsningen av klädlistan med påhittade tjänster och påhittade svar från modellen. CI anropar aldrig Anthropic:
// bilderna i fixtures är påhittade blanketter, och svaren i *.svar.json är det modellen skulle ha svarat.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db, FotoLast, FotoTillagt } from '@flodia/api';
import { claudeAnrop, fotolasareFranMiljo, kor, MotorFel, stockholmsMidnatt, type ClaudeAnrop, type ClaudeSvar, type Tak, type Tjanster } from './index';

const KONTO = '00000000-0000-4000-8000-00000000000a';
const HAR = dirname(fileURLToPath(import.meta.url));
const ROT = join(HAR, '..', '..');
const fixtur = (f: string) => readFileSync(join(HAR, 'fixtures', f));
const BILD_NY = { mediaTyp: 'image/png', base64: fixtur('kladlista-ny.png').toString('base64') };
const BILD_GAMMAL = { mediaTyp: 'image/png', base64: fixtur('kladlista-gammal.png').toString('base64') };
const SVAR_NY = JSON.parse(fixtur('kladlista-ny.svar.json').toString('utf8')) as ClaudeSvar;
const SVAR_GAMMAL = JSON.parse(fixtur('kladlista-gammal.svar.json').toString('utf8')) as ClaudeSvar;

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

interface Falsk extends Tjanster { pa: boolean; anrop: ClaudeAnrop[]; svar: ClaudeSvar; logg: { handelse: string; mal: string | null; detalj: Record<string, unknown> }[]; usage: string[]; aiIdag: number; takTabell: Tak; takLogg: Record<string, unknown>[] }
function tjanster(): Falsk {
  const t: Falsk = {
    pa: true, anrop: [], svar: SVAR_NY, logg: [], usage: [], aiIdag: 0, takLogg: [],
    takTabell: { perAnvandareMinut: 60, perKontoTimme: 3000, fotoPerDag: 5 },
    anvandare: async tok => (tok.startsWith('token-') ? 'anv-' + tok.slice(6) : null),
    roll: async (tok, _a, konto) => (konto === KONTO ? ({ 'token-admin': 'admin', 'token-ekonomi': 'ekonomi', 'token-las': 'las' } as const)[tok as 'token-admin'] ?? null : null),
    intern: async () => true,
    licens: async () => true,
    funktion: async (_t, _k, nyckel) => t.pa && nyckel === 'avrakning.fotolasning',
    aiAnrop: async () => t.aiIdag,
    fotolasare: { modell: 'modell-ur-konfigurationen', anropa: async a => { t.anrop.push(a); return t.svar; } },
    anvandning: async () => ({ minut: 0, timme: 0 }),
    tak: async () => t.takTabell,
    takNatt: async (_k, _a, d) => { t.takLogg.push(d); },
    registrera: async (_k, _a, _m, typ = 'motor') => { t.usage.push(typ); if (typ === 'ai') t.aiIdag++; },
    logga: async (_t, _k, handelse, mal, detalj) => { t.logg.push({ handelse, mal, detalj }); },
    dokument: () => minne,
    nu: () => Date.UTC(2026, 9, 14, 10),
    slump: () => 0.5,
  };
  return t;
}
let t: Falsk;
beforeEach(async () => {
  t = tjanster();
  g.localStorage.m.clear();
  await minne.doc('settings/bilar').set({ list: [{ bil: 101, avr: 'Teståkeri 1' }, { bil: 102, avr: 'Teståkeri 1' }, { bil: 103, avr: 'Teståkeri 2' }, { bil: 104, avr: 'Teståkeri 2' }] });
});

const las = (bild: unknown = BILD_NY, token = 'token-ekonomi', period = '2026-10') => kor(token, { konto: KONTO, modul: 'avrakning', operation: 'fotolasning', data: { steg: 'las', period, bild } }, t) as Promise<FotoLast>;
const laggTill = (rader: unknown[], period = '2026-10') => kor('token-ekonomi', { konto: KONTO, modul: 'avrakning', operation: 'fotolasning', data: { steg: 'lagg_till', period, rader } }, t) as Promise<FotoTillagt>;
async function fel(p: Promise<unknown>): Promise<[number, string, string]> {
  try { await p; return [200, 'ok', '']; } catch (e) { if (e instanceof MotorFel) return [e.status, e.kod, e.message]; throw e; }
}
const noll = { jacka: 0, sommarjacka: 0, vast: 0, troja: 0, skjorta: 0, pike: 0, mossa: 0 };

describe('fotoläsning: avstängd, behörighet och tak', () => {
  it('avstängd inställning ger 403, utan anrop till Anthropic och utan registrerat anrop', async () => {
    t.pa = false;
    expect(await fel(las())).toEqual([403, 'ingen_funktion', 'Fotoläsningen är inte påslagen för kontot.']);
    expect(await fel(laggTill([{ datum: '2026-10-02', bil: '101', utbildning: false, antal: { ...noll, mossa: 1 } }]))).toEqual([403, 'ingen_funktion', 'Fotoläsningen är inte påslagen för kontot.']);
    expect(t.anrop).toEqual([]);
    expect(t.usage).toEqual([]);
  });

  it('läs-rollen får inte, och bara i Avräkning', async () => {
    expect((await fel(las(BILD_NY, 'token-las')))[1]).toBe('ingen_behorighet');
    expect(await fel(kor('token-admin', { konto: KONTO, modul: 'foliering', operation: 'fotolasning', data: {} }, t))).toEqual([400, 'ogiltigt', 'Fotoläsningen finns bara i Avräkning.']);
    expect((await fel(las(BILD_NY, 'token-admin')))[1]).toBe('ok');
  });

  it('taket per konto och dag: anrop över taket stoppas före Anthropic och loggas', async () => {
    for (let i = 0; i < 5; i++) await las();
    expect(t.anrop).toHaveLength(5);
    expect(await fel(las())).toEqual([429, 'for_manga', 'Kontot har nått taket för fotoläsningar i dag. Försök igen i morgon.']);
    expect(t.anrop).toHaveLength(5);
    expect(t.takLogg).toEqual([{ modul: 'avrakning', operation: 'fotolasning', fotoIdag: 5, fotoPerDag: 5 }]);
    // Att lägga till rader anropar inte Anthropic och räknas inte mot taket för foton.
    expect((await fel(laggTill([{ datum: '2026-10-02', bil: '101', utbildning: false, antal: { ...noll, mossa: 1 } }])))[1]).toBe('ok');
    expect(t.usage).toEqual(['ai', 'ai', 'ai', 'ai', 'ai', 'motor']);
  });

  it('dagen räknas från midnatt i svensk tid', () => {
    expect(stockholmsMidnatt(Date.UTC(2026, 9, 14, 10))).toBe('2026-10-13T22:00:00.000Z');
    expect(stockholmsMidnatt(Date.UTC(2026, 11, 31, 23, 30))).toBe('2026-12-31T23:00:00.000Z');
    expect(stockholmsMidnatt(Date.UTC(2026, 9, 25, 12))).toBe('2026-10-24T22:00:00.000Z');
  });

  it('utan nyckel eller modell i konfigurationen är fotoläsningen inte konfigurerad', async () => {
    expect(fotolasareFranMiljo({ anthropic: '', fotoModell: 'x' })).toBeNull();
    expect(fotolasareFranMiljo({ anthropic: 'x', fotoModell: '' })).toBeNull();
    t.fotolasare = null;
    expect(await fel(las())).toEqual([503, 'ej_konfigurerad', 'Fotoläsningen är inte konfigurerad på servern.']);
  });
});

describe('fotoläsning: tolkning', () => {
  it('nya blanketten: rätt rader, artiklar och status, och modellen kommer ur konfigurationen', async () => {
    const r = await las();
    expect(r.period).toBe('2026-10');
    expect(r.rader).toEqual([
      { datum: '2026-10-02', bil: '101', utbildning: true, antal: { ...noll, jacka: 1, troja: 1, skjorta: 1 }, osaker: false, status: [], vald: true },
      { datum: '2026-10-05', bil: '102', utbildning: false, antal: { ...noll, mossa: 2 }, osaker: false, status: [], vald: true },
      { datum: '2026-10-09', bil: '999', utbildning: false, antal: { ...noll, pike: 1 }, osaker: false, status: ['bil_saknas'], vald: false },
      { datum: '2026-09-30', bil: '101', utbildning: false, antal: { ...noll, vast: 1 }, osaker: false, status: ['annan_manad'], vald: false },
    ]);
    const [a] = t.anrop;
    expect(a!.model).toBe('modell-ur-konfigurationen');
    expect(a!.output_config.format.type).toBe('json_schema');
    // Bilden skickas oförändrad till Anthropic.
    expect((a!.messages[0]!.content[0] as { source: { data: string; media_type: string } }).source).toEqual({ type: 'base64', media_type: 'image/png', data: BILD_NY.base64 });
  });

  it('rad på okänd bil markeras, också när bilregistret saknas', async () => {
    await minne.doc('settings/bilar').delete();
    const r = await las();
    expect(r.rader.every(x => x.status.includes('bil_saknas') && !x.vald)).toBe(true);
  });

  it('gamla blanketten med namnkolumner: inga namn kommer tillbaka, och ogiltiga fält gör raden osäker', async () => {
    t.svar = SVAR_GAMMAL;
    const r = await las(BILD_GAMMAL);
    const text = JSON.stringify(r);
    for (const namn of ['TESTFÖRARE', 'TESTÅKERI', 'XY', 'forare', 'akare', 'utlamnad']) expect(text).not.toContain(namn);
    expect(r.rader).toEqual([
      { datum: '2026-10-03', bil: '103', utbildning: true, antal: { ...noll, jacka: 1, troja: 1, skjorta: 2 }, osaker: false, status: [], vald: true },
      { datum: '2026-10-07', bil: null, utbildning: false, antal: { ...noll, sommarjacka: 1 }, osaker: true, status: ['bil_saknas', 'osaker'], vald: false },
    ]);
  });

  it('instruktionen säger åt modellen att hoppa över namnkolumnerna i båda varianterna', async () => {
    await las();
    const text = (t.anrop[0]!.messages[0]!.content[1] as { text: string }).text;
    expect(text).toMatch(/gamla blanketten har också kolumnerna Förare och Åkare/);
    expect(text).toMatch(/Skriv aldrig ut namn eller initialer/);
    expect(t.anrop[0]!.system).toMatch(/aldrig ut namn/);
  });

  it('avböjt, avbrutet och trasigt svar ger svenska fel, och loggas utan bild', async () => {
    t.svar = { stop_reason: 'refusal', content: [] };
    expect(await fel(las())).toEqual([422, 'avbojd', 'Fotot kunde inte läsas. Fyll i raderna för hand.']);
    t.svar = { stop_reason: 'end_turn', content: [{ type: 'text' }] };
    expect((await fel(las()))[1]).toBe('ai_fel');
    t.svar = { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"rader": [' }] };
    expect((await fel(las()))[1]).toBe('ai_fel');
    t.svar = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'inte json' }] };
    expect((await fel(las()))[1]).toBe('ai_fel');
    expect(t.logg.map(l => [l.handelse, l.detalj])).toEqual([['fotolasning.last', { rader: 0, fel: 'avbojd' }], ...Array(3).fill(['fotolasning.last', { rader: 0, fel: 'ai_fel' }])]);
  });

  it('bilden kontrolleras: typ, innehåll och storlek', async () => {
    expect((await fel(las({ mediaTyp: 'image/gif', base64: BILD_NY.base64 })))[2]).toBe('Fotot ska vara JPEG, PNG eller WebP.');
    expect((await fel(las({ mediaTyp: 'image/jpeg', base64: BILD_NY.base64 })))[2]).toBe('Fotot kunde inte läsas.');
    expect((await fel(las({ mediaTyp: 'image/png', base64: Buffer.from('inte en bild').toString('base64') })))[2]).toBe('Fotot kunde inte läsas.');
    expect((await fel(las({ mediaTyp: 'image/png', base64: 'A'.repeat(5 * 1024 * 1024 + 4) })))[1]).toBe('for_stor');
    expect((await fel(las(BILD_NY, 'token-ekonomi', '2026-13')))[2]).toBe('Välj månad (ÅÅÅÅ-MM).');
    expect(t.anrop).toEqual([]);
  });
});

describe('fotoläsning: granskningsloggen och att lägga till', () => {
  it('varje läsning loggas med antal rader, men utan bildens innehåll', async () => {
    await las();
    expect(t.logg).toEqual([{ handelse: 'fotolasning.last', mal: '2026-10', detalj: { rader: 4, osakra: 0 } }]);
    expect(JSON.stringify(t.logg)).not.toContain(BILD_NY.base64.slice(0, 40));
  });

  it('lägg till valda: sparas i klader/<period>, och samma rad en gång till får status finns redan', async () => {
    const forst = await las();
    const valda = forst.rader.filter(r => r.vald);
    expect(await laggTill(valda)).toEqual({ period: '2026-10', tillagda: 2, hoppade: 0 });
    const sparat = (await minne.doc('klader/2026-10').get()).data() as { rader: Record<string, unknown>[] };
    expect(sparat.rader.map(r => [r.datum, r.bil, r.kalla])).toEqual([['2026-10-02', '101', 'foto'], ['2026-10-05', '102', 'foto']]);
    expect(Object.keys(sparat.rader[0]!).sort()).toEqual(['antal', 'bil', 'datum', 'id', 'kalla', 'osaker', 'tillagd', 'utbildning']);

    const igen = await las();
    expect(igen.rader.slice(0, 2).map(r => r.status)).toEqual([['finns_redan'], ['finns_redan']]);
    expect(await laggTill(igen.rader.slice(0, 3))).toEqual({ period: '2026-10', tillagda: 1, hoppade: 2 });
    expect(t.logg.filter(l => l.handelse === 'fotolasning.tillagd').map(l => l.detalj)).toEqual([{ rader: 2, hoppade: 0 }, { rader: 1, hoppade: 2 }]);
  });

  it('raderna tvättas också när de läggs till: okända fält och namn sparas aldrig', async () => {
    await laggTill([{ datum: '2026-10-02', bil: '101', utbildning: false, antal: { ...noll, mossa: 1 }, forare: 'TESTFÖRARE A', status: ['x'] }]);
    expect(JSON.stringify((await minne.doc('klader/2026-10').get()).data())).not.toContain('TESTFÖRARE');
    expect(await fel(laggTill([]))).toEqual([400, 'ogiltigt', 'Välj minst en rad.']);
    expect((await fel(laggTill([{ datum: '2026-10-02', bil: '101', utbildning: false, antal: noll }])))[1]).toBe('ogiltigt');
  });
});

describe('anropet fungerar med Claude Sonnet 5.5', () => {
  it('inget tvingat verktyg och ingen temperature, top_p eller top_k, varken i anropet eller i det som skickas', async () => {
    const skickat: string[] = [];
    const f = (async (_url: string, init: RequestInit) => { skickat.push(init.body as string); return new Response(JSON.stringify(SVAR_NY)); }) as unknown as typeof fetch;
    t.fotolasare = fotolasareFranMiljo({ anthropic: 'testnyckel-som-inte-finns', fotoModell: 'claude-sonnet-5-5' }, f);
    await las();
    const anrop = JSON.parse(skickat[0]!) as Record<string, unknown>;
    for (const falt of ['temperature', 'top_p', 'top_k']) expect(anrop, falt).not.toHaveProperty(falt);
    const val = anrop.tool_choice as { type?: string } | undefined;
    expect(val === undefined || val.type === 'auto' || val.type === 'none', 'tvingad tool_choice').toBe(true);
    expect(anrop.model).toBe('claude-sonnet-5-5');
  });

  it('schemat följer reglerna för structured outputs: additionalProperties false på varje objekt, inga min- och maxgränser', () => {
    const anrop = claudeAnrop('m', '2026-10', { mediaTyp: 'image/png', base64: 'x' });
    expect(anrop.output_config.format.type).toBe('json_schema');
    const fel: string[] = [];
    const ga = (x: unknown, vag: string) => {
      if (!x || typeof x !== 'object') return;
      const o = x as Record<string, unknown>;
      if (o.type === 'object' && o.additionalProperties !== false) fel.push(vag + ': additionalProperties');
      for (const k of ['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength']) if (k in o) fel.push(vag + ': ' + k);
      for (const [k, v] of Object.entries(o)) ga(v, vag + '.' + k);
    };
    ga(anrop.output_config.format.schema, 'schema');
    expect(fel).toEqual([]);
  });
});

describe('Anthropic från servern', () => {
  it('nyckeln skickas bara i anropet till Anthropic, och felsvar visas aldrig för klienten', async () => {
    const anrop: { url: string; init: RequestInit }[] = [];
    let status = 200;
    const f = (async (url: string, init: RequestInit) => { anrop.push({ url, init }); return new Response(JSON.stringify(status === 200 ? SVAR_NY : { error: { message: 'hemligt felsvar' } }), { status }); }) as unknown as typeof fetch;
    t.fotolasare = fotolasareFranMiljo({ anthropic: 'testnyckel-som-inte-finns', fotoModell: 'testmodell' }, f);
    const varna = console.warn; console.warn = () => {};
    try {
      expect((await las()).rader).toHaveLength(4);
      expect(anrop[0]!.url).toBe('https://api.anthropic.com/v1/messages');
      expect((anrop[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('testnyckel-som-inte-finns');
      expect(JSON.parse(anrop[0]!.init.body as string).model).toBe('testmodell');
      status = 500;
      const [s, kod, text] = await fel(las());
      expect([s, kod]).toEqual([502, 'ai_fel']);
      expect(text).not.toContain('hemligt');
    } finally { console.warn = varna; }
  });
});
