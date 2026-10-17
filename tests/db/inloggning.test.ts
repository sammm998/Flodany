// Fas 2b: inloggning med e-postlänk, inget lösenord, ingen självregistrering, spärr, utloggning överallt,
// uppgifterna till kontoväljaren och skriptet för konton. Mejlen fångas i den lokala Mailpit.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { anslutning } from './miljo';
import { adminKlient, bytRoll, hittaAnvandare, laggTill, lista, satsIntern, skapaKonto, sparra, taBort } from '../../scripts/konto.mjs';

const MAILPIT = 'http://127.0.0.1:54324';
const LANK = 'http://127.0.0.1:5173/logga-in/bekrafta';
const kor = randomUUID().slice(0, 8);
const epost = (namn: string) => `${namn}-${kor}@example.se`;
const utanSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

let db: SupabaseClient;
const konton: string[] = [], anvandare: string[] = [];
const anon = () => createClient(anslutning().url, anslutning().anon, utanSession);
const somAnvandare = (token: string) => createClient(anslutning().url, anslutning().anon, { ...utanSession, global: { headers: { Authorization: 'Bearer ' + token } } });

interface Mejl { Subject: string; Text: string; HTML: string }
/** Senaste mejlet till adressen i Mailpit, eller null efter väntetiden. */
async function mejlTill(adress: string, vanta = 10_000): Promise<Mejl | null> {
  const slut = Date.now() + vanta;
  // Minst ett försök, även med väntetid 0.
  for (let forsta = true; forsta || Date.now() < slut; forsta = false) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + adress)}`);
    if (r.ok) {
      const { messages } = await r.json() as { messages: { ID: string }[] };
      if (messages?.length) return await (await fetch(`${MAILPIT}/api/v1/message/${messages[0]!.ID}`)).json() as Mejl;
    }
    await new Promise(x => setTimeout(x, 300));
  }
  return null;
}

async function nyttKonto(namn: string, typ: 'main' | 'sub' | 'direct' = 'direct', forelder?: string) {
  const slug = `test-${kor}-${namn}`;
  const k = await skapaKonto(db, { namn: `Testbolag ${namn}`, slug, typ, forelder, moduler: ['avrakning'] });
  konton.push(k.id);
  return k;
}
async function medlem(konto: string, namn: string, roll: 'admin' | 'ekonomi' | 'las') {
  const r = await laggTill(db, { konto, epost: epost(namn), roll, namn: 'Testperson ' + namn });
  if (!anvandare.includes(r.anvandare.id)) anvandare.push(r.anvandare.id);
  return r.anvandare;
}
/** Session via inloggningslänk skapad av servern (som i miljo.ts), med refresh-token. */
async function session(adress: string) {
  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: adress });
  // En spärrad användare kan få fel redan här. Då finns ingen session.
  if (error) return { data: { session: null, user: null }, error };
  return anon().auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
}

beforeAll(async () => {
  db = adminKlient();
  const k = await nyttKonto('a', 'main');
  await medlem(k.slug, 'lank', 'ekonomi');
  await medlem(k.slug, 'kod', 'las');
  await medlem(k.slug, 'admin', 'admin');
}, 120_000);

afterAll(async () => {
  for (const id of [...konton].reverse()) await db.from('tenants').delete().eq('id', id);
  for (const id of anvandare) await db.auth.admin.deleteUser(id);
}, 120_000);

describe('inloggning med e-postlänk', () => {
  it('mejlet kommer på svenska, utan varumärke, och länken loggar in', async () => {
    const { error } = await anon().auth.signInWithOtp({ email: epost('lank'), options: { shouldCreateUser: false, emailRedirectTo: LANK } });
    expect(error).toBeNull();
    const m = await mejlTill(epost('lank'));
    expect(m, 'mejlet kom fram till Mailpit').not.toBeNull();
    expect(m!.Subject).toBe('Din inloggningslänk');
    expect(m!.HTML).toContain('Länken gäller i 15 minuter');
    expect(m!.HTML).not.toMatch(/fl[oö]dia/i);
    expect(m!.HTML + m!.Subject).not.toMatch(/[–—]/);
    const hash = m!.HTML.match(/\/logga-in\/bekrafta\?token_hash=([^&"]+)&amp;type=email/)?.[1];
    expect(hash, 'länken går till plattformens sida för bekräftelse').toBeTruthy();
    const v = await anon().auth.verifyOtp({ type: 'email', token_hash: hash! });
    expect(v.error).toBeNull();
    expect(v.data.user?.email).toBe(epost('lank'));
    // Samma länk kan inte användas igen.
    expect((await anon().auth.verifyOtp({ type: 'email', token_hash: hash! })).error).not.toBeNull();
  });

  it('koden i mejlet loggar också in, men inte med fel kod', async () => {
    await anon().auth.signInWithOtp({ email: epost('kod'), options: { shouldCreateUser: false } });
    const m = await mejlTill(epost('kod'));
    const kod = m!.HTML.match(/koden: <strong[^>]*>(\d{6})</)?.[1];
    expect(kod).toMatch(/^\d{6}$/);
    const fel = kod === '000000' ? '111111' : '000000';
    expect((await anon().auth.verifyOtp({ type: 'email', email: epost('kod'), token: fel })).error).not.toBeNull();
    expect((await anon().auth.verifyOtp({ type: 'email', email: epost('kod'), token: kod! })).data.session).not.toBeNull();
  });

  it('okänd adress: inget konto skapas och inget mejl skickas', async () => {
    const adress = epost('okand');
    const { error } = await anon().auth.signInWithOtp({ email: adress, options: { shouldCreateUser: true } });
    expect(error).not.toBeNull();
    expect(await hittaAnvandare(db, adress)).toBeNull();
    // Supabase Auth skickar mejlet innan svaret kommer. Inget mejl nu betyder inget mejl alls.
    expect(await mejlTill(adress, 0)).toBeNull();
  });

  it('självregistrering är avstängd', async () => {
    const adress = epost('registrering');
    const { data, error } = await anon().auth.signUp({ email: adress, password: 'Testlosen-' + kor });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
    expect(await hittaAnvandare(db, adress)).toBeNull();
  });

  it('inloggning med lösenord stoppas, även för en användare som har ett', async () => {
    const adress = epost('losen'), losen = 'Testlosen-' + kor;
    const { data } = await db.auth.admin.createUser({ email: adress, password: losen, email_confirm: true });
    anvandare.push(data.user!.id);
    const r = await anon().auth.signInWithPassword({ email: adress, password: losen });
    expect(r.error).not.toBeNull();
    expect(r.data.session).toBeNull();
    expect(r.error!.message).toMatch(/lösenord/);
  });
});

/** Den riktiga setTimeout, sparad innan klockan förfalskas i testet nedan. */
const RIKTIG_TIMEOUT = globalThis.setTimeout;

describe('sessionens giltighetstid (fas 2f)', () => {
  const innehall = (t: string) => JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString('utf8')) as { exp: number; iat: number; session_id: string };

  it('åtkomsttoken gäller i 10 minuter och förnyas automatiskt innan den går ut', async () => {
    const forsta = (await session(epost('lank'))).data.session!;
    expect(innehall(forsta.access_token).exp - innehall(forsta.access_token).iat).toBe(600);

    // supabase-js förnyar när mindre än 90 sekunder återstår. Klockan flyttas fram 9 minuter i testet,
    // anropen till servern sker med riktig tid.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const handelser: string[] = [];
    let ny: string | undefined;
    try {
      const klient = createClient(anslutning().url, anslutning().anon, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
      klient.auth.onAuthStateChange((h, s) => { handelser.push(h); if (h === 'TOKEN_REFRESHED') ny = s?.access_token; });
      expect((await klient.auth.setSession({ access_token: forsta.access_token, refresh_token: forsta.refresh_token })).error).toBeNull();
      await klient.auth.startAutoRefresh();
      vi.setSystemTime(Date.now() + 9 * 60_000);
      await vi.advanceTimersByTimeAsync(31_000);
      // Förnyelsen är ett riktigt anrop till servern: vänta i riktig tid (högst 15 sekunder).
      for (let i = 0; i < 150 && !ny; i++) await new Promise(ok => RIKTIG_TIMEOUT(ok, 100));
      await klient.auth.stopAutoRefresh();
    } finally { vi.useRealTimers(); }
    expect(handelser).toContain('TOKEN_REFRESHED');
    expect(ny).toBeDefined();
    expect(ny).not.toBe(forsta.access_token);
    const n = innehall(ny!);
    expect(n.exp - n.iat).toBe(600);
    expect(n.session_id).toBe(innehall(forsta.access_token).session_id);
    // Den nya token fungerar mot databasen.
    const { data, error } = await somAnvandare(ny!).from('memberships').select('role').limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('spärr och utloggning', () => {
  it('en spärrad användare kan inte logga in eller förnya sin session, och kan släppas igen', async () => {
    const k = await nyttKonto('sparr');
    await medlem(k.slug, 'sparrad', 'ekonomi');
    const s = await session(epost('sparrad'));
    expect(s.data.session).not.toBeNull();
    // En vanlig session går att förnya (hooken stoppar bara lösenord).
    const fornyad = await anon().auth.refreshSession({ refresh_token: s.data.session!.refresh_token });
    expect(fornyad.error).toBeNull();
    await sparra(db, { epost: epost('sparrad') });
    expect((await anon().auth.refreshSession({ refresh_token: fornyad.data.session!.refresh_token })).error).not.toBeNull();
    expect((await session(epost('sparrad'))).data.session).toBeNull();
    expect((await lista(db, { konto: k.slug })).medlemmar[0]!.sparrad).toBe(true);
    await sparra(db, { epost: epost('sparrad'), hav: true });
    expect((await session(epost('sparrad'))).data.session).not.toBeNull();
  });

  it('utloggning överallt gör alla sessioner ogiltiga', async () => {
    const a = await session(epost('admin')), b = await session(epost('admin'));
    const klient = anon();
    await klient.auth.setSession({ access_token: a.data.session!.access_token, refresh_token: a.data.session!.refresh_token });
    expect((await klient.auth.signOut({ scope: 'global' })).error).toBeNull();
    expect((await anon().auth.refreshSession({ refresh_token: b.data.session!.refresh_token })).error).not.toBeNull();
  });
});

describe('kontoväljaren', () => {
  it('en användare med flera konton får alla sina konton med roll, inga andra', async () => {
    const h = await nyttKonto('huvud', 'main'), u = await nyttKonto('under', 'sub', h.slug), annat = await nyttKonto('annat');
    await medlem(h.slug, 'valjare', 'ekonomi');
    await medlem(u.slug, 'valjare', 'admin');
    await medlem(annat.slug, 'annan', 'admin');
    const s = await session(epost('valjare'));
    // Radsäkerheten visar alla medlemmar i användarens konton, så frågan filtrerar på användaren själv.
    const { data, error } = await somAnvandare(s.data.session!.access_token).from('memberships').select('role, tenant:tenants(id, name, slug, type)').eq('user_id', s.data.user!.id);
    expect(error).toBeNull();
    const fick = (data as unknown as { role: string; tenant: { slug: string; type: string } }[]).map(r => [r.tenant.slug, r.tenant.type, r.role]).sort();
    expect(fick).toEqual([[h.slug, 'main', 'ekonomi'], [u.slug, 'sub', 'admin']].sort());
  });

  it('en användare med ett konto får bara det', async () => {
    const s = await session(epost('lank'));
    const { data } = await somAnvandare(s.data.session!.access_token).from('memberships').select('role, tenant:tenants(slug)').eq('user_id', s.data.user!.id);
    expect(data).toHaveLength(1);
  });
});

describe('skriptet för konton (scripts/konto.mjs)', () => {
  it('byter roll, tar bort medlem och skyddar sista admin', async () => {
    const k = await nyttKonto('skript');
    await medlem(k.slug, 'skript-admin', 'admin');
    await medlem(k.slug, 'skript-las', 'las');
    await bytRoll(db, { konto: k.slug, epost: epost('skript-las'), roll: 'ekonomi' });
    await expect(bytRoll(db, { konto: k.slug, epost: epost('skript-admin'), roll: 'las' })).rejects.toThrow(/minst en admin/);
    await expect(taBort(db, { konto: k.slug, epost: epost('skript-admin') })).rejects.toThrow(/minst en admin/);
    await taBort(db, { konto: k.slug, epost: epost('skript-las') });
    expect((await lista(db, { konto: k.slug })).medlemmar.map(m => [m.epost, m.roll])).toEqual([[epost('skript-admin'), 'admin']]);
    const logg = await db.from('audit_log').select('action').eq('tenant_id', k.id).order('id');
    expect(logg.data!.map(r => r.action)).toEqual(['medlemskap.tillagt', 'medlemskap.tillagt', 'medlemskap.roll', 'medlemskap.borttaget']);
  });

  it('markerar ägarens egna bolag som interna, och tar bort markeringen', async () => {
    const k = await nyttKonto('internt');
    expect((await db.from('tenants').select('intern').eq('id', k.id).single()).data).toEqual({ intern: false });
    expect(await satsIntern(db, { konto: k.slug })).toMatchObject({ intern: true });
    expect(await satsIntern(db, { konto: k.slug, av: true })).toMatchObject({ intern: false });
    const nytt = await skapaKonto(db, { namn: 'Testbolag internt', slug: `test-${kor}-int2`, typ: 'direct', moduler: [], intern: true });
    konton.push(nytt.id);
    expect(nytt.intern).toBe(true);
    await expect(satsIntern(db, { konto: 'finns-inte' })).rejects.toThrow(/finns inte/);
  });

  it('kontrollerar typ, förälder och moduler', async () => {
    await expect(skapaKonto(db, { namn: 'X', slug: `test-${kor}-x`, typ: 'sub' })).rejects.toThrow(/finns inte/);
    await expect(skapaKonto(db, { namn: 'X', slug: `test-${kor}-x`, typ: 'okand' })).rejects.toThrow(/Typen/);
    await expect(skapaKonto(db, { namn: 'X', slug: `test-${kor}-x`, typ: 'direct', moduler: ['finns-inte'] })).rejects.toThrow(/Okända moduler/);
    await expect(laggTill(db, { konto: `test-${kor}-a`, epost: epost('x'), roll: 'agare' })).rejects.toThrow(/Rollen/);
  });

  it('vägrar en databas i molnet utan --moln', () => {
    const fore = { url: process.env.SUPABASE_URL, nyckel: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = 'https://exempel.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
    try {
      expect(() => adminKlient()).toThrow(/inte lokal/);
      expect(() => adminKlient({ moln: true })).not.toThrow();
    } finally {
      if (fore.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = fore.url;
      if (fore.nyckel === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = fore.nyckel;
    }
  });
});
