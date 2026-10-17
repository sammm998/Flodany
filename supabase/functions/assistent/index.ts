// Edge Function assistent (Deno): agenten i chatten. All logik i packages/server/assistent.ts.
// Paketeras med "npm run bygg:funktioner" till assistent.bundle.js. Paketeringen committas inte.
import { assistentTjansterFranMiljo, hanteraAssistent, nycklarFranMiljo, startaFellogg, tjansterFranMiljo } from './assistent.bundle.js';

// Felloggning (fas 2f): bara med SENTRY_DSN i Sentrys EU-region, annars bara konsolen. SDK:t laddas bara då.
const fellogg = await startaFellogg(
  { dsn: Deno.env.get('SENTRY_DSN'), miljo: Deno.env.get('FLODIA_MILJO') ?? 'test' },
  () => import('npm:@sentry/deno@10.75.3'),
);
// Funktionens egen secret key (assistent) och publishable-nyckeln. I molnet ingen reserv till de äldre (packages/server/nycklar.ts).
const nycklar = nycklarFranMiljo(n => Deno.env.get(n), 'assistent');
console.info('assistent (' + nycklar.kalla.lage + '): nycklar från ' + nycklar.kalla.service + ' och ' + nycklar.kalla.anon);
const miljo = { url: Deno.env.get('SUPABASE_URL') ?? '', anon: nycklar.anon, service: nycklar.service };
const motor = tjansterFranMiljo(miljo, { larm: (t, taggar) => fellogg.larm(t, { ...taggar, funktion: 'assistent' }) });
// Nyckeln och modellen ligger i Supabase Secrets, aldrig i koden. Utan dem svarar assistenten 503.
const tjanster = assistentTjansterFranMiljo({
  ...miljo,
  anthropic: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
  modell: Deno.env.get('ASSISTENT_MODELL') ?? '',
  insats: Deno.env.get('ASSISTENT_INSATS') ?? 'medium',
}, motor);
const tillatnaUrsprung = (Deno.env.get('PLATTFORM_URL') ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',');

Deno.serve(req => hanteraAssistent(req, tjanster, { tillatnaUrsprung, logg: e => fellogg.fel(e, { funktion: 'assistent' }) }));
