// Demoläget på Railway: REST som Supabase, dokumenten i minnet, motorn och demoassistenten.
import { describe, expect, it } from 'vitest';
import { DEMO_KONTO, demo, minnesDb } from './demo';

const kor = demo({ legacy: false });
const anrop = (vag: string, init?: RequestInit) => kor(new Request('http://x/_demo' + vag, init), null);

describe('demoläget', () => {
  it('konto, licenser och dokument som PostgREST', async () => {
    expect(await (await anrop('/rest/v1/memberships?select=role')).json()).toMatchObject([{ role: 'admin', tenant: { id: DEMO_KONTO, slug: 'demo' } }]);
    expect((await (await anrop('/rest/v1/licenses')).json() as unknown[]).length).toBe(3);
    const bilar = await (await anrop(`/rest/v1/documents?select=data&tenant_id=eq.${DEMO_KONTO}&module_key=eq.avrakning&path=eq.settings/bilar`, { headers: { accept: 'application/vnd.pgrst.object+json' } })).json() as { data: { list: unknown[] } };
    expect(bilar.data.list).toHaveLength(4);
    await anrop('/rest/v1/rpc/dok_skriv', { method: 'POST', body: JSON.stringify({ konto: DEMO_KONTO, modul: 'avrakning', sokvag: 'settings/test', innehall: { a: 1 }, lage: 'ersatt' }) });
    const samling = await (await anrop(`/rest/v1/documents?module_key=eq.avrakning&parent=eq.settings`)).json() as { path: string }[];
    expect(samling.map(d => d.path)).toContain('settings/test');
  });

  it('assistenten svarar utan AI-nyckel, öppnar en panel och sparar samtalet', async () => {
    const r = await anrop('/functions/v1/assistent', { method: 'POST', headers: { authorization: 'Bearer demo' }, body: JSON.stringify({ konto: DEMO_KONTO, text: 'Vilka fakturor är obetalda?' }) });
    const typer = (await r.text()).split('\n\n').filter(Boolean).map(x => (JSON.parse(x.slice(6)) as { typ: string }).typ);
    expect(typer).toContain('panel');
    expect(typer.at(-1)).toBe('klar');
    expect((await (await anrop('/rest/v1/assistent_samtal?select=id')).json() as unknown[]).length).toBe(1);
  });

  it('motorn gör en åtgärd i Verkstad på demodatan', async () => {
    const r = await anrop('/functions/v1/motor', { method: 'POST', headers: { authorization: 'Bearer demo' }, body: JSON.stringify({ konto: DEMO_KONTO, modul: 'foliering', operation: 'atgard', data: { namn: 'betald', arende: 'a2', args: ['2026-10-17'] } }) });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { resultat: { sparat: string[] } }).resultat.sparat).toContain('arenden/a2');
  });

  it('dokumenten i minnet följer documents-API:t', async () => {
    const db = minnesDb(new Map(), 'x');
    await db.doc('a/b').set({ v: 1 });
    await db.doc('a/b').update({ w: 2 });
    expect((await db.doc('a/b').get()).data()).toEqual({ v: 1, w: 2 });
    expect((await db.collection('a').get()).docs.map(d => d.id)).toEqual(['b']);
    await db.doc('a/b').delete();
    expect((await db.doc('a/b').get()).exists).toBe(false);
  });
});
