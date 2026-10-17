// Bygger klientpaketen och granskar dem (npm run kontroll:klient, körs i CI):
//   dist-klient/api       packages/api med esbuild
//   apps/platform/dist    plattformen med Vite (forbjudKarnaVite i vite.config.ts)
// Granskningen letar efter motorkod, legacy-apparna, källkodskartor och nycklar (scripts/klientpaket.mjs).
// Undantaget är svaret från Edge Function legacy, som aldrig ingår i ett klientpaket (se klientpaket.mjs).
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { ROT, fingeravtryck, forbjudKarnaEsbuild, granska, legacyAvtryck } from './klientpaket.mjs';

const API = join(ROT, 'dist-klient', 'api'), PLATTFORM = join(ROT, 'apps', 'platform', 'dist');
rmSync(join(ROT, 'dist-klient'), { recursive: true, force: true });
await build({
  entryPoints: { api: join(ROT, 'packages/api/index.ts') },
  outdir: API, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, legalComments: 'none', logLevel: 'warning',
  plugins: [forbjudKarnaEsbuild()],
});
// I CI finns ingen Supabase i det här jobbet: bygget får platshållare om adressen inte är satt.
process.env.VITE_SUPABASE_URL ??= 'https://exempel.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY ??= 'platshallare';
await viteBuild({ root: join(ROT, 'apps', 'platform'), configFile: join(ROT, 'apps', 'platform', 'vite.config.ts'), logLevel: 'warn' });

const avtryck = fingeravtryck(), legacy = legacyAvtryck();
const fynd = [...granska(API, avtryck, legacy).map(f => 'api/' + f), ...granska(PLATTFORM, avtryck, legacy).map(f => 'platform/' + f)];
if (fynd.length) {
  console.error('Klientpaketet innehåller sådant som inte får skickas till webbläsaren:\n  ' + fynd.join('\n  '));
  process.exit(1);
}
console.log(`Klientpaketen är granskade (api och platform): inga motorer, inga legacy-appar, inga källkodskartor, inga nycklar. ${avtryck.length} och ${legacy.length} fingeravtryck.`);
