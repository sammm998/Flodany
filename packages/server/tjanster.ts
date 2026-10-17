// Tjanster mot Supabase. Användarens token används för allt som rör kontots data (radsäkerheten gäller).
// Service-nyckeln används bara för att räkna och registrera anrop (usage), som klienten inte får skriva.
// Anthropics nyckel (fotoläsningen) läses ur Supabase Secrets och finns bara här på servern.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { skapaDb } from '@flodia/api';
import type { Roll } from './moduler';
import { MotorFel } from './fel';
import type { ClaudeAnrop, ClaudeSvar, Fotolasare } from './fotolasning';
import type { Tjanster } from './motor';

export interface Miljo {
  url: string; anon: string; service: string;
  /** ANTHROPIC_API_KEY ur Supabase Secrets. Utan den är fotoläsningen avstängd på servern. */
  anthropic?: string;
  /** FOTOLASNING_MODELL ur Supabase Secrets: modellen för fotoläsningen. */
  fotoModell?: string;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Anthropic från servern. Bilden skickas med anropet och kastas sedan: inget sparas och inget loggas.
 * Felsvar från Anthropic visas aldrig för klienten och loggas utan anropets innehåll.
 */
export function fotolasareFranMiljo(m: Pick<Miljo, 'anthropic' | 'fotoModell'>, f: typeof fetch = fetch): Fotolasare | null {
  if (!m.anthropic || !m.fotoModell) return null;
  const nyckel = m.anthropic;
  return {
    modell: m.fotoModell,
    async anropa(anrop: ClaudeAnrop): Promise<ClaudeSvar> {
      let svar: Response;
      try {
        svar = await f(ANTHROPIC_URL, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', 'x-api-key': nyckel, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(anrop) });
      } catch {
        throw new MotorFel(502, 'ai_fel', 'Fotot kunde inte läsas just nu. Försök igen om en stund.');
      }
      if (!svar.ok) {
        console.warn('Anthropic svarade med status ' + svar.status);
        throw new MotorFel(502, 'ai_fel', 'Fotot kunde inte läsas just nu. Försök igen om en stund.');
      }
      return await svar.json() as ClaudeSvar;
    },
  };
}

const utanSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** larm: anropas när taket nås, till exempel Sentry (fas 2f). */
export function tjansterFranMiljo(m: Miljo, opt: { larm?: (text: string, taggar?: Record<string, string>) => void } = {}): Tjanster {
  if (!m.url || !m.anon || !m.service) throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY eller SUPABASE_SERVICE_ROLE_KEY saknas');
  const service = createClient(m.url, m.service, utanSession);
  // En klient per token och anrop. Klienten lever bara under anropet.
  const klienter = new Map<string, SupabaseClient>();
  const som = (token: string) => {
    let k = klienter.get(token);
    if (!k) {
      k = createClient(m.url, m.anon, { ...utanSession, accessToken: async () => token });
      klienter.set(token, k);
      if (klienter.size > 100) klienter.delete(klienter.keys().next().value!);
    }
    return k;
  };
  const sedan = (ms: number) => new Date(Date.now() - ms).toISOString();

  return {
    async anvandare(token) {
      const { data, error } = await service.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    async roll(token, anvandare, konto) {
      const { data } = await som(token).from('memberships').select('role').match({ user_id: anvandare, tenant_id: konto }).maybeSingle();
      return (data?.role as Roll | undefined) ?? null;
    },
    async intern(token, konto) {
      const { data } = await som(token).from('tenants').select('intern').eq('id', konto).maybeSingle();
      return data?.intern === true;
    },
    async funktion(token, konto, nyckel) {
      const { data } = await som(token).from('konto_funktioner').select('status, ended_at').match({ tenant_id: konto, nyckel }).maybeSingle();
      return !!data && data.status === 'aktiv' && (!data.ended_at || new Date(data.ended_at as string) > new Date());
    },
    async aiAnrop(konto, sedan) {
      const { count, error } = await service.from('usage').select('id', { count: 'exact', head: true }).match({ tenant_id: konto, kind: 'ai' }).gte('at', sedan);
      if (error) throw new Error('Kunde inte räkna anrop');
      return count ?? 0;
    },
    fotolasare: fotolasareFranMiljo(m),
    async licens(token, konto, modul) {
      const { data } = await som(token).from('licenses').select('status, ended_at').match({ tenant_id: konto, module_key: modul }).maybeSingle();
      return !!data && data.status === 'aktiv' && (!data.ended_at || new Date(data.ended_at as string) > new Date());
    },
    async anvandning(konto, anvandare) {
      const [minut, timme] = await Promise.all([
        service.from('usage').select('id', { count: 'exact', head: true }).eq('user_id', anvandare).gte('at', sedan(60_000)),
        service.from('usage').select('id', { count: 'exact', head: true }).eq('tenant_id', konto).gte('at', sedan(3_600_000)),
      ]);
      if (minut.error || timme.error) throw new Error('Kunde inte räkna anrop');
      return { minut: minut.count ?? 0, timme: timme.count ?? 0 };
    },
    async tak(konto) {
      // Kontots egen rad före standarden (tenant_id null).
      const { data, error } = await service.from('tak').select('tenant_id, per_anvandare_minut, per_konto_timme, foto_per_dag').or(`tenant_id.eq.${konto},tenant_id.is.null`);
      if (error) throw new Error('Kunde inte läsa taket');
      const rad = data.find(x => x.tenant_id === konto) ?? data.find(x => x.tenant_id === null);
      return rad ? { perAnvandareMinut: rad.per_anvandare_minut as number, perKontoTimme: rad.per_konto_timme as number, fotoPerDag: rad.foto_per_dag as number } : null;
    },
    async takNatt(konto, anvandare, detalj) {
      const { count } = await service.from('audit_log').select('id', { count: 'exact', head: true }).match({ tenant_id: konto, actor: anvandare, action: 'tak.natt' }).gte('at', sedan(60_000));
      if (count) return;
      await service.from('audit_log').insert({ tenant_id: konto, actor: anvandare, action: 'tak.natt', target: String(detalj.modul ?? ''), detalj });
      const text = `Taket för anrop nått: konto ${konto}, användare ${anvandare}`;
      if (opt.larm) opt.larm(text, { konto, modul: String(detalj.modul ?? '') }); else console.warn(text, detalj);
    },
    async registrera(konto, anvandare, modul, typ = 'motor') {
      const { error } = await service.from('usage').insert({ tenant_id: konto, user_id: anvandare, module_key: modul, kind: typ });
      if (error) throw new Error('Kunde inte registrera anropet');
    },
    async logga(token, konto, handelse, mal, detalj) {
      const { error } = await som(token).rpc('logga', { konto, handelse, mal, detalj });
      if (error) throw new Error('Kunde inte logga');
    },
    dokument: (token, konto, modul) => skapaDb({ supabase: som(token), konto, modul }),
    nu: () => Date.now(),
    slump: () => Math.random(),
  };
}
