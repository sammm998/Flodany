// Lönebeskedet från legacy/apps/akarkassan och tripkassan (result, utbMan, utbDatum, ytd, lonOf, anstalld, ejAnstallda).
// I legacy läste funktionerna appens globala tillstånd S. Här får de tillståndet som parameter,
// och dagens år skickas in. Logiken är i övrigt oförändrad, rad för rad.
import { compute, type Variant } from './compute';
import { r2 } from './hjalp';
import { unpackTabell } from './parsers';
import { reglerFor, type LonRegler } from './regler';
import { agAvgift, skattekolumn, tabellSkatt, type AgAvgift } from './skatt';
import type { ForareManad, ForareRad, LonCfg, LonResultat, Manad, Pass, Passage, Skattetabell, Tal } from './types';

export interface Person {
  personnr?: string;
  kolumn?: number;
  engang?: Tal;
  jamkning?: Tal | null;
  tabell?: Tal;
  bank?: string;
  ytd?: { tom?: string; lon?: Tal; skatt?: Tal };
  [nyckel: string]: unknown;
}

export interface ForareInst {
  namn?: string;
  modell?: string;
  manadslon?: Tal;
  semFast?: boolean;
  slutat?: boolean;
  start?: string;
  slut?: string;
  person?: Person;
  [nyckel: string]: unknown;
}

export interface LonHist {
  utb?: string;
  brutto: number;
  skatt: number;
}

/** Appens tillstånd för en månad (S i legacy), det som lönen behöver. */
export interface LonState {
  settings: {
    cfg?: Partial<LonCfg>;
    forare: Record<string, ForareInst>;
    lonHist?: Record<string, Record<string, LonHist>>;
  };
  period?: string | null;
  month: Manad;
  shifts: Pass[];
  passages: { bro: Passage[]; stu: Passage[] };
  skatt?: Record<string, Skattetabell | string> | null;
  /** Året för inlästa skattetabeller. */
  skattAr?: Tal | null;
  /** Förra månadens kontanter per förare (ur förra månadens LDL), för kvittning mot fast lön (åkarkassan). */
  prevKont?: Record<string, number>;
  demo?: boolean;
}

export interface LoneRad {
  kod: string;
  text: string;
  antal: number;
  apris: number;
  belopp: number;
  info: boolean;
}

export interface Lonebesked {
  rader: LoneRad[];
  brutto: number;
  formon: number;
  skatt: number;
  kol: number;
  netto: number;
  ag: AgAvgift;
  fel: string[];
  ytd: { lon: number; skatt: number };
  p: Person;
}

export interface LoneVarning {
  id: string;
  typ: 'ej_anstalld' | 'kontanter_utan_lon';
  text: string;
  kontant?: number;
  forskott?: number;
}

export interface LonOpts {
  /** Dagens år, för att tolka tiosiffriga personnummer. */
  idagAr: number;
  /** Skatte- och avgiftsregler med giltighetsdatum. */
  regler?: LonRegler[];
}

const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const prevPer = (per: string) => { const y = +per.slice(0, 4), m = +per.slice(5); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); };

function sum<T>(a: T[], f: (x: T) => number) { return a.reduce((s, x) => s + (f(x) || 0), 0); }
const parseKr = (s: unknown): number => s == null ? 0 : typeof s === 'number' ? s : parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) || 0;

