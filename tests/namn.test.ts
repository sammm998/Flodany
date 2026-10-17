// Namnbytet (fas 2e, ägarens uppdrag 2026-10-12): produkten heter Flödia, paketen @flodia/*.
// Det gamla namnet får inte finnas i något som spåras utanför legacy/, utom de uttryckliga undantagen nedan.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROT = join(import.meta.dirname, '..');
const GAMMALT = new RegExp(['bolags', 'appar'].join(''), 'i');

/** Får innehålla det gamla namnet. */
const UNDANTAG = [
  // Originalspecifikationen behåller sitt filnamn.
  ['Bolags', 'appar-bygg-och-designspec-v3.pdf'].join(''),
];
/** Filer som beskriver själva namnbytet. */
const FILER_OM_BYTET = ['docs/faser/fas-2e-plan.md', 'docs/faser/fas-2e.md'];

describe('namnbytet till Flödia', () => {
  it('det gamla namnet finns bara i legacy/ och i de uttryckliga undantagen', () => {
    const filer = execSync('git ls-files', { cwd: ROT, encoding: 'utf8' }).split('\n')
      .filter(f => f && !f.startsWith('legacy/') && !FILER_OM_BYTET.includes(f) && !/\.(pdf|png|jpe?g|ico|woff2?)$/i.test(f));
    const fel: string[] = [];
    for (const f of filer) {
      if (GAMMALT.test(f.replace(UNDANTAG[0]!, ''))) fel.push(f + ' (filnamnet)');
      let text = readFileSync(join(ROT, f), 'utf8');
      for (const u of UNDANTAG) text = text.split(u).join('');
      text.split('\n').forEach((rad, i) => { if (GAMMALT.test(rad)) fel.push(`${f}:${i + 1}`); });
    }
    expect(fel).toEqual([]);
  });

  it('paketen heter @flodia/*', () => {
    const lasNamn = (p: string) => (JSON.parse(readFileSync(join(ROT, p), 'utf8')) as { name: string }).name;
    expect(lasNamn('package.json')).toBe('flodia');
    for (const p of ['api', 'core', 'kit', 'server', 'ui']) expect(lasNamn(`packages/${p}/package.json`)).toBe(`@flodia/${p}`);
  });
});
