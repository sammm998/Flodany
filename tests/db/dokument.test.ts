// Fas 2c: documents-API mot databasen. Samma kontrakt som mot claude-shim.js (packages/api/kontrakt.ts),
// plus felkoder, kassans sökvägar, licens och att livevisningen aldrig läcker mellan konton.
import { createHmac } from 'node:crypto';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbFel, skapaDb, type Db } from '../../packages/api/index';
import { kontrakt, vantaPa } from '../../packages/api/kontrakt';
import { anslutning, inloggning, skapaVarld, type Aktor, type Varld } from './miljo';
import { infoga } from './tabeller';

let v: Varld;
beforeAll(async () => { v = await skapaVarld(); }, 180_000);
afterAll(async () => { await v?.stang(); }, 180_000);

const aktor = (namn: string): Aktor => v.aktorer.find(a => a.namn === namn)!;
const dbFor = (namn: string, konto: 'A' | 'Asub' | 'B' = 'A', modul = 'avrakning'): Db => skapaDb({ supabase: aktor(namn).klient, konto: v.konto[konto].id, modul });
async function kod(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { return e instanceof DbFel ? e.code : 'annat: ' + String(e); }
}

kontrakt('plattformen', () => dbFor('A-ekonomi'), { fryst: true });

describe('documents-API: behörighet och felkoder', () => {
  it('läs-rollen läser men får not_granted när den skriver eller tar bort', async () => {
    await dbFor('A-ekonomi').doc('settings/params').set({ procent: 35 });
    const las = dbFor('A-las');
    expect((await las.doc('settings/params').get()).data()).toEqual({ procent: 35 });
    expect(await kod(las.doc('settings/params').set({ procent: 99 }))).toBe('not_granted');
    expect(await kod(las.doc('settings/params').update({ procent: 99 }))).toBe('not_granted');
    expect(await kod(las.doc('settings/params').delete())).toBe('not_granted');
    expect(await kod(las.collection('months').add({ a: 1 }))).toBe('not_granted');
    expect((await las.doc('settings/params').get()).data()).toEqual({ procent: 35 });
  });

  it('ett annat konto: inget syns och allt skrivande ger not_granted', async () => {
    await dbFor('B-ekonomi', 'B').doc('settings/bolag').set({ list: ['hemligt'] });
    const fel = dbFor('A-admin', 'B');
    expect((await fel.doc('settings/bolag').get()).exists).toBe(false);
    expect((await fel.collection('settings').get()).empty).toBe(true);
    expect(await kod(fel.doc('settings/bolag').set({ list: [] }))).toBe('not_granted');
    expect(await kod(fel.doc('settings/bolag').update({ list: [] }))).toBe('not_granted');
    expect(await kod(fel.doc('settings/bolag').delete())).toBe('ok'); // syns inte, alltså finns inget att ta bort
    expect((await dbFor('B-ekonomi', 'B').doc('settings/bolag').get()).data()).toEqual({ list: ['hemligt'] });
    expect(await kod(skapaDb({ supabase: aktor('anon').klient, konto: v.konto.A.id, modul: 'avrakning' }).doc('settings/x').set({ a: 1 }))).toBe('not_granted');
  });

  it('ogiltig sökväg och för stort dokument ger invalid_argument', async () => {
    const db = dbFor('A-ekonomi');
    for (const p of ['', '/', 'a/../b', 'a/./b', 'a//b', 'a b/c', 'x'.repeat(513), 'data/users/uid'])
      expect(() => db.doc(p), JSON.stringify(p)).toThrow(DbFel);
    expect(await kod(db.doc('months/2026-01').set({ ldl: 'x'.repeat(2 * 1024 * 1024) }))).toBe('invalid_argument');
    expect(await kod(db.doc('months/2026-02').set(['lista'] as never))).toBe('invalid_argument');
    expect(await kod(db.doc('months/2026-03').set({ ldl: 'x'.repeat(1024 * 1024) }))).toBe('ok');
  });

  it('utan aktiv licens för modulen: inget syns och skrivande ger not_granted', async () => {
    const db = dbFor('B-ekonomi', 'B', 'foliering');
    await db.doc('arenden/a1').set({ id: 'a1' });
    await v.db.query(`update public.licenses set status = 'pausad' where tenant_id = $1 and module_key = 'foliering'`, [v.konto.B.id]);
    try {
      expect((await db.doc('arenden/a1').get()).exists).toBe(false);
      expect(await kod(db.doc('arenden/a2').set({ id: 'a2' }))).toBe('not_granted');
    } finally {
      await v.db.query(`update public.licenses set status = 'aktiv' where tenant_id = $1 and module_key = 'foliering'`, [v.konto.B.id]);
    }
  });

  it('modulerna är skilda åt även inom samma konto', async () => {
    await dbFor('A-ekonomi', 'A', 'akarkassan').doc('settings').set({ variant: 'akarkassan' });
    expect((await dbFor('A-ekonomi', 'A', 'tripkassan').doc('settings').get()).exists).toBe(false);
  });
});