/** Lönefunktionerna för ett tillstånd. Motsvarar funktionerna i appens andra skript. */
export function lon(S: LonState, variant: Variant, opts: LonOpts) {
  const cfg = (): LonCfg => ({ ...variant.DEF, ...S.settings.cfg });
  const ownRegs = () => new Set(S.shifts.map(s => s.reg));
  /* Anställd under perioden: från startdatum till slutdatum. Före start räknas ingen lön, varken fast eller provision. */
  /* Åkarkassan: förra månadens kontanter kvittas mot fast lön från och med cfg.kontEfterFran. */
  const kontEfter = () => { const f = cfg().kontEfterFran; return !!(variant.kontanterManadenEfter && f && S.period && S.period >= f); };
  const anstalld = (id: string, per: string | null | undefined) => { const f = S.settings.forare[id] || {}; if (!per) return true; const fr = per + '-01', ti = per + '-31'; return (!f.start || f.start <= ti) && (!f.slut || f.slut >= fr); };

  function result(): LonResultat {
    const regs = ownRegs(); const pas = [...S.passages.bro, ...S.passages.stu].filter(p => regs.has(p.reg));
    const man: Record<string, ForareManad> = {};
    const ids = new Set([...S.shifts.map(s => s.forare), ...(variant.anstallningstid && !S.demo ? Object.entries(S.settings.forare || {}).filter(([k, f]) => f.modell === 'fast' && !f.slutat && anstalld(k, S.period)).map(([k]) => k) : [])]);
    ids.forEach(id => { const f = S.settings.forare[id] || {};
      const modell = variant.anstallningstid ? (anstalld(id, S.period) ? (f.modell || 'procent') : 'ingen') : (f.modell || 'procent');
      man[id] = { ...(S.month.forare?.[id] || {}), modell, manadslon: f.manadslon || 0, semFast: !!f.semFast };
      const mk = man[id]!; if (mk.modell === 'fast' && kontEfter() && (mk.kontant === undefined || mk.kontant === '' || mk.kontant === null)) mk.kontant = (S.prevKont || {})[id] || 0; });
    return compute(S.shifts, pas, S.settings.cfg, { forare: man, overrides: S.month.overrides }, variant);
  }

  function utbMan(mod?: string): string {
    if (!S.period) return '';
    if (variant.utbetalningPerModell && cfg().utbSamma && mod !== 'procent') return S.period;
    const y = +S.period.slice(0, 4), m = +S.period.slice(5); return m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0');
  }
  function utbDatum(c: LonCfg, m?: string): string {
    if (!variant.utbetalningPerModell) return utbMan() + '-' + String(c.utbetDag || 10).padStart(2, '0');
    const dag = m === 'procent' ? (c.utbetDagProv || variant.utbetDagProvStandard) : (c.utbetDag || variant.utbetDagStandard); return utbMan(m) + '-' + String(dag).padStart(2, '0');
  }
  const person = (id: string): Person => (S.settings.forare[id] || {}).person || {};
  const tabellFor = (nr: Tal | undefined): Skattetabell | null => { const t = S.skatt && S.skatt[String(nr || 33)]; return t ? (typeof t !== 'string' && t.B ? t : unpackTabell(t as string)) : null; };

  /* Tripkassan (ytdEfterUtbetalningsdatum): lön hittills i år räknas på utbetalningsåret (kontantprincipen, samma som
     arbetsgivardeklarationen). Provision för december betalas ut i januari och hör till det nya året. Med: tidigare
     utbetalningar samma år, i datumordning. Åkarkassan: utbetalningsmånad utan lönemodell och tidigare perioder. */
  function ytd(id: string, brutto: number, skatt: number, mod?: string, utb?: string) {
    if (variant.ytdEfterUtbetalningsdatum) utb = utb || utbDatum(cfg(), mod);
    const p = person(id), ar = variant.ytdEfterUtbetalningsdatum ? utb!.slice(0, 4) : utbMan().slice(0, 4); let lon = 0, sk = 0;
    const hist = (S.settings.lonHist || {})[id] || {};
    const bas = p.ytd && p.ytd.tom && p.ytd.tom.slice(0, 4) === ar && p.ytd.tom < S.period! ? p.ytd : null;
    if (bas) { lon += parseKr(bas.lon); sk += parseKr(bas.skatt); }
    const tidigare = (per: string, h: LonHist) => variant.ytdEfterUtbetalningsdatum
      ? per !== S.period && h.utb!.slice(0, 4) === ar && (h.utb! < utb! || (h.utb === utb && per < S.period!))
      : h.utb!.slice(0, 4) === ar && per < S.period!;
    Object.entries(hist).forEach(([per, h]) => { if (h.utb && tidigare(per, h) && (!bas || per > bas.tom!)) { lon += h.brutto; sk -= h.skatt; } });
    return { lon: r2(lon + brutto), skatt: r2(sk - skatt) };
  }

  function lonOf(r: ForareRad, c: LonCfg): Lonebesked {
    const p = person(r.id); const fel: string[] = [];
    const rader: LoneRad[] = [];
    const add = (kod: string, text: string, antal: number, apris: number, belopp: number, info?: boolean) => rader.push({ kod, text, antal, apris, belopp: r2(belopp), info: !!info });
    if (r.modell === 'procent') {
      add('020', 'Procentlön', c.procent / 100, r.exkl, r.proc);
      if (r.broApris) add('009', 'Bro, Sturup och CPH', c.broAndel / 100, -r.broApris, -r.broAvdr);
      if (r.sem) add('420', 'Semesterersättning ' + c.semester + ' %', 1, r.sem, r.sem);
      if (r.bonus) add('010', 'Bonus', 1, r.bonus, r.bonus);
      add('804', r.boltProv ? 'Inkört exkl. moms, efter plattformsavgift' : 'Inkört exkl. moms', 1, r.exkl, r.exkl, true);
      if (r.boltProv) add('806', 'Plattformsavgift Bolt/Uber, avdragen från underlaget', 1, -r.boltProv, -r.boltProv, true);
    } else if (r.modell === 'fast') {
      add('001', 'Månadslön', 1, r.fast, r.fast);
      if (r.sem) add('420', 'Semesterersättning ' + c.semester + ' %', 1, r.sem, r.sem);
      if (r.bonus) add('010', 'Bonus', 1, r.bonus, r.bonus);
    }
    (r.extra || []).filter(x => x.sida === 'brutto').forEach(x => add(x.kod, x.text, x.antal, x.apris, x.belopp));
    rader.sort((x, y) => +x.info - +y.info); // informationsrader sist
    const brutto0 = sum(rader.filter(x => !x.info), x => x.belopp);
    const brutto = Math.round(brutto0); const avr = r2(brutto - brutto0);
    if (Math.abs(avr) >= 0.005) add('990', 'Avrundning', 1, avr, avr);
    const um = variant.utbetalningPerModell ? utbMan(r.modell) : utbMan();
    const R = reglerFor(um, opts.regler);
    const ar = +um.slice(0, 4);
    const kol = p.kolumn || skattekolumn(p.personnr, ar, opts.idagAr, R);
    let skatt: number, skattTxt: string;
    const formon = r.formon || 0, und = brutto + formon;
    if (+(p.engang as number) > 0) { skatt = Math.floor(und * (p.engang as number) / 100); skattTxt = 'Engångsskatt ' + p.engang + ' %'; }
    else if (p.jamkning !== undefined && p.jamkning !== '' && p.jamkning !== null) { skatt = +p.jamkning; skattTxt = 'Skatt enligt jämkningsbeslut'; }
    else { const t = tabellFor(p.tabell || 33); if (!t) fel.push('Skattetabell ' + (p.tabell || 33) + ' saknas'); skatt = tabellSkatt(t, kol, und); skattTxt = 'Tabellskatt ' + (p.tabell || 33) + ', kolumn ' + kol; }
    (r.extra || []).filter(x => x.sida === 'formon').forEach(x => add(x.kod, x.text + variant.formonText, x.antal, x.apris, x.belopp, true));
    // Lönemodell "ingen" ger ingen utbetalning och därmed ingen skatt (inte heller jämkning).
    if (variant.ingenUtanUtbetalning && r.modell === 'ingen') skatt = 0;
    if (und > 0) add('912', skattTxt, 1, -skatt, -skatt);
    if (r.extraSkatt) { add('915', 'Frivillig extra skatt', 1, -r.extraSkatt, -r.extraSkatt); skatt = r2(skatt + r.extraSkatt); }
    (r.extra || []).filter(x => x.sida === 'skattefri' || x.sida === 'netto').forEach(x => add(x.kod, x.text + (x.sida === 'skattefri' ? ' (skattefritt)' : ''), x.antal, x.apris, x.belopp));
    const kTxt = r.modell === 'fast' && kontEfter() ? 'Kontanter i bilen ' + MANADER[+prevPer(S.period!).slice(5) - 1] + ', kvittas' : 'Kontanter i bilen, kvittas';
    if (r.kontant) add('008', kTxt, 1, -r.kontant, -r.kontant);
    if (r.forskott) add('970', 'Avdrag löneförskott', 1, -r.forskott, -r.forskott);
    const netto = r2(brutto - skatt - (r.kontant || 0) - (r.forskott || 0) + (r.skattefri || 0) + (r.nettoJust || 0));
    const ag = agAvgift(p.personnr, und, um, opts.idagAr, R);
    if (!p.personnr) fel.push('Personnummer saknas');
    if (netto > 0 && !p.bank) fel.push('Bankkonto saknas');
    if (variant.varnaSkattetabellAr && S.skattAr && String(S.skattAr) !== String(ar) && !(+(p.engang as number) > 0) && !(p.jamkning !== undefined && p.jamkning !== '' && p.jamkning !== null)) fel.push('Skattetabell för ' + ar + ' saknas (inläst: ' + S.skattAr + ')');
    const y = ytd(r.id, brutto, skatt, r.modell);
    return { rader, brutto, formon, skatt, kol, netto, ag, fel, ytd: y, p };
  }

  /* Förare som kört under månaden men ligger utanför sin anställningsperiod. De räknas inte i lönen (modell "ingen"),
     så de listas som varning. */
  const ejAnstallda = (R: LonResultat): ForareRad[] => S.demo ? [] : R.rows.filter(r => r.modell === 'ingen' && r.pass && (S.settings.forare[r.id] || {}).modell !== 'ingen');

  /* Varningar till lönen: förare med körpass utanför anställningen, och kontanter eller förskott som inte kvittas
     eftersom föraren inte får lön (ägarens beslut 2026-10-13). */
  const lonevarningar = (R: LonResultat): LoneVarning[] => {
    const kr = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' kr';
    const ut: LoneVarning[] = ejAnstallda(R).map(r => ({ id: r.id, typ: 'ej_anstalld', text: `Förare ${r.id} har körpass men ligger utanför sin anställningsperiod och räknas inte i lönen.` }));
    for (const r of R.rows) if (r.ejKvittat) {
      const delar = [r.ejKvittat.kontant ? 'kontanter ' + kr(r.ejKvittat.kontant) : '', r.ejKvittat.forskott ? 'förskott ' + kr(r.ejKvittat.forskott) : ''].filter(Boolean).join(' och ');
      ut.push({ id: r.id, typ: 'kontanter_utan_lon', kontant: r.ejKvittat.kontant, forskott: r.ejKvittat.forskott, text: `Förare ${r.id} får ingen lön för månaden. ${delar[0]!.toUpperCase() + delar.slice(1)} kvittas inte och måste hanteras för sig.` });
    }
    return ut;
  };

  return { cfg, result, utbMan, utbDatum, ytd, lonOf, anstalld, ejAnstallda, lonevarningar };
}
