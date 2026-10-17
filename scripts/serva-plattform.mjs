// Webbserver för plattformens bygge (apps/platform/dist) i drift, till exempel på Railway. Inga beroenden.
// Okända adresser får index.html, så att routern i webbläsaren tar dem (/:konto, /:konto/chatt/:samtal).
// /halsa svarar 200 för hälsokontrollen. Inga nycklar finns här: bara den publika nyckeln ligger i bygget.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = resolve(process.env.PLATTFORM_DIST ?? fileURLToPath(new URL('../apps/platform/dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

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
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/halsa') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('ok'); return; }
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
