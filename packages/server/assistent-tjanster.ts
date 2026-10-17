// Det assistenten behöver av omvärlden, mot Supabase och Anthropic. Samtalen läses och sparas med användarens
// token (radsäkerheten: varje användare ser bara sina egna). Service-nyckeln används bara för att räkna frågor och
// läsa taket, som klienten inte får skriva. Anthropics nyckel läses ur Supabase Secrets och finns bara här.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ClaudeFel, type AssistentTjanster, type Claude, type SamtalPost, type StromAnrop, type StromHandelse } from './assistent';
import type { Tjanster } from './motor';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
/** Server-side fallback med fallbacks: "default" (se harReserv i assistent.ts). */
const RESERV_BETA = 'server-side-fallback-2026-07-01';

/** Läser en ström av server-sent events till JSON-händelser. Rader som inte är data hoppas över. */
export async function* lasSse(kropp: ReadableStream<Uint8Array>): AsyncGenerator<StromHandelse> {
  const lasare = kropp.getReader(), avkodare = new TextDecoder();
  let buffert = '';
  try {
    for (;;) {
      const { value, done } = await lasare.read();
      buffert += avkodare.decode(value ?? new Uint8Array(), { stream: !done });
      let slut: number;
      while ((slut = buffert.search(/\r?\n\r?\n/)) >= 0) {
        const handelse = buffert.slice(0, slut);
        buffert = buffert.slice(slut).replace(/^\r?\n\r?\n/, '');
        const data = handelse.split(/\r?\n/).filter(r => r.startsWith('data:')).map(r => r.slice(5).trimStart()).join('\n');
        if (data) yield JSON.parse(data) as StromHandelse;
      }
      if (done) break;
    }
  } finally { lasare.releaseLock(); }
}

/**
 * Anthropic från servern, med strömning. Felsvar visas aldrig för klienten och loggas utan anropets innehåll.
 * null när nyckeln eller modellen saknas i konfigurationen.
 */
export function claudeFranMiljo(m: { anthropic?: string; modell?: string; insats?: string }, f: typeof fetch = fetch): Claude | null {
  if (!m.anthropic || !m.modell) return null;
  const nyckel = m.anthropic;
  return {
    modell: m.modell,
    insats: m.insats || 'medium',
    async *strom(anrop: StromAnrop) {
      let svar: Response;
      try {
        svar = await f(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8', 'x-api-key': nyckel, 'anthropic-version': '2023-06-01', ...(anrop.fallbacks ? { 'anthropic-beta': RESERV_BETA } : {}) },
          body: JSON.stringify(anrop),
        });
      } catch {
        throw new ClaudeFel(502, 'natverk');
      }
      if (!svar.ok || !svar.body) {
        const fel = await svar.json().catch(() => null) as { error?: { type?: string; message?: string } } | null;
        console.warn('Anthropic svarade med status ' + svar.status + (fel?.error?.type ? ' (' + fel.error.type + ')' : ''));
        throw new ClaudeFel(svar.status, `${fel?.error?.type ?? 'error'}: ${fel?.error?.message ?? ''}`);
      }
      yield* lasSse(svar.body);
    },
  };
}

const utanSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

interface SamtalRad { id: string; tenant_id: string; titel: string; system: string; meddelanden: SamtalPost['meddelanden']; visning: SamtalPost['visning']; paneler: SamtalPost['paneler'] }

export function assistentTjansterFranMiljo(m: { url: string; anon: string; service: string; anthropic?: string; modell?: string; insats?: string }, motor: Tjanster): AssistentTjanster {
  const service = createClient(m.url, m.service, utanSession);
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
  return {
    motor,
    claude: claudeFranMiljo(m),
    samtal: {
      async hamta(token, konto, id) {
        const { data, error } = await som(token).from('assistent_samtal').select('id, tenant_id, titel, system, meddelanden, visning, paneler').match({ id, tenant_id: konto }).maybeSingle();
        if (error) throw new Error('Kunde inte läsa samtalet');
        const r = data as SamtalRad | null;
        return r ? { id: r.id, konto: r.tenant_id, titel: r.titel, system: r.system, meddelanden: r.meddelanden, visning: r.visning, paneler: r.paneler } : null;
      },
      async spara(token, anvandare, p) {
        const { error } = await som(token).from('assistent_samtal').upsert({
          id: p.id, tenant_id: p.konto, user_id: anvandare, titel: p.titel, system: p.system,
          meddelanden: p.meddelanden, visning: p.visning, paneler: p.paneler, andrad: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (error) throw new Error('Kunde inte spara samtalet');
      },
      async rensa(token, fore) {
        await som(token).from('assistent_samtal').delete().lt('andrad', fore);
      },
    },
    async kontonamn(token, konto) {
      const { data } = await som(token).from('tenants').select('name').eq('id', konto).maybeSingle();
      return (data?.name as string | undefined) ?? null;
    },
    async fragor(konto, sedan) {
      const { count, error } = await service.from('usage').select('id', { count: 'exact', head: true }).match({ tenant_id: konto, module_key: 'assistent', kind: 'ai' }).gte('at', sedan);
      if (error) throw new Error('Kunde inte räkna frågor');
      return count ?? 0;
    },
    async perDag(konto) {
      const { data, error } = await service.from('tak').select('tenant_id, assistent_per_dag').or(`tenant_id.eq.${konto},tenant_id.is.null`);
      if (error) throw new Error('Kunde inte läsa taket');
      const rad = data.find(x => x.tenant_id === konto) ?? data.find(x => x.tenant_id === null);
      return (rad?.assistent_per_dag as number | undefined) ?? null;
    },
    id: () => crypto.randomUUID(),
  };
}
