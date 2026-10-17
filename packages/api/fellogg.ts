// Felloggning med Sentry (fas 2f, SPEC-v3.1 avsnitt 10, fas-2-beslut.md beslut 10).
// - Aktiveras bara när en DSN finns i miljön. Utan DSN händer ingenting och SDK:t laddas inte.
// - Bara Sentrys EU-region (ingest.de.sentry.io). En DSN i en annan region används inte.
// - Inga personuppgifter: inga request-kroppar, ingen IP, inga cookies, ingen sessionsinspelning, och
//   e-post, personnummer, telefonnummer, bankkonton, regnummer och token tvättas bort ur all text.
// - Lagringstiden (högst 90 dagar) ställs in i Sentry, inte här. Se docs/faser/fas-2b-moln.md.
// Den här filen används både i webbläsaren och i serverfunktionerna och innehåller inga motorer.

/** Sentrys EU-region. Bara den godtas. */
export const EU_INGEST = /^https:\/\/[^@\s]+@o\d+\.ingest\.de\.sentry\.io\/\d+$/;
export const arEuDsn = (dsn: unknown): dsn is string => typeof dsn === 'string' && EU_INGEST.test(dsn.trim());

/** Mönster för personuppgifter och hemligheter i fri text. Ordningen spelar roll (token före siffror). */
const MONSTER: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[token]'],
  [/\b(token_hash|access_token|refresh_token|apikey|code)=[^&\s"']+/gi, '$1=[token]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-post]'],
  [/\b(19|20)?\d{6}[-+ ]?\d{4}\b/g, '[personnummer]'],
  [/(\+46|\b0)[\s-]?7\d([\s-]?\d){7}\b/g, '[telefon]'],
  [/\b\d{4}[\s-]\d{2,}([\s-]\d+)*\b/g, '[konto]'],
  [/\b[A-ZÅÄÖ]{3}\s?\d{2}[A-Z0-9]\b/g, '[regnr]'],
];

/** Tvättar en text från personuppgifter och hemligheter. */
export function tvattaText(s: string): string {
  let ut = s;
  for (const [m, e] of MONSTER) ut = ut.replace(m, e);
  return ut;
}

type Handelse = {
  message?: string; user?: Record<string, unknown>; request?: Record<string, unknown>; extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>; breadcrumbs?: { message?: string; data?: unknown; category?: string }[];
  exception?: { values?: { value?: string; type?: string; stacktrace?: { frames?: { vars?: unknown }[] } }[] };
  tags?: Record<string, unknown>; [k: string]: unknown;
};

/** Tvättar en Sentry-händelse innan den skickas (beforeSend). Svarar alltid med en ny, tvättad händelse. */
export function tvattaHandelse<T extends Handelse>(h: T): T {
  const ut: Handelse = { ...h };
  if (ut.message) ut.message = tvattaText(ut.message);
  // Användaren: bara det slumpade id:t, aldrig e-post, namn eller IP.
  ut.user = h.user?.id ? { id: String(h.user.id) } : undefined;
  // Anropet: bara metod och adress utan frågesträng. Inga kroppar, huvuden eller cookies.
  if (h.request) {
    const url = typeof h.request.url === 'string' ? h.request.url.split('?')[0] : undefined;
    ut.request = { ...(h.request.method ? { method: h.request.method } : {}), ...(url ? { url: tvattaText(url) } : {}) };
  }
  delete ut.extra;
  if (h.contexts) { const { trace, runtime, os, browser } = h.contexts as Record<string, unknown>; ut.contexts = { ...(trace ? { trace } : {}), ...(runtime ? { runtime } : {}), ...(os ? { os } : {}), ...(browser ? { browser } : {}) }; }
  if (h.exception?.values) ut.exception = { values: h.exception.values.map(v => ({ ...v, value: v.value ? tvattaText(v.value) : v.value, stacktrace: v.stacktrace ? { ...v.stacktrace, frames: v.stacktrace.frames?.map(f => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'vars'))) } : undefined })) };
  if (h.breadcrumbs) ut.breadcrumbs = h.breadcrumbs.map(b => ({ category: b.category, message: b.message ? tvattaText(b.message) : undefined }));
  if (h.tags) ut.tags = Object.fromEntries(Object.entries(h.tags).map(([k, v]) => [k, typeof v === 'string' ? tvattaText(v) : v]));
  return ut as T;
}

export interface Fellogg {
  aktiv: boolean;
  /** Ett fel. Tvättas innan det skickas. */
  fel: (e: unknown, taggar?: Record<string, string>) => void;
  /** Ett larm (till exempel att taket för anrop nåtts). */
  larm: (text: string, taggar?: Record<string, string>) => void;
}

/** Inställningarna till Sentry.init. Gemensamma för webbläsaren och servern. */
export function sentryVal(dsn: string, miljo: string, release?: string) {
  return {
    dsn,
    environment: miljo,
    release,
    sendDefaultPii: false,
    // Ingen prestandamätning eller sessionsinspelning i version 1.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    maxBreadcrumbs: 20,
    beforeSend: (h: Handelse) => tvattaHandelse(h),
    beforeBreadcrumb: (b: { category?: string; message?: string; data?: unknown }) =>
      b.category === 'console' ? null : { category: b.category, message: b.message ? tvattaText(b.message) : undefined },
  };
}

/** Den del av Sentry som används. Gör att SDK:t kan laddas först när en DSN finns, och bytas ut i test. */
export interface SentrySdk {
  init: (val: ReturnType<typeof sentryVal> & Record<string, unknown>) => unknown;
  captureException: (e: unknown, o?: { tags?: Record<string, string> }) => unknown;
  captureMessage: (m: string, o?: { level?: string; tags?: Record<string, string> }) => unknown;
}

/**
 * Startar felloggningen. Utan DSN, eller med en DSN utanför EU, laddas inget SDK och felen skrivs bara till
 * konsolen (utan att något skickas). importera anropas bara när DSN:en är godkänd.
 */
export async function startaFellogg(env: { dsn?: string; miljo?: string; release?: string }, importera: () => Promise<SentrySdk>, konsol: Pick<Console, 'error' | 'warn'> = console): Promise<Fellogg> {
  const lokal: Fellogg = { aktiv: false, fel: e => konsol.error(e), larm: t => konsol.warn(t) };
  if (!env.dsn) return lokal;
  if (!arEuDsn(env.dsn)) { konsol.warn('Felloggningen är avstängd: DSN:en är inte Sentrys EU-region (ingest.de.sentry.io).'); return lokal; }
  const Sentry = await importera();
  Sentry.init(sentryVal(env.dsn.trim(), env.miljo ?? 'test', env.release));
  return {
    aktiv: true,
    fel: (e, taggar) => { Sentry.captureException(e, { tags: taggar }); },
    larm: (t, taggar) => { Sentry.captureMessage(tvattaText(t), { level: 'warning', tags: taggar }); },
  };
}
