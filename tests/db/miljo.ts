// Testmiljö för databastesterna: anslutning till den lokala Supabase, en värld med påhittade konton
// och användare, och en klient per användare. Körs aldrig mot en databas i molnet.
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

export interface Anslutning {
  url: string; anon: string; service: string; db: string;
  /** Den lokala JWT-hemligheten, för testet av token som går ut. */
  jwt: string;
}

let anslutningen: Anslutning | null = null;

/** Från miljövariabler (CI) eller från "supabase status". Bara lokala adresser godtas. */
export function anslutning(): Anslutning {
  if (anslutningen) return anslutningen;
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (!env.SUPABASE_URL) {
    const ut = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    for (const rad of ut.split(/\r?\n/)) { const m = rad.match(/^([A-Z_]+)="?(.*?)"?$/); if (m) env['SB_' + m[1]] = m[2]!; }
    env.SUPABASE_URL = env.SB_API_URL!;
    env.SUPABASE_ANON_KEY = env.SB_ANON_KEY || env.SB_PUBLISHABLE_KEY!;
    env.SUPABASE_SERVICE_ROLE_KEY = env.SB_SERVICE_ROLE_KEY || env.SB_SECRET_KEY!;
    env.SUPABASE_DB_URL = env.SB_DB_URL!;
    env.SUPABASE_JWT_SECRET = env.SB_JWT_SECRET!;
  }
  const a = { url: env.SUPABASE_URL!, anon: env.SUPABASE_ANON_KEY!, service: env.SUPABASE_SERVICE_ROLE_KEY!, db: env.SUPABASE_DB_URL!, jwt: env.SUPABASE_JWT_SECRET ?? '' };
  for (const u of [a.url, a.db]) {
    const h = new URL(u).hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(h)) throw new Error('Databastesterna körs bara mot lokal Supabase, inte ' + h);
  }
  if (!a.anon || !a.service) throw new Error('Nycklar saknas. Kör "npx supabase start" först.');
  return (anslutningen = a);
}

const utanSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Direkt mot Postgres, förbi radsäkerheten. Bara för att lägga in testdata och kontrollera resultat. */
export async function databas(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: anslutning().db });
  await c.connect();
  const { rows } = await c.query<{ forbi: boolean }>('select rolsuper or rolbypassrls as forbi from pg_roles where rolname = current_user');
  if (!rows[0]!.forbi) await c.query('set role service_role');
  return c;
}

export type Roll = 'admin' | 'ekonomi' | 'las';
export type KontoNamn = 'A' | 'Asub' | 'B';
export interface Konto { namn: KontoNamn; id: string; slug: string; typ: 'main' | 'sub' | 'direct'; parent: string | null }
export interface Anvandare { namn: string; id: string; email: string }
/** Den som gör anropet: en inloggad användare med sina konton och roller, eller anon. */
export interface Aktor { namn: string; anvandare: Anvandare | null; roller: Partial<Record<KontoNamn, Roll>>; klient: SupabaseClient; /** Åtkomsttoken (anon-nyckeln för anon), för anrop till serverfunktionen. */ token: string }

export const KONTON: KontoNamn[] = ['A', 'Asub', 'B'];
export const ROLLER: Roll[] = ['admin', 'ekonomi', 'las'];
export const MODULER = ['avrakning', 'akarkassan', 'tripkassan', 'foliering'];

export interface Varld {
  kor: string;
  konto: Record<KontoNamn, Konto>;
  /** Användare per konto och roll, plus en som inte är medlem (extra) för medlemskapstester. */
  anv: Record<KontoNamn, Record<Roll | 'extra', Anvandare>>;
  multi: Anvandare; utan: Anvandare; personal: Anvandare;
  aktorer: Aktor[];
  db: pg.Client;
  admin: SupabaseClient;
  /** Kontonamn för ett konto-id i världen. */
  kontoNamn: (id: string) => KontoNamn | null;
  stang: () => Promise<void>;
}

