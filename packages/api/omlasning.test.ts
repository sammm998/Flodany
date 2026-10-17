// Säkerhetsnätet i livevisningen (ägarens krav efter 2d): omläsningen räknas inte mot taket (den anropar
// aldrig serverfunktionen motor), och den pausas när fliken är dold och läser om direkt när fliken syns igen.
// Mot riktig databas: tests/db/dokument.test.ts (usage ändras inte av omläsning).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { skapaDb } from './index';

class Flik extends EventTarget {
  visibilityState: 'visible' | 'hidden' = 'visible';
  visa(lage: 'visible' | 'hidden') { this.visibilityState = lage; this.dispatchEvent(new Event('visibilitychange')); }
}

/** Påhittad Supabase-klient som räknar läsningar och anrop till serverfunktioner. */
function falskKlient() {
  const raknare = { lasningar: 0, funktionsanrop: 0, kanaler: 0, stangda: 0 };
  const svar = { data: null, error: null };
  const klient = {
    from: () => ({ select: () => ({ match: () => ({ maybeSingle: async () => { raknare.lasningar++; return svar; } }) }) }),
    rpc: async () => ({ error: null }),
    channel: () => {
      raknare.kanaler++;
      const k = { on: () => k, subscribe: (cb: (s: string) => void) => { setTimeout(() => cb('SUBSCRIBED'), 0); return k; } };
      return k;
    },
    removeChannel: async () => { raknare.stangda++; return 'ok'; },
    functions: { invoke: async () => { raknare.funktionsanrop++; return { data: { resultat: null }, error: null }; } },
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    realtime: { setAuth: async () => {} },
  };
  return { klient: klient as unknown as SupabaseClient, raknare };
}

const MS = 1000;
let flik: Flik;
beforeEach(() => {
  vi.useFakeTimers();
  flik = new Flik();
  (globalThis as { document?: unknown }).document = flik;
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
});

function lyssna() {
  const { klient, raknare } = falskKlient();
  let omlasningar = 0;
  const db = skapaDb({ supabase: klient, konto: '00000000-0000-4000-8000-000000000001', modul: 'avrakning', omlasningMs: MS, vidOmlasning: () => { omlasningar++; } });
  const sluta = db.doc('settings/params').onSnapshot(() => {});
  return { raknare, sluta, omlasningar: () => omlasningar };
}

describe('omläsningen i livevisningen', () => {
  it('läser om med jämna mellanrum och anropar aldrig serverfunktionen, så den räknas inte mot taket', async () => {
    const l = lyssna();
    await vi.advanceTimersByTimeAsync(10);
    const fore = l.raknare.lasningar;
    await vi.advanceTimersByTimeAsync(5 * MS);
    expect(l.omlasningar()).toBe(5);
    expect(l.raknare.lasningar - fore).toBe(5);
    expect(l.raknare.funktionsanrop).toBe(0);
    l.sluta();
  });

  it('pausas när fliken är dold och läser om direkt när den syns igen', async () => {
    const l = lyssna();
    await vi.advanceTimersByTimeAsync(2 * MS + 10);
    expect(l.omlasningar()).toBe(2);
    flik.visa('hidden');
    await vi.advanceTimersByTimeAsync(10 * MS);
    expect(l.omlasningar(), 'ingen omläsning medan fliken är dold').toBe(2);
    flik.visa('visible');
    await vi.advanceTimersByTimeAsync(10);
    expect(l.omlasningar(), 'läser om direkt när fliken syns').toBe(3);
    await vi.advanceTimersByTimeAsync(MS);
    expect(l.omlasningar(), 'och fortsätter sedan med jämna mellanrum').toBe(4);
    l.sluta();
  });

  it('börjar inte om fliken redan är dold, och slutar när ingen lyssnar längre', async () => {
    flik.visibilityState = 'hidden';
    const l = lyssna();
    await vi.advanceTimersByTimeAsync(5 * MS);
    expect(l.omlasningar()).toBe(0);
    flik.visa('visible');
    await vi.advanceTimersByTimeAsync(MS + 10);
    expect(l.omlasningar()).toBe(2);
    l.sluta();
    await vi.advanceTimersByTimeAsync(5 * MS);
    expect(l.omlasningar(), 'ingen omläsning efter avslut').toBe(2);
    flik.visa('hidden'); flik.visa('visible');
    await vi.advanceTimersByTimeAsync(10);
    expect(l.omlasningar(), 'synligheten följs inte efter avslut').toBe(2);
  });
});
