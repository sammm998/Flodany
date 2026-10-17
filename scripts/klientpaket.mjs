// Kontrollen av klientpaketet (beslut 26, SPEC-v3.1 16.1.1 och 16.1.2): motorer, parsrar och regler
// (packages/core, packages/kit, packages/server) får aldrig hamna i det som skickas till webbläsaren.
// Tre lager: 1) ESLint förbjuder importen (eslint.config.js), 2) forbjudKarna stoppar bygget om modulen
// ändå hamnar i grafen, 3) granska() letar i det färdiga paketet efter fingeravtryck, källkodskartor och nycklar.
//
// Legacy-apparna (legacy/apps/*/index.html) innehåller också motorerna och letas efter uttryckligen:
// de får aldrig ligga i klientbygget eller som publika statiska filer.
//
// UNDANTAG (ägarens beslut 2026-10-12, fas-2e.md): svaret från Edge Function legacy (legacy-bryggan,
// packages/server/legacy.ts) innehåller legacy-HTML med motorerna. Det granskas inte här, eftersom det
// aldrig ingår i klientpaketet: det lämnas bara ut av serverfunktionen efter inloggning och kontroll av
// internt konto, licens och roll. Allt annat som når webbläsaren granskas.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KARNA = ['packages/core', 'packages/kit', 'packages/server'].map(p => join(ROT, p) + sep);

/** Är filen en del av motorerna? */
export const arKarnkod = (fil) => KARNA.some(k => fil.startsWith(k)) || /[\\/]@flodia[\\/](core|kit|server)[\\/]/.test(fil);

const MEDDELANDE = (fil, fran) => `Beslut 26: ${relative(ROT, fil)} är motorkod och får inte ingå i klientpaketet${fran ? ` (importerad från ${relative(ROT, fran)})` : ''}. Anropa serverfunktionen motor.`;

/** Lager 2 för esbuild. */
export function forbjudKarnaEsbuild() {
  return {
    name: 'forbjud-karna',
    setup(b) {
      b.onLoad({ filter: /.*/ }, args => {
        if (arKarnkod(args.path)) return { errors: [{ text: MEDDELANDE(args.path) }] };
        return undefined;
      });
    },
  };
}

/** Lager 2 för Vite (plattformen i 2e). */
export function forbjudKarnaVite() {
  return {
    name: 'forbjud-karna',
    enforce: 'pre',
    load(id) { if (arKarnkod(id.split('?')[0])) throw new Error(MEDDELANDE(id)); return null; },
  };
}

function filer(katalog, ut = []) {
  for (const n of readdirSync(katalog)) {
    const p = join(katalog, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') filer(p, ut); } else ut.push(p);
  }
  return ut;
}

/** Strängar i källkoden: '...', "..." och `...` utan ${}. */
function strangar(kod) {
  const ut = new Set();
  for (const m of kod.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`/g)) ut.add(m[1] ?? m[2] ?? m[3]);
  return ut;
}

/**
 * Fingeravtryck: strängar på minst 16 tecken som bara finns i motorkoden, inte i klientens egen källkod.
 * Testfiler och påhittade testdata räknas inte.
 */
export function fingeravtryck() {
  const kallor = (katalog) => filer(join(ROT, katalog)).filter(f => /\.(ts|tsx|js|mjs)$/.test(f) && !/\.test\.|[\\/]fixtures[\\/]/.test(f));
  // Klientens egen källtext. En sträng som finns någonstans i den (även inuti en längre) är inget fingeravtryck.
  const klient = [];
  for (const k of ['packages/api', 'packages/ui', 'packages/modules', 'packages/guides', 'apps']) {
    try { for (const f of kallor(k).filter(x => !x.includes(`${sep}dist${sep}`))) klient.push(readFileSync(f, 'utf8')); } catch { /* katalogen finns inte än */ }
  }
  const allt = klient.join('\n'), ut = new Set();
  for (const k of ['packages/core', 'packages/kit', 'packages/server'])
    for (const f of kallor(k)) for (const s of strangar(readFileSync(f, 'utf8'))) if (s.length >= 16 && !s.includes('\\') && !allt.includes(s)) ut.add(s);
  return [...ut];
}

/**
 * Fingeravtryck för legacy-apparna: rader på minst 60 tecken ur HTML-filerna som inte finns i klientens
 * egen källkod. Hittas någon i ett paket ligger legacy-koden där.
 */
export function legacyAvtryck() {
  const klient = [];
  for (const k of ['packages/api', 'packages/ui', 'packages/modules', 'packages/guides', 'apps']) {
    try { for (const f of filer(join(ROT, k)).filter(x => /\.(ts|tsx|js|mjs|css|html)$/.test(x) && !x.includes(`${sep}dist${sep}`))) klient.push(readFileSync(f, 'utf8')); } catch { /* finns inte */ }
  }
  const allt = klient.join('\n'), ut = new Set();
  for (const f of filer(join(ROT, 'legacy', 'apps'))) {
    if (!f.endsWith('.html')) continue;
    for (const rad of readFileSync(f, 'utf8').split(/\r?\n/)) { const t = rad.trim(); if (t.length >= 60 && !allt.includes(t)) ut.add(t); }
  }
  return [...ut];
}

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
/** Supabase anon-nyckel (role anon) är publik med avsikt och får finnas i klienten. Alla andra JWT stoppas. */
const arAnon = (del) => { try { return JSON.parse(Buffer.from(del, 'base64url').toString('utf8')).role === 'anon'; } catch { return false; } };
// Servernycklar: Supabase service-nyckel och Anthropics nyckel (fotoläsningen), och namnen på hemligheterna.
const NYCKEL = /service_role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9]|ANTHROPIC_API_KEY|sk-ant-[A-Za-z0-9]/;

/** Lager 3: granskar det färdiga paketet. Svarar med en lista över fynd (tom = godkänt). */
export function granska(katalog, avtryck = fingeravtryck(), legacy = legacyAvtryck()) {
  const fynd = [];
  for (const f of filer(katalog)) {
    const namn = relative(katalog, f);
    if (f.endsWith('.map')) { fynd.push(`${namn}: källkodskarta (ska inte finnas i drift)`); continue; }
    if (!/\.(js|mjs|cjs|html|css|json|txt|svg)$/.test(f)) continue;
    const kod = readFileSync(f, 'utf8');
    if (/sourceMappingURL=/.test(kod)) fynd.push(`${namn}: hänvisar till en källkodskarta`);
    if ([...kod.matchAll(JWT)].some(m => !arAnon(m[1]))) fynd.push(`${namn}: innehåller något som ser ut som en JWT (inte anon-nyckeln)`);
    if (NYCKEL.test(kod)) fynd.push(`${namn}: innehåller något som ser ut som en servernyckel`);
    const traffar = avtryck.filter(s => kod.includes(s));
    if (traffar.length) fynd.push(`${namn}: ${traffar.length} fingeravtryck från motorkoden, till exempel ${JSON.stringify(traffar[0])}`);
    const legacyTraffar = legacy.filter(s => kod.includes(s));
    if (legacyTraffar.length) fynd.push(`${namn}: ${legacyTraffar.length} rader från legacy-apparna (får aldrig ligga i klientbygget)`);
  }
  return fynd;
}
