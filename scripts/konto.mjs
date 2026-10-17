// Konton och användare från kommandoraden, tills admin och inbjudningar finns i gränssnittet (fas 4a).
// Körs med service-nyckeln, som aldrig skrivs ut. Lokalt hämtas nycklarna från "supabase status".
// Mot molnet krävs SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY i miljön (process.env, ingen fil krävs) och flaggan --moln.
//
//   node scripts/konto.mjs skapa-konto --namn "Testbolag AB" --slug testbolag --typ main [--forelder slug] [--orgnr 559000-0000] [--moduler avrakning,foliering] [--intern]
//   node scripts/konto.mjs lagg-till --konto slug --epost namn@example.se --roll admin|ekonomi|las [--namn "För Efternamn"]
//   node scripts/konto.mjs byt-roll --konto slug --epost namn@example.se --roll ekonomi
//   node scripts/konto.mjs ta-bort --konto slug --epost namn@example.se
//   node scripts/konto.mjs sparra --epost namn@example.se [--hav]
//   node scripts/konto.mjs lista --konto slug
//   node scripts/konto.mjs intern --konto slug [--av]   (ägarens egna bolag: legacy-bryggan, beslut 8)
//   node scripts/konto.mjs funktion --konto slug --nyckel avrakning.fotolasning [--av]   (paket och tillval)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROLLER = ['admin', 'ekonomi', 'las'];
const TYPER = ['main', 'sub', 'direct'];
const MODULER = ['avrakning', 'akarkassan', 'tripkassan', 'foliering'];
const LOKALA = ['127.0.0.1', 'localhost', '::1'];

export class KontoFel extends Error {}

