// Serverfunktionerna använder bara de nya API-nycklarna i molnet. De äldre används bara lokalt (CI).
import { describe, expect, it } from 'vitest';
import { iMolnet, nycklarFranMiljo } from './nycklar';

const miljo = (m: Record<string, string>) => (n: string) => m[n];
const NYA = {
  SUPABASE_SECRET_KEYS: JSON.stringify({ motor: 'sb_secret_motor', legacy: 'sb_secret_legacy' }),
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_default' }),
};
const ALDRE = { SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service_role', SUPABASE_ANON_KEY: 'eyJ.anon' };
const MOLN = { SB_REGION: 'eu-north-1' };

describe('molnläget', () => {
  it("FLODIA_MILJO = 'drift' räcker", () => {
    expect(iMolnet(miljo({ FLODIA_MILJO: 'drift' }))).toBe(true);
    expect(() => nycklarFranMiljo(miljo({ FLODIA_MILJO: 'drift', ...ALDRE }), 'motor')).toThrow(/Secret key motor saknas/);
  });

  it('SB_REGION räcker, även när FLODIA_MILJO är något annat', () => {
    expect(iMolnet(miljo({ SB_REGION: 'eu-north-1' }))).toBe(true);
    expect(iMolnet(miljo({ SB_REGION: 'eu-north-1', FLODIA_MILJO: 'test' }))).toBe(true);
    expect(() => nycklarFranMiljo(miljo({ SB_REGION: 'eu-north-1', FLODIA_MILJO: 'test', ...ALDRE }), 'legacy')).toThrow(/Secret key legacy saknas/);
  });

  it('utan något av dem är det lokalt, också med FLODIA_MILJO = test', () => {
    expect(iMolnet(miljo({}))).toBe(false);
    expect(iMolnet(miljo({ FLODIA_MILJO: 'test' }))).toBe(false);
    expect(nycklarFranMiljo(miljo({ FLODIA_MILJO: 'test', ...ALDRE }), 'motor').kalla.lage).toBe('lokalt');
  });
});

describe('API-nycklarna i serverfunktionerna', () => {
  it('i molnet: funktionens egen secret key och publishable-nyckeln, aldrig de äldre', () => {
    for (const f of ['motor', 'legacy'] as const) {
      const n = nycklarFranMiljo(miljo({ ...MOLN, ...NYA, ...ALDRE }), f);
      expect([n.service, n.anon]).toEqual(['sb_secret_' + f, 'sb_publishable_default']);
      expect(n.kalla).toEqual({ lage: 'moln', service: `SUPABASE_SECRET_KEYS.${f}`, anon: 'SUPABASE_PUBLISHABLE_KEYS.default' });
    }
  });

  it('i molnet finns ingen reserv: saknas en ny nyckel startar funktionen inte, även om de äldre finns', () => {
    expect(() => nycklarFranMiljo(miljo({ ...MOLN, ...ALDRE }), 'motor')).toThrow(/Secret key motor saknas/);
    expect(() => nycklarFranMiljo(miljo({ ...MOLN, ...ALDRE, SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_default' }) }), 'legacy')).toThrow(/Secret key legacy saknas/);
    expect(() => nycklarFranMiljo(miljo({ ...MOLN, ...ALDRE, SUPABASE_SECRET_KEYS: NYA.SUPABASE_SECRET_KEYS }), 'motor')).toThrow(/Publishable-nyckeln default saknas/);
    expect(() => nycklarFranMiljo(miljo({ ...MOLN, ...ALDRE, SUPABASE_SECRET_KEYS: 'inte json' }), 'motor')).toThrow(/saknas/);
  });

  it('lokalt (supabase start i CI) används de äldre nycklarna när de nya saknas', () => {
    expect(nycklarFranMiljo(miljo(ALDRE), 'legacy')).toEqual({ service: 'eyJ.service_role', anon: 'eyJ.anon', kalla: { lage: 'lokalt', service: 'SUPABASE_SERVICE_ROLE_KEY (lokalt)', anon: 'SUPABASE_ANON_KEY (lokalt)' } });
    expect(nycklarFranMiljo(miljo({ ...NYA, ...ALDRE }), 'motor').service).toBe('sb_secret_motor');
  });

  it('källan och felen beskrivs utan nyckelns värde', () => {
    // Två kontroller: källan, och felet. Kastas inget fel faller testet.
    expect.assertions(2);
    expect(JSON.stringify(nycklarFranMiljo(miljo({ ...MOLN, ...NYA }), 'motor').kalla)).not.toMatch(/sb_secret_|sb_publishable_/);
    try { nycklarFranMiljo(miljo({ ...MOLN, ...ALDRE }), 'motor'); } catch (e) { expect(String(e)).not.toMatch(/eyJ/); }
  });
});
