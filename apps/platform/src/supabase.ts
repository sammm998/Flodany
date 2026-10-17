// Supabase-klienten i webbläsaren: bara den publika nyckeln. Sessionen sparas och förnyas av supabase-js,
// och Realtime får den nya token vid varje förnyelse (packages/api, foljToken).
import { createClient } from '@supabase/supabase-js';
import { rensaLegacyKopior } from './lagring';

/**
 * Demoläget: utan Supabase i bygget pratar plattformen med webbserverns /_demo (scripts/serva-plattform.mjs),
 * som spelar Supabase med påhittad data. Användaren är inloggad direkt som demoanvändaren.
 */
export const DEMO = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
export const URL_SUPABASE = DEMO ? `${location.origin}/_demo` : import.meta.env.VITE_SUPABASE_URL;
export const ANON = DEMO ? 'demo' : import.meta.env.VITE_SUPABASE_ANON_KEY;

/** En session som gäller länge för demoanvändaren. Bara mot demon: den har ingen betydelse någon annanstans. */
function demoSession() {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const exp = Math.floor(Date.now() / 1000) + 365 * 86_400, id = '00000000-0000-4000-8000-0000000000d1';
  const user = { id, email: 'demo@example.se', aud: 'authenticated', role: 'authenticated', user_metadata: { name: 'Demo Användare' }, app_metadata: {}, created_at: '2026-10-17T00:00:00Z' };
  const nyckel = `sb-${new URL(URL_SUPABASE).hostname.split('.')[0]}-auth-token`;
  try { localStorage.setItem(nyckel, JSON.stringify({ access_token: `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: id, exp, role: 'authenticated' })}.demo`, refresh_token: 'demo', expires_in: 365 * 86_400, expires_at: exp, token_type: 'bearer', user })); } catch { /* lagringen är avstängd */ }
}
if (DEMO) demoSession();

export const supabase = createClient(URL_SUPABASE, ANON, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: !DEMO, detectSessionInUrl: false } });

// Demon har ingen Realtime: livevisningen svarar ansluten direkt och dokumenten läses om med jämna mellanrum.
if (DEMO) {
  const kanal = { on: () => kanal, subscribe: (cb?: (s: string) => void) => { setTimeout(() => cb?.('SUBSCRIBED'), 0); return kanal; }, unsubscribe: async () => 'ok' };
  Object.assign(supabase, { channel: () => kanal, removeChannel: async () => 'ok' });
}

export async function loggaUt() {
  // I demon finns ingen inloggning: börja om som demoanvändaren.
  if (DEMO) { rensaLegacyKopior(); demoSession(); location.assign('/'); return; }
  rensaLegacyKopior();
  try { localStorage.removeItem('flodia:senaste-konto'); } catch { /* lagringen är avstängd */ }
  await supabase.auth.signOut();
}
