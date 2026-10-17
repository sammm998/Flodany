// Fas 2a: regler som matrisen i rls.test.ts inte täcker av sig själv. Sista admin, delning mellan
// huvudkund och underkund, licens, funktionerna klienten får anropa, gränser, triggrar och lagringstid.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { skapaVarld, type Aktor, type Varld } from './miljo';
import { infoga } from './tabeller';
import { vantaPa } from '../../packages/api/kontrakt';

let v: Varld;
beforeAll(async () => { v = await skapaVarld(); }, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

const aktor = (namn: string): Aktor => v.aktorer.find(a => a.namn === namn)!;
const rad = async (sql: string, p: unknown[] = []) => (await v.db.query(sql, p)).rows[0];

describe('medlemskap', () => {
  it('kontot kan aldrig stå utan admin', async () => {
    const a = aktor('A-admin'), me = v.anv.A.admin.id;
    const del = await a.klient.from('memberships').delete().match({ user_id: me, tenant_id: v.konto.A.id });
    expect(del.error?.message).toMatch(/minst en admin/);
    const upd = await a.klient.from('memberships').update({ role: 'las' }).match({ user_id: me, tenant_id: v.konto.A.id });
    expect(upd.error?.message).toMatch(/minst en admin/);
    expect((await rad('select role from public.memberships where user_id = $1 and tenant_id = $2', [me, v.konto.A.id])).role).toBe('admin');
  });

  it('med två admin kan den ena gå, och ändringen loggas med vem som gjorde den', async () => {
    const a = aktor('B-admin');
    await infoga(v.db, 'memberships', { user_id: v.anv.B.extra.id, tenant_id: v.konto.B.id, role: 'admin' });
    const upd = await a.klient.from('memberships').update({ role: 'las' }).match({ user_id: v.anv.B.extra.id, tenant_id: v.konto.B.id });
    expect(upd.error).toBeNull();
    const logg = await rad(`select actor, detalj from public.audit_log where tenant_id = $1 and action = 'medlemskap.roll' order by id desc limit 1`, [v.konto.B.id]);
    expect(logg).toEqual({ actor: v.anv.B.admin.id, detalj: { fran: 'admin', till: 'las' } });
    await v.db.query('delete from public.memberships where user_id = $1 and tenant_id = $2', [v.anv.B.extra.id, v.konto.B.id]);
  });

  it('en admin kan inte lägga till medlemskap i ett annat konto, inte ens för sig själv', async () => {
    const { error } = await aktor('A-admin').klient.from('memberships').insert({ user_id: v.anv.A.admin.id, tenant_id: v.konto.B.id, role: 'admin' });
    expect(error).not.toBeNull();
    expect(await rad('select count(*)::int c from public.memberships where user_id = $1 and tenant_id = $2', [v.anv.A.admin.id, v.konto.B.id])).toEqual({ c: 0 });
  });
});

describe('huvudkund och underkund', () => {
  it('huvudkunden ser inte underkundens data, och tvärtom', async () => {
    await infoga(v.db, 'documents', { tenant_id: v.konto.Asub.id, module_key: 'akarkassan', path: 'm-2026-10', data: { lon: 1 } });
    await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'avrakning', path: 'months/2026-10', data: { summa: 1 } });
    const huvud = await aktor('A-admin').klient.from('documents').select('tenant_id');
    expect(huvud.data!.every(r => r.tenant_id === v.konto.A.id)).toBe(true);
    const under = await aktor('Asub-admin').klient.from('documents').select('tenant_id');
    expect(under.data!.every(r => r.tenant_id === v.konto.Asub.id)).toBe(true);
    const konton = await aktor('Asub-admin').klient.from('tenants').select('id');
    expect(konton.data!.map(r => r.id)).toEqual([v.konto.Asub.id]);
  });

  it('delning går bara från huvudkund till egen underkund', async () => {
    const ny = (from: string, to: string) => ({ from_tenant: from, to_tenant: to, module_key: 'avrakning', kind: 'avrakning', period: '2026-10' });
    expect((await aktor('A-ekonomi').klient.from('shares').insert(ny(v.konto.A.id, v.konto.Asub.id))).error).toBeNull();
    expect((await aktor('A-admin').klient.from('shares').insert(ny(v.konto.A.id, v.konto.B.id))).error).not.toBeNull();
    expect((await aktor('Asub-admin').klient.from('shares').insert(ny(v.konto.Asub.id, v.konto.A.id))).error).not.toBeNull();
    expect((await aktor('A-las').klient.from('shares').insert(ny(v.konto.A.id, v.konto.Asub.id))).error).not.toBeNull();
    expect((await aktor('B-admin').klient.from('shares').insert(ny(v.konto.A.id, v.konto.Asub.id))).error).not.toBeNull();
  });

  it('bara mottagaren markerar en delning som öppnad', async () => {
    const d = await infoga(v.db, 'shares', { from_tenant: v.konto.A.id, to_tenant: v.konto.Asub.id, module_key: 'avrakning', kind: 'oppna' });
    for (const namn of ['A-admin', 'B-admin', 'utan konto', 'anon']) {
      const { error } = await aktor(namn).klient.rpc('markera_delning_oppnad', { delning: d.id });
      expect(error, namn).not.toBeNull();
    }
    expect((await rad('select opened_at from public.shares where id = $1', [d.id])).opened_at).toBeNull();
    expect((await aktor('Asub-las').klient.rpc('markera_delning_oppnad', { delning: d.id })).error).toBeNull();
    expect((await rad('select opened_at from public.shares where id = $1', [d.id])).opened_at).not.toBeNull();
  });
});

