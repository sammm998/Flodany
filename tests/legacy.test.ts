import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LISTA, ROT, berakna } from '../scripts/legacy-sha256.mjs';

describe('legacy/', () => {
  it('är orörd (samma kontrollsummor som i tests/legacy.sha256)', () => {
    const sparad = readFileSync(LISTA, 'utf8').trim().split('\n');
    expect(berakna()).toEqual(sparad);
  });

  const appar = readdirSync(join(ROT, 'legacy', 'apps'));

  it('innehåller de fyra apparna', () => {
    expect(appar.sort()).toEqual(['akarkassan', 'avrakning', 'foliering', 'tripkassan']);
  });

  it.each(appar)('%s laddar claude-shim.js från en sökväg som finns', (app) => {
    const html = readFileSync(join(ROT, 'legacy', 'apps', app, 'index.html'), 'utf8');
    const src = html.match(/<script src="([^"]*claude-shim\.js)"/)?.[1];
    expect(src).toBeDefined();
    expect(existsSync(join(ROT, 'legacy', 'apps', app, src!))).toBe(true);
  });
});
