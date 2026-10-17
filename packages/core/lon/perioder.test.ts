// Fas 2: dag och kväll per pass får inte hänga kvar mellan beräkningar (krav från fas 1b).
// Förut sparades indelningen i en WeakMap på modulnivå, så en senare beräkning med samma
// pass-objekt kunde få en gammal indelning med andra inställningar.
import { describe, expect, it } from 'vitest';
import * as ny from './index';
import { ANTAL_SCENARIER, genereraLon } from './fixtures/generera';
import { laddaLegacyEng } from '../../../tests/legacy-lon';

const DEF = ny.AKARKASSAN.DEF;
const CFG_A = { ...DEF, dagStart: 4, dagSlut: 16 };
const CFG_B = { ...DEF, dagStart: 7, dagSlut: 19 };
const json = (x: unknown) => JSON.stringify(x);

function indata(i: number) {
  const sc = genereraLon(i);
  return { ldl: sc.ldl, passager: [...ny.parseBro(sc.bro).rows, ...ny.parseSturup(sc.sturup).rows] };
}

describe('lön: ingen dold indelning mellan beräkningar', () => {
  it('matchBro med samma pass-objekt efter en annan beräkning ger samma svar som med nya objekt', () => {
    const fel: number[] = [];
    for (let i = 0; i < ANTAL_SCENARIER; i++) {
      const { ldl, passager } = indata(i);
      const pass = ny.parseLDL(ldl).shifts;
      ny.compute(pass, passager, CFG_A, {}, ny.AKARKASSAN);
      const efter = ny.matchBro(passager, pass, CFG_B);
      const nya = ny.matchBro(passager, ny.parseLDL(ldl).shifts, CFG_B);
      if (json(efter) !== json(nya)) fel.push(i);
    }
    expect(fel).toEqual([]);
  });

  it('två beräkningar med olika inställningar på samma pass påverkar inte varandra', async () => {
    const fel: number[] = [];
    for (let i = 0; i < ANTAL_SCENARIER; i++) {
      const { ldl, passager } = indata(i);
      const facitA = json(ny.compute(ny.parseLDL(ldl).shifts, passager, CFG_A, {}, ny.AKARKASSAN));
      const facitB = json(ny.compute(ny.parseLDL(ldl).shifts, passager, CFG_B, {}, ny.AKARKASSAN));
      const pass = ny.parseLDL(ldl).shifts;
      // Omväxlande, och samtidigt via Promise.all
      const [a1, b1] = [ny.compute(pass, passager, CFG_A, {}, ny.AKARKASSAN), ny.compute(pass, passager, CFG_B, {}, ny.AKARKASSAN)];
      const [b2, a2] = await Promise.all([CFG_B, CFG_A].map(async c => ny.compute(pass, passager, c, {}, ny.AKARKASSAN)));
      if ([a1, a2].some(r => json(r) !== facitA) || [b1, b2].some(r => json(r) !== facitB)) fel.push(i);
    }
    expect(fel).toEqual([]);
  }, 60_000);

  it.each(['akarkassan', 'tripkassan'] as const)('passPerioder ger samma dag och kväll som legacy visar under Körpass (%s)', (app) => {
    const G = laddaLegacyEng(app), V = ny.VARIANTER[app];
    type GPass = { id: string };
    const fel: number[] = [];
    let jamforda = 0;
    for (let i = 0; i < ANTAL_SCENARIER; i++) {
      const sc = genereraLon(i);
      const gpass = (G.parseLDL as (t: string) => { shifts: GPass[] })(sc.ldl).shifts;
      const gpas = [...(G.parseBro as (l: string[]) => { rows: unknown[] })(sc.bro).rows, ...(G.parseSturup as (l: string[]) => { rows: unknown[] })(sc.sturup).rows];
      let gamla: Record<string, string>;
      try {
        const R = (G.compute as (...a: unknown[]) => { cfg: unknown })(gpass, gpas, sc.settings.cfg, {});
        gamla = Object.fromEntries(gpass.map(s => [s.id, (G.shiftPeriod as (s: unknown, c: unknown) => string)(s, R.cfg)]));
      } catch { continue; }
      const pass = ny.parseLDL(sc.ldl).shifts;
      const R = ny.compute(pass, [...ny.parseBro(sc.bro).rows, ...ny.parseSturup(sc.sturup).rows], sc.settings.cfg as never, {}, V);
      if (json(ny.passPerioder(pass, R.cfg)) !== json(gamla)) fel.push(i);
      jamforda++;
    }
    expect(fel).toEqual([]);
    expect(jamforda).toBeGreaterThan(ANTAL_SCENARIER * 0.9);
  }, 60_000);
});
