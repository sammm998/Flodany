// Kontraktet för documents-API:t: samma tester körs mot legacy/shared/claude-shim.js (shim.test.ts)
// och mot plattformens databas (tests/db/dokument.test.ts). Båda ska bete sig likadant.
import { describe, expect, it } from 'vitest';
import type { ColSnap, Db, DocSnap } from './index';

export interface Kontraktsval {
  /** data() ger fryst data (claude.ai och plattformen) eller en kopia (shimmen). */
  fryst: boolean;
}

/** Väntar tills villkoret är sant, högst t millisekunder. */
export async function vantaPa(villkor: () => boolean, t = 15_000): Promise<void> {
  const slut = Date.now() + t;
  while (!villkor()) {
    if (Date.now() > slut) throw new Error('Väntade för länge');
    await new Promise(r => setTimeout(r, 25));
  }
}

let n = 0;
const unik = () => `k${Date.now().toString(36)}${(n++).toString(36)}`;

export function kontrakt(namn: string, db: () => Db, val: Kontraktsval) {
  describe(`documents-API, kontraktet (${namn})`, () => {
    it('dokument som saknas', async () => {
      const s = await db().doc(`${unik()}/saknas`).get();
      expect(s.exists).toBe(false);
      expect(s.data()).toBeUndefined();
      expect(s.id).toBe('saknas');
    });

    it('set och get, med svenska tecken, tal, listor och objekt i flera nivåer', async () => {
      const v = { namn: 'Åkeri Öst', belopp: 1234.5, lista: [1, 'två', { tre: 3 }], djup: { a: { b: null } }, sant: true };
      const ref = db().doc(`${unik()}/params`);
      await ref.set(v);
      const s = await ref.get();
      expect(s.exists).toBe(true);
      expect(s.data()).toEqual(v);
      expect(s.ref.path).toBe(ref.path);
    });

    it('set ersätter hela dokumentet, set med merge och update sammanfogar på toppnivå', async () => {
      const ref = db().doc(`${unik()}/x`);
      await ref.set({ a: 1, b: { c: 1, d: 2 } });
      await ref.set({ e: 5 });
      expect((await ref.get()).data()).toEqual({ e: 5 });
      await ref.set({ a: 1, b: { c: 1 } }, { merge: true });
      expect((await ref.get()).data()).toEqual({ e: 5, a: 1, b: { c: 1 } });
      await ref.update({ b: { d: 2 }, f: 'ny' });
      expect((await ref.get()).data()).toEqual({ e: 5, a: 1, b: { d: 2 }, f: 'ny' });
    });

    it('update på ett dokument som saknas skapar det', async () => {
      const ref = db().doc(`${unik()}/ny`);
      await ref.update({ last: '2026-10' });
      expect((await ref.get()).data()).toEqual({ last: '2026-10' });
    });

    it('delete tar bort, och delete på något som saknas är inget fel', async () => {
      const ref = db().doc(`${unik()}/bort`);
      await ref.set({ a: 1 });
      await ref.delete();
      expect((await ref.get()).exists).toBe(false);
      await expect(ref.delete()).resolves.toBeUndefined();
    });

    it('sökvägen normaliseras: snedstreck först och sist spelar ingen roll', async () => {
      const p = unik();
      await db().doc(`/${p}/params/`).set({ a: 1 });
      expect((await db().doc(`${p}/params`).get()).data()).toEqual({ a: 1 });
    });

    it('collection: bara direkta barn, sorterade som i shimmen', async () => {
      const c = unik();
      for (const id of ['b', 'a', 'ä', '10', '9', 'B']) await db().doc(`${c}/${id}`).set({ id });
      await db().doc(`${c}/a/under/x`).set({ djup: true });
      await db().doc(`${c}x/z`).set({ annan: true });
      const s = await db().collection(c).get();
      expect(s.docs.map(d => d.id)).toEqual(['10', '9', 'a', 'ä', 'b', 'B'].sort((x, y) => x.localeCompare(y)));
      expect(s.size).toBe(6);
      expect(s.empty).toBe(false);
      const ids: string[] = [];
      s.forEach(d => ids.push(d.data()!.id as string));
      expect(ids).toEqual(s.docs.map(d => d.id));
      expect((await db().collection(`${c}/a/under`).get()).docs.map(d => d.id)).toEqual(['x']);
      expect((await db().collection(unik()).get()).empty).toBe(true);
    });

    it('doc().collection(), collection().doc() och add', async () => {
      const c = unik();
      const ref = db().doc(`${c}/m`).collection('rader').doc('r1');
      expect(ref.path).toBe(`${c}/m/rader/r1`);
      await ref.set({ ok: 1 });
      expect((await db().collection(`${c}/m/rader`).get()).size).toBe(1);
      const slump = db().collection(c).doc();
      expect(slump.id).toMatch(/^[a-z0-9]{1,10}$/);
      const ny = await db().collection(c).add({ tillagd: true });
      expect(ny.id).toMatch(/^[a-z0-9]{1,10}$/);
      expect((await ny.get()).data()).toEqual({ tillagd: true });
    });

    it(val.fryst ? 'data() är fryst' : 'data() är en kopia', async () => {
      const ref = db().doc(`${unik()}/f`);
      await ref.set({ a: { b: 1 } });
      const d = (await ref.get()).data() as { a: { b: number } };
      if (val.fryst) {
        expect(Object.isFrozen(d) && Object.isFrozen(d.a)).toBe(true);
      } else {
        d.a.b = 2;
        expect((await ref.get()).data()).toEqual({ a: { b: 1 } });
      }
    });

    // Livevisningen testas utan fasta pauser: ett vittne (en andra lyssnare) visar när en ändring har
    // kommit fram, och då vet vi att den avslutade lyssnaren också hade fått den om den fortfarande lyssnat.
    it('onSnapshot på dokument: först nuvarande läge, sedan varje ändring, inget efter avslut', async () => {
      const ref = db().doc(`${unik()}/live`);
      const sett: DocSnap[] = [], vittne: DocSnap[] = [];
      const sluta = ref.onSnapshot(s => sett.push(s));
      const slutaVittne = ref.onSnapshot(s => vittne.push(s));
      try {
        await redo(db());
        await vantaPa(() => sett.length >= 1);
        expect(sett[0]!.exists).toBe(false);
        await ref.set({ v: 1 });
        await vantaPa(() => sett.some(s => s.data()?.v === 1));
        await ref.update({ v: 2 });
        await vantaPa(() => sett.some(s => s.data()?.v === 2));
        await ref.delete();
        await vantaPa(() => !sett.at(-1)!.exists);
        sluta();
        await ref.set({ v: 3 });
        await vantaPa(() => vittne.some(s => s.data()?.v === 3));
        expect(sett.some(s => s.data()?.v === 3), 'avslutad lyssnare fick en ändring').toBe(false);
      } finally { sluta(); slutaVittne(); }
    });

    it('onSnapshot på samling: nya och borttagna dokument, men inte ändringar längre ner', async () => {
      const c = unik();
      await db().doc(`${c}/a`).set({ n: 1 });
      const sett: ColSnap[] = [];
      const sluta = db().collection(c).onSnapshot(s => sett.push(s));
      try {
        await redo(db());
        await vantaPa(() => sett.length >= 1);
        expect(sett[0]!.docs.map(d => d.id)).toEqual(['a']);
        await db().collection(c).doc('b').set({ n: 2 });
        await vantaPa(() => sett.at(-1)!.size === 2);
        const antal = sett.length;
        // Ändringen längre ner följs av en ändring i samlingen. När den syns ska den vara den enda nya.
        await db().doc(`${c}/a/under/x`).set({ djup: 1 });
        await db().doc(`${c}/zz`).set({ vittne: 1 });
        await vantaPa(() => sett.at(-1)!.docs.some(d => d.id === 'zz'));
        expect(sett.length, 'ändring längre ner gav en egen ögonblicksbild').toBe(antal + 1);
        await db().doc(`${c}/a`).delete();
        await vantaPa(() => sett.at(-1)!.docs.map(d => d.id).join() === 'b,zz');
      } finally { sluta(); }
    });
  });
}

/** Väntar tills livevisningen är ansluten, där det går att veta (plattformen). Shimmen är alltid redo. */
export const redo = (d: Db): Promise<void> => (d.redo ? d.redo() : Promise.resolve());
