// Kontroll av den publicerade serverfunktionen motor, före och efter en publicering (docs/publicera-motor.md).
// Loggar in som en testanvändare (e-postlänk skapad med service-nyckeln, inget mejl skickas), räknar en avräkning
// med påhittad testdata (packages/core/avrakning/fixtures, scenariot grund) och jämför med det gyllene facit och
// med en tidigare körning. Kontrollerar också att fotoläsningen svarar 403 i ett konto utan funktionen.
// Nycklarna läses ur miljön och skrivs aldrig ut. Resultatet sparas i en fil utanför repot.
//
//   node scripts/kontrollera-motor.mjs --konto <slug> --epost <testanvändare> --ut <fil> [--jamfor <fil>] --moln
//
// Miljö: SUPABASE_URL, SUPABASE_ANON_KEY och SUPABASE_SERVICE_ROLE_KEY.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { build } from 'esbuild';
import { adminKlient, KontoFel } from './konto.mjs';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = join(ROT, 'packages/core/avrakning/fixtures');

/** Underlaget som i packages/server/motor.test.ts ("räkna avräkning: samma som gyllene facit"), bara påhittad data. */
export async function avrakningsUnderlag() {
  const entry = `
    import { GRUND_S } from './packages/core/avrakning/fixtures/scenarier';
    import { lasCsv, lasJson, lasPdf, lasText } from './packages/core/avrakning/fixtures/las';
    import * as avr from './packages/core/avrakning/index';
    const D = { period: '2026-09', cph: { 101: 3, 103: '2' }, sturup: { 102: 4 }, tc: avr.parseTaxiCaller(lasPdf('taxicaller.pdf.json')),
      bamb: avr.parseBambora(lasJson('bambora.sales.json')), app: avr.parseApp(lasCsv('app.csv')), bro: avr.countPassages(lasText('passager.txt'), GRUND_S.bilar).cnt };
    export const underlag = { indata: D, installningar: GRUND_S };
    export const facit = lasJson('facit/grund.json').varde;`;
  const r = await build({
    stdin: { contents: entry, resolveDir: ROT, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(join(FIXTURES, 'las.ts')).href) },
  });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}

function flaggor(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); f[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  return f;
}

async function main() {
  const f = flaggor(process.argv.slice(2));
  if (!f.konto || !f.epost || !f.ut) throw new KontoFel('Ange --konto, --epost och --ut.');
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) throw new KontoFel('SUPABASE_URL och SUPABASE_ANON_KEY saknas i miljön.');
  const admin = adminKlient({ moln: f.moln === true });
  const utan = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

  // Inloggning som testanvändaren, samma väg som i drift (e-postlänk), utan att något mejl skickas.
  const { data: lank, error: lankFel } = await admin.auth.admin.generateLink({ type: 'magiclink', email: String(f.epost) });
  if (lankFel) throw new KontoFel('Kunde inte skapa inloggningen: ' + lankFel.message);
  const inloggning = createClient(url, anon, utan);
  const { data: inl, error: inlFel } = await inloggning.auth.verifyOtp({ type: 'magiclink', token_hash: lank.properties.hashed_token });
  if (inlFel || !inl.session) throw new KontoFel('Kunde inte logga in testanvändaren.');
  const klient = createClient(url, anon, { ...utan, accessToken: async () => inl.session.access_token });
  const { data: konto } = await klient.from('tenants').select('id, name').eq('slug', String(f.konto)).maybeSingle();
  if (!konto) throw new KontoFel(`Testanvändaren är inte med i ${f.konto}.`);

  const motor = async (operation, data) => {
    const svar = await fetch(`${url}/functions/v1/motor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: anon, authorization: 'Bearer ' + inl.session.access_token, 'x-region': 'eu-north-1' },
      body: JSON.stringify({ konto: konto.id, modul: 'avrakning', operation, data }),
    });
    return { status: svar.status, json: await svar.json().catch(() => ({})) };
  };

  let fel = 0;
  const { underlag, facit } = await avrakningsUnderlag();
  const r = await motor('berakna', underlag);
  const resultat = JSON.parse(JSON.stringify(r.json.resultat ?? null));
  const sha = createHash('sha256').update(JSON.stringify(resultat)).digest('hex');
  console.log(`Avräkning med påhittad testdata: HTTP ${r.status}, sha256 ${sha.slice(0, 16)}`);
  const likaFacit = r.status === 200 && isDeepStrictEqual(resultat, facit);
  console.log(`  lika med det gyllene facit: ${likaFacit ? 'ja' : 'NEJ'}`);
  if (!likaFacit) fel++;
  if (f.jamfor) {
    const fore = JSON.parse(readFileSync(String(f.jamfor), 'utf8'));
    const lika = isDeepStrictEqual(resultat, fore.resultat);
    console.log(`  lika med körningen ${fore.tid} (sha256 ${fore.sha256.slice(0, 16)}): ${lika ? 'ja' : 'NEJ'}`);
    if (!lika) fel++;
  }

  const bild = { mediaTyp: 'image/png', base64: readFileSync(join(ROT, 'packages/server/fixtures/kladlista-ny.png')).toString('base64') };
  const foto = await motor('fotolasning', { steg: 'las', period: '2026-10', bild });
  const fotoOk = foto.status === 403 && foto.json.fel?.kod === 'ingen_funktion';
  console.log(`Fotoläsning i ${konto.name}: HTTP ${foto.status} ${foto.json.fel?.kod ?? ''} (väntat 403 ingen_funktion): ${fotoOk ? 'ja' : 'NEJ'}`);
  if (!fotoOk) fel++;

  writeFileSync(String(f.ut), JSON.stringify({ tid: new Date().toISOString(), sha256: sha, resultat }, null, 2));
  console.log(fel ? `${fel} avvikelse(r). Se docs/publicera-motor.md om hur motor backas.` : 'Allt stämmer.');
  await inloggning.auth.signOut().catch(() => {});
  process.exit(fel ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(e => { console.error(e instanceof KontoFel ? e.message : e); process.exit(1); });