describe('licens', () => {
  it('utan aktiv licens syns och ändras inga dokument i modulen', async () => {
    await infoga(v.db, 'documents', { tenant_id: v.konto.B.id, module_key: 'foliering', path: 'arenden/x1', data: { id: 'x1' } });
    const a = aktor('B-ekonomi');
    expect((await a.klient.from('documents').select('id').eq('module_key', 'foliering')).data).toHaveLength(1);
    for (const andring of [`status = 'pausad'`, `ended_at = now() - interval '1 day'`]) {
      await v.db.query(`update public.licenses set ${andring} where tenant_id = $1 and module_key = 'foliering'`, [v.konto.B.id]);
      expect((await a.klient.from('documents').select('id').eq('module_key', 'foliering')).data, andring).toHaveLength(0);
      expect((await a.klient.from('documents').insert({ tenant_id: v.konto.B.id, module_key: 'foliering', path: 'arenden/x2', data: {} })).error, andring).not.toBeNull();
      await v.db.query(`update public.licenses set status = 'aktiv', ended_at = null where tenant_id = $1 and module_key = 'foliering'`, [v.konto.B.id]);
    }
  });
});

describe('funktionerna klienten får anropa', () => {
  it('logga skriver bara i konton där man är medlem, med rätt avsändare', async () => {
    expect((await aktor('A-admin').klient.rpc('logga', { konto: v.konto.B.id, handelse: 'test.intrang' })).error).not.toBeNull();
    expect((await aktor('anon').klient.rpc('logga', { konto: v.konto.A.id, handelse: 'test.anon' })).error).not.toBeNull();
    expect((await aktor('A-las').klient.rpc('logga', { konto: v.konto.A.id, handelse: 'test.las', mal: 'x' })).error).toBeNull();
    expect(await rad(`select actor, target from public.audit_log where tenant_id = $1 and action = 'test.las'`, [v.konto.A.id])).toEqual({ actor: v.anv.A.las.id, target: 'x' });
    expect(await rad(`select count(*)::int c from public.audit_log where action in ('test.intrang', 'test.anon')`)).toEqual({ c: 0 });
  });

  it('hjälpfunktionerna i app går inte att anropa via API:t', async () => {
    const { error } = await aktor('A-admin').klient.rpc('mina_konton' as never);
    expect(error).not.toBeNull();
  });
});