/** Skapar en ny värld med påhittade konton och användare. Allt får ett körnummer så att körningar inte krockar. */
export async function skapaVarld(): Promise<Varld> {
  const a = anslutning();
  const kor = randomUUID().slice(0, 8);
  const db = await databas();
  const admin = createClient(a.url, a.service, utanSession);

  const konto = {} as Record<KontoNamn, Konto>;
  const skapaKonto = async (namn: KontoNamn, typ: Konto['typ'], parent: string | null) => {
    const slug = `test-${kor}-${namn.toLowerCase()}`;
    const { rows } = await db.query<{ id: string }>(
      'insert into public.tenants (type, name, slug, parent_id, org_nr) values ($1, $2, $3, $4, $5) returning id',
      [typ, `Testbolag ${namn} ${kor}`, slug, parent, '559000-000' + KONTON.indexOf(namn)]);
    konto[namn] = { namn, id: rows[0]!.id, slug, typ, parent };
  };
  await skapaKonto('A', 'main', null);
  await skapaKonto('Asub', 'sub', konto.A.id);
  await skapaKonto('B', 'direct', null);
  for (const k of KONTON) for (const m of MODULER)
    await db.query('insert into public.licenses (tenant_id, module_key, variant, price) values ($1, $2, $3, 0)', [konto[k].id, m, k === 'Asub' ? 'sub' : 'main']);

  const skapaAnvandare = async (namn: string): Promise<Anvandare> => {
    const email = `${namn.toLowerCase()}-${kor}@example.se`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: 'Testperson ' + namn } });
    if (error) throw error;
    return { namn, id: data.user.id, email };
  };
  const anv = {} as Varld['anv'];
  for (const k of KONTON) {
    anv[k] = {} as Varld['anv'][KontoNamn];
    for (const r of [...ROLLER, 'extra'] as const) anv[k][r] = await skapaAnvandare(`${k}-${r}`);
    for (const r of ROLLER) await db.query('insert into public.memberships (user_id, tenant_id, role) values ($1, $2, $3)', [anv[k][r].id, konto[k].id, r]);
  }
  const multi = await skapaAnvandare('multi'), utan = await skapaAnvandare('utan'), personal = await skapaAnvandare('personal');
  await db.query('insert into public.memberships (user_id, tenant_id, role) values ($1, $2, $3), ($1, $4, $5)', [multi.id, konto.A.id, 'las', konto.B.id, 'ekonomi']);
  await db.query(`insert into public.platform_staff (user_id, role) values ($1, 'superadmin')`, [personal.id]);

  const aktorer: Aktor[] = [];
  for (const k of KONTON) for (const r of ROLLER) aktorer.push({ namn: `${k}-${r}`, anvandare: anv[k][r], roller: { [k]: r }, ...await inloggning(anv[k][r].email) });
  aktorer.push({ namn: 'multi', anvandare: multi, roller: { A: 'las', B: 'ekonomi' }, ...await inloggning(multi.email) });
  aktorer.push({ namn: 'utan konto', anvandare: utan, roller: {}, ...await inloggning(utan.email) });
  aktorer.push({ namn: 'personal', anvandare: personal, roller: {}, ...await inloggning(personal.email) });
  aktorer.push({ namn: 'anon', anvandare: null, roller: {}, klient: createClient(a.url, a.anon, utanSession), token: a.anon });

  const allaAnv = [...KONTON.flatMap(k => Object.values(anv[k])), multi, utan, personal];
  return {
    kor, konto, anv, multi, utan, personal, aktorer, db, admin,
    kontoNamn: id => KONTON.find(k => konto[k].id === id) ?? null,
    stang: async () => {
      // Konton först (medlemskap och data försvinner med dem), sedan användarna.
      await db.query('delete from public.tenants where id = any($1) and type = $2', [[konto.Asub.id], 'sub']);
      await db.query('delete from public.tenants where id = any($1)', [[konto.A.id, konto.B.id]]);
      for (const u of allaAnv) await admin.auth.admin.deleteUser(u.id);
      await db.end();
    },
  };
}

/** Loggar in som i drift: inloggningslänk (skapad av servern) och verifiering. Ingen lösenordsinloggning. */
export async function inloggad(email: string): Promise<SupabaseClient> {
  return (await inloggning(email)).klient;
}

/** Som inloggad, men ger också token. */
export async function inloggning(email: string): Promise<{ klient: SupabaseClient; token: string }> {
  const a = anslutning();
  const admin = createClient(a.url, a.service, utanSession);
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const anon = createClient(a.url, a.anon, utanSession);
  const v = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: data.properties.hashed_token });
  if (v.error || !v.data.session) throw v.error ?? new Error('Ingen session för ' + email);
  // accessToken gäller både REST och Realtime, även när Realtime ansluter igen. Med bara en header
  // eller setAuth faller Realtime tillbaka på anon-nyckeln vid återanslutning, eftersom testklienten saknar session.
  const token = v.data.session.access_token;
  return { klient: createClient(a.url, a.anon, { ...utanSession, accessToken: async () => token }), token };
}
