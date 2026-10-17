import { describe, expect, it } from 'vitest';
import { MODULER } from '../modules/index';
import { GUIDER, avrakningMain, komIgang, type KontoLage } from './index';

const tomt: KontoLage = { dokument: () => undefined, antal: () => 0, dokumenten: () => [], publicerade: 0, inbjudningar: 0 };
const texter = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(texter) : []);
/** Tankstrecken (U+2013 och U+2014), byggda med teckenkoder så att filen själv inte innehåller dem. */
const TANKSTRECK = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('guiderna', () => {
  it('3 till 5 välkomstkort, hjälp för varje vy och filhjälp för varje uppladdning', () => {
    for (const g of GUIDER) {
      const m = MODULER.find(x => x.nyckel === g.modul)!;
      expect(g.welcome.length).toBeGreaterThanOrEqual(3);
      expect(g.welcome.length).toBeLessThanOrEqual(5);
      expect(Object.keys(g.help).sort()).toEqual(m.varianter[g.variant]!.vyer.map(v => v.nyckel).sort());
      expect(Object.keys(g.fileHelp).sort()).toEqual(m.uppladdningar.map(u => u.nyckel).sort());
    }
  });

  it('inga tankstreck och inga tomma texter', () => {
    for (const g of GUIDER) for (const t of [...texter(g.welcome), ...texter(g.help), ...texter(g.fileHelp), ...g.checklist.map(s => s.text)]) {
      expect(t, t).not.toMatch(TANKSTRECK);
      expect(t.trim()).not.toBe('');
    }
  });

  it('kom igång bockas av utifrån kontots data, och nästa steg är det första som inte är klart', () => {
    expect(komIgang(avrakningMain, tomt)).toMatchObject({ klara: 0, totalt: 6, nasta: { nyckel: 'bolag' } });
    const dok: Record<string, Record<string, unknown>> = { 'settings/bolag': { list: [{ namn: 'Testbolag AB' }] }, 'settings/bilar': { list: [] }, 'settings/params': {} };
    const k = komIgang(avrakningMain, { ...tomt, dokument: p => dok[p], antal: s => (s === 'months' ? 1 : 0) });
    expect(k.steg.filter(s => s.klar).map(s => s.nyckel)).toEqual(['bolag', 'priser', 'forsta-manad']);
    expect(k.nasta?.nyckel).toBe('bilar');
    expect(komIgang(avrakningMain, { dokument: () => ({ list: [1] }), antal: () => 1, dokumenten: () => [], publicerade: 1, inbjudningar: 1 }).nasta).toBeNull();
  });
});

describe('guider för alla appar (spec v3 s. 3 och 16: varje app har en välkomstguide)', () => {
  it('varje modul i manifesten har en guide', () => {
    for (const m of MODULER) expect(GUIDER.some(g => g.modul === m.nyckel), m.nyckel).toBe(true);
  });

  it('åkeriguiden är densamma för Åkarkassan och Tripkassan, och kort 2 är ägarens godkända text', () => {
    const [a, t] = ['akarkassan', 'tripkassan'].map(m => GUIDER.find(g => g.modul === m)!);
    expect(t.welcome.slice(1)).toEqual(a.welcome.slice(1));
    expect(t.checklist.map(s => s.text)).toEqual(a.checklist.map(s => s.text));
    expect(a.welcome[1]!.text).toBe('Du laddar upp LDL från Megtax, och centralens avräkning, bro och Sturup tills de kommer automatiskt.');
  });

  it('kom igång i kassan bockas av utifrån kassans dokument på toppnivå', () => {
    const g = GUIDER.find(x => x.modul === 'akarkassan')!;
    const dok: Record<string, Record<string, unknown>> = {
      settings: { cfg: { procent: 35 }, forare: { 1001: { person: { bank: '1234-5678901' } } } },
      skatt: { tabeller: { 33: 'x' } },
    };
    const docs = [{ id: 'm-2026-09', data: { lonekorning: { rader: {} } } }, { id: 'settings', data: dok.settings! }];
    const k = komIgang(g, { ...tomt, dokument: p => dok[p], dokumenten: s => (s === '' ? docs : []) });
    expect(k.steg.filter(s => s.klar).map(s => s.nyckel)).toEqual(['forare', 'skatt', 'procent', 'forsta-lon']);
    expect(k.nasta?.nyckel).toBe('avtal');
    expect(komIgang(g, tomt).klara).toBe(0);
  });

  it('kom igång i Verkstad', () => {
    const g = GUIDER.find(x => x.modul === 'foliering')!;
    const k = komIgang(g, { ...tomt, dokument: p => (p === 'installningar/foretag' ? { namn: 'Testverkstad AB' } : undefined), antal: s => (s === 'forsakring' ? 1 : 0) });
    expect(k.steg.filter(s => s.klar).map(s => s.nyckel)).toEqual(['foretag', 'forsakring']);
  });
});
