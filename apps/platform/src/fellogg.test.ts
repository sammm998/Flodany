import { describe, expect, it } from 'vitest';
import { startaPlattformensFellogg } from './fellogg';

describe('plattformens felloggning', () => {
  it('är avstängd utan DSN och med en DSN utanför EU', async () => {
    expect((await startaPlattformensFellogg({})).aktiv).toBe(false);
    const varna = console.warn; console.warn = () => {};
    try { expect((await startaPlattformensFellogg({ VITE_SENTRY_DSN: 'https://k@o1.ingest.us.sentry.io/1' })).aktiv).toBe(false); }
    finally { console.warn = varna; }
  });
});
