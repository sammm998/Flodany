// Assistenten med påhittade tjänster och en påhittad Claude som spelar upp strömmar: behörighet, verktygen,
// panelerna, att historiken är append-only, återhämtning och HTTP-strömmen. Ingen riktig AI anropas.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AssistentHandelse, Db } from '@flodia/api';
import {
  ClaudeFel, MotorFel, SYSTEM_FAST, VERKTYG, assistera, delAv, forEko, hanteraAssistent, lasSse, lasStrom, maskera, tillModell,
  type AssistentTjanster, type SamtalPost, type StromAnrop, type StromHandelse, type Tak, type Tjanster,
} from './index';

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

// ============ Påhittad Claude ============

/** Ett svar som ström: block av text, tankar och verktygsanrop, och till sist stop_reason. */
type Bit = { text: string } | { tanke: string; signatur: string } | { verktyg: string; id: string; input: unknown } | { fallback: true };
function strom(bitar: Bit[], stopp: string): StromHandelse[] {
  const h: StromHandelse[] = [{ type: 'message_start', message: { id: 'msg', content: [] } }];
  bitar.forEach((b, index) => {
    if ('text' in b) {
      h.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      // Texten kommer i två delar, som i en riktig ström.
      const mitt = Math.ceil(b.text.length / 2);
      for (const del of [b.text.slice(0, mitt), b.text.slice(mitt)]) if (del) h.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: del } });
    } else if ('tanke' in b) {
      h.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      h.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: b.tanke } });
      h.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: b.signatur } });
    } else if ('verktyg' in b) {
      h.push({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.verktyg, input: {} } });
      const json = JSON.stringify(b.input);
      for (let i = 0; i < json.length; i += 7) h.push({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 7) } });
    } else {
      h.push({ type: 'content_block_start', index, content_block: { type: 'fallback', from: { model: 'a' }, to: { model: 'b' } } });
    }
    h.push({ type: 'content_block_stop', index });
  });
  h.push({ type: 'message_delta', delta: { stop_reason: stopp }, usage: { output_tokens: 10 } }, { type: 'message_stop' });
  return h;
}

