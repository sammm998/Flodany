// Legacy-bryggan med påhittade tjänster. Mot Edge Function och databas: tests/db/legacy.test.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BRYGG_TAGG, LEGACY_APPAR, SHIM_TAGG, hanteraLegacy, medBrygga, type LegacyApp, type Tjanster } from './index';

const ROT = join(import.meta.dirname, '..', '..');
const FILER = Object.fromEntries(LEGACY_APPAR.map(a => [a, readFileSync(join(ROT, 'legacy', 'apps', a, 'index.html'), 'utf8')])) as Record<LegacyApp, string>;
const INTERNT = '00000000-0000-4000-8000-0000000000aa', EXTERNT = '00000000-0000-4000-8000-0000000000bb';

let logg: string[];
let t: Tjanster;
beforeEach(() => {
  logg = [];
  const roller: Record<string, string> = { 'token-admin': 'admin', 'token-ekonomi': 'ekonomi', 'token-las': 'las' };
  t = {
    anvandare: async tok => (tok.startsWith('token-') ? tok : null),
    roll: async (tok, _a, konto) => ([INTERNT, EXTERNT].includes(konto) ? (roller[tok] as never) ?? null : null),
    intern: async (_t, konto) => konto === INTERNT,
    licens: async () => true, funktion: async () => false, aiAnrop: async () => 0, fotolasare: null,
    anvandning: async () => ({ minut: 0, timme: 0 }), tak: async () => null, takNatt: async () => {}, registrera: async () => {},
    logga: async (_t, _k, h, mal) => { logg.push(`${h} ${mal}`); },
    dokument: () => { throw new Error('används inte'); }, nu: () => 0, slump: () => 0,
  };
});

const hamta = (konto: string, app: string, token?: string) =>
  hanteraLegacy(new Request(`http://x/legacy?konto=${konto}&app=${app}`, { headers: token ? { authorization: 'Bearer ' + token } : {} }), t, FILER);

describe('legacy-bryggan', () => {
  it('svaret är legacy-filen byte för byte, utom shim-taggen som byts mot bryggan', async () => {
    for (const app of LEGACY_APPAR) {
      const r = await hamta(INTERNT, app, 'token-ekonomi');
      expect(r.status, app).toBe(200);
      expect(r.headers.get('cache-control')).toBe('no-store');
      const html = await r.text();
      expect(html).not.toContain(SHIM_TAGG);
      expect(html.split(BRYGG_TAGG).length).toBe(2);
      expect(html.replace(BRYGG_TAGG, SHIM_TAGG)).toBe(FILER[app]);
    }
    expect(logg).toEqual(LEGACY_APPAR.map(a => 'legacy.oppnad ' + a));
  });

  it('utloggad får 401, externt konto 403, läs-rollen 403 i kassorna', async () => {
    expect((await hamta(INTERNT, 'avrakning')).status).toBe(401);
    expect((await hamta(INTERNT, 'avrakning', 'falsk')).status).toBe(401);
    const ext = await hamta(EXTERNT, 'avrakning', 'token-admin');
    expect(ext.status).toBe(403);
    expect(await ext.json()).toEqual({ fel: { kod: 'inte_internt', text: 'De nuvarande apparna finns bara för interna konton.' } });
    expect((await hamta('00000000-0000-4000-8000-0000000000cc', 'avrakning', 'token-admin')).status).toBe(403);
    for (const app of ['akarkassan', 'tripkassan']) expect((await hamta(INTERNT, app, 'token-las')).status, app).toBe(403);
    expect((await hamta(INTERNT, 'avrakning', 'token-las')).status).toBe(200);
    t.licens = async () => false;
    expect((await hamta(INTERNT, 'avrakning', 'token-admin')).status).toBe(403);
  });

  it('okänd app och ogiltigt konto ger 400, och inget i svaret avslöjar legacy-koden', async () => {
    for (const [konto, app] of [[INTERNT, 'okand'], [INTERNT, '../../shared/claude-shim.js'], ['inte-ett-id', 'avrakning']] as const) {
      const r = await hamta(konto, app, 'token-admin');
      expect(r.status).toBe(400);
      expect(await r.text()).not.toContain('<script');
    }
  });

  it('kräver exakt en shim-tagg', () => {
    expect(() => medBrygga('<html></html>')).toThrow(/exakt en/);
    expect(() => medBrygga(SHIM_TAGG + SHIM_TAGG)).toThrow(/exakt en/);
  });
});
