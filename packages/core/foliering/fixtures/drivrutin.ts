// Gör samma steg i gammal motor (legacy-skriptet i sandlåda, via klick och fältändringar)
// och ny motor (foliering(S, tid).atgarder), och samlar det som behövs för att jämföra.
import { stockholmDatum } from '../../tid';
import { clone } from '../grund';
import { foliering } from '../motor';
import { AtgardsFel } from '../forkrav';
import type { ManuellUtkast } from '../motor';
import type { Arende, FolieringState, Tid, Utfall } from '../types';
import { laddaLegacyFoliering, type LegacyFoliering, type Klocka } from '../../../../tests/legacy-foliering';

export type Steg =
  | { typ: 'nytt' }
  | { typ: 'klick'; act: string; id: string; form?: Record<string, string>; i?: number }
  | { typ: 'text'; id: string; f: 'reg' | 'skadenr' | 'agare' | 'bil' | 'notering'; v: string }
  | { typ: 'val'; id: string; f: 'storlek' | 'forsakring' | 'offert.datum' | 'faktura.datum'; v: string }
  | { typ: 'pris'; id: string; pid: string }
  | { typ: 'rad'; id: string; i: number; falt: 'text' | 'antal' | 'apris'; v: string }
  | { typ: 'manuell'; p: string; bm: ManuellUtkast }
  | { typ: 'export'; p: string };

export interface Tidpunkt { ms: number; slump: number }

/** Dagens datum i svensk tid, som legacy räknar fram det när datorn går i svensk tid. */
export const idagFor = (ms: number): string => stockholmDatum(ms);
export const tidFor = (t: Tidpunkt): Tid => ({ idag: idagFor(t.ms), nu: new Date(t.ms).toISOString(), nuMs: t.ms, slump: () => t.slump });

export interface Start {
  arenden?: Arende[];
  fordon?: Record<string, Record<string, unknown>>;
  forsakring?: Record<string, Record<string, unknown>>;
  kostnader?: Record<string, Record<string, unknown>>;
  inst?: Record<string, unknown>;
}

const map = <T>(o: Record<string, T> | undefined, medId: boolean) => new Map(Object.entries(o || {}).map(([k, v]) => [k, (medId ? { ...v, id: k } : v) as T]));

/** Tillståndet som det ser ut efter inläsning från databasen (dokumenten får sitt id). */
export function nyttState(st: Start): FolieringState {
  return {
    arenden: new Map((st.arenden || []).map(a => [a.id, clone(a)])),
    fordon: map(clone(st.fordon || {}), true), forsakring: map(clone(st.forsakring || {}), true), kostnader: map(clone(st.kostnader || {}), true),
    bokforing: new Map(), inst: clone(st.inst || {}),
  } as unknown as FolieringState;
}

export interface Resultat { utfall: Utfall | { fel: string } }

/** Båda motorerna sida vid sida. */
export class Par {
  klocka: Klocka = { ms: 0, slump: 0 };
  L: LegacyFoliering;
  N: FolieringState;
  /** medLegacy = false: bara nya motorn körs (för facit utan legacy). */
  constructor(st: Start, medLegacy = true) {
    this.L = medLegacy ? laddaLegacyFoliering(this.klocka) : tomLegacy();
    const s = nyttState(st);
    for (const k of ['arenden', 'fordon', 'forsakring', 'kostnader', 'bokforing'] as const) this.L.S[k] = structuredClone(s[k]) as never;
    this.L.S.inst = clone(s.inst);
    this.L.S.loaded = true;
    this.N = nyttState(st);
  }
  /** Motorn utan förkrav, exakt som legacy (fas 1c). Förkraven prövas separat för varje steg (forkrav i steg). */
  F(t: Tidpunkt) { return foliering(this.N, tidFor(t), { utanForkrav: true }); }

