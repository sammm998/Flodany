// Datatyper för lönemotorn (åkarkassan och tripkassan). Formen är densamma som i legacy.
import type { EgenLoneart, ExtraRad, ManuellRad, EgenArt } from './lonearter';

export type Tal = number | string;

// ===== Parsrarnas utdata =====

export interface LdlBetalning {
  kod: string;
  namn: string;
  belopp: number;
  antal: number;
}

/** Ett körpass från Megtax/FlexMate (LDL.txt). Belopp i kronor. Tider i lokal tid. */
export interface Pass {
  id: string;
  rap: string;
  start: string;
  slut: string;
  rast: number;
  forare: string;
  bilId: string;
  regnr: string;
  reg: string;
  orgnr: string;
  foretag: string;
  turer: number;
  passKm: number;
  betKm: number;
  kont: number;
  kred: number;
  kontDricks: number;
  kredDricks: number;
  kontKl: number[];
  kredKl: number[];
  pay: LdlBetalning[];
  a: Date;
  b: Date;
  tim: number;
  bom?: number;
}

export interface LdlResultat {
  shifts: Pass[];
  warn: string[];
}

export type PassageTyp = 'bro' | 'avgift' | 'sturup';

/** En passage (bro, pickup-avgift eller Sturup). */
export interface Passage {
  ts: string;
  ts2: string | null;
  t: Date | null;
  desc: string;
  reg: string;
  bil?: string;
  typ: PassageTyp | string;
  valuta: string;
  belopp: number;
  text: string;
}

export interface AvrakningRad {
  art: number;
  text: string;
  bil: string;
  antal: number | null;
  summa: number;
}

export interface AvrakningFaktura {
  nr: string;
  datum: string;
  attBetala: number | null;
  rows: AvrakningRad[];
}

/** Skattetabell: B = belopp per inkomstintervall, P = procent över högsta intervallet. Rad: [till, kol1..kol6]. */
export interface Skattetabell {
  B: number[][];
  P: number[][];
}

// ===== Konfiguration =====

export interface LonCfg {
  procent: number;
  semester: number;
  utbetDag: number;
  utbetDagProv?: number;
  utbSamma?: boolean;
  broAndel: number;
  broPris: number;
  cphPris: number;
  inklPickup: boolean;
  inklSturup: boolean;
  bomBortLon: boolean;
  momsKlass: number[];
  dagStart: number;
  dagSlut: number;
  redovForarandel: number;
  agAvgift: number;
  broMarginalMin: number;
  /** Bolagets val i löneartsregistret (aktiv, à-pris). */
  lonearter?: Record<string, EgenLoneart>;
  /** Bolagets egna lönearter (registerversion 2). */
  lonearterEgna?: EgenArt[];
  /** Från och med den här perioden kvittas förra månadens kontanter mot fast lön (åkarkassan). */
  kontEfterFran?: string;
  [nyckel: string]: unknown;
}

/** Manuella uppgifter per förare för månaden. */
export interface ForareManad {
  modell?: string;
  manadslon?: Tal;
  semFast?: boolean;
  boltProv?: Tal;
  uberProv?: Tal;
  ob?: Tal;
  bonus?: Tal;
  kontant?: Tal | null;
  forskott?: Tal;
  /** Manuella lönearter denna månad. */
  rader?: ManuellRad[];
  [nyckel: string]: unknown;
}

export interface Manad {
  forare?: Record<string, ForareManad>;
  overrides?: Record<string, string | null>;
  [nyckel: string]: unknown;
}

// ===== Resultat =====

export type Period = 'dag' | 'natt';

export interface MatchadPassage extends Passage {
  key: string;
  period: string;
  shift: string | null;
  forare: string | null;
  metod: 'omatchad' | 'pass' | 'marginal' | 'manuell';
  forslag: { forare: string; start: string; slut: string; min: number; annan: string | null } | null;
  kost?: number;
  iLon?: boolean;
}

export interface ForareRad {
  id: string;
  pass: number;
  tim: number;
  ink: number;
  exkl: number;
  kont: number;
  kred: number;
  kontDr: number;
  kredDr: number;
  km: number;
  betKm: number;
  bom: number;
  bud: number;
  broN: number;
  cphN: number;
  stuN: number;
  broSek: number;
  bilar: string[];
  pay: Record<string, number>;
  modell: string;
  exklMegtax: number;
  bomEx: number;
  proc: number;
  broAvdr: number;
  broApris: number;
  sem: number;
  ob: number;
  bonus: number;
  fast: number;
  brutto: number;
  agAvg: number;
  /** Beräknade manuella lönearter. */
  extra: ExtraRad[];
  formon: number;
  skattefri: number;
  extraSkatt: number;
  nettoJust: number;
  kontant: number;
  forskott: number;
  boltProv: number;
  /** Lönemodell "ingen": kontanter och förskott som inte kvittas, eftersom föraren inte får lön (varning). */
  ejKvittat?: { kontant: number; forskott: number };
}

export interface KassaPeriod {
  kassa: number;
  kont: number;
  kred: number;
  bro: number;
  broN: number;
  stu: number;
  stuN: number;
  forare: string[];
  pass: string[];
  exBro?: number;
  andel?: number;
  hosForare?: number;
}

export interface KassaDag {
  datum: string;
  vecka: number;
  wd: number;
  dag: KassaPeriod | null;
  natt: KassaPeriod | null;
}

export interface KassaBil {
  reg: string;
  regnr: string;
  bilId: string;
  dagar: Record<string, KassaDag>;
}

export interface LonResultat {
  cfg: LonCfg;
  rows: ForareRad[];
  bro: MatchadPassage[];
  bilar: Record<string, KassaBil>;
}