/** Klient med service-nyckeln. Mot annat än lokal databas krävs moln = true. */
export function adminKlient({ moln = false } = {}) {
  let url = process.env.SUPABASE_URL, nyckel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !nyckel) {
    const ut = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const env = Object.fromEntries(ut.split(/\r?\n/).map(r => r.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
    url = env.API_URL; nyckel = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
  }
  if (!url || !nyckel) throw new KontoFel('Hittar ingen databas. Kör "npm run db:start" eller sätt SUPABASE_URL och SUPABASE_SERVICE_ROLE_KEY.');
  if (!LOKALA.includes(new URL(url).hostname) && !moln) throw new KontoFel(`${new URL(url).hostname} är inte lokal. Lägg till --moln om det är meningen.`);
  return createClient(url, nyckel, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ok = ({ data, error }) => { if (error) throw new KontoFel(error.message); return data; };

async function kontoMedSlug(db, slug) {
  const k = ok(await db.from('tenants').select('id, name, slug, type').eq('slug', slug).maybeSingle());
  if (!k) throw new KontoFel(`Kontot ${slug} finns inte.`);
  return k;
}

/** Användaren med e-postadressen, eller null. */
export async function hittaAnvandare(db, epost) {
  const e = epost.trim().toLowerCase();
  for (let sida = 1; ; sida++) {
    const { users } = ok(await db.auth.admin.listUsers({ page: sida, perPage: 1000 }));
    const u = users.find(x => x.email?.toLowerCase() === e);
    if (u) return u;
    if (users.length < 1000) return null;
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ namn: string, slug: string, typ: string, forelder?: string, orgnr?: string, moduler?: string[], intern?: boolean }} p
 */
export async function skapaKonto(db, { namn, slug, typ, forelder, orgnr, moduler = MODULER, intern = false }) {
  if (!namn || !slug) throw new KontoFel('Ange --namn och --slug.');
  if (!TYPER.includes(typ)) throw new KontoFel(`Typen ska vara ${TYPER.join(', ')}.`);
  const okanda = moduler.filter(m => !MODULER.includes(m));
  if (okanda.length) throw new KontoFel(`Okända moduler: ${okanda.join(', ')}.`);
  const parent = typ === 'sub' ? (await kontoMedSlug(db, forelder ?? '')).id : null;
  if (typ !== 'sub' && forelder) throw new KontoFel('Bara en underkund (typ sub) har förälder.');
  const k = ok(await db.from('tenants').insert({ name: namn, slug, type: typ, parent_id: parent, org_nr: orgnr ?? null, intern: intern === true }).select('id, name, slug, type, intern').single());
  if (moduler.length) ok(await db.from('licenses').insert(moduler.map(m => ({ tenant_id: k.id, module_key: m, variant: typ === 'sub' ? 'sub' : 'main' }))));
  return k;
}

/**
 * Lägger till användaren i kontot med rollen. Användaren skapas om den inte finns (utan lösenord).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ konto: string, epost: string, roll: string, namn?: string }} p
 */
export async function laggTill(db, { konto, epost, roll, namn }) {
  if (!ROLLER.includes(roll)) throw new KontoFel(`Rollen ska vara ${ROLLER.join(', ')}.`);
  const k = await kontoMedSlug(db, konto);
  let u = await hittaAnvandare(db, epost);
  if (!u) u = ok(await db.auth.admin.createUser({ email: epost.trim().toLowerCase(), email_confirm: true, user_metadata: namn ? { name: namn } : {} })).user;
  ok(await db.from('memberships').upsert({ user_id: u.id, tenant_id: k.id, role: roll }));
  return { konto: k, anvandare: { id: u.id, email: u.email }, roll };
}

export async function bytRoll(db, { konto, epost, roll }) {
  if (!ROLLER.includes(roll)) throw new KontoFel(`Rollen ska vara ${ROLLER.join(', ')}.`);
  const k = await kontoMedSlug(db, konto), u = await hittaAnvandare(db, epost);
  if (!u) throw new KontoFel(`${epost} finns inte.`);
  const rader = ok(await db.from('memberships').update({ role: roll }).match({ user_id: u.id, tenant_id: k.id }).select('role'));
  if (!rader.length) throw new KontoFel(`${epost} är inte med i ${konto}.`);
}

export async function taBort(db, { konto, epost }) {
  const k = await kontoMedSlug(db, konto), u = await hittaAnvandare(db, epost);
  if (!u) throw new KontoFel(`${epost} finns inte.`);
  ok(await db.from('memberships').delete().match({ user_id: u.id, tenant_id: k.id }));
}

/** Spärrar användaren (ingen ny inloggning, inga nya tokens) eller häver spärren. */
export async function sparra(db, { epost, hav = false }) {
  const u = await hittaAnvandare(db, epost);
  if (!u) throw new KontoFel(`${epost} finns inte.`);
  ok(await db.auth.admin.updateUserById(u.id, { ban_duration: hav ? 'none' : '876000h' }));
  return u.id;
}

/**
 * Markerar kontot som internt (ägarens egna bolag) eller tar bort markeringen. Bara interna konton får
 * legacy-bryggan (beslut 8). Går bara med service-nyckeln, aldrig från klienten.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ konto: string, av?: boolean }} p
 */
export async function satsIntern(db, { konto, av = false }) {
  const k = await kontoMedSlug(db, konto);
  const rad = ok(await db.from('tenants').update({ intern: !av }).eq('id', k.id).select('slug, name, intern').single());
  return rad;
}

/**
 * Fotoläsningen får slås på först när Anthropic står som underbiträde med avtal i docs/underbitraden.md,
 * alltså när raden inte har några platshållare kvar och inte säger "Ej i bruk" (docs/fotolasning.md).
 * Svarar med vad som saknas, eller null.
 */
export function fotolasningSaknar(underbitraden = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'underbitraden.md'), 'utf8')) {
  const rad = underbitraden.split(/\r?\n/).find(x => /^\|\s*Anthropic\s*\|/.test(x));
  if (!rad) return 'Anthropic saknas i docs/underbitraden.md.';
  if (/\[[^\]]*\]|Ej i bruk|Avstängd/i.test(rad)) return 'Anthropic-raden i docs/underbitraden.md är inte ifylld (avtal, region och datum). Se docs/fotolasning.md.';
  return null;
}

