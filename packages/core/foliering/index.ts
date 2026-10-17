// Folieringen enligt modulkitets kontrakt (SPEC-v3.1 avsnitt 3).
import type { Engine } from '@flodia/kit';
import { foliering, type AttGora, type FakturaPost, type Nyckeltal, type Periodsumma } from './motor';
import type { FolieringState, Tid, Verifikation } from './types';

export * from './grund';
export { foliering, type AttGora, type FakturaPost, type FolieringVal, type ManuellUtkast, type Nyckeltal, type Periodsumma, type Varning } from './motor';
export { AtgardsFel, FORKRAV, TEXT_FALT, VALDA_FALT, kontrollera, type AtgardsFelKod, type ForkravLage } from './forkrav';
export type * from './types';

export interface FolieringIndata {
  S: FolieringState;
  /** Bokföringsperiod (ÅÅÅÅ-MM) att ta fram verifikationer, varningar och SIE för. */
  period?: string;
}

export interface FolieringUtdata {
  nyckeltal: Nyckeltal[];
  attGora: AttGora[];
  fakturor: FakturaPost[];
  bokforing: null | {
    period: string;
    verifikationer: Verifikation[];
    varningar: [string, string][];
    summa: Periodsumma;
    sie: ArrayBuffer;
  };
}

/** Motorn: tillstånd och tid in, översikt, påminnelser, fakturor och bokföring ut. Ändrar inte tillståndet. */
export const folieringEngine: Engine<FolieringIndata, Tid, FolieringUtdata> = {
  key: 'foliering',
  version: '1.0.0',
  compute: ({ S, period }, tid) => {
    const F = foliering(S, tid);
    const { nyckeltal, attGora } = F.oversikt();
    let bokforing: FolieringUtdata['bokforing'] = null;
    if (period) { const V = F.utkast(period); bokforing = { period, verifikationer: V, varningar: F.varningar(period, V), summa: F.periodSum(V), sie: F.bygSie(period, V) }; }
    return { nyckeltal, attGora, fakturor: F.allaFakturor(), bokforing };
  },
};
