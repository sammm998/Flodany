// Modellen av vem som får vad, en post per tabell i public. Testerna jämför databasens svar med modellen
// för varje användare, varje konto och varje operation. En tabell utan post här stoppar CI (metatestet).
import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { KONTON, type Aktor, type Konto, type KontoNamn, type Roll, type Varld } from './miljo';

export type Rad = Record<string, unknown>;
export type Op = 'insert' | 'update' | 'delete' | 'flytta';

export interface Tabell {
  namn: string;
  /** Primärnyckelns kolumner. */
  nyckel: string[];
  /** Kolumner som klienten läser i testet (nyckel och ägarkolumner). */
  kolumner: string;
  /** Kolumnen som anger kontot, för försöket att flytta en rad till ett annat konto. */
  kontoKolumn?: string;
  /** Tabellen gäller inte ett konto (prövas bara en gång per användare). */
  global?: boolean;
  /** Ska raden synas för användaren? */
  syns: (rad: Rad, a: Aktor, v: Varld) => boolean;
  /** Får användaren göra op på en rad i kontot k? */
  far: (op: Exclude<Op, 'flytta'>, roll: Roll | undefined, k: Konto, a: Aktor, v: Varld) => boolean;
  /** Ny rad i kontot k att försöka skapa, och hur den hittas efteråt. null = prövas inte (se metatestet för rättigheter). */
  ny: ((k: Konto, a: Aktor, v: Varld, n: number) => { rad: Rad; markor: Rad }) | null;
  /** En befintlig rad i kontot k att försöka ändra eller ta bort. Skapas direkt i databasen. */
  mal: (k: Konto, a: Aktor, v: Varld, n: number) => Promise<{ nyckel: Rad; tillfallig: boolean }>;
  /** Ändringen som provas med update. */
  andring: (n: number) => Rad;
  /** Raderna som läggs in i varje konto innan testerna (förutom det miljo.ts redan skapat). */
  fyll?: (k: Konto, v: Varld) => Promise<void>;
}

const roll = (a: Aktor, id: unknown, v: Varld): Roll | undefined => { const k = v.kontoNamn(String(id)); return k ? a.roller[k] : undefined; };
const medlem = (a: Aktor, id: unknown, v: Varld) => roll(a, id, v) !== undefined;
/** Kassorna är känsliga (personnummer, bankkonton, löner): läs-rollen har ingen åtkomst alls (ägarens beslut efter 2d). */
export const KANSLIGA = new Set(['akarkassan', 'tripkassan']);
const farLasa = (a: Aktor, konto: unknown, modul: unknown, v: Varld) => { const r = roll(a, konto, v); return r !== undefined && (r !== 'las' || !KANSLIGA.has(String(modul))); };
/** En rad per modul, en vanlig och en känslig, så att läsningen prövas för båda. */
const fyllModuler = (namn: string, rad: (k: Konto, modul: string) => Rad) => async (k: Konto, v: Varld) => { for (const m of ['avrakning', 'akarkassan']) await infoga(v.db, namn, rad(k, m)); };
const admin = (a: Aktor, id: unknown, v: Varld) => roll(a, id, v) === 'admin';
const skriver = (r: Roll | undefined) => r === 'admin' || r === 'ekonomi';
const aldrig = () => false;

/** Konton en användare i världen är medlem i. */
function kontonFor(anvId: string, v: Varld): KontoNamn[] {
  const ut: KontoNamn[] = [];
  for (const k of KONTON) for (const r of ['admin', 'ekonomi', 'las'] as const) if (v.anv[k][r].id === anvId) ut.push(k);
  if (anvId === v.multi.id) ut.push('A', 'B');
  return ut;
}

export async function infoga(db: pg.Client, tabell: string, rad: Rad): Promise<Rad> {
  const k = Object.keys(rad);
  const { rows } = await db.query(`insert into public.${tabell} (${k.join(', ')}) values (${k.map((_, i) => '$' + (i + 1)).join(', ')}) returning *`, Object.values(rad));
  return rows[0];
}

const plocka = (rad: Rad, kol: string[]) => Object.fromEntries(kol.map(c => [c, rad[c]]));
const hex64 = () => randomBytes(32).toString('hex');
const period = (n: number) => `${2100 + Math.floor(n / 12) % 800}-${String(n % 12 + 1).padStart(2, '0')}`;
/** En annan användare än a, i kontot k (för rader som tillhör någon annan). */
const annan = (k: Konto, a: Aktor, v: Varld) => (a.anvandare?.id === v.anv[k.namn].las.id ? v.anv[k.namn].ekonomi : v.anv[k.namn].las);