  /** Kör ett steg i båda. Returnerar det som legacy och ny sparade, visade och laddade ner,
   *  och om förkraven (fynd f) hade nekat steget. */
  async steg(s: Steg, t: Tidpunkt): Promise<{ gammal: Resultat; ny: Resultat; forkrav: AtgardsFel | null }> {
    this.klocka.ms = t.ms; this.klocka.slump = t.slump;
    const forkrav = this.provaForkrav(s, t);
    const L = this.L, rec = L.rec; rec.spara.length = 0; rec.filer.length = 0; rec.meddelanden.length = 0;
    const F = this.F(t), A = F.atgarder, a = 'id' in s ? this.N.arenden.get(s.id)! : (null as unknown as Arende);
    let gfel: string | null = null, nfel: string | null = null;
    const kor = async (f: () => unknown) => { try { await f(); return null; } catch (e) { return e instanceof Error ? `${e.name}: ${e.message}` : String(e); } };

    switch (s.typ) {
      case 'nytt':
        L.setRoute({ tab: 'arenden', id: null });
        gfel = await kor(() => L.klicka({ act: 'nytt' })); break;
      case 'klick': {
        L.setRoute({ tab: 'arenden', id: s.id });
        const ds: Record<string, string> = { act: s.act, id: s.id, ...(s.i != null ? { i: String(s.i) } : {}) };
        gfel = await kor(async () => { await L.klicka(ds, s.form); if (s.act === 'makulera') await L.klicka(ds, s.form); }); break;
      }
      case 'text': {
        L.setRoute({ tab: 'arenden', id: s.id });
        const el = { dataset: { f: s.f }, value: s.v, tagName: s.f === 'notering' ? 'TEXTAREA' : 'INPUT', type: 'text' };
        gfel = await kor(async () => { L.skriv(el); await L.andra(el); }); break;
      }
      case 'val': {
        L.setRoute({ tab: 'arenden', id: s.id });
        const datum = s.f.endsWith('datum');
        gfel = await kor(() => L.andra({ dataset: { f: s.f }, value: s.v, tagName: datum ? 'INPUT' : 'SELECT', type: datum ? 'date' : 'select-one' })); break;
      }
      case 'pris':
        L.setRoute({ tab: 'arenden', id: s.id });
        gfel = await kor(() => L.andra({ id: 'addPris', value: s.pid, tagName: 'SELECT' })); break;
      case 'rad':
        L.setRoute({ tab: 'arenden', id: s.id });
        gfel = await kor(async () => { L.skriv({ dataset: { rf: s.falt, r: String(s.i) }, value: s.v, tagName: 'INPUT', type: 'text' }); }); break;
      case 'manuell':
        L.setRoute({ tab: 'bokforing', id: null }); L.ui.bp = s.p; L.ui.bm = clone(s.bm);
        gfel = await kor(() => L.klicka({ act: 'bmSave' })); break;
      case 'export':
        L.setRoute({ tab: 'bokforing', id: null }); L.ui.bp = s.p; L.ui.bArm = false;
        gfel = await kor(async () => { await L.klicka({ act: 'bokExport' }); await L.klicka({ act: 'bokExport' }); }); break;
    }
    let nu: Utfall | null = null;
    try { nu = utforNy(A, a, s); } catch (e) { nfel = e instanceof Error ? `${e.name}: ${e.message}` : String(e); }
    // Som databasens onSnapshot: sparade inställningar syns i tillståndet direkt efter.
    const snapshot = (S: { inst: Record<string, unknown> }, spara: [string, unknown][]) => { for (const [p, o] of spara) if (p.startsWith('installningar/')) S.inst[p.slice(14)] = clone(o); };
    snapshot(this.L.S, rec.spara); if (nu) snapshot(this.N, nu.spara);
    const gammal: Resultat = { utfall: gfel ? { fel: gfel } : { spara: clone(rec.spara), filer: rec.filer.map(f => ({ ...f })), meddelanden: [...rec.meddelanden] } };
    return { gammal, ny: { utfall: nfel ? { fel: nfel } : nu! }, forkrav };
  }

