// Liten webbserver för legacy-apparna, utan beroenden.
// Start: npm run legacy, öppna sedan http://localhost:8000/legacy/apps/avrakning/
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 8000;

const TYPER = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Mapp utan index.html: visa en lista med länkar, mappar först
function lista(sokvag, poster) {
  const synliga = poster
    .filter((p) => !p.name.startsWith('.') && p.name !== 'node_modules')
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || (a.name < b.name ? -1 : 1));
  const rader = synliga
    .map((p) => {
      const namn = p.name + (p.isDirectory() ? '/' : '');
      return `<li><a href="${encodeURIComponent(p.name)}${p.isDirectory() ? '/' : ''}">${esc(namn)}</a></li>`;
    })
    .join('\n');
  const upp = sokvag === '/' ? '' : '<p><a href="../">Upp en nivå</a></p>';
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>${esc(sokvag)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:40px;color:#0E1E35}a{color:#1F4D3A}</style>
</head><body><h1>${esc(sokvag)}</h1>${upp}<ul>
${rader}
</ul></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const sokvag = normalize(join(ROT, decodeURIComponent(url.pathname)));
  // Släpp aldrig ut filer utanför projektmappen
  if (sokvag !== ROT && !sokvag.startsWith(ROT + sep)) {
    res.writeHead(403).end('Ej tillåtet');
    return;
  }
  try {
    let fil = sokvag;
    if ((await stat(fil)).isDirectory()) {
      // Utan avslutande snedstreck blir appens relativa sökvägar (../../shared) fel
      if (!url.pathname.endsWith('/')) {
        res.writeHead(301, { Location: url.pathname + '/' }).end();
        return;
      }
      fil = join(fil, 'index.html');
      if (!existsSync(fil)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(lista(url.pathname, await readdir(sokvag, { withFileTypes: true })));
        return;
      }
    }
    const innehall = await readFile(fil);
    res.writeHead(200, { 'Content-Type': TYPER[extname(fil)] ?? 'application/octet-stream' });
    res.end(innehall);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Hittades inte');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Legacy-apparna: http://localhost:${PORT}/legacy/apps/`);
  console.log('Stoppa med Ctrl+C');
});
