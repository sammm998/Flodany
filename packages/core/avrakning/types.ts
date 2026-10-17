// Datatyper för avräkningen. Formen är densamma som i legacy/apps/avrakning/index.html.

/** Värden från formulär och databasen kan vara text eller tal. Motorn gör om dem med +x som i legacy. */
export type Tal = number | string;

// ===== Parsrarnas utdata =====

export type TripTyp = 'person' | 'bud' | 'utland';

export interface Konto {
  nr: number | string;
  namn: string;
}

export interface Trip {
  konto: Konto | null;
  bil: number | null;
  belopp: number;
  pass: string;
  rutt: string;
  datum: string | null;
  forare?: string;
  tid: string;
  bud: boolean;
  utland: boolean;
  typ: TripTyp;
}

export interface Tc {
  trips: Trip[];
  fakt: Record<string, number>;
  period: string | null;
  csv?: true;
}

export interface BamboraTrans {
  tid: string;
  kassor: number;
  belopp: number;
  dricks: number;
  datum: string;
  refund?: true;
}

export interface AppBetalning {
  bil: number;
  belopp: number;
  typ: string;
  datum?: string;
  id: string;
  forare: string;
  fran: string;
  till: string;
}

export interface AppResultat {
  app: AppBetalning[];
  ejApp: AppBetalning[];
}

export interface PassageResultat {
  cnt: Record<string, number>;
  okanda: Record<string, number>;
}

// ===== Inställningar (S) =====

export interface Params {
  vx: number;
  tl: number;
  sa: number;
  m6: number;
  m25: number;
  bro: number;
  sturup: number;
  cph: number;
  fs?: number;
  skuldGrans?: number;
  fsGratis?: string;
  [nyckel: string]: unknown;
}

export interface BilRegister {
  bil: Tal;
  reg?: string;
  avr?: string;
  bolag?: string;
  [nyckel: string]: unknown;
}

export interface Terminal {
  id: Tal;
  bil?: Tal | null;
}

export interface Kassa {
  kassor: Tal;
  bil: Tal;
}

export interface Bolag {
  namn: string;
  kn?: Tal;
  kn2?: Tal;
  vx?: Tal;
  vxInn?: Tal;
  vxRab?: Tal;
  tl?: Tal;
  gratisTom?: string;
  fsFrom?: string;
  [nyckel: string]: unknown;
}

export interface Installningar {
  params: Params;
  bilar: BilRegister[];
  terminaler: Terminal[];
  kassor: Kassa[];
  bolag: Bolag[];
}

// ===== Indata (D) =====

export interface ExtraRad {
  text?: string;
  art?: Tal | null;
  antal?: Tal;
  apris?: Tal;
  moms?: Tal;
  skuld?: boolean;
}

export interface Manuellt {
  forskott?: Tal;
  oppna?: Tal;
  rabatt?: Tal;
  ejBak?: Tal;
  vxBak?: Tal | null;
  tlBak?: Tal | null;
  extra?: (ExtraRad | null)[];
}

export interface ReskontraPost {
  kn: Tal;
  nr: Tal;
  fdat: string;
  saldo: number;
  namn: string;
}

export interface Reskontra {
  datum?: string;
  poster: ReskontraPost[];
}

export interface Oresund {
  kostBro?: number | null;
  kostCph?: number | null;
  nCph?: number;
  okandaBro?: Record<string, number>;
  okandaCph?: Record<string, number>;
  manader?: string[];
  fakturadatum?: string;
  ovriga?: Record<string, number>;
  prisAndring?: { fran: number; till: number };
}

export interface SturupInfo {
  okanda?: { bil: Tal; reg: string; antal: number; belopp: number }[];
  avvik?: { bil: Tal; bilFil?: Tal | null; regFil?: string; regReg?: string }[];
  period?: string;
}

export interface VismaFaktura {
  kn: Tal;
  nr?: Tal;
  namn?: string;
  att: number;
  rows?: { art: number | null; text: string; summa: Tal }[];
}

export interface ForskottRad {
  med: boolean;
  bolag: string;
  datum: string;
  belopp: Tal;
}

export interface TidigareBolag {
  kn?: Tal;
  namn: string;
  skuld?: number;
  rows?: { art: number | null; text: string; antal: Tal }[];
}

/** Antal per bil, eller per bil och pris. */
export type PerBilAntal = Record<string, Tal>;
export type PerBilPris = Record<string, Record<string, number>>;

export interface Indata {
  period?: string | null;
  tc?: Tc | null;
  bamb?: BamboraTrans[] | null;
  app?: AppResultat | null;
  bro?: PerBilAntal;
  sturup?: PerBilAntal;
  cph?: PerBilAntal;
  broRad?: PerBilPris;
  sturupRad?: PerBilPris;
  sturupInfo?: SturupInfo | null;
  oresund?: Oresund | null;
  manuellt?: Record<string, Manuellt>;
  forskottRad?: ForskottRad[];
  reskontra?: Reskontra | null;
  skuldMed?: boolean;
  visma?: { bolag?: VismaFaktura[] } | null;
  prevSummary?: { bolag?: TidigareBolag[] } | null;
  [nyckel: string]: unknown;
}

// ===== Resultat =====

export interface Manadsetiketter {
  namn: string;
  lang: string;
  vx: string;
}

export interface PerBil {
  bil: number;
  kort: number;
  refund: number;
  dricks: number;
  person: number;
  bud: number;
  utland: number;
  app: number;
  bro: number;
  sturup: number;
  cph: number;
  reg?: string;
  bolag?: string;
}

export interface FakturaRad {
  art: number | null;
  text: string;
  antal: Tal;
  apris: number;
  summa: number;
  moms: number;
  bak?: true;
  rabatt?: number;
  rabattPct?: number;
  extra?: true;
  skuld?: true;
}

export interface Kontroll {
  niva: 'fel' | 'info';
  typ: string;
  vad: string;
  belopp: number | null;
  atgard: string;
}

export interface BolagResultat extends Bolag {
  forsk: number;
  skuld: number;
  manad: number;
  bilar: number[];
  rows: FakturaRad[];
  netto: number;
  moms25: number;
  moms6: number;
  oresavr: number;
  att: number;
  kredit: number;
  kort: number;
  deb: number;
  app: number;
  bro: number;
  sturup: number;
  cph: number;
  aktiv: boolean;
}

export interface KundKorning {
  d: string | null;
  t: string;
  p: string;
  r: string;
  b: number | null;
  s: number;
  y: string;
  f: string;
}

export interface KundResultat {
  nr: number | string | undefined;
  namn: string | undefined;
  n: number;
  person: number;
  bud: number;
  utland: number;
  korn?: KundKorning[];
  r592: number;
  r593: number;
  r594: number;
  total: number;
  taxicaller: number | null;
  diff: number | null;
}

export interface Kpi {
  kundTotal: number;
  kundAntal: number;
  korningar: number;
  kort: number;
  app: number;
  vx: number;
  serv: number;
  skuldPos: number;
  skuldNeg: number;
  utbet: number;
  inbet: number;
  fel: number;
}

export interface Resultat {
  period: string | null | undefined;
  L: Manadsetiketter;
  perBil: PerBil[];
  bolag: BolagResultat[];
  kund: KundResultat[];
  kontroll: Kontroll[];
  kpi: Kpi;
}