  /** Provkör steget med förkrav på en kopia av tillståndet. Svarar med felet om förkraven nekar. */
  provaForkrav(s: Steg, t: Tidpunkt): AtgardsFel | null {
    const N = structuredClone(this.N), F = foliering(N, tidFor(t));
    try { utforNy(F.atgarder, 'id' in s ? N.arenden.get(s.id)! : (null as unknown as Arende), s); return null; }
    catch (e) { return e instanceof AtgardsFel ? e : null; }
  }

  /** Tillståndet som ska vara lika (det som 1c rör). */
  tillstand() {
    const plocka = (S: Record<string, unknown>) => ({ arenden: S.arenden, fordon: S.fordon, forsakring: S.forsakring, kostnader: S.kostnader, bokforing: S.bokforing, inst: S.inst });
    return { gammal: plocka(this.L.S), ny: plocka(this.N as unknown as Record<string, unknown>) };
  }
}

/** Ersätter legacy när bara nya motorn ska köras. */
function tomLegacy(): LegacyFoliering {
  return { S: { inst: {} }, ui: {}, setRoute() {}, async klicka() {}, async andra() {}, skriv() {}, rec: { spara: [], filer: [], meddelanden: [] }, fn: {} };
}

function slaIhop(u: Utfall[]): Utfall { return { spara: u.flatMap(x => x.spara), filer: u.flatMap(x => x.filer), meddelanden: u.flatMap(x => x.meddelanden) }; }

/** Vad ett steg som förkraven nekar gjorde utan dem (som legacy). */
export function forut(u: Resultat['utfall']): 'kastade' | 'sparade' | 'meddelande' | 'inget' {
  if ('fel' in u) return 'kastade';
  return u.spara.length || u.filer.length ? 'sparade' : u.meddelanden.length ? 'meddelande' : 'inget';
}

type Atgarder = ReturnType<typeof foliering>['atgarder'];

/** Stegets åtgärd i nya motorn (samma som legacy gör vid klicket eller fältändringen). */
export function utforNy(A: Atgarder, a: Arende, s: Steg): Utfall {
  switch (s.typ) {
    case 'nytt': return A.nyttArende();
    case 'klick': {
      const f = s.form || {};
      const M: Record<string, () => Utfall> = {
        skickad: () => A.offertSkickad(a), godkand: () => A.godkand(a, f['#godkAv'] ?? ''), avslag: () => A.avslag(a), ateroppna: () => A.ateroppna(a),
        offertIgen: () => A.offertPaminnelse(a), skapaFaktura: () => A.skapaFaktura(a), fakturaSkickad: () => A.fakturaSkickad(a), paminnelseKlar: () => A.paminnelseNoterad(a),
        betald: () => A.betald(a, f['#betDat']), obetald: () => A.angraBetalning(a), makulera: () => A.makulera(a), skapaMoms: () => A.skapaMoms(a),
        momsSkickad: () => A.momsSkickad(a), momsBetald: () => A.momsBetald(a, f['#mBetDat']), momsObetald: () => A.angraMomsBetalning(a),
        addlog: () => A.anteckning(a, f['#logTxt'] ?? ''), egenrad: () => A.egenRad(a), delrad: () => A.taBortRad(a, s.i ?? 0),
      };
      return M[s.act]!();
    }
    case 'text': { const u = [A.textFalt(a, s.f, s.v)]; if (s.f === 'reg') u.push(A.regAndrat(a, s.v)); else if (s.f !== 'notering') u.push(A.spara(a)); return slaIhop(u); }
    case 'val': return A.valtFalt(a, s.f, s.v);
    case 'pris': return A.laggTillPris(a, s.pid);
    case 'rad': return A.radFalt(a, s.i, s.falt, s.v);
    case 'manuell': return A.manuellVerifikation(s.p, clone(s.bm));
    case 'export': return A.exporteraPeriod(s.p);
  }
}

/** Kort namn på stegets åtgärd, för statistiken. */
export const stegNamn = (s: Steg): string => s.typ === 'klick' ? s.act : s.typ === 'val' || s.typ === 'text' ? s.typ + ' ' + s.f : s.typ;
