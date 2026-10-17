// Fynd f (fas 2): varje åtgärd kontrollerar läget och ger ett tydligt fel.
// Jämförelsen mot legacy (jamforelse.test.ts) visar vilka steg förkraven nekar och att alla
// steg som kraschar i legacy nekas. Här testas förkraven själva, med motorn som servern använder.
import { describe, expect, it } from 'vitest';
import * as ny from './index';
import { clone } from './grund';
import { nyttState, tidFor, utforNy, type Tidpunkt } from './fixtures/drivrutin';
import { ANTAL_SCENARIER, genereraStart, nastaSteg } from './fixtures/generera';
import { SCENARIER } from './fixtures/scenarier';
import type { Arende, FolieringState, Utfall } from './types';
import { franStockholm, stockholmDatum } from '../tid';

const TID = { idag: '2026-09-15', nu: '2026-09-15T08:00:00.000Z', nuMs: Date.UTC(2026, 8, 15, 8), slump: () => 0.5 };

function lage(...arenden: Partial<Arende>[]) {
  const S = nyttState(clone(SCENARIER.momsflode!.start)) as FolieringState;
  S.arenden.clear();
  arenden.forEach((a, i) => S.arenden.set('x' + i, { id: 'x' + i, reg: 'ABC12A', skadenr: 'S1', forsakring: [...S.forsakring.keys()][0]!, agare: 'Ägare Ett AB', bil: null, storlek: 'vanlig', status: 'utkast',
    offert: { datum: '2026-09-01', giltigTom: '2026-10-01', rader: [{ text: 'Foliering dörr', antal: 1, apris: 1000 }], godkandAv: '' }, faktura: null, moms: null, logg: [], ...a } as Arende));
  return { S, A: ny.foliering(S, TID).atgarder, a: (i = 0) => S.arenden.get('x' + i)! };
}
const faktura = (o: Record<string, unknown> = {}) => ({ nr: 1001, datum: '2026-09-01', forfall: '2026-09-11', utfort: '2026-09-01', rader: [{ text: 'Foliering dörr', antal: 1, apris: 1000 }], betald: false, betaldDatum: '', paminnelse: '', ...o });
const moms = (o: Record<string, unknown> = {}) => ({ nr: 'M-1001', datum: '2026-09-05', forfall: '2026-09-15', till: 'Ägare Ett AB', betald: false, betaldDatum: '', skickad: '', ...o });

/** Förväntar AtgardsFel med kod, och att tillståndet är orört. */
function nekas(S: FolieringState, fn: () => unknown, kod: ny.AtgardsFelKod, text?: RegExp) {
  const fore = JSON.stringify([...S.arenden.values()]);
  let e: unknown = null;
  try { fn(); } catch (x) { e = x; }
  expect(e, 'ska nekas').toBeInstanceOf(ny.AtgardsFel);
  expect((e as ny.AtgardsFel).kod).toBe(kod);
  if (text) expect((e as ny.AtgardsFel).message).toMatch(text);
  expect(JSON.stringify([...S.arenden.values()]), 'tillståndet ska vara orört').toBe(fore);
}