function tenantTabell(namn: string, nyRad: (k: Konto, n: number) => Rad, markor: string[], andring: (n: number) => Rad, far: Tabell['far'], syns: Tabell['syns'] = (r, a, v) => medlem(a, r.tenant_id, v)): Tabell {
  return {
    namn, nyckel: ['id'], kolumner: 'id, tenant_id', kontoKolumn: 'tenant_id', syns, far,
    ny: (k, _a, _v, n) => { const rad = nyRad(k, n); return { rad, markor: plocka(rad, markor) }; },
    mal: async (k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, namn, nyRad(k, n + 500000)), ['id']), tillfallig: true }),
    andring,
    fyll: async (k, v) => { await infoga(v.db, namn, nyRad(k, Math.floor(Math.random() * 1e6))); },
  };
}

export const TABELLER: Tabell[] = [
  {
    namn: 'tenants', nyckel: ['id'], kolumner: 'id, parent_id',
    syns: (r, a, v) => medlem(a, r.id, v),
    far: (op, r) => op === 'update' && r === 'admin',
    ny: (_k, _a, v, n) => { const slug = `test-${v.kor}-ny${n}`; return { rad: { type: 'direct', name: 'Nytt bolag', slug }, markor: { slug } }; },
    mal: async k => ({ nyckel: { id: k.id }, tillfallig: false }),
    andring: n => ({ name: 'Ändrat namn ' + n }),
  },
  {
    namn: 'profiles', nyckel: ['id'], kolumner: 'id',
    syns: (r, a, v) => !!a.anvandare && (r.id === a.anvandare.id || kontonFor(String(r.id), v).some(k => a.roller[k] !== undefined)),
    // Bara den egna profilen. Målraden är profilen för en användare i kontot, ibland användaren själv.
    far: (op, _r, k, a, v) => op === 'update' && !!a.anvandare && a.anvandare.id === v.anv[k.namn].las.id,
    ny: null,
    mal: async (k, _a, v) => ({ nyckel: { id: v.anv[k.namn].las.id }, tillfallig: false }),
    andring: n => ({ name: 'Testperson ändrad ' + n }),
  },
  {
    namn: 'memberships', nyckel: ['user_id', 'tenant_id'], kolumner: 'user_id, tenant_id', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => medlem(a, r.tenant_id, v),
    far: (op, r) => r === 'admin',
    ny: (k, _a, v) => { const rad = { user_id: v.anv[k.namn].extra.id, tenant_id: k.id, role: 'las' }; return { rad, markor: plocka(rad, ['user_id', 'tenant_id']) }; },
    mal: async (k, _a, v) => {
      await v.db.query('delete from public.memberships where user_id = $1 and tenant_id = $2', [v.anv[k.namn].extra.id, k.id]);
      return { nyckel: plocka(await infoga(v.db, 'memberships', { user_id: v.anv[k.namn].extra.id, tenant_id: k.id, role: 'ekonomi' }), ['user_id', 'tenant_id']), tillfallig: true };
    },
    andring: () => ({ role: 'las' }),
  },
  {
    namn: 'modules', nyckel: ['key'], kolumner: 'key', global: true,
    syns: (_r, a) => !!a.anvandare,
    far: aldrig,
    ny: (_k, _a, v, n) => { const key = `test-${v.kor}-${n}`; return { rad: { key, name: 'Testmodul' }, markor: { key } }; },
    mal: async () => ({ nyckel: { key: 'avrakning' }, tillfallig: false }),
    andring: n => ({ name: 'Ändrad ' + n }),
  },
  {
    namn: 'licenses', nyckel: ['id'], kolumner: 'id, tenant_id', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => medlem(a, r.tenant_id, v),
    far: aldrig,
    ny: null,
    mal: async (k, _a, v) => { const { rows } = await v.db.query('select id from public.licenses where tenant_id = $1 and module_key = $2', [k.id, 'avrakning']); return { nyckel: { id: rows[0].id }, tillfallig: false }; },
    andring: n => ({ price: n % 1000 }),
  },
  {
    ...tenantTabell('documents', (k, n) => ({ tenant_id: k.id, module_key: 'avrakning', path: `test/d${n}`, data: { n } }), ['tenant_id', 'path'], n => ({ data: { andrad: n } }),
      (_op, r) => skriver(r)),
    kolumner: 'id, tenant_id, module_key', syns: (r, a, v) => farLasa(a, r.tenant_id, r.module_key, v),
    fyll: fyllModuler('documents', (k, m) => ({ tenant_id: k.id, module_key: m, path: `fyll/${m}`, data: { m } })),
  },
  {
    ...tenantTabell('file_runs', k => ({ tenant_id: k.id, module_key: 'avrakning', kind: 'test', filename: 'test.txt', sha256: hex64() }), ['tenant_id', 'sha256'], () => ({ kind: 'andrad' }),
      (_op, r) => skriver(r)),
    kolumner: 'id, tenant_id, module_key', syns: (r, a, v) => farLasa(a, r.tenant_id, r.module_key, v),
    fyll: fyllModuler('file_runs', (k, m) => ({ tenant_id: k.id, module_key: m, kind: 'test', filename: 'fyll.txt', sha256: hex64() })),
  },
  {
    namn: 'periods', nyckel: ['tenant_id', 'module_key', 'period'], kolumner: 'tenant_id, module_key, period', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => farLasa(a, r.tenant_id, r.module_key, v),
    far: (op, r) => op !== 'delete' && skriver(r),
    ny: (k, _a, _v, n) => { const rad = { tenant_id: k.id, module_key: 'avrakning', period: period(n) }; return { rad, markor: rad }; },
    mal: async (k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, 'periods', { tenant_id: k.id, module_key: 'avrakning', period: period(n + 4000) }), ['tenant_id', 'module_key', 'period']), tillfallig: true }),
    andring: () => ({ status: 'godkand' }),
    fyll: fyllModuler('periods', (k, m) => ({ tenant_id: k.id, module_key: m, period: '2026-10' })),
  },
  {
    namn: 'shares', nyckel: ['id'], kolumner: 'id, from_tenant, to_tenant, module_key', kontoKolumn: 'from_tenant',
    syns: (r, a, v) => farLasa(a, r.from_tenant, r.module_key, v) || farLasa(a, r.to_tenant, r.module_key, v),
    // Bara huvudkundens ekonomi och admin, och bara till den egna underkunden. Ändras och tas inte bort.
    far: (op, r, k) => op === 'insert' && k.namn === 'A' && skriver(r),
    ny: (k, _a, v, n) => { const kind = `test-${n}`; return { rad: { from_tenant: k.id, to_tenant: k.namn === 'A' ? v.konto.Asub.id : v.konto.A.id, module_key: 'avrakning', kind }, markor: { kind } }; },
    mal: async (k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, 'shares', { from_tenant: k.id, to_tenant: k.namn === 'A' ? v.konto.Asub.id : v.konto.A.id, module_key: 'avrakning', kind: `mal-${n}` }), ['id']), tillfallig: true }),
    andring: () => ({ kind: 'andrad', opened_at: new Date().toISOString() }),
    fyll: async (k, v) => { if (k.namn === 'A') await infoga(v.db, 'shares', { from_tenant: k.id, to_tenant: v.konto.Asub.id, module_key: 'avrakning', kind: 'avrakning', period: '2026-10' }); },
  },
  {
    namn: 'offers', nyckel: ['id'], kolumner: 'id, parent_id', kontoKolumn: 'parent_id',
    syns: (r, a, v) => admin(a, r.parent_id, v),
    far: (_op, r) => r === 'admin',
    ny: (k, _a, _v, n) => { const rad = { parent_id: k.id, module_key: 'avrakning', price: n + 0.25 }; return { rad, markor: rad }; },
    mal: async (k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, 'offers', { parent_id: k.id, module_key: 'avrakning', price: n }), ['id']), tillfallig: true }),
    andring: () => ({ auto_enable: true }),
    fyll: async (k, v) => { await infoga(v.db, 'offers', { parent_id: k.id, module_key: 'akarkassan' }); },
  },
  {
    namn: 'invites', nyckel: ['id'], kolumner: 'id, parent_id', kontoKolumn: 'parent_id',
    syns: (r, a, v) => admin(a, r.parent_id, v),
    far: (_op, r) => r === 'admin',
    ny: (k, _a, v, n) => { const rad = { parent_id: k.id, email: `inbjuden-${v.kor}-${n}@example.se` }; return { rad, markor: rad }; },
    mal: async (k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, 'invites', { parent_id: k.id, email: `mal-${v.kor}-${n}@example.se`, token_hash: hex64() }), ['id']), tillfallig: true }),
    andring: () => ({ status: 'aterkallad' }),
    fyll: async (k, v) => { await infoga(v.db, 'invites', { parent_id: k.id, email: `fyll-${v.kor}-${k.namn}@example.se`, token_hash: hex64() }); },
  },
  {
    namn: 'guide_progress', nyckel: ['user_id', 'tenant_id', 'module_key', 'step_key'], kolumner: 'user_id, tenant_id, module_key, step_key', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => !!a.anvandare && r.user_id === a.anvandare.id && medlem(a, r.tenant_id, v),
    // Egna steg i egna konton. Målraden för delete är användarens egen.
    far: (op, r) => op !== 'update' && r !== undefined,
    ny: (k, a, _v, n) => { const rad = { user_id: a.anvandare?.id ?? randomUUID(), tenant_id: k.id, module_key: 'avrakning', step_key: 'steg-' + n }; return { rad, markor: rad }; },
    mal: async (k, a, v, n) => {
      // Användarens egen rad (anon har ingen, då någon annans). Andras rader prövas i roller.test.ts.
      const user_id = a.anvandare?.id ?? annan(k, a, v).id;
      return { nyckel: plocka(await infoga(v.db, 'guide_progress', { user_id, tenant_id: k.id, module_key: 'avrakning', step_key: 'mal-' + n }), ['user_id', 'tenant_id', 'module_key', 'step_key']), tillfallig: true };
    },
    andring: () => ({ done_at: '2000-01-01T00:00:00Z' }),
    fyll: async (k, v) => { for (const r of ['admin', 'las'] as const) await infoga(v.db, 'guide_progress', { user_id: v.anv[k.namn][r].id, tenant_id: k.id, module_key: 'avrakning', step_key: 'valkommen' }); },
  },
  tenantTabell('audit_log', (k, n) => ({ tenant_id: k.id, action: 'test.' + n }), ['tenant_id', 'action'], () => ({ action: 'andrad' }), aldrig,
    (r, a, v) => admin(a, r.tenant_id, v)),
  tenantTabell('usage', (k, n) => ({ tenant_id: k.id, module_key: 'avrakning', kind: 'motor', units: n + 1 }), ['tenant_id', 'units'], () => ({ units: 999999 }), aldrig,
    (r, a, v) => admin(a, r.tenant_id, v)),
  {
    // Tak för anrop per konto (ägarens beslut efter 2d). Raden utan konto är standarden och syns inte för klienten.
    namn: 'tak', nyckel: ['tenant_id'], kolumner: 'tenant_id', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => r.tenant_id !== null && admin(a, r.tenant_id, v),
    far: aldrig,
    ny: k => { const rad = { tenant_id: k.id, per_anvandare_minut: 1, per_konto_timme: 1 }; return { rad, markor: { tenant_id: k.id } }; },
    // Kontots befintliga rad (en per konto). Ingen klient får ändra den, så den ligger kvar orörd.
    mal: async (k, _a, v) => {
      await v.db.query('insert into public.tak (tenant_id, per_anvandare_minut, per_konto_timme) values ($1, 60, 3000) on conflict (tenant_id) do nothing', [k.id]);
      return { nyckel: { tenant_id: k.id }, tillfallig: false };
    },
    andring: () => ({ per_konto_timme: 999999 }),
    fyll: async (k, v) => { await infoga(v.db, 'tak', { tenant_id: k.id, per_anvandare_minut: 60, per_konto_timme: 3000 }); },
  },
  {
    // Katalogen över paket och tillval (fotoläsningen 2026-10-14). Alla inloggade läser, bara plattformen skriver.
    namn: 'funktioner', nyckel: ['nyckel'], kolumner: 'nyckel', global: true,
    syns: (_r, a) => !!a.anvandare,
    far: aldrig,
    ny: (_k, _a, v, n) => { const nyckel = `test.k${v.kor}-${n}`; return { rad: { nyckel, module_key: 'avrakning', namn: 'Testfunktion', typ: 'tillval' }, markor: { nyckel } }; },
    mal: async () => ({ nyckel: { nyckel: 'avrakning.fotolasning' }, tillfallig: false }),
    andring: n => ({ namn: 'Ändrad ' + n }),
  },
  {
    // Funktioner per konto. Medlemmar läser kontots rader, men ingen kund kan slå på något själv.
    namn: 'konto_funktioner', nyckel: ['tenant_id', 'nyckel'], kolumner: 'tenant_id, nyckel', kontoKolumn: 'tenant_id',
    syns: (r, a, v) => medlem(a, r.tenant_id, v),
    far: aldrig,
    ny: k => { const rad = { tenant_id: k.id, nyckel: 'avrakning.fotolasning', status: 'aktiv' }; return { rad, markor: { tenant_id: k.id, nyckel: 'avrakning.fotolasning', status: 'aktiv' } }; },
    mal: async (k, _a, v) => {
      await v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel, status) values ($1, 'avrakning.fotolasning', 'pausad') on conflict do nothing`, [k.id]);
      return { nyckel: { tenant_id: k.id, nyckel: 'avrakning.fotolasning' }, tillfallig: false };
    },
    andring: () => ({ status: 'aktiv' }),
    fyll: async (k, v) => { await v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel, status) values ($1, 'avrakning.fotolasning', 'pausad') on conflict do nothing`, [k.id]); },
  },
  {
    namn: 'satser', nyckel: ['id'], kolumner: 'id', global: true,
    syns: aldrig, far: aldrig,
    ny: (_k, _a, v, n) => { const rad = { key: `test.${v.kor}.${n}`, value: 1, valid_from: '2026-01-01' }; return { rad, markor: { key: rad.key } }; },
    mal: async (_k, _a, v, n) => ({ nyckel: plocka(await infoga(v.db, 'satser', { key: `mal.${v.kor}.${n}`, value: 1, valid_from: '2026-01-01' }), ['id']), tillfallig: true }),
    andring: () => ({ value: 2 }),
  },
  {
    namn: 'platform_staff', nyckel: ['user_id'], kolumner: 'user_id', global: true,
    syns: aldrig, far: aldrig,
    // Försök att göra sig själv till superadmin.
    ny: (_k, a) => { const rad = { user_id: a.anvandare?.id ?? randomUUID(), role: 'superadmin' }; return { rad, markor: { user_id: rad.user_id } }; },
    mal: async (_k, _a, v) => ({ nyckel: { user_id: v.personal.id }, tillfallig: false }),
    andring: () => ({ role: 'support' }),
  },
];

