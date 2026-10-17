// Skriver apps/platform/.env.local med den lokala Supabase-adressen och den publika nyckeln
// (från "supabase status"). Filen committas aldrig. I molnet sätts värdena vid bygget.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROT } from './klientpaket.mjs';

const ut = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(ut.split(/\r?\n/).map(r => r.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const url = env.API_URL, anon = env.ANON_KEY || env.PUBLISHABLE_KEY;
if (!url || !anon) throw new Error('Hittar ingen lokal Supabase. Kör "npm run db:start".');
writeFileSync(join(ROT, 'apps/platform/.env.local'), `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${anon}\n`);
console.log('apps/platform/.env.local är skriven.');
