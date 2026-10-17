import { describe, expect, expectTypeOf, it } from 'vitest';
import { valjParser, type Engine, type FileInput, type FileParser, type Finding, type Rule } from './index';

const csv = (rubrik: string): FileInput => ({ name: 'x.csv', kind: 'csv', text: rubrik });

const parser = (key: string, ord: string, sakerhet: number): FileParser<string> => ({
  key,
  label: key,
  accepts: ['csv'],
  detect: (f) => (f.text?.includes(ord) ? sakerhet : 0),
  parse: (f) => ({ data: f.text ?? '', summary: 'en rad', warnings: [] }),
  fixtures: [],
});

describe('kit', () => {
  it('väljer parsern med högst detect', () => {
    const a = parser('a', 'Belopp', 0.7);
    const b = parser('b', 'Bil', 0.9);
    expect(valjParser([a, b], csv('Bil;Belopp'))?.key).toBe('b');
  });

  it('frågar användaren under 0,6', () => {
    expect(valjParser([parser('a', 'Bil', 0.59)], csv('Bil'))).toBeNull();
  });

  it('hoppar över parsrar som inte tar filtypen', () => {
    expect(valjParser([parser('a', 'Bil', 1)], { name: 'x.pdf', kind: 'pdf', text: 'Bil' })).toBeNull();
  });

  it('parsern kan få valfri context', () => {
    const p: FileParser<string, { prefix: string }> = { ...parser('a', 'Bil', 1), parse: (f, c) => ({ data: (c?.prefix ?? '') + (f.text ?? ''), summary: '', warnings: [] }) };
    expect(p.parse(csv('Bil'), { prefix: '>' }).data).toBe('>Bil');
    expect(p.parse(csv('Bil')).data).toBe('Bil');
  });

  it('motor och regel följer kontrakten', () => {
    const motor: Engine<number[], { moms: number }, number> = {
      key: 'summa',
      version: '1.0.0',
      compute: (rader, { moms }) => rader.reduce((a, x) => a + x, 0) * (1 + moms),
    };
    const regel: Rule<number> = {
      key: 'okning',
      level: 'varning',
      check: (nu, forra) => (forra != null && nu > forra * 1.5 ? [{ title: 'Stor ökning', detail: 'Mer än 50 %', rows: [] }] : []),
    };
    expect(motor.compute([100, 100], { moms: 0.25 })).toBe(250);
    expect(regel.check(250, 100)).toHaveLength(1);
    expectTypeOf(regel.check).returns.toEqualTypeOf<Finding[]>();
  });
});