/** Väntade rättigheter för rollen authenticated på tabellnivå och kolumnnivå. anon får ingenting. */
export const RATTIGHETER: Record<string, Record<string, string[] | 'alla'>> = {
  tenants: { SELECT: 'alla', UPDATE: ['brand', 'name', 'org_nr'] },
  profiles: { SELECT: 'alla', UPDATE: ['name', 'phone'] },
  memberships: { SELECT: 'alla', INSERT: 'alla', DELETE: 'alla', UPDATE: ['role'] },
  modules: { SELECT: 'alla' },
  licenses: { SELECT: 'alla' },
  documents: { SELECT: 'alla', INSERT: 'alla', UPDATE: 'alla', DELETE: 'alla' },
  file_runs: { SELECT: 'alla', INSERT: 'alla', UPDATE: 'alla', DELETE: 'alla' },
  periods: { SELECT: 'alla', INSERT: 'alla', UPDATE: ['status'] },
  shares: { SELECT: 'alla', INSERT: 'alla' },
  offers: { SELECT: 'alla', INSERT: 'alla', UPDATE: 'alla', DELETE: 'alla' },
  invites: { SELECT: ['created_at', 'created_by', 'email', 'expires_at', 'id', 'modules', 'org_nr', 'parent_id', 'status'], INSERT: ['email', 'modules', 'org_nr', 'parent_id'], UPDATE: ['status'], DELETE: 'alla' },
  guide_progress: { SELECT: 'alla', INSERT: 'alla', DELETE: 'alla' },
  audit_log: { SELECT: 'alla' },
  usage: { SELECT: 'alla' },
  satser: {},
  platform_staff: {},
  tak: { SELECT: 'alla' },
  funktioner: { SELECT: 'alla' },
  konto_funktioner: { SELECT: 'alla' },
};

/** Funktioner i public som körs med ägarens rättigheter. Var och en kontrollerar själv medlemskapet. */
export const DEFINER_I_PUBLIC = ['logga', 'markera_delning_oppnad'];
