// Legacy-bryggan (fas 2e, beslut 8 i fas-2-beslut.md och ägarens tillägg 2026-10-12).
//
// UNDANTAG FRÅN BESLUT 26. Legacy-apparnas HTML innehåller motorerna i klartext. Den här funktionen är
// det enda stället där de lämnas ut till en webbläsare, och bara:
//   - efter inloggning (annars 401),
//   - till en medlem i ett konto med tenants.intern = true (annars 403),
//   - med aktiv licens för appen, och admin eller ekonomi för kassorna (annars 403).
// Filerna ligger aldrig som publika statiska filer, varken i klientbygget eller på någon öppen adress.
// Granskningen av klientpaketet (scripts/klientpaket.mjs) gäller för allt utom just det här svaret.
//
// Svaret är legacy-filen byte för byte, utom skripttaggen för claude-shim.js, som byts mot en rad som
// hämtar window.claude från plattformen (documents-API:t, skapaClaude). Filen i legacy/ ändras aldrig.
import { MotorFel } from './fel';
import { MODULER, type Modul } from './moduler';
import type { Tjanster } from './motor';

export const LEGACY_APPAR = ['avrakning', 'akarkassan', 'tripkassan', 'foliering'] as const;
export type LegacyApp = typeof LEGACY_APPAR[number];

export const SHIM_TAGG = '<script src="../../shared/claude-shim.js"></script>';
/**
 * Hämtar window.claude från plattformen som visar appen i en iframe. Öppnad direkt finns ingen databas.
 * Ramen kan ha data-flodia (chattens panel kan visa flera appar samtidigt): då hämtas appens egen runtime.
 */
export const BRYGG_TAGG = '<script>window.claude = window.parent !== window ? ((window.frameElement && window.parent.flodiaClaudeRam && window.parent.flodiaClaudeRam[window.frameElement.getAttribute("data-flodia")]) || window.parent.flodiaClaude) : undefined;</script>';

/** Legacy-filen med bryggan i stället för shimmen. Kräver exakt en shim-tagg. */
export function medBrygga(html: string): string {
  if (html.split(SHIM_TAGG).length !== 2) throw new Error('Legacy-filen ska ha exakt en skripttagg för claude-shim.js');
  return html.replace(SHIM_TAGG, BRYGG_TAGG);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Kontrollerar anropet. Kastar MotorFel med 401, 403 eller 400. */
export async function kontrolleraLegacy(token: string | null, konto: string | null, app: string | null, t: Tjanster): Promise<LegacyApp> {
  if (!token) throw new MotorFel(401, 'ej_inloggad', 'Logga in igen.');
  const anvandare = await t.anvandare(token);
  if (!anvandare) throw new MotorFel(401, 'ej_inloggad', 'Logga in igen.');
  if (!konto || !UUID.test(konto)) throw new MotorFel(400, 'ogiltigt', 'Kontot saknas.');
  if (!app || !(LEGACY_APPAR as readonly string[]).includes(app)) throw new MotorFel(400, 'ogiltigt', 'Okänd app.');
  const roll = await t.roll(token, anvandare, konto);
  if (!roll) throw new MotorFel(403, 'ingen_behorighet', 'Du har inte behörighet till det här.');
  if (!(await t.intern(token, konto))) throw new MotorFel(403, 'inte_internt', 'De nuvarande apparna finns bara för interna konton.');
  if (!(await t.licens(token, konto, app))) throw new MotorFel(403, 'ingen_licens', 'Kontot har inte appen.');
  const modul: Modul = MODULER[app as LegacyApp];
  if (modul.kanslig && roll === 'las') throw new MotorFel(403, 'ingen_behorighet', 'Du har inte behörighet till det här.');
  return app as LegacyApp;
}

export async function hanteraLegacy(req: Request, t: Tjanster, filer: Record<LegacyApp, string>, opt: { tillatnaUrsprung?: string[]; logg?: (e: unknown) => void } = {}): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors: Record<string, string> = origin && (opt.tillatnaUrsprung ?? ['http://127.0.0.1:5173', 'http://localhost:5173']).includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
    : { Vary: 'Origin' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const json = (status: number, kod: string, text: string) => new Response(JSON.stringify({ fel: { kod, text } }), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (req.method !== 'GET') return json(405, 'ogiltigt', 'Bara GET.');
  try {
    const url = new URL(req.url);
    const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
    const konto = url.searchParams.get('konto');
    const app = await kontrolleraLegacy(token, konto, url.searchParams.get('app'), t);
    await t.logga(token!, konto!, 'legacy.oppnad', app, {});
    return new Response(medBrygga(filer[app]), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (e) {
    if (e instanceof MotorFel) return json(e.status, e.kod, e.message);
    (opt.logg ?? console.error)(e);
    return json(500, 'serverfel', 'Något gick fel på servern. Försök igen om en stund.');
  }
}