describe('gränser och triggrar', () => {
  it('kontot på en rad kan aldrig bytas, inte ens förbi radsäkerheten', async () => {
    const d = await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'avrakning', path: 'settings/flytt', data: {} });
    await expect(v.db.query('update public.documents set tenant_id = $1 where id = $2', [v.konto.B.id, d.id])).rejects.toThrow(/kan inte ändras/);
  });

  it('ogiltiga sökvägar och för stora dokument stoppas', async () => {
    for (const path of ['../x', 'a/../b', '/a', 'a/', 'a//b', '.', 'a b', 'x'.repeat(513)])
      await expect(v.db.query('insert into public.documents (tenant_id, module_key, path, data) values ($1, $2, $3, $4)', [v.konto.A.id, 'avrakning', path, {}]), path).rejects.toThrow();
    const stor = { ldl: 'x'.repeat(2 * 1024 * 1024) };
    await expect(v.db.query('insert into public.documents (tenant_id, module_key, path, data) values ($1, $2, $3, $4)', [v.konto.A.id, 'akarkassan', 'm-2026-01', stor])).rejects.toThrow(/check/);
    const ok = await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'akarkassan', path: 'data/m-2026-02', data: { ldl: 'x'.repeat(1024 * 1024) } });
    expect(ok.parent).toBe('data');
    expect(ok.doc_id).toBe('m-2026-02');
  });

  it('version och ändringsinfo uppdateras vid varje ändring', async () => {
    const d = await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'avrakning', path: 'settings/params', data: { a: 1 } });
    expect(d.version).toBe(1);
    expect((await aktor('A-ekonomi').klient.from('documents').update({ data: { a: 2 } }).eq('id', d.id)).error).toBeNull();
    expect(await rad('select version, updated_by from public.documents where id = $1', [d.id])).toEqual({ version: 2, updated_by: v.anv.A.ekonomi.id });
  });

  it('en ny användare får en profil, och personal ser ingen kunddata', async () => {
    expect(await rad('select name from public.profiles where id = $1', [v.utan.id])).toEqual({ name: 'Testperson utan' });
    for (const t of ['tenants', 'documents', 'memberships', 'audit_log']) expect((await aktor('personal').klient.from(t).select('*')).data ?? [], t).toHaveLength(0);
  });

  it('granskningsloggen rensas efter 3 år', async () => {
    const gammal = await infoga(v.db, 'audit_log', { tenant_id: v.konto.A.id, action: 'test.gammal', at: new Date(Date.now() - (3 * 365 + 2) * 864e5) });
    const ny = await infoga(v.db, 'audit_log', { tenant_id: v.konto.A.id, action: 'test.ny', at: new Date(Date.now() - (3 * 365 - 2) * 864e5) });
    await v.db.query('select app.rensa_granskningslogg()');
    expect(await rad('select count(*)::int c from public.audit_log where id = $1', [gammal.id])).toEqual({ c: 0 });
    expect(await rad('select count(*)::int c from public.audit_log where id = $1', [ny.id])).toEqual({ c: 1 });
  });
});

describe('kassorna: läs-rollen har ingen åtkomst alls (ägarens beslut efter 2d)', () => {
  it('läs-rollen ser inga dokument, filkörningar eller perioder i kassorna, men i andra moduler', async () => {
    for (const modul of ['akarkassan', 'tripkassan', 'avrakning']) {
      await infoga(v.db, 'documents', { tenant_id: v.konto.B.id, module_key: modul, path: 'settings', data: { forare: { 1001: { person: { personnr: '19800000-0000' } } } } });
      await infoga(v.db, 'periods', { tenant_id: v.konto.B.id, module_key: modul, period: '2026-09' });
      await infoga(v.db, 'file_runs', { tenant_id: v.konto.B.id, module_key: modul, kind: 'ldl', filename: 'LDL.txt', sha256: modul.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a') });
    }
    const moduler = ['akarkassan', 'avrakning', 'tripkassan'];
    for (const t of ['documents', 'periods', 'file_runs']) {
      const las = await aktor('B-las').klient.from(t).select('module_key').in('module_key', moduler);
      expect(las.data!.map(r => r.module_key), `läs i ${t}`).toEqual(['avrakning']);
      const eko = await aktor('B-ekonomi').klient.from(t).select('module_key').in('module_key', moduler);
      expect(eko.data!.map(r => r.module_key).sort(), `ekonomi i ${t}`).toEqual(moduler);
    }
    // multi är läs i A och ekonomi i B: ser kassan i B men inte i A.
    await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'akarkassan', path: 'settings', data: {} });
    const multi = await aktor('multi').klient.from('documents').select('tenant_id, module_key').eq('module_key', 'akarkassan');
    expect(multi.data!.map(r => r.tenant_id)).toEqual([v.konto.B.id]);
  });

  it('livevisningen: läs-rollen nekas kanalen för kassan, ekonomi ansluts', async () => {
    const status = (namn: string) => {
      const s: string[] = [];
      const k = aktor(namn).klient.channel(`dok:${v.konto.B.id}:akarkassan`, { config: { private: true } }).subscribe(x => s.push(x));
      return { s, sluta: () => aktor(namn).klient.removeChannel(k) };
    };
    const las = status('B-las'), eko = status('B-ekonomi');
    try {
      await vantaPa(() => las.s.includes('CHANNEL_ERROR') && eko.s.includes('SUBSCRIBED'));
      expect(las.s).not.toContain('SUBSCRIBED');
    } finally { await las.sluta(); await eko.sluta(); }
  });
});
