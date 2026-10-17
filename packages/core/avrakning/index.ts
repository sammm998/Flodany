// Avräkningen enligt modulkitets kontrakt (SPEC-v3.1 avsnitt 3).
import type { Engine, FileInput, FileParser, ParseResult } from '@flodia/kit';
import { compute } from './compute';
import { groupLines, monthLabels } from './hjalp';
import { parseApp, parseBambora, parseTaxiCaller, parseTcCsv } from './parsers';
import type { AppResultat, BamboraTrans, Indata, Installningar, Resultat, Tc } from './types';

export { compute } from './compute';
export { MAN3, MANAD, deacc, fsAktiv, groupLines, monthLabels, r2, ymAdd } from './hjalp';
export { countPassages, parseApp, parseBambora, parseTaxiCaller, parseTcCsv } from './parsers';
export type * from './types';

/** Motorn. Indata är månadens filer (D), konfigurationen är inställningarna (S). */
export const avrakningEngine: Engine<Indata, Installningar, Resultat> = {
  key: 'avrakning',
  version: '1.0.0',
  compute: (input, config) => compute(config, input),
};

const nf0 = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });
const manad = (p: string | null | undefined) => (p && /^\d{4}-\d\d$/.test(p) ? ', ' + monthLabels(p).namn.toLowerCase() : '');
const ym = (s: unknown) => { const p = String(s ?? '').slice(0, 7); return /^\d{4}-\d\d$/.test(p) ? p : undefined; };
const pagesText = (pages: FileInput['pages'] = []) => pages.map(p => groupLines(p).map(r => r.items.map(i => i.str).join(' ')).join('\n')).join('\n');
const rubrik = (f: FileInput) => f.text?.split('\n')[0] ?? Object.keys(f.rows?.[0] ?? {}).join(',');
const resultat = <T>(data: T, summary: string, period?: string | null, warnings: string[] = []): ParseResult<T> =>
  ({ data, summary, warnings, ...(period ? { period } : {}) });

/** TaxiCallers fakturor per konto (PDF, "Konto #... Fakturanummer"). */
export const tcPdfParser: FileParser<Tc> = {
  key: 'tc',
  label: 'TaxiCaller, fakturor per konto (PDF)',
  accepts: ['pdf'],
  detect: (f) => {
    const txt = pagesText(f.pages?.slice(0, 2));
    if (/Körnings-id/.test(txt) && /Totalsum/.test(txt)) return 0;
    return /Konto #\d+/.test(txt) ? 0.9 : 0;
  },
  parse: (f) => {
    const tc = parseTaxiCaller(f.pages ?? []);
    const varn = tc.trips.length ? [] : ['Filen har inga körningar. Är det fakturorna från TaxiCaller?'];
    return resultat(tc, `${nf0.format(tc.trips.length)} körningar, ${Object.keys(tc.fakt).length} konton${manad(tc.period)}`, tc.period, varn);
  },
  fixtures: ['taxicaller.pdf.json'],
};

/** Kontext till tc-csv: kontonamn från tidigare månader (filen har bara kontonummer). */
export interface TcCsvKontext {
  kontonamn?: Record<string, string>;
}

/** TaxiCallers lista över debiteringskunder sparad som CSV. */
export const tcCsvParser: FileParser<Tc, TcCsvKontext> = {
  key: 'tc-csv',
  label: 'TaxiCaller, debiteringskunder (CSV)',
  accepts: ['csv', 'txt'],
  detect: (f) => (/konto Nr/i.test(rubrik(f)) && /Totalsumma/i.test(rubrik(f)) ? 0.95 : 0),
  parse: (f, context) => {
    const tc = parseTcCsv(f.rows ?? [], context?.kontonamn);
    const varn = tc.trips.length ? [] : ['Filen har inga körningar.'];
    const kr = tc.trips.reduce((a, t) => a + t.belopp, 0);
    return resultat(tc, `${nf0.format(tc.trips.length)} körningar, ${new Set(tc.trips.map(t => t.konto?.nr)).size} konton, ${nf0.format(kr)} kr${manad(tc.period)}`, tc.period, varn);
  },
  fixtures: ['taxicaller-deb.csv'],
};

/** Bamboras kortbetalningar (Excel, flik Sales). */
export const bamboraParser: FileParser<BamboraTrans[]> = {
  key: 'bamb',
  label: 'Bambora, kortbetalningar (Excel)',
  accepts: ['xlsx'],
  detect: (f) => (f.sheets?.includes('Sales') ? 0.95 : 0),
  parse: (f) => {
    const bamb = parseBambora(f.rows ?? []);
    const rf = bamb.filter(t => t.refund), nk = bamb.length - rf.length, rtot = rf.reduce((a, t) => a + t.belopp, 0);
    const tot = bamb.reduce((a, t) => a + (t.refund ? -t.belopp : t.belopp), 0);
    const p = ym(bamb[0]?.datum);
    return resultat(bamb, `${nf0.format(nk)} köp` + (rf.length ? `, ${rf.length} återbetalningar ${nf0.format(rtot)} kr` : '') + `, netto ${nf0.format(tot)} kr${manad(p)}`, p);
  },
  fixtures: ['bambora.sales.json'],
};

/** TaxiCallers appbetalningar (CSV). */
export const appParser: FileParser<AppResultat> = {
  key: 'app',
  label: 'TaxiCaller, appbetalningar (CSV)',
  accepts: ['csv', 'txt'],
  detect: (f) => {
    const h = rubrik(f);
    if (/konto Nr/i.test(h) && /Totalsumma/i.test(h)) return 0;
    if (!/Vehicle number/i.test(h)) return 0;
    return /Payment/i.test(h) ? 0.95 : 0.7;
  },
  parse: (f) => {
    const app = parseApp(f.rows ?? []);
    const varn = app.app.length ? [] : ['Filen har inga appbetalningar (Payment = app). Fel fil? Välj appbetalningarna från TaxiCaller.'];
    const p = ym(app.app[0]?.datum);
    return resultat(app, `${nf0.format(app.app.length)} appbetalningar, ${nf0.format(app.app.reduce((a, x) => a + x.belopp, 0))} kr${manad(p)}`, p, varn);
  },
  fixtures: ['app.csv'],
};

export const parsrar: FileParser<unknown>[] = [tcPdfParser, tcCsvParser, bamboraParser, appParser];
