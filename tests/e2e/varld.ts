// Påhittad värld för Playwright: konton, användare och inloggning. Bara mot den lokala Supabase.
import { randomUUID } from 'node:crypto';
import { createClient, type Session } from '@supabase/supabase-js';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';
import { anslutning, databas } from '../db/miljo';

const utanSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
export const MAILPIT = 'http://127.0.0.1:54324';

export interface E2eKonto { id: string; slug: string; namn: string }
export interface E2eAnvandare { id: string; email: string; namn: string }
export interface E2eVarld {
  /** A: huvudkund, internt, Avräkning och Lön och kassa (akarkassan). B: direktkund, externt, Verkstad. C: inga appar. */
  A: E2eKonto; B: E2eKonto; C: E2eKonto;
  /** multi: admin i A, ekonomi i B. ekonomi: ekonomi i A. las: läs i A. tom: admin i C. */
  multi: E2eAnvandare; ekonomi: E2eAnvandare; las: E2eAnvandare; tom: E2eAnvandare;
  db: pg.Client;
  stang: () => Promise<void>;
}

export async function skapaE2eVarld(namn: string): Promise<E2eVarld> {
  const a = anslutning(), kor = `${namn}-${randomUUID().slice(0, 6)}`;
  const admin = createClient(a.url, a.service, utanSession), db = await databas();
  const konto = async (k: string, typ: string, intern: boolean, moduler: string[]): Promise<E2eKonto> => {
    const namnet = `Testbolag ${k} ${kor}`, slug = `e2e-${kor}-${k.toLowerCase()}`;
    const { rows } = await db.query('insert into public.tenants (type, name, slug, intern) values ($1, $2, $3, $4) returning id', [typ, namnet, slug, intern]);
    for (const m of moduler) await db.query('insert into public.licenses (tenant_id, module_key) values ($1, $2)', [rows[0].id, m]);
    return { id: rows[0].id, slug, namn: namnet };
  };
  const A = await konto('A', 'main', true, ['avrakning', 'akarkassan']);
  const B = await konto('B', 'direct', false, ['foliering']);
  const C = await konto('C', 'direct', false, []);
  const anvandare = async (n: string): Promise<E2eAnvandare> => {
    const email = `${n}-${kor}@example.se`, namnet = `Testperson ${n}`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: namnet } });
    if (error) throw error;
    return { id: data.user.id, email, namn: namnet };
  };
  const multi = await anvandare('multi'), ekonomi = await anvandare('ekonomi'), las = await anvandare('las'), tom = await anvandare('tom');
  const med = (u: E2eAnvandare, k: E2eKonto, roll: string) => db.query('insert into public.memberships (user_id, tenant_id, role) values ($1, $2, $3)', [u.id, k.id, roll]);
  await med(multi, A, 'admin'); await med(multi, B, 'ekonomi'); await med(ekonomi, A, 'ekonomi'); await med(las, A, 'las'); await med(tom, C, 'admin');
  return {
    A, B, C, multi, ekonomi, las, tom, db,
    stang: async () => {
      await db.query('delete from public.tenants where id = any($1)', [[A.id, B.id, C.id]]);
      for (const u of [multi, ekonomi, las, tom]) await admin.auth.admin.deleteUser(u.id);
      await db.end();
    },
  };
}

/** En riktig session via inloggningslänk skapad av servern (som i drift, utan mejl). */
export async function session(email: string): Promise<Session> {
  const a = anslutning();
  const { data, error } = await createClient(a.url, a.service, utanSession).auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const v = await createClient(a.url, a.anon, utanSession).auth.verifyOtp({ type: 'magiclink', token_hash: data.properties!.hashed_token });
  if (!v.data.session) throw v.error ?? new Error('Ingen session');
  return v.data.session;
}

/** Loggar in i webbläsaren genom att lägga sessionen där supabase-js letar (sb-<värd>-auth-token). */
export async function loggaInSom(page: Page, email: string) {
  const s = await session(email), nyckel = `sb-${new URL(anslutning().url).hostname.split('.')[0]}-auth-token`;
  await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('e2e-inloggad')) { localStorage.setItem(k, v); sessionStorage.setItem('e2e-inloggad', '1'); } }, [nyckel, JSON.stringify(s)] as const);
  return s;
}

/** Senaste mejlet till adressen i Mailpit. */
export async function mejl(email: string, vanta = 15_000): Promise<{ HTML: string; Subject: string } | null> {
  const slut = Date.now() + vanta;
  for (let forsta = true; forsta || Date.now() < slut; forsta = false) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + email)}`);
    const { messages } = (await r.json()) as { messages?: { ID: string }[] };
    if (messages?.length) return (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json()) as { HTML: string; Subject: string };
    if (!vanta) return null;
    await new Promise(x => setTimeout(x, 300));
  }
  return null;
}

/** På smal skärm ligger sidomenyn bakom knappen Meny. */
export async function oppnaMeny(page: Page) {
  const meny = page.getByRole('navigation', { name: 'Huvudmeny' }), knapp = page.getByRole('button', { name: 'Meny' });
  // Vänta tills skalet är ritat: antingen syns menyn (bred skärm) eller knappen Meny (smal skärm).
  await expect(meny.or(knapp).first()).toBeVisible();
  if (await meny.isVisible()) return;
  await knapp.click();
  await expect(meny).toBeVisible();
}

/** Tillgänglighet (WCAG 2.2 AA): inga allvarliga fynd. */
export async function tillganglig(page: Page) {
  // @axe-core/playwright har typer från en nyare Playwright-version. Sidan är densamma.
  const r = await new AxeBuilder({ page: page as never }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const allvarliga = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`);
  expect(allvarliga).toEqual([]);
}