/**
 * Slår på eller av en funktion (paket eller tillval) i kontot. Går bara med service-nyckeln, aldrig från klienten.
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ konto: string, nyckel: string, av?: boolean, underbitraden?: string }} p
 */
export async function satsFunktion(db, { konto, nyckel, av = false, underbitraden }) {
  const k = await kontoMedSlug(db, konto);
  if (!av && nyckel === 'avrakning.fotolasning') { const fel = fotolasningSaknar(underbitraden); if (fel) throw new KontoFel(fel); }
  ok(await db.from('konto_funktioner').upsert({ tenant_id: k.id, nyckel, status: av ? 'pausad' : 'aktiv' }, { onConflict: 'tenant_id,nyckel' }));
  return { konto: k, nyckel, pa: !av };
}

export async function lista(db, { konto }) {
  const k = await kontoMedSlug(db, konto);
  const rader = ok(await db.from('memberships').select('user_id, role').eq('tenant_id', k.id));
  const namn = Object.fromEntries(ok(await db.from('profiles').select('id, name').in('id', rader.map(r => r.user_id))).map(p => [p.id, p.name ?? '']));
  const ut = [];
  for (const r of rader) { const { user } = ok(await db.auth.admin.getUserById(r.user_id)); ut.push({ epost: user.email, namn: namn[r.user_id] ?? '', roll: r.role, sparrad: !!user.banned_until && new Date(user.banned_until) > new Date() }); }
  return { konto: k, medlemmar: ut.sort((a, b) => a.epost.localeCompare(b.epost)) };
}

function flaggor(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); f[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  return f;
}

async function main() {
  const [kommando, ...resten] = process.argv.slice(2), f = flaggor(resten);
  const db = adminKlient({ moln: f.moln === true });
  switch (kommando) {
    case 'skapa-konto': { const k = await skapaKonto(db, { ...f, intern: f.intern === true, moduler: f.moduler ? String(f.moduler).split(',') : MODULER }); console.log(`Kontot ${k.name} (${k.slug}) är skapat${k.intern ? ' och internt' : ''}.`); break; }
    case 'lagg-till': { const r = await laggTill(db, f); console.log(`${r.anvandare.email} är ${r.roll} i ${r.konto.name}.`); break; }
    case 'byt-roll': await bytRoll(db, f); console.log(`${f.epost} är nu ${f.roll} i ${f.konto}.`); break;
    case 'ta-bort': await taBort(db, f); console.log(`${f.epost} är borttagen ur ${f.konto}.`); break;
    case 'sparra': await sparra(db, { epost: f.epost, hav: f.hav === true }); console.log(f.hav ? `Spärren för ${f.epost} är hävd.` : `${f.epost} är spärrad.`); break;
    case 'intern': { const r = await satsIntern(db, { konto: f.konto, av: f.av === true }); console.log(r.intern ? `${r.name} är internt och får legacy-bryggan.` : `${r.name} är inte längre internt.`); break; }
    case 'funktion': { const r = await satsFunktion(db, { konto: f.konto, nyckel: String(f.nyckel ?? ''), av: f.av === true }); console.log(`${r.nyckel} är ${r.pa ? 'påslagen' : 'avstängd'} i ${r.konto.name}.`); break; }
    case 'lista': { const r = await lista(db, f); console.log(`${r.konto.name} (${r.konto.slug}):`); for (const m of r.medlemmar) console.log(`  ${m.roll.padEnd(8)}${m.epost}${m.namn ? ' (' + m.namn + ')' : ''}${m.sparrad ? ', spärrad' : ''}`); break; }
    default: throw new KontoFel('Kommandon: skapa-konto, lagg-till, byt-roll, ta-bort, sparra, intern, funktion, lista. Se början av scripts/konto.mjs.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(e => { console.error(e instanceof KontoFel ? e.message : e); process.exit(1); });
}
