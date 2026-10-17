import { describe, expect, it } from 'vitest';
import { LEGACY_PREFIX, rensaLegacyKopior } from './lagring';

class Lagring {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
}

describe('utloggning: legacy-apparnas kopior i webbläsaren rensas (fråga 2 i fas-2c.md)', () => {
  it('tar bort ak_, tt_ och shim:, men inget annat', () => {
    const l = new Lagring();
    for (const k of ['ak_settings', 'ak_m-2026-10', 'tt_bok-2026-09', 'shim:settings/params', 'flodia:senaste-konto', 'sb-token', 'akare']) l.m.set(k, 'x');
    expect(rensaLegacyKopior(l)).toBe(4);
    expect([...l.m.keys()].sort()).toEqual(['akare', 'flodia:senaste-konto', 'sb-token']);
    expect(LEGACY_PREFIX).toEqual(['ak_', 'tt_', 'shim:']);
  });

  it('tål att lagringen är avstängd', () => {
    const trasig = { get length(): number { throw new Error('avstängd'); }, key: () => null, removeItem: () => {} };
    expect(rensaLegacyKopior(trasig)).toBe(0);
  });
});
