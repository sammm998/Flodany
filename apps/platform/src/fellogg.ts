// Felloggning i webbläsaren (fas 2f). Bara när VITE_SENTRY_DSN finns och är Sentrys EU-region.
// Utan DSN laddas inte Sentry alls. Händelserna tvättas från personuppgifter (packages/api/fellogg.ts).
import { startaFellogg, type Fellogg, type SentrySdk } from '@flodia/api';

export let fellogg: Fellogg = { aktiv: false, fel: e => console.error(e), larm: t => console.warn(t) };

export async function startaPlattformensFellogg(env: { VITE_SENTRY_DSN?: string; VITE_FLODIA_MILJO?: string } = import.meta.env) {
  fellogg = await startaFellogg(
    { dsn: env.VITE_SENTRY_DSN, miljo: env.VITE_FLODIA_MILJO ?? 'test' },
    async () => (await import('@sentry/react')) as unknown as SentrySdk,
  );
  return fellogg;
}
