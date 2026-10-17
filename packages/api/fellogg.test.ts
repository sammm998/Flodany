// Felloggningen: bara med DSN, bara EU-regionen, och inga personuppgifter i händelserna.
// Alla uppgifter här är påhittade (personnummer med månad och dag 00, regnummer ABC12A, example.se).
import { describe, expect, it } from 'vitest';
import { arEuDsn, sentryVal, startaFellogg, tvattaHandelse, tvattaText, type SentrySdk } from './fellogg';

const EU = 'https://abc123def456@o123456.ingest.de.sentry.io/7890123';
const US = 'https://abc123def456@o123456.ingest.us.sentry.io/7890123';

function falsktSdk() {
  const anrop: { init: unknown[]; fel: unknown[]; larm: unknown[] } = { init: [], fel: [], larm: [] };
  const sdk: SentrySdk = { init: v => anrop.init.push(v), captureException: (e, o) => anrop.fel.push([e, o]), captureMessage: (m, o) => anrop.larm.push([m, o]) };
  return { sdk, anrop };
}
const tyst = { error: () => {}, warn: () => {} };

describe('felloggningen aktiveras bara med en DSN i EU-regionen', () => {
  it('utan DSN laddas inget SDK och inget skickas', async () => {
    let laddat = 0;
    const f = await startaFellogg({}, async () => { laddat++; return falsktSdk().sdk; }, tyst);
    expect(f.aktiv).toBe(false);
    f.fel(new Error('x'));
    expect(laddat).toBe(0);
  });

  it('en DSN utanför EU används inte', async () => {
    let laddat = 0;
    const varningar: string[] = [];
    const f = await startaFellogg({ dsn: US }, async () => { laddat++; return falsktSdk().sdk; }, { error: () => {}, warn: t => varningar.push(String(t)) });
    expect(f.aktiv).toBe(false);
    expect(laddat).toBe(0);
    expect(varningar[0]).toMatch(/EU-region/);
    for (const d of [EU.replace('https', 'http'), EU + '?x=1', 'https://o1.ingest.de.sentry.io/1', 'https://k@o1.ingest.de.sentry.io.exempel.se/1']) expect(arEuDsn(d), d).toBe(false);
    expect(arEuDsn(EU)).toBe(true);
  });

  it('med EU-DSN: init utan personuppgifter, fel och larm skickas', async () => {
    const { sdk, anrop } = falsktSdk();
    const f = await startaFellogg({ dsn: EU, miljo: 'test', release: '1.0.0' }, async () => sdk, tyst);
    expect(f.aktiv).toBe(true);
    expect(anrop.init[0]).toMatchObject({ dsn: EU, environment: 'test', release: '1.0.0', sendDefaultPii: false, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });
    f.fel(new Error('trasigt'), { modul: 'avrakning' });
    f.larm('Taket nått för ekonomi@example.se');
    expect(anrop.fel).toHaveLength(1);
    expect(anrop.larm[0]).toEqual(['Taket nått för [e-post]', { level: 'warning', tags: undefined }]);
  });
});

describe('inga personuppgifter i händelserna', () => {
  it('tvättar e-post, personnummer, telefon, bankkonto, regnummer och token ur text', () => {
    const text = 'Förare ekonomi@example.se 19800000-0000 och 800000-0000, tel 070-123 45 67 och +46701234567, konto 1234-5678901, bil ABC12A och ABC 34B, token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLWV4ZW1wZWw och /logga-in/bekrafta?token_hash=abcdef123&type=email';
    const ut = tvattaText(text);
    for (const kvar of ['@example.se', '19800000-0000', '800000-0000', '070-123', '+4670', '1234-5678901', 'ABC12A', 'ABC 34B', 'eyJ', 'abcdef123']) expect(ut, kvar).not.toContain(kvar);
    expect(ut).toContain('[e-post]');
    expect(ut).toContain('[personnummer]');
    expect(ut).toContain('[telefon]');
    expect(ut).toContain('[regnr]');
    expect(ut).toContain('token_hash=[token]');
  });

  it('tvättar en hel händelse: användare, anrop, extra, brödsmulor, undantag och lokala variabler', () => {
    const ut = tvattaHandelse({
      message: 'Fel för ekonomi@example.se',
      user: { id: 'u-1', email: 'ekonomi@example.se', ip_address: '10.0.0.1', username: 'Testperson Ett' },
      request: { method: 'POST', url: 'https://app.flodia.se/logga-in/bekrafta?token_hash=hemligt', data: { personnr: '19800000-0000' }, headers: { authorization: 'Bearer x' }, cookies: { a: 'b' } },
      extra: { lon: 35000 },
      breadcrumbs: [{ category: 'fetch', message: 'POST ekonomi@example.se', data: { body: '{"bank":"1234-5678901"}' } }],
      exception: { values: [{ type: 'Error', value: 'Saknar 19800000-0000', stacktrace: { frames: [{ vars: { personnr: '19800000-0000' } }] } }] },
      contexts: { trace: { trace_id: '1' }, state: { S: { lon: 1 } } },
    });
    const json = JSON.stringify(ut);
    for (const kvar of ['example.se', '10.0.0.1', 'Testperson', '19800000-0000', 'hemligt', 'authorization', 'cookies', '35000', '1234-5678901', '"state"', 'vars']) expect(json, kvar).not.toContain(kvar);
    expect(ut.user).toEqual({ id: 'u-1' });
    expect(ut.request).toEqual({ method: 'POST', url: 'https://app.flodia.se/logga-in/bekrafta' });
  });

  it('beforeSend och beforeBreadcrumb i inställningarna tvättar, och konsolens brödsmulor tas bort', () => {
    const v = sentryVal(EU, 'test');
    expect(JSON.stringify(v.beforeSend({ message: 'ekonomi@example.se' }))).not.toContain('example.se');
    expect(v.beforeBreadcrumb({ category: 'console', message: '19800000-0000' })).toBeNull();
    expect(v.beforeBreadcrumb({ category: 'navigation', message: '/a/19800000-0000', data: { from: 'x' } })).toEqual({ category: 'navigation', message: '/a/[personnummer]' });
  });
});