describe('foliering: förkrav per åtgärd (fynd f)', () => {
  it('varje åtgärd har ett förkrav, och inga förkrav saknar åtgärd', () => {
    const { A } = lage();
    expect(Object.keys(ny.FORKRAV).sort()).toEqual(Object.keys(A).sort());
    for (const [namn, k] of Object.entries(ny.FORKRAV)) expect(k.krav, namn).toMatch(/\S/);
  });

  it('åtgärder som kraschade i legacy ger ett tydligt fel', () => {
    const { S, A, a } = lage({});
    for (const f of [A.betald, A.angraBetalning, A.makulera, A.fakturaSkickad, A.paminnelseNoterad, A.skapaMoms] as ((a: Arende) => Utfall)[])
      nekas(S, () => f(a()), 'fel_lage', /ingen faktura/);
    for (const f of [A.momsBetald, A.angraMomsBetalning, A.momsSkickad] as ((a: Arende) => Utfall)[])
      nekas(S, () => f(a()), 'fel_lage', /ingen momsfaktura/);
    nekas(S, () => A.valtFalt(a(), 'faktura.datum', '2026-09-02'), 'fel_lage', /ingen faktura/);
  });

  it('ärendet måste finnas', () => {
    const { S, A } = lage();
    nekas(S, () => A.godkand(undefined as unknown as Arende, ''), 'saknas', /Ärendet finns inte/);
  });

  it('offerten: status och rader', () => {
    const { S, A, a } = lage({}, { offert: { datum: '2026-09-01', giltigTom: '2026-10-01', rader: [], godkandAv: '' } }, { status: 'avslag' });
    expect(A.offertSkickad(a()).spara).toHaveLength(1);
    nekas(S, () => A.offertSkickad(a()), 'fel_lage', /utkast/);
    nekas(S, () => A.offertSkickad(a(1)), 'fel_lage', /inga rader/);
    nekas(S, () => A.skapaFaktura(a(1)), 'fel_lage', /inga rader/);
    nekas(S, () => A.godkand(a(2), ''), 'fel_lage');
    nekas(S, () => A.avslag(a(2)), 'fel_lage');
    expect(A.ateroppna(a(2)).spara).toHaveLength(1);
    nekas(S, () => A.ateroppna(a(2)), 'fel_lage', /avslag/);
    nekas(S, () => A.offertPaminnelse(a(1)), 'fel_lage', /inte skickad/);
  });

  it('fakturerad offert är låst, och en faktura kan inte skapas två gånger', () => {
    const { S, A, a } = lage({ status: 'fakturerad', faktura: faktura() });
    nekas(S, () => A.skapaFaktura(a()), 'fel_lage', /redan en faktura/);
    nekas(S, () => A.egenRad(a()), 'fel_lage', /låst/);
    nekas(S, () => A.taBortRad(a(), 0), 'fel_lage', /låst/);
    nekas(S, () => A.laggTillPris(a(), ny.DEF_PRISER[0]!.id), 'fel_lage', /låst/);
    nekas(S, () => A.radFalt(a(), 0, 'apris', '5'), 'fel_lage', /låst/);
    nekas(S, () => A.valtFalt(a(), 'storlek', 'storre'), 'fel_lage', /låst/);
    expect(A.valtFalt(a(), 'faktura.datum', '2026-09-02').spara).toHaveLength(1);
  });

  it('betalning, ångra, makulera och momsfaktura i rätt ordning', () => {
    const { S, A, a } = lage({ status: 'fakturerad', faktura: faktura() });
    nekas(S, () => A.angraBetalning(a()), 'fel_lage', /inte betald/);
    nekas(S, () => A.skapaMoms(a()), 'fel_lage', /försäkringsbolaget har betalat/);
    nekas(S, () => A.betald(a(), '2026-13-01'), 'ogiltigt', /ÅÅÅÅ-MM-DD/);
    A.betald(a(), '2026-09-10');
    nekas(S, () => A.betald(a()), 'fel_lage', /redan betald/);
    nekas(S, () => A.makulera(a()), 'fel_lage', /betald faktura kan inte makuleras/);
    nekas(S, () => A.paminnelseNoterad(a()), 'fel_lage', /redan betald/);
    expect(a().moms, 'momsfakturan skapas vid betalningen').toBeTruthy();
    nekas(S, () => A.skapaMoms(a()), 'fel_lage', /redan en momsfaktura/);
    nekas(S, () => A.momsBetald(a()), 'fel_lage', /inte skickad/);
    nekas(S, () => A.angraMomsBetalning(a()), 'fel_lage', /inte betald/);
    A.momsSkickad(a()); A.momsBetald(a(), '2026-09-14');
    nekas(S, () => A.momsBetald(a()), 'fel_lage', /redan betald/);
    expect(A.angraMomsBetalning(a()).spara).toHaveLength(1);
  });

  it('momsfaktura utan fordonsägare, och som väntar på försäkringsbolaget', () => {
    const { S, A, a } = lage({ status: 'betald', agare: '', faktura: faktura({ betald: true, betaldDatum: '2026-09-10' }) }, { status: 'fakturerad', faktura: faktura(), moms: moms() });
    nekas(S, () => A.skapaMoms(a()), 'fel_lage', /fordonsägare/);
    nekas(S, () => A.momsSkickad(a(1)), 'fel_lage', /försäkringsbolaget har betalat/);
  });

  it('bara tillåtna fält kan ändras, med giltiga värden', () => {
    const { S, A, a } = lage({});
    for (const f of ['status', 'faktura', 'faktura.nr', 'moms.nr', 'id', 'logg', '__proto__.x', 'offert.rader'])
      nekas(S, () => A.valtFalt(a(), f, 'x'), 'ogiltigt', /Fältet går inte att ändra/);
    for (const f of ['status', 'faktura.nr', 'andrad', 'offert.godkandAv'])
      nekas(S, () => A.textFalt(a(), f, 'x'), 'ogiltigt', /Fältet går inte att ändra/);
    nekas(S, () => A.radFalt(a(), 0, 'pid' as 'text', 'x'), 'ogiltigt');
    nekas(S, () => A.valtFalt(a(), 'storlek', 'enorm'), 'ogiltigt', /vanlig eller större/);
    nekas(S, () => A.valtFalt(a(), 'forsakring', 'finns-inte'), 'saknas', /Försäkringsbolaget/);
    nekas(S, () => A.valtFalt(a(), 'offert.datum', '2026-02-30'), 'ogiltigt');
    nekas(S, () => A.taBortRad(a(), 5), 'saknas', /Raden/);
    nekas(S, () => A.radFalt(a(), -1, 'text', 'x'), 'saknas', /Raden/);
    nekas(S, () => A.laggTillPris(a(), 'finns-inte'), 'saknas', /prislistan/);
    nekas(S, () => A.anteckning(a(), '   '), 'ogiltigt', /Skriv en text/);
    expect(A.valtFalt(a(), 'offert.datum', '').spara).toHaveLength(1);
    expect(A.textFalt(a(), 'skadenr', 'S2').spara).toHaveLength(1);
  });

  it('ett ärende med faktura kan inte tas bort, ett utan kan', async () => {
    const { S, A, a } = lage({}, { status: 'fakturerad', faktura: faktura() });
    nekas(S, () => A.taBortArende(a(1)), 'fel_lage', /med faktura kan inte tas bort/);
    const u = A.taBortArende(a());
    expect(u.taBort).toEqual(['arenden/x0']);
    expect(u.spara).toEqual([]);
    expect(S.arenden.has('x0')).toBe(false);
    nekas(S, () => A.taBortArende(undefined as unknown as Arende), 'saknas');
  });

  it('bokföringen: låst period, första öppna, månaden slut, röda punkter', () => {
    const { S, A } = lage();
    const F = ny.foliering(S, TID), p = F.forstaOppna();
    nekas(S, () => A.exporteraPeriod('2026-9'), 'ogiltigt');
    nekas(S, () => A.manuellVerifikation('sept', { datum: '2026-09-01', text: 'x', bokslut: false, rader: [] }), 'ogiltigt');
    if (p) {
      nekas(S, () => A.exporteraPeriod(ny.pAdd(p, 1)), 'fel_lage', /första öppna/);
      if (ny.pSlut(p) >= TID.idag) nekas(S, () => A.exporteraPeriod(p), 'fel_lage', /inte slut/);
    }
    S.bokforing.set('2026-07', { period: '2026-07', status: 'last', manuella: [] } as never);
    nekas(S, () => A.manuellVerifikation('2026-07', { datum: '2026-07-01', text: 'x', bokslut: false, rader: [] }), 'fel_lage', /låst/);
    nekas(S, () => A.exporteraPeriod('2026-07'), 'fel_lage', /redan låst/);
  });
});

