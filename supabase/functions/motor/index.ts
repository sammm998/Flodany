// Edge Function motor (Deno). Tunt skal: all logik finns i packages/server och paketeras till
// motor.bundle.js med "npm run bygg:funktioner". Paketeringen committas inte.
import { nycklarFranMiljo, hantera, startaFellogg, tjansterFranMiljo } from './motor.bundle.js';

// Felloggning (fas 2f): bara med SENTRY_DSN i Sentrys EU-region, annars bara konsolen. SDK:t laddas bara då.
const fellogg = await startaFellogg(
  { dsn: Deno.env.get('SENTRY_DSN'), miljo: Deno.env.get('FLODIA_MILJO') ?? 'test' },
  () => import('npm:@sentry/deno@10.75.3'),
);
// De nya API-nycklarna: funktionens egen secret key (motor) och publishable-nyckeln. I molnet ingen reserv till de äldre (packages/server/nycklar.ts).
const nycklar = nycklarFranMiljo(n => Deno.env.get(n), 'motor');
console.info('motor (' + nycklar.kalla.lage + '): nycklar från ' + nycklar.kalla.service + ' och ' + nycklar.kalla.anon);
const tjanster = tjansterFranMiljo({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  anon: nycklar.anon,
  service: nycklar.service,
  // Fotoläsningen: nyckeln och modellen ligger i Supabase Secrets, aldrig i koden. Utan dem är den av.
  anthropic: Deno.env.get('ANTHROPIC_API_KEY') ?? '',
  fotoModell: Deno.env.get('FOTOLASNING_MODELL') ?? '',
}, { larm: (t, taggar) => fellogg.larm(t, { ...taggar, funktion: 'motor' }) });
const tillatnaUrsprung = (Deno.env.get('PLATTFORM_URL') ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',');

Deno.serve(req => hantera(req, tjanster, { tillatnaUrsprung, logg: e => fellogg.fel(e, { funktion: 'motor' }) }));