describe('documents-API: kassans sökvägar under data/users/<uid>', () => {
  it('kontot är nyckeln: prefixet tas bort, och samlingen på toppnivå listar månaderna', async () => {
    const uid = v.anv.Asub.ekonomi.id, db = dbFor('Asub-ekonomi', 'Asub', 'akarkassan');
    const anv = db.collection('data/users/' + uid);
    await anv.doc('settings').set({ cfg: { procent: 35 } });
    await anv.doc('m-2026-09').set({ ldl: 'påhittad' });
    await anv.doc('m-2026-10').set({ ldl: 'påhittad' });
    const { rows } = await v.db.query(`select path, parent from public.documents where tenant_id = $1 and module_key = 'akarkassan' order by path`, [v.konto.Asub.id]);
    expect(rows).toEqual([{ path: 'm-2026-09', parent: '' }, { path: 'm-2026-10', parent: '' }, { path: 'settings', parent: '' }]);
    expect((await anv.get()).docs.map(d => d.id)).toEqual(['m-2026-09', 'm-2026-10', 'settings']);
    // En annan användare i samma konto ser samma data (kontot är nyckeln, inte användaren).
    const admin = dbFor('Asub-admin', 'Asub', 'akarkassan');
    expect((await admin.collection('data/users/' + v.anv.Asub.admin.id).doc('settings').get()).data()).toEqual({ cfg: { procent: 35 } });
  });
});