interface Falsk extends AssistentTjanster {
  anrop: StromAnrop[]; svar: (StromHandelse[] | Error)[]; sparade: Map<string, SamtalPost>;
  roller: Record<string, 'admin' | 'ekonomi' | 'las'>; licenser: Set<string>; logg: string[]; registrerat: string[]; fragorIdag: number;
}
function tjanster(): Falsk {
  let n = 0;
  const motor: Tjanster = {
    tak: async (): Promise<Tak> => ({ perAnvandareMinut: 60, perKontoTimme: 3000 }),
    takNatt: async () => {},
    anvandare: async tok => (tok.startsWith('token-') ? 'anv-' + tok.slice(6) : null),
    roll: async (tok, _a, konto) => (konto === KONTO ? f.roller[tok] ?? null : null),
    licens: async (_t, _k, m) => f.licenser.has(m),
    funktion: async () => false, aiAnrop: async () => 0, fotolasare: null,
    intern: async () => false,
    anvandning: async () => ({ minut: 0, timme: 0 }),
    registrera: async (_k, _a, modul, typ) => { f.registrerat.push(`${modul} ${typ}`); },
    logga: async (_t, _k, h, mal) => { f.logg.push(`${h} ${mal ?? ''}`.trim()); },
    dokument: () => minne,
    nu: () => Date.UTC(2026, 9, 17, 10),
    slump: () => Math.random(),
  };
  const f: Falsk = {
    anrop: [], svar: [], sparade: new Map(), logg: [], registrerat: [], fragorIdag: 0,
    roller: { 'token-admin': 'admin', 'token-ekonomi': 'ekonomi', 'token-las': 'las' },
    licenser: new Set(['avrakning', 'akarkassan', 'foliering']),
    motor,
    claude: {
      modell: 'claude-opus-5-5', insats: 'medium',
      async *strom(anrop) {
        f.anrop.push(structuredClone(anrop));
        const s = f.svar.shift();
        if (!s) throw new Error('Inget svar kvar i testet');
        if (s instanceof Error) throw s;
        yield* s;
      },
    },
    samtal: {
      hamta: async (_t, konto, id) => { const p = f.sparade.get(id); return p && p.konto === konto ? structuredClone(p) : null; },
      spara: async (_t, _a, p) => { f.sparade.set(p.id, structuredClone(p)); },
      rensa: async () => {},
    },
    kontonamn: async () => 'Testcentralen AB',
    fragor: async () => f.fragorIdag,
    perDag: async () => null,
    id: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
  return f;
}

let t: Falsk;
beforeEach(() => { t = tjanster(); g.localStorage.m.clear(); });

async function fraga(text: string, opt: { token?: string; samtal?: string; vy?: { app: string; vy?: string } } = {}): Promise<AssistentHandelse[]> {
  const h: AssistentHandelse[] = [];
  await assistera(opt.token ?? 'token-ekonomi', { konto: KONTO, text, ...(opt.samtal ? { samtal: opt.samtal } : {}), ...(opt.vy ? { vy: opt.vy } : {}) }, t, x => h.push(structuredClone(x)));
  return h;
}
async function fel(p: Promise<unknown>): Promise<[number, string]> {
  try { await p; return [200, 'ok']; } catch (e) { if (e instanceof MotorFel) return [e.status, e.kod]; throw e; }
}
const text = (h: AssistentHandelse[]) => h.filter(x => x.typ === 'text').map(x => (x as { text: string }).text).join('');

describe('assistenten: kontroll', () => {
  it('utan inloggning, fel konto, tom fråga och utan konfiguration', async () => {
    expect(await fel(assistera(null, {}, t, () => {}))).toEqual([401, 'ej_inloggad']);
    expect(await fel(assistera('token-ekonomi', { konto: 'x', text: 'hej' }, t, () => {}))).toEqual([400, 'ogiltigt']);
    expect(await fel(assistera('token-ekonomi', { konto: '00000000-0000-4000-8000-00000000000b', text: 'hej' }, t, () => {}))).toEqual([403, 'ingen_behorighet']);
    expect(await fel(assistera('token-ekonomi', { konto: KONTO, text: '  ' }, t, () => {}))).toEqual([400, 'ogiltigt']);
    expect(await fel(assistera('token-ekonomi', { konto: KONTO, text: 'x'.repeat(5000) }, t, () => {}))).toEqual([400, 'ogiltigt']);
    t.claude = null;
    expect(await fel(assistera('token-ekonomi', { konto: KONTO, text: 'hej' }, t, () => {}))).toEqual([503, 'ej_konfigurerad']);
  });

  it('taket för frågor per dygn', async () => {
    t.fragorIdag = 200;
    expect(await fel(fraga('hej'))).toEqual([429, 'for_manga']);
  });

  it('ett samtal som inte finns, eller som tillhör ett annat konto', async () => {
    expect(await fel(fraga('hej', { samtal: '00000000-0000-4000-8000-0000000000ff' }))).toEqual([404, 'saknas']);
  });
});

describe('assistenten: svar och samtal', () => {
  it('ett enkelt svar strömmas, sparas och räknas som en fråga', async () => {
    t.svar.push(strom([{ tanke: 'Användaren hälsar.', signatur: 'sig1' }, { text: 'Hej! Vad vill du göra i dag?' }], 'end_turn'));
    const h = await fraga('Hej', { vy: { app: 'foliering', vy: 'arenden' } });
    expect(h[0]).toMatchObject({ typ: 'samtal', titel: 'Hej' });
    expect(text(h)).toBe('Hej! Vad vill du göra i dag?');
    expect(h.at(-1)).toMatchObject({ typ: 'klar', meddelande: { roll: 'assistent', delar: [{ typ: 'text', text: 'Hej! Vad vill du göra i dag?' }] } });
    expect(t.registrerat).toEqual(['assistent ai']);

    const a = t.anrop[0]!;
    expect(a.model).toBe('claude-opus-5-5');
    expect(a.stream).toBe(true);
    expect(a.fallbacks).toBe('default');
    expect(a.thinking).toEqual({ type: 'adaptive' });
    expect(a.output_config).toEqual({ effort: 'medium' });
    expect(a.tools).toEqual(VERKTYG);
    expect(a.system[0]).toEqual({ type: 'text', text: SYSTEM_FAST, cache_control: { type: 'ephemeral' } });
    expect(a.system[1]!.text).toContain('Testcentralen AB');
    expect(a.system[1]!.text).toContain('Verkstad (foliering)');
    expect(a.system[1]!.text).not.toContain('tripkassan');
    // Sammanhanget (datum och panelen) skrivs i användarens meddelande, inte i systemtexten.
    expect(a.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '[Datum 2026-10-17, panelen visar Verkstad, vyn arenden]\nHej' }] }]);

    const p = [...t.sparade.values()][0]!;
    expect(p.titel).toBe('Hej');
    expect(p.meddelanden.at(-1)).toEqual({ role: 'assistant', content: [{ type: 'thinking', thinking: 'Användaren hälsar.', signature: 'sig1' }, { type: 'text', text: 'Hej! Vad vill du göra i dag?' }] });
    expect(p.visning.map(m => m.roll)).toEqual(['anvandare', 'assistent']);
  });

  it('nästa fråga i samma samtal: historien är append-only och systemtexten densamma', async () => {
    t.svar.push(strom([{ tanke: 't1', signatur: 's1' }, { text: 'Svar ett.' }], 'end_turn'));
    const forsta = await fraga('Första');
    const id = (forsta[0] as { id: string }).id;
    // Kontot byter namn mellan frågorna. Samtalets systemtext ändras inte.
    t.kontonamn = async () => 'Nytt namn AB';
    t.svar.push(strom([{ text: 'Svar två.' }], 'end_turn'));
    await fraga('Andra', { samtal: id });
    const [a1, a2] = t.anrop;
    expect(a2!.system).toEqual(a1!.system);
    expect(a2!.messages.slice(0, 2)).toEqual([...a1!.messages, { role: 'assistant', content: [{ type: 'thinking', thinking: 't1', signature: 's1' }, { type: 'text', text: 'Svar ett.' }] }]);
    expect(a2!.messages).toHaveLength(3);
    expect(t.sparade.get(id)!.visning).toHaveLength(4);
  });

  it('modellen avböjer: ett vänligt svar, och historien slutar med assistenten', async () => {
    t.svar.push(strom([], 'refusal'));
    const h = await fraga('Något');
    expect(text(h)).toContain('Jag kan inte svara på det här');
    expect([...t.sparade.values()][0]!.meddelanden.at(-1)!.role).toBe('assistant');
  });

  it('tankeblocken godtas inte: de tas bort en gång och frågan körs igen', async () => {
    t.svar.push(strom([{ tanke: 'a', signatur: 'b' }, { text: 'Ett.' }], 'end_turn'));
    const id = ((await fraga('Ett'))[0] as { id: string }).id;
    t.svar.push(new ClaudeFel(400, 'invalid_request_error: messages.1.content.0: Invalid `signature` in `thinking` block.'));
    t.svar.push(strom([{ text: 'Två.' }], 'end_turn'));
    const h = await fraga('Två', { samtal: id });
    expect(text(h)).toBe('Två.');
    expect(t.anrop[2]!.messages[1]!.content.map(b => b.type)).toEqual(['text']);
    // Den sparade historien behåller blocken.
    expect(t.sparade.get(id)!.meddelanden[1]!.content.map(b => b.type)).toEqual(['thinking', 'text']);
  });

  it('ett fel från Anthropic sparar samtalet och kastas vidare', async () => {
    t.svar.push(new ClaudeFel(529, 'overloaded_error'));
    await expect(fraga('Hej')).rejects.toBeInstanceOf(ClaudeFel);
    const p = [...t.sparade.values()][0]!;
    expect(p.meddelanden.map(m => m.role)).toEqual(['user', 'assistant']);
  });
});