describe(`foliering: ${ANTAL_SCENARIER} slumpade scenarier med förkrav`, () => {
  it('motorn med förkrav kastar aldrig något annat än AtgardsFel', () => {
    const andra: string[] = [];
    let nekade = 0, steg = 0;
    for (let i = 0; i < ANTAL_SCENARIER; i++) {
      const { g, start } = genereraStart(i);
      const N = nyttState(start);
      let ms = franStockholm(2026, 8, g.heltal(1, 20), g.heltal(0, 23), g.heltal(0, 59)).getTime();
      const antal = g.heltal(15, 70);
      for (let k = 0; k < antal; k++) {
        ms += g.heltal(0, 7 * 24 * 60) * 6e4;
        const t: Tidpunkt = { ms, slump: g.r() };
        const F = ny.foliering(N, tidFor(t));
        const s = nastaSteg(g, N, F.perioder(), F.forstaOppna(), stockholmDatum(ms));
        steg++;
        try {
          const u = utforNy(F.atgarder, 'id' in s ? N.arenden.get(s.id)! : (null as unknown as Arende), s);
          for (const [p, o] of u.spara) if (p.startsWith('installningar/')) N.inst[p.slice(14) as keyof typeof N.inst] = clone(o) as never;
        } catch (e) {
          if (e instanceof ny.AtgardsFel) nekade++; else andra.push(`scenario ${i} steg ${k}: ${String(e)}`);
        }
      }
    }
    expect(andra).toEqual([]);
    expect(nekade).toBeGreaterThan(100);
    expect(steg - nekade).toBeGreaterThan(5000);
  }, 120_000);
});
