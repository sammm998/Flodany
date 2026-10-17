// Fotoläsningen av klädlistan mot den lokala Supabase och Edge Function motor. CI har ingen nyckel till
// Anthropic, så en påslagen läsning svarar "inte konfigurerad". Tolkningen prövas i packages/server/fotolasning.test.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminKlient, fotolasningSaknar, satsFunktion } from '../../scripts/konto.mjs';
import { anslutning, skapaVarld, type Varld } from './miljo';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BILD = { mediaTyp: 'image/png', base64: readFileSync(join(ROT, 'packages/server/fixtures/kladlista-ny.png')).toString('base64') };
let v: Varld;
beforeAll(async () => { v = await skapaVarld(); }, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

async function las(namn: string, steg: 'las' | 'lagg_till' = 'las'): Promise<{ status: number; fel?: { kod: string; text: string } }> {
  const a = v.aktorer.find(x => x.namn === namn)!;
  const r = await fetch(`${anslutning().url}/functions/v1/motor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anslutning().anon, authorization: 'Bearer ' + a.token },
    body: JSON.stringify({ konto: v.konto.A.id, modul: 'avrakning', operation: 'fotolasning', data: steg === 'las' ? { steg, period: '2026-10', bild: BILD } : { steg, period: '2026-10', rader: [] } }),
  });
  const json = await r.json().catch(() => ({})) as { fel?: { kod: string; text: string } };
  return { status: r.status, ...(json.fel ? { fel: json.fel } : {}) };
}
const sla = (status: 'aktiv' | 'pausad') => v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel, status) values ($1, 'avrakning.fotolasning', $2)
  on conflict (tenant_id, nyckel) do update set status = excluded.status`, [v.konto.A.id, status]);

describe('fotoläsningen i drift', () => {
  it('är av från början: 403 för alla roller, och inget anrop registreras', async () => {
    const { rows } = await v.db.query(`select count(*)::int c from public.konto_funktioner where tenant_id = $1 and nyckel = 'avrakning.fotolasning' and status = 'aktiv'`, [v.konto.A.id]);
    expect(rows[0].c).toBe(0);
    for (const namn of ['A-admin', 'A-ekonomi']) expect(await las(namn)).toEqual({ status: 403, fel: { kod: 'ingen_funktion', text: 'Fotoläsningen är inte påslagen för kontot.' } });
    expect((await las('A-admin', 'lagg_till')).status).toBe(403);
    const u = await v.db.query(`select count(*)::int c from public.usage where tenant_id = $1 and kind = 'ai'`, [v.konto.A.id]);
    expect(u.rows[0].c).toBe(0);
  });

  it('pausad räknas som av, och läs-rollen och andra konton får aldrig', async () => {
    await sla('pausad');
    expect((await las('A-admin')).fel?.kod).toBe('ingen_funktion');
    await sla('aktiv');
    expect((await las('A-las')).fel?.kod).toBe('ingen_behorighet');
    expect((await las('B-admin')).fel?.kod).toBe('ingen_behorighet');
  });

  it('påslagen utan nyckel: inte konfigurerad, men anropet räknas och loggas med användare och antal rader', async () => {
    await sla('aktiv');
    expect(await las('A-ekonomi')).toEqual({ status: 503, fel: { kod: 'ej_konfigurerad', text: 'Fotoläsningen är inte konfigurerad på servern.' } });
    const logg = await v.db.query(`select actor, target, detalj, at from public.audit_log where tenant_id = $1 and action = 'fotolasning.last'`, [v.konto.A.id]);
    expect(logg.rows).toHaveLength(1);
    expect(logg.rows[0]).toMatchObject({ actor: v.anv.A.ekonomi.id, target: '2026-10', detalj: { rader: 0, fel: 'ej_konfigurerad' } });
    expect(logg.rows[0].at).toBeInstanceOf(Date);
    // Bildens innehåll finns aldrig i granskningsloggen.
    const allt = await v.db.query(`select detalj::text d from public.audit_log where tenant_id = $1`, [v.konto.A.id]);
    expect(allt.rows.some(r => String(r.d).includes(BILD.base64.slice(0, 40)))).toBe(false);
    const u = await v.db.query(`select kind from public.usage where tenant_id = $1 and kind = 'ai'`, [v.konto.A.id]);
    expect(u.rows).toHaveLength(1);
  });

  it('taket per konto och dag', async () => {
    await sla('aktiv');
    await v.db.query(`insert into public.tak (tenant_id, per_anvandare_minut, per_konto_timme, foto_per_dag) values ($1, 60, 3000, 1)
      on conflict (tenant_id) do update set foto_per_dag = 1`, [v.konto.A.id]);
    try {
      expect(await las('A-admin')).toEqual({ status: 429, fel: { kod: 'for_manga', text: 'Kontot har nått taket för fotoläsningar i dag. Försök igen i morgon.' } });
      const logg = await v.db.query(`select detalj from public.audit_log where tenant_id = $1 and action = 'tak.natt'`, [v.konto.A.id]);
      expect(logg.rows.at(-1)?.detalj).toMatchObject({ operation: 'fotolasning', fotoPerDag: 1 });
    } finally {
      await v.db.query('delete from public.tak where tenant_id = $1', [v.konto.A.id]);
    }
  });

  it('brytaren slås av och på bara av plattformen, och varje ändring loggas', async () => {
    const admin = v.aktorer.find(x => x.namn === 'A-admin')!;
    await admin.klient.from('konto_funktioner').update({ status: 'pausad' }).match({ tenant_id: v.konto.A.id, nyckel: 'avrakning.fotolasning' });
    const { rows } = await v.db.query(`select status from public.konto_funktioner where tenant_id = $1`, [v.konto.A.id]);
    expect(rows[0].status).toBe('aktiv');
    const logg = await v.db.query(`select action from public.audit_log where tenant_id = $1 and target = 'avrakning.fotolasning' order by at`, [v.konto.A.id]);
    expect(logg.rows.map(r => r.action)).toEqual(['funktion.insert', 'funktion.update', 'funktion.update', 'funktion.update']);
  });

  it('en funktion kan inte slås på utan det den kräver, och det som krävs kan inte stängas av', async () => {
    await v.db.query(`insert into public.funktioner (nyckel, module_key, namn, typ, kraver) values ('avrakning.testkrav', 'avrakning', 'Test', 'tillval', '{avrakning.fotolasning}')`);
    try {
      await sla('pausad');
      await expect(v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel) values ($1, 'avrakning.testkrav')`, [v.konto.A.id])).rejects.toThrow(/kräver avrakning.fotolasning/);
      await sla('aktiv');
      await v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel) values ($1, 'avrakning.testkrav')`, [v.konto.A.id]);
      await expect(sla('pausad')).rejects.toThrow(/krävs av avrakning.testkrav/);
    } finally {
      await v.db.query(`delete from public.konto_funktioner where nyckel = 'avrakning.testkrav'`);
      await v.db.query(`delete from public.funktioner where nyckel = 'avrakning.testkrav'`);
    }
  });

  it('kommandot slår inte på fotoläsningen förrän Anthropic står med avtal i docs/underbitraden.md', async () => {
    const db = adminKlient();
    const ofylld = '| Anthropic | Fotoläsning av klädlistan | [fylls i] | [avtal fylls i] | Ej i bruk |';
    const ifylld = '| Anthropic | Fotoläsning av klädlistan | USA, standardavtalsklausuler | Anthropics DPA, nollagring | 2026-11-01 |';
    expect(fotolasningSaknar(ofylld)).toMatch(/inte ifylld/);
    expect(fotolasningSaknar('| Sentry | x | y | z | Ej i bruk |')).toMatch(/saknas/);
    expect(fotolasningSaknar(ifylld)).toBeNull();
    const konto = v.konto.B.slug, nyckel = 'avrakning.fotolasning';
    await expect(satsFunktion(db, { konto, nyckel, underbitraden: ofylld })).rejects.toThrow(/inte ifylld/);
    expect(await satsFunktion(db, { konto, nyckel, underbitraden: ifylld })).toMatchObject({ nyckel, pa: true });
    expect(await satsFunktion(db, { konto, nyckel, av: true })).toMatchObject({ nyckel, pa: false });
    const { rows } = await v.db.query('select status from public.konto_funktioner where tenant_id = $1 and nyckel = $2', [v.konto.B.id, nyckel]);
    expect(rows[0].status).toBe('pausad');
  });
});