describe('livevisning: aldrig mellan konton', () => {
  /** Lyssnar direkt på en kanal och samlar händelserna och statusen. */
  function lyssnaPa(klient: SupabaseClient, amne: string) {
    const handelser: Record<string, unknown>[] = [], status: string[] = [];
    const kanal: RealtimeChannel = klient.channel(amne, { config: { private: true } })
      .on('broadcast', { event: 'dok' }, ({ payload }) => handelser.push(payload))
      .subscribe(s => status.push(s));
    return { kanal, handelser, status, sluta: () => klient.removeChannel(kanal) };
  }
  const ansluten = (k: { status: string[] }) => vantaPa(() => k.status.includes('SUBSCRIBED'));
  const nekad = (k: { status: string[] }) => vantaPa(() => k.status.includes('CHANNEL_ERROR'));

  it('en användare i konto A får aldrig händelser från konto B, inte heller vid borttagning', async () => {
    const amneB = `dok:${v.konto.B.id}:avrakning`;
    const intrang = lyssnaPa(aktor('A-admin').klient, amneB);
    const anon = lyssnaPa(aktor('anon').klient, amneB);
    const ratt = lyssnaPa(aktor('B-las').klient, amneB);
    try {
      // Kanalerna är klara innan något händer: rätt användare är ansluten, de andra är nekade.
      await Promise.all([ansluten(ratt), nekad(intrang), nekad(anon)]);
      expect(intrang.status).not.toContain('SUBSCRIBED');
      expect(anon.status).not.toContain('SUBSCRIBED');
      const d = await infoga(v.db, 'documents', { tenant_id: v.konto.B.id, module_key: 'avrakning', path: 'months/2026-10', data: { hemligt: 1 } });
      await v.db.query('update public.documents set data = $1 where id = $2', [{ hemligt: 2 }, d.id]);
      await v.db.query('delete from public.documents where id = $1', [d.id]);
      await vantaPa(() => ratt.handelser.map(h => h.op).join() === 'insert,update,delete');
      expect(intrang.handelser, 'A-admin fick händelser från B').toEqual([]);
      expect(anon.handelser, 'anon fick händelser').toEqual([]);
    } finally { for (const k of [intrang, anon, ratt]) await k.sluta(); }
  });

  it('händelserna innehåller bara sökväg, samling, vad som hände och version, aldrig data', async () => {
    const k = lyssnaPa(aktor('A-las').klient, `dok:${v.konto.A.id}:avrakning`);
    try {
      await ansluten(k);
      await dbFor('A-ekonomi').doc('months/2026-11').set({ hemligt: 'syns inte i händelsen' });
      await vantaPa(() => k.handelser.length >= 1);
      // id är meddelandets eget id, som Realtime lägger till.
      const { id, ...resten } = k.handelser[0]!;
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(resten).toEqual({ path: 'months/2026-11', parent: 'months', op: 'insert', version: 1 });
    } finally { await k.sluta(); }
  });

  it('klienten kan inte skicka egna händelser på en kanal', async () => {
    const amne = `dok:${v.konto.A.id}:avrakning`;
    const mottagare = lyssnaPa(aktor('A-las').klient, amne);
    const avsandare = lyssnaPa(aktor('A-admin').klient, amne);
    try {
      await Promise.all([ansluten(mottagare), ansluten(avsandare)]);
      // En falsk händelse från klienten, sedan en riktig ändring. Den falska skulle ha kommit först.
      await avsandare.kanal.send({ type: 'broadcast', event: 'dok', payload: { path: 'falsk', parent: '', op: 'insert', version: 1 } });
      await dbFor('A-ekonomi').doc('months/2026-12').set({ riktig: true });
      await vantaPa(() => mottagare.handelser.some(h => h.path === 'months/2026-12'));
      expect(mottagare.handelser.map(h => h.path)).toEqual(['months/2026-12']);
    } finally { await avsandare.sluta(); await mottagare.sluta(); }
  });

  it('onSnapshot i fel konto ger fel i stället för data, och en annan användare i rätt konto ser ändringen', async () => {
    const fel: DbFel[] = [], sett: unknown[] = [], ratt: unknown[] = [];
    const intrang = dbFor('A-admin', 'B'), bLas = dbFor('B-las', 'B');
    const sluta = intrang.doc('settings/params').onSnapshot(s => sett.push(s.data()), e => fel.push(e));
    const sluta2 = bLas.doc('settings/params').onSnapshot(s => ratt.push(s.data()));
    try {
      await expect(intrang.redo!()).rejects.toMatchObject({ code: 'not_granted' });
      await bLas.redo!();
      await dbFor('B-admin', 'B').doc('settings/params').set({ live: 'B' });
      await vantaPa(() => ratt.some(d => (d as { live?: string } | undefined)?.live === 'B'));
      expect(fel[0]!.code).toBe('not_granted');
      expect(sett.every(d => d === undefined), 'A-admin fick aldrig B:s data').toBe(true);
    } finally { sluta(); sluta2(); }
  });

  it('ny token vid förnyelse: en token som går ut ersätts och livevisningen fortsätter', async () => {
    const { url, anon, jwt } = anslutning();
    const klient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: lank } = await v.admin.auth.admin.generateLink({ type: 'magiclink', email: v.anv.A.las.email });
    const { data: forsta } = await klient.auth.verifyOtp({ type: 'magiclink', token_hash: lank.properties!.hashed_token });
    // Samma session men en token som bara gäller i 20 sekunder.
    const utgar = Math.floor(Date.now() / 1000) + 20;
    const kort = signera({ ...lasJwt(forsta.session!.access_token), iat: utgar - 20, exp: utgar }, jwt);
    expect((await klient.auth.setSession({ access_token: kort, refresh_token: forsta.session!.refresh_token })).error).toBeNull();
    await vantaPa(() => klient.realtime.accessTokenValue === kort);

    const db = skapaDb({ supabase: klient, konto: v.konto.A.id, modul: 'avrakning' });
    const sett: unknown[] = [];
    const sluta = db.doc('live/token').onSnapshot(s => sett.push(s.data()));
    try {
      await db.redo!();
      const { data: ny, error } = await klient.auth.refreshSession();
      expect(error).toBeNull();
      await vantaPa(() => klient.realtime.accessTokenValue === ny.session!.access_token);
      // Vänta tills den korta token har gått ut, sedan en ändring som ska synas.
      await vantaPa(() => Date.now() / 1000 > utgar + 3, 40_000);
      await dbFor('A-ekonomi').doc('live/token').set({ efter: 'utgång' });
      await vantaPa(() => sett.some(d => (d as { efter?: string } | undefined)?.efter === 'utgång'));
    } finally { sluta(); }
  }, 90_000);
});

