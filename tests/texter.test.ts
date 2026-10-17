import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROT } from '../scripts/legacy-sha256.mjs';

// Regel i CLAUDE.md: inga tankstreck (U+2014 och U+2013) i texter och dokument
const TANKSTRECK = /[–—]/;
const MAPPAR = ['packages', 'apps', 'docs/faser', 'supabase/templates'];
const TYPER = new Set(['.md', '.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.json', '.yaml', '.yml']);

function filer(mapp: string): string[] {
  if (!existsSync(mapp)) return [];
  return readdirSync(mapp, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name === 'dist') return [];
    const full = join(mapp, d.name);
    return d.isDirectory() ? filer(full) : TYPER.has(extname(d.name)) ? [full] : [];
  });
}

describe('texter', () => {
  it('har inga tankstreck i packages/, apps/, docs/faser/ och mejlmallarna', () => {
    const fel = MAPPAR.flatMap((m) => filer(join(ROT, m)))
      .flatMap((fil) =>
        readFileSync(fil, 'utf8')
          .split('\n')
          .map((rad, i) => (TANKSTRECK.test(rad) ? `${relative(ROT, fil)}:${i + 1}` : null))
          .filter((x): x is string => x !== null),
      );
    expect(fel).toEqual([]);
  });
});
