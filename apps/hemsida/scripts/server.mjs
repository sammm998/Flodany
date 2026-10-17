// Visar dist lokalt som Cloudflare Pages gör: index.html för kataloger och huvudena i _headers.
// Används av Lighthouse i CI och för att titta på sidan: npm run visa -w @flodia/hemsida
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HEMSIDA } from './bygg.mjs';

const TYPER = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp', '.mp4': 'video/mp4' };

/**
 * Reglerna i _headers: [mönster, [[namn, värde]]]. Ett mönster som slutar med * matchar allt under.
 * @param {string} text
 * @returns {[string, [string, string][]][]}
 */
export function lasHeaders(text) {
  /** @type {[string, [string, string][]][]} */
  const regler = [];
  for (const rad of text.split(/\r?\n/)) {
    if (!rad.trim() || rad.trim().startsWith('#')) continue;
    if (!/^\s/.test(rad)) regler.push([rad.trim(), []]);
    else { const i = rad.indexOf(':'); regler.at(-1)[1].push([rad.slice(0, i).trim(), rad.slice(i + 1).trim()]); }
  }
  return regler;
}
export const matchar = (monster, sokvag) => (monster.endsWith('*') ? sokvag.startsWith(monster.slice(0, -1)) : sokvag === monster);

/**
 * Huvudena för en sökväg, som Pages slår ihop dem från alla regler som matchar.
 * @param {[string, [string, string][]][]} regler
 * @param {string} sokvag
 * @returns {Record<string, string>}
 */
export function huvudFor(regler, sokvag) {
  /** @type {Record<string, string>} */
  const ut = {};
  for (const [m, h] of regler) if (matchar(m, sokvag)) for (const [n, v] of h) ut[n] = v;
  return ut;
}

export function starta(katalog = join(HEMSIDA, 'dist'), port = 0) {
  const regler = lasHeaders(readFileSync(join(katalog, '_headers'), 'utf8'));
  const server = createServer((req, res) => {
    const sokvag = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let fil = normalize(join(katalog, sokvag));
    if (!fil.startsWith(normalize(katalog))) { res.writeHead(403).end(); return; }
    if (existsSync(fil) && statSync(fil).isDirectory()) fil = join(fil, 'index.html');
    if (!existsSync(fil) || sokvag.startsWith('/_')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Hittades inte'); return; }
    res.writeHead(200, { 'Content-Type': TYPER[extname(fil)] ?? 'application/octet-stream', ...huvudFor(regler, sokvag) }).end(readFileSync(fil));
  });
  return new Promise(klar => server.listen(port, '127.0.0.1', () => klar(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const s = await starta(undefined, 4321);
  console.log(`Hemsidan visas på http://127.0.0.1:${s.address().port}/ (bygg först med npm run bygg -w @flodia/hemsida).`);
}