describe('omläsningen räknas inte mot taket', () => {
  it('flera omläsningar ändrar inte usage, och motorn går fortfarande att anropa', async () => {
    const { klient } = await inloggning(v.anv.A.ekonomi.email);
    const rakna = async () => (await v.db.query('select count(*)::int c from public.usage where user_id = $1', [v.anv.A.ekonomi.id])).rows[0].c as number;
    const fore = await rakna();
    let omlasningar = 0;
    const db = skapaDb({ supabase: klient, konto: v.konto.A.id, modul: 'avrakning', omlasningMs: 200, vidOmlasning: () => { omlasningar++; } });
    const sluta = db.doc('settings/omlasning').onSnapshot(() => {});
    try {
      await db.redo!();
      await vantaPa(() => omlasningar >= 5);
    } finally { sluta(); }
    expect(await rakna()).toBe(fore);
  });
});

describe('sökvägar i NFC', () => {
  const nfd = 'Åkeri', nfc = 'Åkeri';
  it('a plus ring och å är samma sökväg, i API:t och direkt mot servern', async () => {
    expect(nfd).not.toBe(nfc);
    const db = dbFor('A-ekonomi', 'A', 'foliering');
    await db.doc(`fordon/${nfd}`).set({ via: 'api' });
    expect((await db.doc(`fordon/${nfc}`).get()).data()).toEqual({ via: 'api' });
    // Förbi API:t: servern normaliserar själv.
    const { error } = await aktor('A-ekonomi').klient.rpc('dok_skriv', { konto: v.konto.A.id, modul: 'foliering', sokvag: `fordon/${nfd}`, innehall: { via: 'rpc' }, lage: 'sammanfoga' });
    expect(error).toBeNull();
    await infoga(v.db, 'documents', { tenant_id: v.konto.A.id, module_key: 'foliering', path: `kostnader/${nfd}`, data: { via: 'sql' } });
    const { rows } = await v.db.query(`select path, path is nfc normalized nfc from public.documents where tenant_id = $1 and module_key = 'foliering' order by path`, [v.konto.A.id]);
    expect(rows).toEqual([{ path: `fordon/${nfc}`, nfc: true }, { path: `kostnader/${nfc}`, nfc: true }]);
    expect((await db.doc(`fordon/${nfc}`).get()).data()).toEqual({ via: 'rpc' });
    expect((await db.collection('kostnader').get()).docs.map(d => d.id)).toEqual([nfc]);
    await db.doc(`kostnader/${nfd}`).delete();
    expect((await db.collection('kostnader').get()).empty).toBe(true);
  });
});

/** Innehållet i en JWT (utan kontroll av signaturen, bara för testet). */
function lasJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
}
/** HS256 med den lokala hemligheten, som Supabase Auth använder lokalt. */
function signera(innehall: Record<string, unknown>, hemlighet: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(innehall);
  return data + '.' + createHmac('sha256', hemlighet).update(data).digest('base64url');
}
