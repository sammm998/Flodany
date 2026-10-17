// Paketerar serverfunktionerna för Edge Functions (Deno), minifierat och utan källkodskarta:
//   motor:  packages/server/index.ts         -> supabase/functions/motor/motor.bundle.js
//   legacy: packages/server/legacy-ingang.ts -> supabase/functions/legacy/legacy.bundle.js
// Motorerna och legacy-filerna ingår här, på servern, och aldrig i klientpaketet (beslut 26).
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gemensamt = { bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, legalComments: 'none', logLevel: 'warning' };
await build({ ...gemensamt, entryPoints: [join(ROT, 'packages/server/index.ts')], outfile: join(ROT, 'supabase/functions/motor/motor.bundle.js') });
await build({ ...gemensamt, entryPoints: [join(ROT, 'packages/server/legacy-ingang.ts')], outfile: join(ROT, 'supabase/functions/legacy/legacy.bundle.js'), loader: { '.html': 'text' } });
console.log('Serverfunktionerna motor och legacy är byggda.');
