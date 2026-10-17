// Kör folieringens skript ur legacy/apps/foliering/index.html i en sandlåda, utan att ändra filen.
// Hela skriptet körs (inte bara utvalda funktioner), med:
// - fasta värden för klocka och slump: new Date() utan argument, Date.now() och Math.random() ger det
//   som testet bestämt, så att id och tidsstämplar blir desamma som i den nya koden
// - ersättningar för skärm och databas: put, saveFile och toast registrerar vad som sparas och visas,
//   render och liknande gör ingenting
// - händelsehanterarna (click, input, change) fångas så att testet kan klicka och ändra fält.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIL = join(dirname(fileURLToPath(import.meta.url)), '..', 'legacy', 'apps', 'foliering', 'index.html');

export interface Klocka {
  /** Millisekunder för new Date() utan argument och Date.now(). */
  ms: number;
  /** Värdet som Math.random() ger. */
  slump: number;
}

export interface Registrering {
  spara: [string, unknown][];
  filer: { namn: string; data: ArrayBuffer; mapp?: string }[];
  meddelanden: string[];
}

export interface LegacyFoliering {
  S: Record<string, unknown> & { inst: Record<string, unknown> };
  ui: Record<string, unknown>;
  setRoute(r: { tab: string; id: string | null }): void;
  klicka(dataset: Record<string, string>, form?: Record<string, string>): Promise<void>;
  andra(el: Record<string, unknown>, form?: Record<string, string>): Promise<void>;
  skriv(el: Record<string, unknown>): void;
  rec: Registrering;
  fn: Record<string, (...a: never[]) => unknown>;
}

/** En tom DOM-nod som tål allt: läsning ger nya noder, value är tom text, anrop gör ingenting. */
function dummy(): unknown {
  const p: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === 'value' || k === 'textContent' || k === 'innerHTML' ? '' : k === 'then' || k === Symbol.toPrimitive ? undefined : k === 'length' ? 0 : p),
    set: () => true,
    apply: () => p,
  });
  return p;
}

const EXPORT = ['today', 'foretag', 'priser', 'fors', 'belopp', 'fakStatus', 'momsStatus', 'momsAttSkicka', 'momsBelopp', 'nastaFaktura', 'allaFakturor', 'openItems',
  'viewOversikt', 'esc', 'plate', 'kr', 'rarFor', 'perioder', 'forstaOppna', 'genAuto', 'efterreg', 'forsvunna', 'utkast', 'verSum', 'periodSum', 'varningar', 'bygSie', 'sieNamn',
  'fnOffert', 'fnFaktura', 'fnMoms', 'cp437', 'sieTxt', 'rowText'];

export function laddaLegacyFoliering(klocka: Klocka): LegacyFoliering {
  const html = readFileSync(FIL, 'utf8');
  const a = html.indexOf('/* ============ Grundfunktioner ============ */'), b = html.indexOf('\nboot();\n', a);
  if (a < 0 || b < a) throw new Error('Hittar inte skriptet i ' + FIL);
  const kod = html.slice(a, b);

  const RealDate = Date;
  class FastDate extends RealDate {
    constructor(...args: unknown[]) { if (args.length) super(...(args as [number])); else super(klocka.ms); }
    static now() { return klocka.ms; }
  }
  const FastMath = Object.create(Math, { random: { value: () => klocka.slump } });
  const handlers: Record<string, (e: unknown) => unknown> = {};
  const form: Record<string, string> = {};
  const document = {
    addEventListener: (typ: string, f: (e: unknown) => unknown) => { handlers[typ] = f; },
    querySelector: (sel: string) => (sel in form ? { value: form[sel], focus() {}, setSelectionRange() {} } : dummy()),
    querySelectorAll: () => [],
    activeElement: null, body: dummy(), createElement: () => dummy(),
  };
  const rec: Registrering = { spara: [], filer: [], meddelanden: [] };
  const setTimeout = (f: () => void, ms: number) => { if (ms === 500) f(); return 0; }; // saveLater sparar direkt, övriga timers (bekräftelse, fokus) körs inte

  const tillagg = `
render = () => {}; softRender = () => {}; go = () => {}; filterRows = () => {}; flashSaved = () => {}; setConn = () => {};
toast = (t) => { __rec.meddelanden.push(t); };
put = async (path, obj) => { __rec.spara.push([path, clone(obj)]); return true; };
del = async () => {};
saveFile = async (namn, data, mapp) => { __rec.filer.push({ namn, data, mapp }); return true; };
db = {};
return { S, getUi: () => ui, setRoute: r => { route = r; }, fn: { ${EXPORT.join(', ')} } };`;
  const fabrik = new Function('document', 'window', 'navigator', 'location', 'localStorage', 'setTimeout', 'clearTimeout', 'Date', 'Math', '__rec', kod + tillagg);
  const r = fabrik(document, { scrollTo() {}, claude: {} }, { clipboard: {} }, { hash: '' }, {}, setTimeout, () => {}, FastDate, FastMath, rec) as
    { S: LegacyFoliering['S']; getUi: () => Record<string, unknown>; setRoute: LegacyFoliering['setRoute']; fn: LegacyFoliering['fn'] };

  const satt = (f?: Record<string, string>) => { for (const k of Object.keys(form)) delete form[k]; Object.assign(form, f || {}); };
  return {
    S: r.S, get ui() { return r.getUi(); }, setRoute: r.setRoute, rec, fn: r.fn,
    async klicka(dataset, f) {
      satt(f);
      const el = { dataset, tagName: 'BUTTON' };
      await handlers.click!({ target: { closest: (sel: string) => (sel === '[data-act]' || sel === 'button' ? el : null) } });
    },
    async andra(el, f) { satt(f); await handlers.change!({ target: { files: [], dataset: {}, ...el } }); },
    skriv(el) { handlers.input!({ target: { dataset: {}, ...el } }); },
  };
}
