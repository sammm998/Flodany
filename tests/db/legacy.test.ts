// Legacy-bryggan som Edge Function mot den lokala Supabase (ägarens tillägg 2026-10-12):
// utloggad får 401, externt konto får 403, och svaret är legacy-filen med bara bryggan utbytt.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BRYGG_TAGG, SHIM_TAGG } from '../../packages/server/legacy';
import { anslutning, skapaVarld, type Varld } from './miljo';

const ROT = join(import.meta.dirname, '..', '..');
let v: Varld;
beforeAll(async () => {
  v = await skapaVarld();
  // A är internt (ägarens egna bolag), B och Asub är externa kunder.
  await v.db.query('update public.tenants set intern = true where id = $1', [v.konto.A.id]);
}, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

async function hamta(konto: string, app: string, token: string | null) {
  const r = await fetch(`${anslutning().url}/functions/v1/legacy?konto=${konto}&app=${app}`, {
    headers: { apikey: anslutning().anon, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  });
  return { status: r.status, text: await r.text(), typ: r.headers.get('content-type'), cache: r.headers.get('cache-control') };
}
const token = (namn: string) => v.aktorer.find(a => a.namn === namn)!.token;

describe('legacy-bryggan i drift', () => {
  it('utloggad får 401, med eller utan anon-nyckeln som token', async () => {
    expect((await hamta(v.konto.A.id, 'avrakning', null)).status).toBe(401);
    const anon = await hamta(v.konto.A.id, 'avrakning', anslutning().anon);
    expect(anon.status).toBe(401);
    expect(anon.text).not.toContain('<script');
  });

  it('externt konto får 403, även för dess admin, och svaret innehåller ingen legacy-kod', async () => {
    for (const [namn, konto] of [['B-admin', v.konto.B.id], ['Asub-admin', v.konto.Asub.id], ['A-admin', v.konto.B.id]] as const) {
      const r = await hamta(konto, 'avrakning', token(namn));
      expect(r.status, namn).toBe(403);
      expect(r.text).not.toContain('<script');
    }
    expect(JSON.parse((await hamta(v.konto.B.id, 'avrakning', token('B-admin'))).text)).toEqual({ fel: { kod: 'inte_internt', text: 'De nuvarande apparna finns bara för interna konton.' } });
  });

  it('läs-rollen får 403 för kassorna men inte för avräkningen', async () => {
    expect((await hamta(v.konto.A.id, 'akarkassan', token('A-las'))).status).toBe(403);
    expect((await hamta(v.konto.A.id, 'avrakning', token('A-las'))).status).toBe(200);
  });

  it('internt konto får legacy-filen byte för byte, med bara bryggan i stället för shimmen', async () => {
    for (const app of ['avrakning', 'akarkassan', 'tripkassan', 'foliering']) {
      const r = await hamta(v.konto.A.id, app, token('A-ekonomi'));
      expect(r.status, app).toBe(200);
      expect(r.typ).toBe('text/html; charset=utf-8');
      expect(r.cache).toBe('no-store');
      expect(r.text.replace(BRYGG_TAGG, SHIM_TAGG)).toBe(readFileSync(join(ROT, 'legacy/apps', app, 'index.html'), 'utf8'));
    }
    // Varje öppning loggas med vem som öppnade (här ekonomi, läs-rollen öppnade avräkningen i testet före).
    const { rows } = await v.db.query(`select target from public.audit_log where tenant_id = $1 and action = 'legacy.oppnad' and actor = $2 order by id`, [v.konto.A.id, v.anv.A.ekonomi.id]);
    expect(rows.map(r => r.target)).toEqual(['avrakning', 'akarkassan', 'tripkassan', 'foliering']);
  });

  it('det finns ingen öppen adress till legacy-filerna', async () => {
    const { url } = anslutning();
    for (const p of ['/legacy/apps/avrakning/index.html', '/storage/v1/object/public/legacy/avrakning.html', '/functions/v1/legacy/legacy/apps/avrakning/index.html'])
      expect((await fetch(url + p)).status, p).not.toBe(200);
  });
});
