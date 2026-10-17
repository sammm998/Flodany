// Modulkitets kontrakt enligt SPEC-v3.1 avsnitt 3.2 till 3.4.

/** Textobjekt från en PDF-sida (pdf.js), y nedåt. */
export interface PdfItem {
  str: string;
  x: number;
  y: number;
}

export type FileKind = 'pdf' | 'csv' | 'xlsx' | 'txt';

/**
 * En fil som redan är uppläst i webbläsaren. Filer läses i klienten (pdf.js, SheetJS)
 * så att servern behandlar så lite personuppgifter som möjligt. Parsern får innehållet,
 * inte själva filen.
 */
export interface FileInput {
  name: string;
  kind: FileKind;
  /** PDF: textobjekt per sida. */
  pages?: PdfItem[][];
  /** CSV och Excel: rader som objekt med rubrikerna som nycklar. */
  rows?: Record<string, unknown>[];
  /** Excel: flikarnas namn. */
  sheets?: string[];
  /** Text: hela filen, eller rubrikraden för CSV. */
  text?: string;
}

/**
 * 3.2 Parserkontrakt. C är valfri kontext som modulen skickar med, till exempel
 * uppgifter från tidigare månader (kontonamn). Parsern ska fungera även utan den.
 */
export interface FileParser<T, C = unknown> {
  key: string; // 'tc', 'bamb', 'ldl' ...
  label: string; // visas för användaren
  accepts: FileKind[];
  detect(input: FileInput): number; // 0 till 1, hur säker parsern är på att filen är dess
  parse(input: FileInput, context?: C): ParseResult<T>;
  fixtures: string[]; // påhittade testfiler i packages/core/<modul>/fixtures
}

export interface ParseResult<T> {
  data: T;
  period?: string; // 'ÅÅÅÅ-MM' om filen avslöjar perioden
  summary: string; // "1 284 körningar, 61 bilar, oktober 2026"
  warnings: string[]; // svenska, skrivna som hjälp
}

/** Under den här säkerheten frågar filigenkänningen "Vilken fil skulle det vara?". */
export const DETECT_GRANS = 0.6;

/** Väljer parsern med högst detect. Under DETECT_GRANS blir svaret null. */
export function valjParser<T>(parsrar: FileParser<T>[], input: FileInput): FileParser<T> | null {
  let bast: FileParser<T> | null = null;
  let poang = 0;
  for (const p of parsrar) {
    if (!p.accepts.includes(input.kind)) continue;
    const d = p.detect(input);
    if (d > poang) {
      poang = d;
      bast = p;
    }
  }
  return poang >= DETECT_GRANS ? bast : null;
}

/** 3.3 Motorkontrakt */
export interface Engine<Input, Config, Output> {
  key: string;
  version: string; // höjs vid varje ändring av resultatet
  compute(input: Input, config: Config): Output; // ren funktion, inga sidoeffekter, ingen klocka, inget nätverk
}

/** 3.4 Kontrollregler */
export interface Finding {
  title: string;
  detail: string;
  rows: unknown[];
  amount?: number;
}

export interface Rule<Output> {
  key: string;
  level: 'fel' | 'varning' | 'info';
  check(current: Output, previous?: Output): Finding[];
}
