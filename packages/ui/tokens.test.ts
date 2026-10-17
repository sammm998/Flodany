import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
);

// Värden från spec v3 sid 14
const SPEC = {
  '--navy': '#0E1E35',
  '--green': '#1F4D3A',
  '--green-soft': '#E7F0EA',
  '--cream': '#FBF8F2',
  '--cream-2': '#F4EEE3',
  '--white': '#FFFFFF',
  '--line': '#E7E9ED',
  '--subtle': '#F7F8F9',
  '--muted': '#6B7385',
  '--status-klar-bg': '#E7F0EA',
  '--status-klar': '#183D2E',
  '--status-vantar-bg': '#FCF1D6',
  '--status-vantar': '#7A5300',
  '--status-avvikelse-bg': '#FBE9E5',
  '--status-avvikelse': '#9A3412',
  '--status-info-bg': '#EAEFF6',
  '--status-info': '#1E3A5F',
  '--status-utkast-bg': '#F0F1F4',
  '--status-utkast': '#4A5568',
  '--radius-sm': '8px',
  '--radius': '12px',
  '--radius-lg': '20px',
  '--space': '4px',
};

const TYPSNITT = {
  '--font-display': '"Instrument Serif"',
  '--font': '"Geist"',
  '--font-num': '"Geist Mono"',
};

describe('tokens.css', () => {
  it.each(Object.entries(SPEC))('%s är %s', (namn, varde) => {
    expect(tokens[namn]).toBe(varde);
  });

  it.each(Object.entries(TYPSNITT))('%s börjar med %s', (namn, forst) => {
    expect(tokens[namn]?.split(',')[0]).toBe(forst);
  });

  it('har inga tokens utöver de kontrollerade', () => {
    expect(Object.keys(tokens).sort()).toEqual([...Object.keys(SPEC), ...Object.keys(TYPSNITT)].sort());
  });

  it('klar-status har samma ton som salvia (green-soft)', () => {
    expect(tokens['--status-klar-bg']).toBe(tokens['--green-soft']);
  });
});
