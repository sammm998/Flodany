// Paketerar demoläget (packages/server/demo-ingang.ts) för webbservern på Railway: dist-demo/demo.mjs.
// Motorerna ingår här, på servern, och aldrig i klientpaketet (beslut 26).
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(ROT, 'packages/server/demo-ingang.ts')], outfile: join(ROT, 'dist-demo/demo.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node22', minify: true, sourcemap: false, legalComments: 'none', logLevel: 'warning', loader: { '.html': 'text' },
});
console.log('Demoläget är byggt (dist-demo/demo.mjs).');
