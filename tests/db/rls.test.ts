// Fas 2a: "konto A kan aldrig läsa, ändra eller ta bort konto B:s data", för alla tabeller och alla roller.
// Varje användare (admin, ekonomi och läs i tre konton, en med två konton, en utan konto, personal och anon)
// läser varje tabell och försöker skapa, ändra, ta bort och flytta rader i varje konto. Svaret jämförs
// med modellen i tabeller.ts. Databasens innehåll kontrolleras direkt i Postgres efter varje försök.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KONTON, skapaVarld, type Aktor, type Varld } from './miljo';
import { DEFINER_I_PUBLIC, RATTIGHETER, TABELLER, type Rad, type Tabell } from './tabeller';

let v: Varld;
let n = 0;

beforeAll(async () => {
  v = await skapaVarld();
  for (const t of TABELLER) if (t.fyll) for (const k of KONTON) await t.fyll(v.konto[k], v);
}, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

const nyckelText = (t: Tabell, r: Rad) => t.nyckel.map(c => String(r[c])).join('|');
const where = (r: Rad, start = 1) => Object.keys(r).map((c, i) => `${c} = $${i + start}`).join(' and ');
async function radJson(t: Tabell, nyckel: Rad): Promise<string | null> {
  const { rows } = await v.db.query(`select to_jsonb(x) j from public.${t.namn} x where ${where(nyckel)}`, Object.values(nyckel));
  return rows[0] ? JSON.stringify(rows[0].j) : null;
}
async function antal(t: Tabell, markor: Rad): Promise<number> {
  const { rows } = await v.db.query(`select count(*)::int c from public.${t.namn} where ${where(markor)}`, Object.values(markor));
  return rows[0].c;
}
/** Kontrollsumma över alla rader i tabellen som inte tillhör användarens egna konton. */
async function andrasRader(t: Tabell, a: Aktor): Promise<string> {
  const egna = KONTON.filter(k => a.roller[k]).map(k => v.konto[k].id);
  // Egna konton (och egen profil) får ändras enligt modellen och räknas inte med.
  const kol = t.kontoKolumn ?? (t.namn === 'tenants' ? 'id' : t.namn === 'profiles' ? 'id' : undefined);
  const uteslut = t.namn === 'profiles' ? (a.anvandare ? [a.anvandare.id] : []) : egna;
  const filter = kol ? `where not (${kol}::text = any($1))` : '';
  const { rows } = await v.db.query(`select md5(coalesce(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text), '')) s from public.${t.namn} x ${filter}`, kol ? [uteslut] : []);
  return rows[0].s;
}

describe('metatest: varje tabell har radsäkerhet, rättigheter och testfall', () => {
  it('alla tabeller i public har radsäkerhet påslagen och tvingad, och finns i tabeller.ts', async () => {
    const { rows } = await v.db.query(`select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.relrowsecurity, r.relname + ': radsäkerhet påslagen').toBe(true);
      expect(r.relforcerowsecurity, r.relname + ': radsäkerhet tvingad').toBe(true);
    }
    expect(rows.map(r => r.relname).sort(), 'tabeller.ts har en post per tabell').toEqual(TABELLER.map(t => t.namn).sort());
    expect(Object.keys(RATTIGHETER).sort()).toEqual(TABELLER.map(t => t.namn).sort());
  });

  it('inga vyer, materialiserade vyer eller främmande tabeller i public', async () => {
    const { rows } = await v.db.query(`select c.relname, c.relkind from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind in ('v', 'm', 'f')`);
    expect(rows).toEqual([]);
  });

  it('anon har inga rättigheter, authenticated exakt de väntade', async () => {
    const { rows: anon } = await v.db.query(`select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'
      union all select table_name, privilege_type from information_schema.column_privileges where table_schema = 'public' and grantee = 'anon'`);
    expect(anon).toEqual([]);
    const { rows: tab } = await v.db.query(`select table_name t, privilege_type p from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated'`);
    const { rows: kol } = await v.db.query(`select table_name t, privilege_type p, column_name c from information_schema.column_privileges where table_schema = 'public' and grantee = 'authenticated'`);
    const faktiskt: Record<string, Record<string, string[] | 'alla'>> = Object.fromEntries(TABELLER.map(t => [t.namn, {}]));
    for (const r of tab) faktiskt[r.t]![r.p] = 'alla';
    for (const r of kol) if (faktiskt[r.t]![r.p] !== 'alla') ((faktiskt[r.t]![r.p] ??= []) as string[]).push(r.c);
    for (const t of Object.values(faktiskt)) for (const p of Object.keys(t)) if (Array.isArray(t[p])) (t[p] as string[]).sort();
    expect(faktiskt).toEqual(RATTIGHETER);
  });

  it('samma läge som i molnet: en ny tabell i public får inga rättigheter av sig själv', async () => {
    // Molnprojektet har "Automatically expose new tables" avstängt. Migrationen 20261012080000 ger samma läge här.
    await v.db.query('begin');
    try {
      await v.db.query('create table public.prov_ny_tabell (id int)');
      await v.db.query('create function public.prov_ny_funktion() returns int language sql as $$ select 1 $$');
      const { rows } = await v.db.query(`select r.rolname, has_table_privilege(r.rolname, 'public.prov_ny_tabell', 'select') tabell,
          has_function_privilege(r.rolname, 'public.prov_ny_funktion()', 'execute') funktion
        from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') order by 1`);
      expect(rows).toEqual([
        { rolname: 'anon', tabell: false, funktion: false },
        { rolname: 'authenticated', tabell: false, funktion: false },
        { rolname: 'service_role', tabell: false, funktion: false },
      ]);
    } finally { await v.db.query('rollback'); }
  });

  it('service_role har uttryckliga rättigheter på varje tabell (serverfunktionerna och skripten)', async () => {
    const { rows } = await v.db.query(`select c.relname,
        has_table_privilege('service_role', c.oid, 'select') s, has_table_privilege('service_role', c.oid, 'insert') i,
        has_table_privilege('service_role', c.oid, 'update') u, has_table_privilege('service_role', c.oid, 'delete') d
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') order by 1`);
    expect(rows.filter(r => !(r.s && r.i && r.u && r.d)).map(r => r.relname)).toEqual([]);
    expect(rows.length).toBe(TABELLER.length);
  });

  it('funktioner: anon kör inga, och bara de kända i public körs med ägarens rättigheter', async () => {
    const { rows } = await v.db.query(`select s.nspname, p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') inloggad
      from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname in ('public', 'app')`);
    expect(rows.filter(r => r.anon).map(r => r.nspname + '.' + r.proname), 'anon får inte köra').toEqual([]);
    expect(rows.filter(r => r.nspname === 'public' && r.prosecdef).map(r => r.proname).sort()).toEqual([...DEFINER_I_PUBLIC].sort());
    const appInloggad = rows.filter(r => r.nspname === 'app' && r.inloggad).map(r => r.proname).sort();
    expect(appInloggad).toEqual(['ar_underkund', 'delar_konto', 'dok_kanal_tillaten', 'far_lasa', 'har_licens', 'har_roll', 'mina_konton']);
    expect(rows.filter(r => r.prosecdef).every(r => r.nspname === 'public' || r.nspname === 'app')).toBe(true);
  });

  it('funktioner som körs med ägarens rättigheter har tom search_path', async () => {
    const { rows } = await v.db.query(`select s.nspname || '.' || p.proname f, p.proconfig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('public', 'app') and p.prosecdef`);
    for (const r of rows) expect(r.proconfig ?? [], r.f).toContain('search_path=""');
  });
});

/** Vad varje användare ser i tabellen jämfört med modellen. Tom lista = inga avvikelser. */
async function lasFel(t: Tabell): Promise<string[]> {
  const { rows: alla } = await v.db.query(`select ${t.kolumner} from public.${t.namn}`);
  const fel: string[] = [];
  for (const a of v.aktorer) {
    const vant = new Set(alla.filter(r => t.syns(r, a, v)).map(r => nyckelText(t, r)));
    const { data, error } = await a.klient.from(t.namn).select(t.kolumner);
    const fick = new Set((error ? [] : (data as unknown as Rad[])).map(r => nyckelText(t, r)));
    const for_mycket = [...fick].filter(x => !vant.has(x)), for_lite = [...vant].filter(x => !fick.has(x));
    if (for_mycket.length) fel.push(`${a.namn} ser ${for_mycket.length} rader för mycket`);
    if (for_lite.length) fel.push(`${a.namn} ser ${for_lite.length} rader för lite${error ? ' (fel: ' + error.message + ')' : ''}`);
  }
  return fel;
}

/** Skapa, ändra, ta bort och flytta för varje användare och konto, jämfört med modellen. */
async function skrivFel(t: Tabell, aktorer: Aktor[] = v.aktorer): Promise<string[]> {
  const fel: string[] = [];
  for (const a of aktorer) {
    const fore = await andrasRader(t, a);
    for (const kn of t.global ? (['A'] as const) : KONTON) {
      const k = v.konto[kn], r = a.roller[kn], vem = `${a.namn} i ${kn}`;

      if (t.ny) {
        const { rad, markor } = t.ny(k, a, v, ++n);
        const tillat = t.far('insert', r, k, a, v);
        const fore = await antal(t, markor);
        const { error } = await a.klient.from(t.namn).insert(rad);
        const nya = (await antal(t, markor)) - fore;
        if (tillat && (error || nya !== 1)) fel.push(`${vem}: insert borde gå (${error?.message ?? nya})`);
        if (!tillat && nya !== 0) fel.push(`${vem}: insert gick fast den inte får`);
        if (nya > 0) await v.db.query(`delete from public.${t.namn} where ${where(markor)}`, Object.values(markor));
      }

      for (const op of ['update', 'delete'] as const) {
        const m = await t.mal(k, a, v, ++n), tillat = t.far(op, r, k, a, v);
        const forut = await radJson(t, m.nyckel);
        const andring = t.andring(++n);
        const q = op === 'update' ? a.klient.from(t.namn).update(andring).match(m.nyckel as Record<string, string>) : a.klient.from(t.namn).delete().match(m.nyckel as Record<string, string>);
        const { error } = await q;
        const efter = await radJson(t, m.nyckel);
        if (op === 'update') {
          const andrad = efter !== null && Object.entries(andring).every(([c, x]) => JSON.stringify((JSON.parse(efter) as Rad)[c]) === JSON.stringify(x) || (c === 'opened_at'));
          if (tillat && (error || !andrad)) fel.push(`${vem}: update borde gå (${error?.message ?? 'oförändrad'})`);
          if (!tillat && efter !== forut) fel.push(`${vem}: update ändrade raden fast den inte får`);
        } else {
          if (tillat && (error || efter !== null)) fel.push(`${vem}: delete borde gå (${error?.message ?? 'finns kvar'})`);
          if (!tillat && efter !== forut) fel.push(`${vem}: delete tog bort raden fast den inte får`);
        }
        if (m.tillfallig && efter !== null) await v.db.query(`delete from public.${t.namn} where ${where(m.nyckel)}`, Object.values(m.nyckel));
      }

      // Flytta en rad till ett annat konto: aldrig tillåtet, inte ens för admin i båda kontona.
      if (t.kontoKolumn) {
        const m = await t.mal(k, a, v, ++n);
        for (const annat of KONTON.filter(x => x !== kn)) {
          const forut = await radJson(t, m.nyckel);
          await a.klient.from(t.namn).update({ [t.kontoKolumn]: v.konto[annat].id }).match(m.nyckel as Record<string, string>);
          if (await radJson(t, m.nyckel) !== forut) fel.push(`${vem}: flyttade raden till ${annat}`);
        }
        if (m.tillfallig) await v.db.query(`delete from public.${t.namn} where ${where(m.nyckel)}`, Object.values(m.nyckel));
      }
    }
    // Inget i andra konton får ha ändrats av den här användaren (utöver det modellen tillåter i egna konton).
    if (await andrasRader(t, a) !== fore) fel.push(`${a.namn}: rader i andras konton ändrades`);
  }
  return fel;
}

describe('läsning: varje användare ser exakt det modellen säger, inget mer och inget mindre', () => {
  it.each(TABELLER.map(t => t.namn))('%s', async (namn) => {
    expect(await lasFel(TABELLER.find(x => x.namn === namn)!)).toEqual([]);
  }, 60_000);

  it('modellen är inte tom: varje konto har rader i kontotabellerna', async () => {
    for (const t of TABELLER.filter(x => x.kontoKolumn && x.fyll)) for (const k of KONTON) {
      if (t.namn === 'shares' && k !== 'A') continue;
      const { rows } = await v.db.query(`select count(*)::int c from public.${t.namn} where ${t.kontoKolumn} = $1`, [v.konto[k].id]);
      expect(rows[0].c, `${t.namn} i ${k}`).toBeGreaterThan(0);
    }
  });
});
describe('skrivning: skapa, ändra, ta bort och flytta, för varje användare och konto', () => {
  it.each(TABELLER.map(t => t.namn))('%s', async (namn) => {
    expect(await skrivFel(TABELLER.find(x => x.namn === namn)!)).toEqual([]);
  }, 180_000);
});

// Testerna ska kunna bli röda: öppna en läcka med flit och kontrollera att den upptäcks.
describe('kontroll av testerna: en avsiktlig läcka upptäcks', () => {
  const doc = () => TABELLER.find(t => t.namn === 'documents')!;
  async function medPolicy(sql: string | string[], fn: () => Promise<string[]>): Promise<string[]> {
    const lista = Array.isArray(sql) ? sql : [sql];
    for (const [i, s] of lista.entries()) await v.db.query(s.replace('$P', `create policy "avsiktlig läcka ${i}"`));
    try { return await fn(); } finally { for (const i of lista.keys()) await v.db.query(`drop policy "avsiktlig läcka ${i}" on public.documents`); }
  }
  it('läsning: alla får läsa alla dokument', async () => {
    const fel = await medPolicy('$P on public.documents for select to authenticated using (true)', () => lasFel(doc()));
    expect(fel.some(f => f.includes('för mycket'))).toBe(true);
  });
  it('ändring: alla får ändra alla dokument', async () => {
    const fel = await medPolicy('$P on public.documents for update to authenticated using (true) with check (true)', () => skrivFel(doc(), v.aktorer.filter(a => a.namn === 'B-las')));
    expect(fel.some(f => f.includes('update ändrade'))).toBe(true);
  });
  it('borttagning: läs-rollen får ta bort i sitt konto', async () => {
    const fel = await medPolicy('$P on public.documents for delete to authenticated using (true)', () => skrivFel(doc(), v.aktorer.filter(a => a.namn === 'A-las')));
    expect(fel.some(f => f.includes('A-las i A: delete tog bort'))).toBe(true);
  });
  it('borttagning: alla får läsa och ta bort alla dokument', async () => {
    // Postgres kräver läsrätt för att ta bort en rad, så läckan i andra konton syns först med båda.
    const fel = await medPolicy(['$P on public.documents for select to authenticated using (true)', '$P on public.documents for delete to authenticated using (true)'],
      () => skrivFel(doc(), v.aktorer.filter(a => a.namn === 'A-ekonomi')));
    expect(fel.some(f => f.includes('A-ekonomi i B: delete tog bort'))).toBe(true);
  });
  it('skapande: alla får skapa dokument i alla konton', async () => {
    const fel = await medPolicy('$P on public.documents for insert to authenticated with check (true)', () => skrivFel(doc(), v.aktorer.filter(a => a.namn === 'Asub-ekonomi')));
    expect(fel.some(f => f.includes('insert gick'))).toBe(true);
  });
  it('efteråt är allt som förut', async () => {
    expect(await lasFel(doc())).toEqual([]);
    expect(await skrivFel(doc())).toEqual([]);
  }, 180_000);
});