describe('assistenten: verktygen', () => {
  it('hämtar data, maskerar personnummer till modellen och visar allt i panelen', async () => {
    await minne.doc('months/2026-09').set({ summary: { kpi: { korningar: 1234, oms: 456789.5 }, bolag: [{ namn: 'Teståkeri 1', orgnr: '19800101-1234', bilar: [101] }] } });
    t.svar.push(strom([{ text: 'Jag hämtar september.' }, { verktyg: 'hamta_data', id: 'tu1', input: { app: 'avrakning', typ: 'dokument', sokvag: 'months/2026-09', del: 'summary' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'September hade 1 234 körningar (Avräkning, months/2026-09).' }], 'end_turn'));
    const h = await fraga('Visa september');

    const panel = h.find(x => x.typ === 'panel') as Extract<AssistentHandelse, { typ: 'panel' }>;
    expect(panel.panel).toMatchObject({ typ: 'data', app: 'avrakning', kalla: 'Avräkning, months/2026-09, summary', avkortad: false });
    expect((panel.panel as { data: { bolag: { orgnr: string }[] } }).data.bolag[0]!.orgnr).toBe('19800101-1234');
    expect(h.filter(x => x.typ === 'verktyg').map(x => (x as { verktyg: { status: string } }).verktyg.status)).toEqual(['pagar', 'klar']);

    const svar = t.anrop[1]!.messages.at(-1)!;
    expect(svar.role).toBe('user');
    const resultat = svar.content[0]!;
    expect(resultat).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' });
    expect(resultat.content).toContain('1234');
    expect(resultat.content).toContain('[personnummer]');
    expect(resultat.content).not.toContain('19800101-1234');
    expect(t.logg).toContain('assistent.hamtade avrakning/months/2026-09');

    const klar = h.at(-1) as Extract<AssistentHandelse, { typ: 'klar' }>;
    expect(klar.meddelande.delar.map(d => d.typ)).toEqual(['text', 'verktyg', 'text']);
    expect(klar.meddelande.delar[1]).toMatchObject({ typ: 'verktyg', panel: panel.panel.id });
    expect([...t.sparade.values()][0]!.paneler).toHaveLength(1);
  });

  it('en samling, en app utan licens och kassorna för läs-rollen', async () => {
    await minne.doc('arenden/a1').set({ reg: 'ABC123', status: 'utkast' });
    await minne.doc('arenden/a2').set({ reg: 'DEF456', status: 'skickad' });
    t.svar.push(strom([
      { verktyg: 'hamta_data', id: 'a', input: { app: 'foliering', typ: 'samling', sokvag: 'arenden', del: null } },
      { verktyg: 'hamta_data', id: 'b', input: { app: 'tripkassan', typ: 'dokument', sokvag: 'settings', del: null } },
    ], 'tool_use'));
    t.svar.push(strom([{ text: 'Klart.' }], 'end_turn'));
    await fraga('Ärenden');
    const [a, b] = t.anrop[1]!.messages.at(-1)!.content;
    expect(a!.content).toContain('har 2 dokument');
    expect(a!.is_error).toBeUndefined();
    expect(b).toMatchObject({ tool_use_id: 'b', is_error: true });
    expect(b!.content).toContain('Kontot har inte appen');

    t.svar.push(strom([{ verktyg: 'hamta_data', id: 'c', input: { app: 'akarkassan', typ: 'dokument', sokvag: 'settings', del: null } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Nej.' }], 'end_turn'));
    await fraga('Lönerna', { token: 'token-las' });
    expect(t.anrop[2]!.system[1]!.text).not.toContain('akarkassan');
    expect(t.anrop[3]!.messages.at(-1)!.content[0]).toMatchObject({ is_error: true });
  });

  it('öppnar en app i panelen och visar hjälpen', async () => {
    t.svar.push(strom([
      { verktyg: 'oppna_app', id: 'o', input: { app: 'avrakning', vy: 'kontroll' } },
      { verktyg: 'hjalp', id: 'h', input: { app: 'avrakning' } },
    ], 'tool_use'));
    t.svar.push(strom([{ text: 'Avräkning är öppen till höger.' }], 'end_turn'));
    const h = await fraga('Öppna avräkningen');
    const paneler = h.filter(x => x.typ === 'panel').map(x => (x as Extract<AssistentHandelse, { typ: 'panel' }>).panel);
    expect(paneler.map(p => p.typ).sort()).toEqual(['app', 'hjalp']);
    expect(paneler.find(p => p.typ === 'app')).toMatchObject({ app: 'avrakning', vy: 'kontroll', rubrik: 'Avräkning' });
    expect(paneler.find(p => p.typ === 'hjalp')).toMatchObject({ stycken: expect.arrayContaining([expect.objectContaining({ rubrik: 'Välkommen till Avräkning' })]) });
  });

  it('kör motorn för Verkstad', async () => {
    t.svar.push(strom([{ verktyg: 'berakna', id: 'b', input: { app: 'foliering', period: '2026-10' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Här är oktober.' }], 'end_turn'));
    const h = await fraga('Siffrorna för oktober');
    expect(h.find(x => x.typ === 'panel')).toMatchObject({ panel: { typ: 'berakning', kalla: 'Verkstad, motorn för 2026-10' } });
    expect(t.registrerat).toEqual(['assistent ai', 'foliering motor']);
  });

  it('föreslår en åtgärd men ändrar ingenting, och läs-rollen får inga förslag', async () => {
    await minne.doc('arenden/a1').set({ id: 'a1', reg: 'ABC123', status: 'skickad', offert: { rader: [] } });
    const fore = JSON.stringify((await minne.doc('arenden/a1').get()).data());
    t.svar.push(strom([{ verktyg: 'foresla_atgard', id: 'f', input: { namn: 'godkand', arende: 'a1', args: ['Kunden'], beskrivning: 'Offerten för ABC123 markeras som godkänd.' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Förslaget väntar på ditt godkännande.' }], 'end_turn'));
    const h = await fraga('Godkänn offerten för ABC123');
    expect(h.find(x => x.typ === 'panel')).toMatchObject({ panel: { typ: 'atgard', app: 'foliering', atgard: { namn: 'godkand', arende: 'a1', args: ['Kunden'], beskrivning: 'Offerten för ABC123 markeras som godkänd.' } } });
    expect(JSON.stringify((await minne.doc('arenden/a1').get()).data())).toBe(fore);
    expect(t.anrop[1]!.messages.at(-1)!.content[0]!.content).toContain('Inget är ändrat än');

    t.svar.push(strom([{ verktyg: 'foresla_atgard', id: 'g', input: { namn: 'betald', arende: 'a1', args: [], beskrivning: 'x' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Nej.' }], 'end_turn'));
    await fraga('Markera betald', { token: 'token-las' });
    expect(t.anrop[3]!.messages.at(-1)!.content[0]).toMatchObject({ is_error: true });

    t.svar.push(strom([{ verktyg: 'foresla_atgard', id: 'h', input: { namn: 'betald', arende: 'finns-inte', args: [], beskrivning: 'x' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Nej.' }], 'end_turn'));
    await fraga('Markera betald');
    expect(t.anrop[5]!.messages.at(-1)!.content[0]!.content).toContain('finns inte');
  });

  it('verktygsanrop med trasig JSON blir ett fel till modellen', async () => {
    t.svar.push([
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'x', name: 'hjalp', input: {} } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"app": "avr' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]);
    t.svar.push(strom([{ text: 'Jag försöker igen senare.' }], 'end_turn'));
    await fraga('Hjälp');
    expect(t.anrop[1]!.messages.at(-1)!.content[0]).toMatchObject({ tool_use_id: 'x', is_error: true });
  });

  it('stannar efter högst åtta steg', async () => {
    for (let i = 0; i < 8; i++) t.svar.push(strom([{ verktyg: 'hjalp', id: 'h' + i, input: { app: 'foliering' } }], 'tool_use'));
    const h = await fraga('Loopa');
    expect(t.anrop).toHaveLength(8);
    expect(text(h)).toContain('Jag stannar här');
    expect([...t.sparade.values()][0]!.meddelanden.at(-1)!.role).toBe('assistant');
  });
});

describe('assistenten: strömmen och hjälpfunktioner', () => {
  it('lasStrom bygger ihop block och reserv mitt i svaret', async () => {
    async function* gen() { yield* strom([{ tanke: 'x', signatur: 'y' }, { verktyg: 'hjalp', id: 'a', input: { app: 'foliering' } }, { fallback: true }, { text: 'Hej' }, { verktyg: 'hjalp', id: 'b', input: { app: 'avrakning' } }], 'tool_use'); }
    const delar: string[] = [];
    const s = await lasStrom(gen(), d => delar.push(d));
    expect(delar.join('')).toBe('Hej');
    expect(s.stopp).toBe('tool_use');
    expect(s.content.map(b => b.type)).toEqual(['thinking', 'tool_use', 'fallback', 'text', 'tool_use']);
    expect(forEko(s.content).map(b => b.type)).toEqual(['fallback', 'text', 'tool_use']);
    expect(forEko(s.content).at(-1)!.input).toEqual({ app: 'avrakning' });
  });

  it('lasSse läser händelser som delats mitt i en rad', async () => {
    const text = 'event: a\ndata: {"type":"ping"}\n\nevent: b\r\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    const kropp = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += 5) c.enqueue(bytes.slice(i, i + 5)); c.close(); } });
    const ut: StromHandelse[] = [];
    for await (const h of lasSse(kropp)) ut.push(h);
    expect(ut).toEqual([{ type: 'ping' }, { type: 'message_delta', delta: { stop_reason: 'end_turn' } }]);
  });

  it('maskera, delAv och tillModell', () => {
    expect(maskera({ a: ['Kalle 850101-1234', '198501011234'], b: 'konto 1234 567 890 12', c: 'bil 101, 2026-09-01', d: 5 }))
      .toEqual({ a: ['Kalle [personnummer]', '[personnummer]'], b: 'konto [kontonummer]', c: 'bil 101, 2026-09-01', d: 5 });
    expect(delAv({ a: { b: [1] } }, 'a.b')).toEqual([1]);
    expect(delAv({ a: 1 }, 'a.b')).toBeUndefined();
    expect(delAv({ a: 1 }, null)).toEqual({ a: 1 });
    const lang = tillModell({ x: 'y'.repeat(100) }, 50);
    expect(lang).toContain('(avkortat');
  });
});

describe('assistenten: HTTP', () => {
  const req = (kropp: unknown, token?: string) => new Request('http://x/assistent', { method: 'POST', headers: { origin: 'http://127.0.0.1:5173', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(kropp) });

  it('fel före strömmen ger JSON med status', async () => {
    const r = await hanteraAssistent(req({ konto: KONTO, text: 'Hej' }), t);
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ fel: { kod: 'ej_inloggad', text: 'Logga in igen.' } });
    expect(r.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    expect((await hanteraAssistent(new Request('http://x', { method: 'GET' }), t)).status).toBe(405);
    expect((await hanteraAssistent(new Request('http://x', { method: 'OPTIONS', headers: { origin: 'https://ond.example' } }), t)).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('ett svar strömmas som server-sent events, och fel under strömmen blir en händelse', async () => {
    t.svar.push(strom([{ text: 'Hej!' }], 'end_turn'));
    const r = await hanteraAssistent(req({ konto: KONTO, text: 'Hej' }, 'token-admin'), t);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/event-stream');
    const rader = (await r.text()).split('\n\n').filter(Boolean).map(x => JSON.parse(x.replace(/^data: /, '')) as AssistentHandelse);
    expect(rader.map(x => x.typ)).toEqual(['samtal', 'text', 'text', 'klar']);

    t.svar.push(new ClaudeFel(529, 'overloaded_error'));
    const r2 = await hanteraAssistent(req({ konto: KONTO, text: 'Hej igen' }, 'token-admin'), t);
    const rader2 = (await r2.text()).split('\n\n').filter(Boolean).map(x => JSON.parse(x.replace(/^data: /, '')) as AssistentHandelse);
    expect(rader2.at(-1)).toEqual({ typ: 'fel', kod: 'ai_fel', text: 'Assistenten är upptagen just nu. Försök igen om en stund.' });
  });
});

describe('assistenten: beslut om förslag', () => {
  it('beslutet sparas med panelen och kan inte skrivas över', async () => {
    await minne.doc('arenden/a1').set({ id: 'a1', reg: 'ABC123', status: 'skickad', offert: { rader: [] } });
    t.svar.push(strom([{ verktyg: 'foresla_atgard', id: 'f', input: { namn: 'avslag', arende: 'a1', args: [], beskrivning: 'Avslag.' } }], 'tool_use'));
    t.svar.push(strom([{ text: 'Väntar.' }], 'end_turn'));
    const h = await fraga('Avslå');
    const id = (h[0] as { id: string }).id, panel = (h.find(x => x.typ === 'panel') as Extract<AssistentHandelse, { typ: 'panel' }>).panel.id;
    const svara = async (utfall: 'utford' | 'avbojd') => {
      t.svar.push(strom([{ text: 'Ok.' }], 'end_turn'));
      await assistera('token-ekonomi', { konto: KONTO, samtal: id, text: 'Jag godkände.', beslut: { panel, utfall, meddelanden: ['Klart'] } }, t, () => {});
    };
    await svara('utford');
    await svara('avbojd');
    expect(t.sparade.get(id)!.paneler[0]).toMatchObject({ beslut: { utfall: 'utford', meddelanden: ['Klart'], tid: '2026-10-17T10:00:00.000Z' } });
  });
});
