// Supabase-klienten i webbläsaren: bara den publika nyckeln. Sessionen sparas och förnyas av supabase-js,
// och Realtime får den nya token vid varje förnyelse (packages/api, foljToken).
import { createClient } from '@supabase/supabase-js';
import { rensaLegacyKopior } from './lagring';

export const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL;
export const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(URL_SUPABASE, ANON, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

export async function loggaUt() {
  rensaLegacyKopior();
  try { localStorage.removeItem('flodia:senaste-konto'); } catch { /* lagringen är avstängd */ }
  await supabase.auth.signOut();
}
