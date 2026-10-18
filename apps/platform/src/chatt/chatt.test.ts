// Chattens rena delar: strömmen från servern, hur händelserna bygger meddelandet, panelerna och formateringen.
import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import type { AssistentHandelse, ChattMeddelande, Panel } from '@flodia/api';
import { laggTillPanel, lasHandelser, tillampa } from './handelser';
import { csv, kolumner, text } from './DataVisning';
import { block, inline } from './Markdown';

const tom: ChattMeddelande = { id: 'm', roll: 'assistent', delar: [] };

describe('chatten: händelserna', () => {
  it('text läggs ihop, verktyg uppdateras på plats och panelen kopplas till verktyget', () => {
    const h: AssistentHandelse[] = [
      { typ: 'text', text: 'Jag ' }, { typ: 'text', text: 'hämtar.' },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar', status: 'pagar' } },
      { typ: 'panel', verktyg: 'v1', panel: { id: 'p1', typ: 'hjalp', rubrik: 'Hjälp', app: 'avrakning', stycken: [] } },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar', status: 'klar' } },
      { typ: 'text', text: 'Klart.' },
    ];
    const m = h.reduce(tillampa, tom);
    expect(m.delar).toEqual([
      { typ: 'text', text: 'Jag hämtar.' },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar', status: 'klar' }, panel: 'p1' },
      { typ: 'text', text: 'Klart.' },
    ]);
    expect(tillampa(m, { typ: 'fel', kod: 'x', text: 'Fel.' }).delar.at(-1)).toEqual({ typ: 'text', text: '\n\nFel.' });
  });

  it('samma app öppnas bara en gång, andra paneler läggs till', () => {
    const app = (id: string, vy: string | null): Panel => ({ id, typ: 'app', rubrik: 'Verkstad', app: 'foliering', vy });
    let r = laggTillPanel([], app('a', null));
    r = laggTillPanel(r.paneler, { id: 'd', typ: 'data', rubrik: 'X', app: 'foliering', kalla: 'x', data: 1, avkortad: false });
    r = laggTillPanel(r.paneler, app('b', 'fakturor'));
    expect(r.id).toBe('a');
    expect(r.paneler.map(p => p.id)).toEqual(['a', 'd']);
    expect(r.paneler[0]).toMatchObject({ id: 'a', vy: 'fakturor' });
  });

  it('läser server-sent events som kommer i delar', async () => {
    const t = 'data: {"typ":"text","text":"Hej"}\n\ndata: {"typ":"text","text":" då"}\n\n';
    const b = new TextEncoder().encode(t);
    const kropp = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < b.length; i += 3) c.enqueue(b.slice(i, i + 3)); c.close(); } });
    const ut: AssistentHandelse[] = [];
    await lasHandelser(kropp, h => ut.push(h));
    expect(ut).toEqual([{ typ: 'text', text: 'Hej' }, { typ: 'text', text: ' då' }]);
  });
});

/** Texten i en React-nod, för att jämföra formateringen. */
function platt(n: ReactNode): string {
  if (Array.isArray(n)) return n.map(platt).join('');
  if (isValidElement(n)) { const e = n as ReactElement<{ children?: ReactNode; href?: string }>; return `<${String(e.type)}${e.props.href ? ' ' + e.props.href : ''}>${platt(e.props.children)}</${String(e.type)}>`; }
  return n === null || n === undefined || typeof n === 'boolean' ? '' : String(n);
}

describe('chatten: formateringen', () => {
  it('fetstil, kursiv, kod och länkar, men bara säkra länkar', () => {
    expect(platt(inline('Det är **viktigt** och *lite* `kod`.'))).toBe('Det är <strong>viktigt</strong> och <em>lite</em> <code>kod</code>.');
    expect(platt(inline('[Avräkning](/konto/avrakning) och [x](javascript:alert(1)) och [y](https://example.se)'))).toBe('<a /konto/avrakning>Avräkning</a> och x) och <a https://example.se>y</a>');
    expect(platt(inline('<script>alert(1)</script>'))).toBe('<script>alert(1)</script>');
  });

  it('stycken, rubriker, listor, tabeller och kod', () => {
    const b = block('## Rubrik\nEtt stycke\nsom fortsätter.\n\n- ett\n- två\n\n1. först\n2. sen\n\n| Bil | Belopp |\n|---|---:|\n| 101 | 1 234,50 kr |\n\n```\nkod\n```');
    expect(b.map(x => x.typ)).toEqual(['h', 'p', 'ul', 'ol', 'tabell', 'kod']);
    expect(b[1]).toEqual({ typ: 'p', rader: ['Ett stycke', 'som fortsätter.'] });
    expect(b[4]).toEqual({ typ: 'tabell', huvud: ['Bil', 'Belopp'], rader: [['101', '1 234,50 kr']] });
  });
});

describe('chatten: data i panelen', () => {
  it('kolumner, text och CSV med semikolon', () => {
    const rader = [{ id: 'a', belopp: 1234.5, betald: true, rader: [1, 2], djup: { x: 1 } }, { id: 'b;c', belopp: 2, ny: 'x' }];
    expect(kolumner(rader)).toEqual(['id', 'belopp', 'betald', 'rader', 'ny']);
    expect(text(1234.5)).toBe('1 234,5');
    expect(text(true)).toBe('Ja');
    expect(csv(rader)).toBe('id;belopp;betald;rader;ny\r\na;1234,5;Ja;2 st;\r\n"b;c";2;;;x');
  });
});

describe('chatten: ändringar som godkänns', () => {
  it('tillampaAndringar sätter och tar bort på punktade vägar utan att ändra originalet', async () => {
    const { tillampaAndringar, giltigtFalt } = await import('@flodia/api');
    const fore = Object.freeze({ forare: Object.freeze({ 1001: Object.freeze({ namn: 'Ett' }) }), foretag: 'Demo', lista: [1] });
    const efter = tillampaAndringar(fore, [{ falt: 'forare.1006.namn', varde: 'Sex' }, { falt: 'foretag', taBort: true }, { falt: 'lista', varde: [1, 2] }]);
    expect(efter).toEqual({ forare: { 1001: { namn: 'Ett' }, 1006: { namn: 'Sex' } }, lista: [1, 2] });
    expect(fore.foretag).toBe('Demo');
    expect(giltigtFalt('a.b.c')).toBe(true);
    expect(giltigtFalt('a..b')).toBe(false);
    expect(giltigtFalt('constructor')).toBe(false);
    expect(() => tillampaAndringar({}, [{ falt: '__proto__.x', varde: 1 }])).toThrow();
  });
});
