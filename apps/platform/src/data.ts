// Plattformens data. Allt läses med användarens egna rättigheter (radsäkerheten avgör).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { skapaDb } from '@flodia/api';
import type { KontoLage } from '@flodia/guides';
import type { Licens, Roll } from '@flodia/modules';
import { supabase } from './supabase';

export interface Konto { id: string; name: string; slug: string; type: 'platform' | 'main' | 'sub' | 'direct'; brand: { accent?: string }; intern: boolean }
export interface Medlemskap { roll: Roll; konto: Konto }

export const TYP: Record<Konto['type'], string> = { platform: 'Flödia', main: 'Huvudkund', sub: 'Underkund', direct: 'Direktkund' };
export const ROLL: Record<Roll, string> = { admin: 'Admin', ekonomi: 'Ekonomi', las: 'Läs' };

/** Sessionen. undefined medan den läses, null om ingen är inloggad. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setS(data.session));
    const { data } = supabase.auth.onAuthStateChange((_h, ny) => setS(ny));
    return () => data.subscription.unsubscribe();
  }, []);
  return s;
}

/** Användarens konton med roll (kontoväljaren). Radsäkerheten visar alla medlemmar i kontot, så frågan filtrerar på användaren. */
export function useMinaKonton(anvandare: string | undefined) {
  return useQuery({
    queryKey: ['konton', anvandare],
    enabled: !!anvandare,
    queryFn: async (): Promise<Medlemskap[]> => {
      const { data, error } = await supabase.from('memberships').select('role, tenant:tenants(id, name, slug, type, brand, intern)').eq('user_id', anvandare!);
      if (error) throw error;
      return (data as unknown as { role: Roll; tenant: Konto }[]).map(r => ({ roll: r.role, konto: r.tenant })).sort((a, b) => a.konto.name.localeCompare(b.konto.name, 'sv'));
    },
  });
}

export function useLicenser(konto: string | undefined) {
  return useQuery({
    queryKey: ['licenser', konto],
    enabled: !!konto,
    queryFn: async (): Promise<Licens[]> => {
      const { data, error } = await supabase.from('licenses').select('module_key, variant, status, ended_at').eq('tenant_id', konto!);
      if (error) throw error;
      return data as Licens[];
    },
  });
}

/** Är funktionen (paket eller tillval) påslagen i kontot? Bara för att visa eller dölja knappar: spärren sitter på servern. */
export function useFunktion(konto: string | undefined, nyckel: string) {
  return useQuery({
    queryKey: ['funktion', konto, nyckel],
    enabled: !!konto,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.from('konto_funktioner').select('status, ended_at').match({ tenant_id: konto!, nyckel }).maybeSingle();
      if (error) throw error;
      return !!data && data.status === 'aktiv' && (!data.ended_at || new Date(data.ended_at as string) > new Date());
    },
  });
}

/** Användarens egna guidesteg i kontot och modulen (guide_progress). */
export function useGuidesteg(konto: string | undefined, modul: string) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['guidesteg', konto, modul],
    enabled: !!konto,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('guide_progress').select('step_key').match({ tenant_id: konto!, module_key: modul });
      if (error) throw error;
      return data.map(r => r.step_key as string);
    },
  });
  const klar = async (steg: string) => {
    const { error } = await supabase.from('guide_progress').upsert({ tenant_id: konto!, module_key: modul, step_key: steg }, { onConflict: 'user_id,tenant_id,module_key,step_key', ignoreDuplicates: true });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['guidesteg', konto, modul] });
  };
  const nollstall = async (steg: string) => {
    await supabase.from('guide_progress').delete().match({ tenant_id: konto!, module_key: modul, step_key: steg });
    await qc.invalidateQueries({ queryKey: ['guidesteg', konto, modul] });
  };
  return { ...q, klar, nollstall };
}

/**
 * Det kom igång-listan läser i kontot, live: dokumenten i settings och months via documents-API:t
 * (onSnapshot), plus publicerade perioder och inbjudningar.
 */
export function useKontoLage(konto: string | undefined, modul: string, aktiv: boolean, samlingar: string[] = []): { lage: KontoLage | null; fel: Error | null } {
  type Doc = { id: string; data: Readonly<Record<string, unknown>> };
  const [docs, setDocs] = useState<Record<string, Doc[]>>({});
  const [fel, setFel] = useState<Error | null>(null);
  const nyckel = samlingar.join('|');
  const extra = useQuery({
    queryKey: ['lage', konto, modul],
    enabled: !!konto && aktiv,
    queryFn: async () => {
      const [p, i] = await Promise.all([
        supabase.from('periods').select('period', { count: 'exact', head: true }).match({ tenant_id: konto!, module_key: modul, status: 'publicerad' }),
        supabase.from('invites').select('id', { count: 'exact', head: true }).eq('parent_id', konto!),
      ]);
      return { publicerade: p.count ?? 0, inbjudningar: i.count ?? 0 };
    },
  });
  // Varje samling som guiden läser följs live, så att en bock syns direkt när någon i kontot gjort steget.
  useEffect(() => {
    setDocs({});
    if (!konto || !aktiv || !nyckel) return;
    const db = skapaDb({ supabase, konto, modul });
    const sluta = nyckel.split('|').map(samling => db.collection(samling).onSnapshot(
      s => setDocs(f => ({ ...f, [samling]: s.docs.map(d => ({ id: d.id, data: d.data()! })) })), e => setFel(e)));
    return () => { for (const s of sluta) s(); };
  }, [konto, modul, aktiv, nyckel]);
  if (samlingar.some(s => !docs[s]) || !extra.data) return { lage: null, fel: fel ?? (extra.error as Error | null) };
  const sokvag = (samling: string, id: string) => (samling ? samling + '/' + id : id);
  const alla = new Map(samlingar.flatMap(s => docs[s]!.map(d => [sokvag(s, d.id), d.data] as const)));
  return { lage: {
    dokument: p => alla.get(p), antal: s => docs[s]?.length ?? 0, dokumenten: s => docs[s] ?? [],
    publicerade: extra.data.publicerade, inbjudningar: extra.data.inbjudningar,
  }, fel };
}

const SENASTE = 'flodia:senaste-konto';
export const senasteKonto = (): string | null => { try { return localStorage.getItem(SENASTE); } catch { return null; } };
export const sparaSenasteKonto = (slug: string) => { try { localStorage.setItem(SENASTE, slug); } catch { /* lagringen är avstängd */ } };
