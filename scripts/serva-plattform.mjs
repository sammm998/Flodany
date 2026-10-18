// Webbserver för plattformens bygge (apps/platform/dist) i drift, till exempel på Railway. Inga beroenden.
// Okända adresser får index.html, så att routern i webbläsaren tar dem (/:konto, /:konto/chatt/:samtal).
// /halsa svarar 200 för hälsokontrollen. Inga nycklar finns här: bara den publika nyckeln ligger i bygget.
//
// Demoläget: finns dist-demo/demo.mjs (npm run bygg:demo) svarar servern på /_demo som Supabase, med påhittad
// data i minnet (packages/server/demo.ts). Plattformen använder det när den är byggd utan Supabase.
// Miljövariabler: DEMO=av stänger av, DEMO_LOSENORD kräver lösenord för hela sidan, DEMO_NUVARANDE_APPAR=nej
// stänger av de nuvarande apparna i panelen, ANTHROPIC_API_KEY och ASSISTENT_MODELL ger riktiga svar från Claude.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = resolve(process.env.PLATTFORM_DIST ?? fileURLToPath(new URL('../apps/platform/dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;
const DEMO_FIL = fileURLToPath(new URL('../dist-demo/demo.mjs', import.meta.url));
const LOSENORD = process.env.DEMO_LOSENORD ?? '';

let demo = null;
if (process.env.DEMO !== 'av' && existsSync(DEMO_FIL)) {
  const { demo: skapa, FILER } = await import(DEMO_FIL);
  // De nuvarande apparna visas i demon om de inte stängs av (DEMO_NUVARANDE_APPAR=nej). Sätt DEMO_LOSENORD.
  const legacy = process.env.DEMO_NUVARANDE_APPAR !== 'nej';
  const hantera = skapa({ anthropic: process.env.ANTHROPIC_API_KEY, modell: process.env.ASSISTENT_MODELL, insats: process.env.ASSISTENT_INSATS, fotoModell: process.env.FOTOLASNING_MODELL, legacy });
  demo = req => hantera(req, legacy ? FILER : null);
  console.log(`Demoläget är på (${process.env.ANTHROPIC_API_KEY ? 'Claude' : 'demoassistent utan AI'}${legacy ? ', med de nuvarande apparna' : ''}${LOSENORD ? ', med lösenord' : ''}).`);
}

/** Node-anropet som ett vanligt Request, och svaret (även en ström) tillbaka. */
async function viaDemo(req, res, url) {
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req);
  const r = await demo(new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
}

const TYPER = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8',
};
const SAKERHET = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

async function fil(sokvag) {
  const full = normalize(join(ROT, sokvag));
  if (full !== ROT && !full.startsWith(ROT + sep)) return null;
  try { return (await stat(full)).isFile() ? full : null; } catch { return null; }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname === '/halsa') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ok'); return; }
    if (LOSENORD) {
      // Sidorna kräver lösenordet. Sidans egna anrop till /_demo skickar en token i authorization, så där räcker
      // kakan som sätts när lösenordet godtagits.
      const kaka = createHash('sha256').update('flodia-demo:' + LOSENORD).digest('hex');
      const harKaka = (req.headers.cookie ?? '').split(/;\s*/).includes('flodia_demo=' + kaka);
      const [, given] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':');
      if (url.pathname.startsWith('/_demo/') ? !harKaka : given !== LOSENORD && !harKaka) { res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Flodia demo"' }); res.end('Lösenord krävs.'); return; }
      if (!harKaka) res.setHeader('Set-Cookie', `flodia_demo=${kaka}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    }
    if (demo && url.pathname.startsWith('/_demo/')) { await viaDemo(req, res, url); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const hittad = await fil(decodeURIComponent(url.pathname));
    const full = hittad ?? join(ROT, 'index.html');
    // Filerna under assets har innehållets hash i namnet och kan sparas länge. index.html läses alltid om.
    const cache = hittad && url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    const data = await readFile(full);
    res.writeHead(200, { ...SAKERHET, 'Content-Type': TYPER[extname(full)] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Något gick fel.');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`Plattformen på port ${PORT} (${ROT})`));
