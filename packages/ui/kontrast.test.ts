import { describe, expect, it } from 'vitest';
import { kontrast, lasFarg, STANDARD_ACCENT, valjAccent } from './kontrast';

describe('kontots huvudfärg (varumärke nivå 1)', () => {
  it('kontrast enligt WCAG: svart mot vitt 21, standardfärgen klarar AA', () => {
    expect(kontrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(kontrast(lasFarg(STANDARD_ACCENT)!, [255, 255, 255])).toBeGreaterThan(4.5);
    expect(kontrast(lasFarg('#777777')!, [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it('godkänd färg används, för ljus eller oläslig ersätts med standard och ett skäl', () => {
    expect(valjAccent('#0e1e35')).toEqual({ farg: '#0E1E35', godkand: true });
    expect(valjAccent(undefined)).toEqual({ farg: STANDARD_ACCENT, godkand: true });
    const ljus = valjAccent('#FFD400');
    expect(ljus.farg).toBe(STANDARD_ACCENT);
    expect(ljus.godkand).toBe(false);
    expect(ljus.skal).toMatch(/för låg kontrast.*minst 4,5:1/);
    expect(valjAccent('#777').godkand).toBe(false);
    for (const x of ['red', 'rgb(0,0,0)', '#12345', 42, '#1F4D3A; color: red']) expect(valjAccent(x)).toMatchObject({ farg: STANDARD_ACCENT, godkand: false });
  });
});
