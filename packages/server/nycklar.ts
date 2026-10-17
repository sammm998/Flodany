// Vilka API-nycklar serverfunktionerna använder. Supabase sätter de nya nycklarna i miljön som JSON med nyckelns namn:
// SUPABASE_SECRET_KEYS och SUPABASE_PUBLISHABLE_KEYS. Varje funktion har en egen secret key med samma namn som
// funktionen (motor, legacy, assistent), så att en läcka bara kräver ett byte. Nycklarnas värden skrivs aldrig ut.
//
// I molnet finns ingen reserv: de äldre JWT-nycklarna är avstängda sedan 2026-10-14, och saknas funktionens nyckel
// startar funktionen inte (docs/publicera-motor.md). Molnet känns igen i första hand på FLODIA_MILJO = 'drift'
// (vår egen hemlighet) och i andra hand på SB_REGION, som Supabase bara sätter i molnet. Ett av dem räcker.
// Lokalt (supabase start i CI) finns inga secret keys med funktionernas namn, så där används de äldre nycklarna.

export type Funktion = 'motor' | 'legacy' | 'assistent';
export interface Nycklar { anon: string; service: string; kalla: { lage: 'moln' | 'lokalt'; anon: string; service: string } }

function lasJson(text: string | undefined): Record<string, unknown> {
  if (!text) return {};
  try { const o = JSON.parse(text) as unknown; return o && typeof o === 'object' && !Array.isArray(o) ? o as Record<string, unknown> : {}; } catch { return {}; }
}
const text = (x: unknown) => (typeof x === 'string' && x ? x : '');

/** Körs funktionen i molnet? FLODIA_MILJO = 'drift' först, SB_REGION sedan. */
export function iMolnet(miljo: (namn: string) => string | undefined): boolean {
  return miljo('FLODIA_MILJO') === 'drift' || !!miljo('SB_REGION');
}

/** Väljer nycklar ur miljön: funktionens egen secret key och publishable-nyckeln default. Kastar i molnet om de saknas. */
export function nycklarFranMiljo(miljo: (namn: string) => string | undefined, funktion: Funktion): Nycklar {
  const hemliga = lasJson(miljo('SUPABASE_SECRET_KEYS')), publika = lasJson(miljo('SUPABASE_PUBLISHABLE_KEYS'));
  const service = text(hemliga[funktion]), anon = text(publika.default);
  if (iMolnet(miljo)) {
    if (!service) throw new Error(`Secret key ${funktion} saknas i SUPABASE_SECRET_KEYS. Skapa den i Supabase (API Keys) och publicera funktionen igen.`);
    if (!anon) throw new Error('Publishable-nyckeln default saknas i SUPABASE_PUBLISHABLE_KEYS.');
    return { service, anon, kalla: { lage: 'moln', service: `SUPABASE_SECRET_KEYS.${funktion}`, anon: 'SUPABASE_PUBLISHABLE_KEYS.default' } };
  }
  return {
    service: service || (miljo('SUPABASE_SERVICE_ROLE_KEY') ?? ''),
    anon: anon || (miljo('SUPABASE_ANON_KEY') ?? ''),
    kalla: {
      lage: 'lokalt',
      service: service ? `SUPABASE_SECRET_KEYS.${funktion}` : 'SUPABASE_SERVICE_ROLE_KEY (lokalt)',
      anon: anon ? 'SUPABASE_PUBLISHABLE_KEYS.default' : 'SUPABASE_ANON_KEY (lokalt)',
    },
  };
}
