// Datatyper för folieringen. Formen är densamma som i legacy (dokumenten i databasen).

export interface Rad {
  pid?: string;
  text: string;
  antal: number;
  apris: number;
}

export interface Offert {
  datum: string;
  giltigTom?: string;
  rader: Rad[];
  godkandAv?: string;
  skickad?: string;
  paminnelse?: string;
}

export interface Faktura {
  nr: number;
  datum: string;
  forfall: string;
  utfort?: string;
  rader: Rad[];
  betald: boolean;
  betaldDatum: string;
  paminnelse: string;
}

export interface Momsfaktura {
  nr: string;
  datum: string;
  forfall: string;
  till: string;
  betald: boolean;
  betaldDatum: string;
  skickad: string;
  importerad?: unknown;
}

export interface Logg {
  d: string;
  t: string;
}

export interface Arende {
  id: string;
  reg: string;
  skadenr: string;
  forsakring: string;
  agare: string;
  bil: number | string | null;
  storlek: string;
  skadedatum?: string;
  notering?: string;
  status: string;
  offert: Offert;
  faktura: Faktura | null;
  moms: Momsfaktura | null;
  logg: Logg[];
  skapad?: string;
  andrad?: string;
  [nyckel: string]: unknown;
}

export interface Fordon {
  id?: string;
  reg?: string;
  bil?: number | string | null;
  agare?: string;
  adress?: string;
  epost?: string;
}

export interface Forsakring {
  id: string;
  namn: string;
  epost?: string;
  adress1?: string;
  adress2?: string;
  kontakt?: string;
  kort?: string;
}

export interface Kostnad {
  id: string;
  datum: string;
  typ: string;
  leverantor?: string;
  beskrivning?: string;
  fakturanr?: string;
  belopp: number | string;
  moms?: number | string;
  [nyckel: string]: unknown;
}

export interface VerRad {
  k: number;
  b: number;
  t: string;
}

export interface Verifikation {
  key: string;
  datum: string;
  typ: string;
  text: string;
  rader: VerRad[];
  nr?: number;
  bokslut?: boolean;
  varn?: string;
  orig?: string;
  [nyckel: string]: unknown;
}

export interface ManuellVer {
  id: string;
  datum: string;
  text: string;
  bokslut: boolean;
  rader: VerRad[];
  skapad?: string;
}

export interface BokDoc {
  period: string;
  status: string;
  manuella?: ManuellVer[];
  ver?: Verifikation[];
  keys?: string[];
  [nyckel: string]: unknown;
}

export interface Pris {
  id: string;
  kat?: string;
  text: string;
  textN?: string;
  vanlig: number;
  storre: number;
  perSt?: boolean;
  mv?: number | null;
  ms?: number | null;
}

/** Appens tillstånd (S i legacy), det som 1c behöver. */
export interface FolieringState {
  arenden: Map<string, Arende>;
  fordon: Map<string, Fordon>;
  forsakring: Map<string, Forsakring>;
  kostnader: Map<string, Kostnad>;
  bokforing: Map<string, BokDoc>;
  inst: {
    foretag?: Record<string, unknown>;
    priser?: { items?: Pris[] };
    serie?: { nasta?: number | string };
    bokforing?: { rarStart?: number | string };
    [nyckel: string]: unknown;
  };
}

/** Dag, tid och slump skickas in. Motorn läser aldrig klockan. */
export interface Tid {
  /** Dagens datum ÅÅÅÅ-MM-DD (svensk tid). */
  idag: string;
  /** Nu som ISO-tid, för tidsstämplar (andrad, exporterad, skapad). */
  nu: string;
  /** Nu i millisekunder, för id. */
  nuMs: number;
  /** Slumptal 0 till 1, för id. */
  slump: () => number;
}

/** Det som ska sparas: sökväg och dokument, i samma ordning som legacy sparar. */
export type Sparning = [path: string, dokument: unknown];

/** En sparad fil (SIE). */
export interface Fil {
  namn: string;
  data: ArrayBuffer;
  mapp?: string;
}

export interface Utfall {
  spara: Sparning[];
  filer: Fil[];
  /** Meddelanden till användaren, i samma ordning som legacy visar dem. */
  meddelanden: string[];
  /** Dokument som ska tas bort (bara taBortArende). */
  taBort?: string[];
}
