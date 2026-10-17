// Fas 2d: serverfunktionen motor som Edge Function (Deno) mot den lokala Supabase. Samma resultat som
// motorerna direkt, behörighet, licens, tak, Verkstadens åtgärder med radsäkerhet, granskningslogg och usage.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anropaMotor, MotorSvarFel } from '../../packages/api/index';
import * as avr from '../../packages/core/avrakning/index';
import * as lon from '../../packages/core/lon/index';
import { stockholmDatum } from '../../packages/core/tid';
import { GRUND_S } from '../../packages/core/avrakning/fixtures/scenarier';
import { lasCsv, lasJson, lasPdf, lasText } from '../../packages/core/avrakning/fixtures/las';
import { LON_SCENARIER } from '../../packages/core/lon/fixtures/scenarier';
import { anslutning, skapaVarld, type Aktor, type Varld } from './miljo';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let v: Varld;
beforeAll(async () => { v = await skapaVarld(); }, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

const aktor = (namn: string): Aktor => v.aktorer.find(a => a.namn === namn)!;

/** Direkt mot funktionens adress, med valfri token. */
async function post(token: string | null, kropp: unknown): Promise<{ status: number; json: { resultat?: unknown; fel?: { kod: string; text: string } } }> {
  const r = await fetch(`${anslutning().url}/functions/v1/motor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: anslutning().anon, ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: typeof kropp === 'string' ? kropp : JSON.stringify(kropp),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const anrop = (namn: string, konto: 'A' | 'Asub' | 'B', modul: string, operation: string, data: unknown = {}) =>
  post(aktor(namn).token, { konto: v.konto[konto].id, modul, operation, data });

describe('motor: behörighet och licens i drift', () => {
  it('utan inloggning eller med anon-nyckeln: 401', async () => {
    expect((await post(null, { konto: v.konto.A.id, modul: 'foliering', operation: 'berakna' })).status).toBe(401);
    const anon = await anrop('anon', 'A', 'foliering', 'berakna');
    expect(anon).toEqual({ status: 401, json: { fel: { kod: 'ej_inloggad', text: 'Logga in igen.' } } });
  });

  it('fel konto, fel roll och utan licens', async () => {
    expect((await anrop('A-admin', 'B', 'foliering', 'berakna')).json.fel?.kod).toBe('ingen_behorighet');
    expect((await anrop('A-las', 'A', 'foliering', 'atgard', { namn: 'nyttArende' })).json.fel?.kod).toBe('ingen_behorighet');
    expect((await anrop('A-las', 'A', 'foliering', 'berakna')).status).toBe(200);
    await v.db.query(`update public.licenses set status = 'pausad' where tenant_id = $1 and module_key = 'avrakning'`, [v.konto.B.id]);
    try {
      expect(await anrop('B-ekonomi', 'B', 'avrakning', 'berakna', {})).toEqual({ status: 403, json: { fel: { kod: 'ingen_licens', text: 'Kontot har inte appen.' } } });
    } finally {
      await v.db.query(`update public.licenses set status = 'aktiv' where tenant_id = $1 and module_key = 'avrakning'`, [v.konto.B.id]);
    }
  });

  it('trasigt anrop och okänd modul ger 400 utan interna detaljer', async () => {
    expect(await post(aktor('A-admin').token, '{trasig')).toEqual({ status: 400, json: { fel: { kod: 'ogiltigt', text: 'Anropet kunde inte läsas.' } } });
    expect((await anrop('A-admin', 'A', 'okand', 'berakna')).json.fel?.kod).toBe('ogiltigt');
  });

  it('tak för anrop per användare', async () => {
    const anv = v.anv.Asub.admin.id;
    await v.db.query(`insert into public.usage (tenant_id, user_id, module_key, kind) select $1, $2, 'foliering', 'motor' from generate_series(1, 60)`, [v.konto.Asub.id, anv]);
    try {
      expect((await anrop('Asub-admin', 'Asub', 'foliering', 'berakna')).status).toBe(429);
    } finally {
      await v.db.query('delete from public.usage where user_id = $1', [anv]);
    }
  });
});

describe('motor: kassorna och taket (ägarens beslut efter 2d)', () => {
  it('läs-rollen får inte räkna eller tolka i kassorna', async () => {
    for (const modul of ['akarkassan', 'tripkassan']) {
      expect((await anrop('A-las', 'A', modul, 'berakna', {})).json.fel?.kod, modul).toBe('ingen_behorighet');
      expect((await anrop('A-las', 'A', modul, 'tolka', { fil: { name: 'x', kind: 'txt', text: '' } })).json.fel?.kod, modul).toBe('ingen_behorighet');
    }
  });

  it('taket läses ur tabellen per konto utan driftsättning, och loggas en gång när det nås', async () => {
    const konto = v.konto.B.id, anv = v.anv.B.admin.id;
    await v.db.query('insert into public.tak (tenant_id, per_anvandare_minut, per_konto_timme) values ($1, 2, 3000)', [konto]);
    try {
      expect((await anrop('B-admin', 'B', 'foliering', 'berakna')).status).toBe(200);
      expect((await anrop('B-admin', 'B', 'foliering', 'berakna')).status).toBe(200);
      const nekad = await anrop('B-admin', 'B', 'foliering', 'berakna');
      expect(nekad).toEqual({ status: 429, json: { fel: { kod: 'for_manga', text: 'För många anrop. Vänta en minut och försök igen.' } } });
      expect((await anrop('B-admin', 'B', 'foliering', 'berakna')).status).toBe(429);
      const logg = await v.db.query(`select actor, target, detalj from public.audit_log where tenant_id = $1 and action = 'tak.natt'`, [konto]);
      expect(logg.rows).toEqual([{ actor: anv, target: 'foliering', detalj: { modul: 'foliering', operation: 'berakna', minut: 2, timme: 2, perAnvandareMinut: 2, perKontoTimme: 3000 } }]);
      // Ändrat tak gäller direkt.
      await v.db.query('update public.tak set per_anvandare_minut = 10 where tenant_id = $1', [konto]);
      expect((await anrop('B-admin', 'B', 'foliering', 'berakna')).status).toBe(200);
    } finally {
      await v.db.query('delete from public.tak where tenant_id = $1', [konto]);
      await v.db.query('delete from public.usage where user_id = $1', [anv]);
    }
  });

  it('standardtaket finns i tabellen: 60 per minut och användare, 3000 per timme och konto', async () => {
    const { rows } = await v.db.query('select per_anvandare_minut, per_konto_timme from public.tak where tenant_id is null');
    expect(rows).toEqual([{ per_anvandare_minut: 60, per_konto_timme: 3000 }]);
  });
});

describe('motor: samma resultat som motorerna direkt', () => {
  it('avräkning: gyllene facit', async () => {
    const D = { period: '2026-09', cph: { 101: 3, 103: '2' }, sturup: { 102: 4 }, tc: avr.parseTaxiCaller(lasPdf('taxicaller.pdf.json')),
      bamb: avr.parseBambora(lasJson('bambora.sales.json')), app: avr.parseApp(lasCsv('app.csv')), bro: avr.countPassages(lasText('passager.txt'), GRUND_S.bilar).cnt };
    const r = await anrop('A-ekonomi', 'A', 'avrakning', 'berakna', { indata: D, installningar: GRUND_S });
    expect(r.status).toBe(200);
    expect(r.json.resultat).toEqual(lasJson<{ varde: unknown }>('facit/grund.json').varde);
  });

  it('lön: servern tolkar filerna och räknar, samma som lonEngine i testet', async () => {
    const las = (f: string) => readFileSync(join(ROT, 'packages/core/lon/fixtures', f), 'utf8');
    const sc = LON_SCENARIER.grund!;
    const settings = { cfg: sc.cfg ?? {}, forare: sc.forare, lonHist: sc.lonHist ?? {} }, month = { forare: sc.manad ?? {} };
    const fore = stockholmDatum(Date.now());
    const r = await anrop('A-ekonomi', 'A', 'akarkassan', 'berakna', { period: sc.period, ldl: las('ldl.txt'), bro: las('bro.txt'), sturup: las('sturup.txt'), settings, month });
    const S = { settings, period: sc.period, month, shifts: lon.parseLDL(las('ldl.txt')).shifts, passages: { bro: lon.parseBro(las('bro.txt').split(/\r?\n/)).rows, stu: lon.parseSturup(las('sturup.txt').split(/\r?\n/)).rows }, skatt: null, demo: false } as unknown as lon.LonState;
    expect(r.status).toBe(200);
    expect(r.json.resultat).toEqual(JSON.parse(JSON.stringify(lon.lonEngine.compute(S, { variant: 'akarkassan', idag: fore }))));
  });

  it('tolka: LDL känns igen, okänd fil ger en fråga', async () => {
    const r = await anrop('A-ekonomi', 'A', 'akarkassan', 'tolka', { fil: { name: 'LDL.txt', kind: 'txt', text: readFileSync(join(ROT, 'packages/core/lon/fixtures/ldl.txt'), 'utf8') } });
    expect((r.json.resultat as { parser: string }).parser).toBe('ldl');
    expect((await anrop('A-ekonomi', 'A', 'akarkassan', 'tolka', { fil: { name: 'x.txt', kind: 'txt', text: 'okänt' } })).json.fel?.kod).toBe('okand_fil');
  });
});

describe('motor: Verkstadens åtgärder med radsäkerhet', () => {
  it('ärende skapas, kontrolleras, faktureras och skyddas mot borttagning, med logg och usage', async () => {
    const supabase = aktor('B-ekonomi').klient, konto = v.konto.B.id;
    const atgard = (namn: string, extra: Record<string, unknown> = {}) => anropaMotor<{ sparat: string[]; borttaget: string[] }>(supabase, { konto, modul: 'foliering', operation: 'atgard', data: { namn, ...extra } });
    const fore = (await v.db.query('select count(*)::int c from public.usage where user_id = $1', [v.anv.B.ekonomi.id])).rows[0].c;

    const id = (await atgard('nyttArende')).sparat[0]!.split('/')[1]!;
    const { rows } = await v.db.query(`select tenant_id, updated_by, data->>'skapad' skapad from public.documents where module_key = 'foliering' and path = $1`, ['arenden/' + id]);
    expect(rows).toEqual([{ tenant_id: konto, updated_by: v.anv.B.ekonomi.id, skapad: stockholmDatum(Date.now()) }]);

    await expect(atgard('betald', { arende: id })).rejects.toMatchObject({ kod: 'fel_lage', message: 'Ärendet har ingen faktura.', status: 409 });
    await atgard('egenRad', { arende: id });
    await atgard('radFalt', { arende: id, args: [0, 'apris', '1000'] });
    await atgard('skapaFaktura', { arende: id });
    await expect(atgard('taBortArende', { arende: id })).rejects.toBeInstanceOf(MotorSvarFel);
    const tom = (await atgard('nyttArende')).sparat[0]!.split('/')[1]!;
    expect((await atgard('taBortArende', { arende: tom })).borttaget).toEqual(['arenden/' + tom]);

    const logg = await v.db.query(`select action, actor from public.audit_log where tenant_id = $1 and action like 'atgard.%' order by id`, [konto]);
    expect(logg.rows.map(r => r.action)).toEqual(['atgard.nyttArende', 'atgard.egenRad', 'atgard.radFalt', 'atgard.skapaFaktura', 'atgard.nyttArende', 'atgard.taBortArende']);
    expect(logg.rows.every(r => r.actor === v.anv.B.ekonomi.id)).toBe(true);
    const efter = (await v.db.query('select count(*)::int c from public.usage where user_id = $1', [v.anv.B.ekonomi.id])).rows[0].c;
    expect(efter - fore, 'varje godkänt anrop räknas, även de som nekas av förkraven').toBe(8);
  });
});
