// Kontraktet körs mot legacy/shared/claude-shim.js, utan att filen ändras, med ett påhittat
// localStorage. Samma kontrakt körs mot databasen i tests/db/dokument.test.ts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll } from 'vitest';
import type { Db } from './index';
import { kontrakt } from './kontrakt';

class Lagring {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

let db: Db;
beforeAll(async () => {
  const g = globalThis as unknown as { window: { claude?: { use: (n: string) => Promise<unknown> } }; localStorage: Lagring };
  g.window = {};
  g.localStorage = new Lagring();
  const kalla = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legacy', 'shared', 'claude-shim.js'), 'utf8');
  const info = console.info;
  console.info = () => {};
  try { new Function(kalla)(); } finally { console.info = info; }
  db = (await g.window.claude!.use('db')) as Db;
});

kontrakt('claude-shim.js', () => db, { fryst: false });
