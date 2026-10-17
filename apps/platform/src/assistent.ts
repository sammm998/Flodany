// Assistenten i webbläsaren: frågan skickas till serverfunktionen assistent med användarens token och svaret läses
// som en ström av händelser. Samtalen läses och tas bort med användarens egna rättigheter (radsäkerheten avgör).
// Ingen nyckel till AI:n och ingen motor finns här (beslut 26).
import { useQuery } from '@tanstack/react-query';
import type { AssistentAnrop, AssistentHandelse, SamtalRad, SparatSamtal } from '@flodia/api';
import { ANON, URL_SUPABASE, supabase } from './supabase';
import { lasHandelser } from './chatt/handelser';

export class AssistentFel extends Error {
  readonly kod: string;
  constructor(kod: string, text: string) { super(text); this.name = 'AssistentFel'; this.kod = kod; }
}

/** Ställer en fråga. Händelserna kommer i ordning till vid. Kastar AssistentFel om servern svarar med fel. */
export async function fraga(anrop: AssistentAnrop, vid: (h: AssistentHandelse) => void, signal?: AbortSignal): Promise<void> {
  const { data } = await supabase.auth.getSession();
  let r: Response;
  try {
    r = await fetch(`${URL_SUPABASE}/functions/v1/assistent`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + (data.session?.access_token ?? ''), apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify(anrop),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new AssistentFel('natverk', 'Servern svarar inte. Försök igen om en stund.');
  }
  if (!r.ok || !r.body) {
    const j = await r.json().catch(() => null) as { fel?: { kod?: string; text?: string } } | null;
    throw new AssistentFel(j?.fel?.kod ?? 'serverfel', j?.fel?.text ?? 'Assistenten kunde inte svara. Försök igen.');
  }
  await lasHandelser(r.body, vid);
}

/** Användarens senaste samtal i kontot. */
export function useSamtalLista(konto: string | undefined) {
  return useQuery({
    queryKey: ['samtal', konto],
    enabled: !!konto,
    queryFn: async (): Promise<SamtalRad[]> => {
      const { data, error } = await supabase.from('assistent_samtal').select('id, titel, andrad').eq('tenant_id', konto!).order('andrad', { ascending: false }).limit(50);
      if (error) throw error;
      return data as SamtalRad[];
    },
  });
}

export async function hamtaSamtal(konto: string, id: string): Promise<SparatSamtal | null> {
  const { data, error } = await supabase.from('assistent_samtal').select('id, titel, andrad, visning, paneler').match({ tenant_id: konto, id }).maybeSingle();
  if (error) throw error;
  return data as SparatSamtal | null;
}

export async function taBortSamtal(id: string): Promise<void> {
  const { error } = await supabase.from('assistent_samtal').delete().eq('id', id);
  if (error) throw error;
}
