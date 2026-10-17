// Supabase-klienten i webbläsaren: bara den publika nyckeln. Sessionen sparas och förnyas av supabase-js,
// och Realtime får den nya token vid varje förnyelse (packages/api, foljToken).
import { createClient } from '@supabase/supabase-js';
import { rensaLegacyKopior } from './lagring';

/** Är plattformen kopplad till Supabase? Utan adressen och nyckeln visar plattformen bara en sida om det. */
export const KONFIGURERAD = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;
// Utan konfiguration skapas klienten mot en adress som aldrig anropas, så att sidan kan visas ändå.
export const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321';
export const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY || 'saknas';
export const supabase = createClient(URL_SUPABASE, ANON, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });

export async function loggaUt() {
  rensaLegacyKopior();
  try { localStorage.removeItem('flodia:senaste-konto'); } catch { /* lagringen är avstängd */ }
  await supabase.auth.signOut();
}
