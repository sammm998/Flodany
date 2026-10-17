// Lönemotorn från ENG i legacy/apps/akarkassan och tripkassan (compute, matchBro, dag/kväll).
// Logiken är oförändrad, rad för rad. Skillnaderna mellan apparna styrs av Variant.
import { isoVecka, laggTillDagar, stockholmDatum, stockholmDelar, veckodag } from '../tid';
import { dstr, r2 } from './hjalp';
import { laRader } from './lonearter';
import type { ForareManad, ForareRad, KassaBil, KassaPeriod, LonCfg, LonResultat, Manad, MatchadPassage, Pass, Passage, Period } from './types';

const DEF_GEMENSAM = {
  procent: 35, semester: 12, broAndel: 35, broPris: 201, cphPris: 17.04, inklPickup: true, inklSturup: true, bomBortLon: true,
  momsKlass: [25, 12, 6, 0, 0], dagStart: 4, dagSlut: 16,
  redovForarandel: 40, agAvgift: 31.42, broMarginalMin: 20
};

export interface Variant {
  key: 'akarkassan' | 'tripkassan';
  /** Standardinställningar (ENG.DEF i appen). */
  DEF: LonCfg;
  /** Förare med fast månadslön tas med även utan körpass. */
  fastUtanPass: boolean;
  /** Förare med fast lön: kontanterna i bilen kvittas mot lönen (true) eller sätts in på banken (false). */
  kvittaKontantFastLon: boolean;
  /** Utbetalningsmånad: fast lön kan betalas samma månad (utbSamma) och provision på egen dag (utbetDagProv). */
  utbetalningPerModell: boolean;
  /** Vilka förare som räknas: tripkassan tar även med fast anställda utan pass, inom anställningstiden. */
  anstallningstid: boolean;
  /** Lönemodell "ingen": inga extra lönearter (tripkassan). */
  ingenUtanLonearter: boolean;
  /** Hittills i år räknas efter utbetalningsdatum och utbetalningsår (tripkassan). Annars efter utbetalningsmånad utan lönemodell. */
  ytdEfterUtbetalningsdatum: boolean;
  /** Lönebeskedet får ett fel när inläst skattetabell gäller ett annat år än utbetalningsåret (tripkassan). */
  varnaSkattetabellAr: boolean;
  /** Tillägg i texten för förmånsrader på lönebeskedet. */
  formonText: string;
  /** Förare med fast lön utan körpass läggs till före bropassagerna (tripkassan) eller efter (åkarkassan). Påverkar ordningen vid lika inkört. */
  fastForeBro: boolean;
  /** Utbetalningsdag när inställningen saknas: fast lön och provision. */
  utbetDagStandard: number;
  utbetDagProvStandard: number;
  /** Fast lön: förra månadens kontanter kvittas från och med cfg.kontEfterFran (åkarkassan v33). */
  kontanterManadenEfter: boolean;
  /**
   * Lönemodell "ingen" ger ingen utbetalning: kontanter och förskott kvittas inte (kontant 0, förskott 0, netto 0)
   * och listas i stället som varning (ejKvittat, lonevarningar). Ägarens beslut 2026-10-13. AVVIKER FRÅN LEGACY,
   * där kontanterna kvittas och nettot kan bli negativt. Jämförelsetesterna mot legacy kör med false.
   */
  ingenUtanUtbetalning: boolean;
}

// Åkarkassan v33 (legacy 2026-10-13): fast lön den 25:e samma månad, provision den 10:e månaden efter,
// anställningsperiod, inga lönearter för modell "ingen" och förra månadens kontanter kvittas från 2026-10.
export const AKARKASSAN: Variant = {
  key: 'akarkassan',
  DEF: { ...DEF_GEMENSAM, utbetDag: 25, utbetDagProv: 10, utbSamma: true, kontEfterFran: '2026-10' } as LonCfg,
  fastUtanPass: true,
  kvittaKontantFastLon: true,
  utbetalningPerModell: true,
  anstallningstid: true,
  ingenUtanLonearter: true,
  ytdEfterUtbetalningsdatum: true,
  varnaSkattetabellAr: true,
  formonText: ' (förmån, betalas inte ut)',
  fastForeBro: false,
  utbetDagStandard: 25,
  utbetDagProvStandard: 10,
  kontanterManadenEfter: true,
  ingenUtanUtbetalning: true,
};

export const TRIPKASSAN: Variant = {
  key: 'tripkassan',
  DEF: { ...DEF_GEMENSAM, utbetDag: 25, utbetDagProv: 7, utbSamma: true } as LonCfg,
  fastUtanPass: true,
  kvittaKontantFastLon: false,
  utbetalningPerModell: true,
  anstallningstid: true,
  ingenUtanLonearter: true,
  ytdEfterUtbetalningsdatum: true,
  varnaSkattetabellAr: true,
  formonText: '',
  fastForeBro: true,
  utbetDagStandard: 10,
  utbetDagProvStandard: 7,
  kontanterManadenEfter: false,
  ingenUtanUtbetalning: true,
};

export const VARIANTER = { akarkassan: AKARKASSAN, tripkassan: TRIPKASSAN };

export function periodOf(d: Date, cfg: LonCfg): Period { const t = stockholmDelar(d), h = t.tim + t.min / 60; return (h >= cfg.dagStart && h < cfg.dagSlut) ? 'dag' : 'natt'; }
/* Dag/kväll per Megtax-pass. Grund: passets mitt. Sedan inloggningsordningen i bilen: tar en förare över bilen
   (inloggning inom 3 tim efter förra utloggningen) och båda passen hamnat på samma sida, blir det första dagpass
   och det som tar över kvällspass. Hela passet räknas alltid till en sida, inkörningen delas aldrig vid ett klockslag.
   Indelningen returneras och skickas vidare. Den sparas aldrig mellan beräkningar (fas 2, tidigare en WeakMap på modulnivå). */
export type Perioder = Map<Pass, Period>;
const midPeriod = (s: Pass, cfg: LonCfg) => periodOf(new Date((s.a.getTime() + s.b.getTime()) / 2), cfg);
export function markPeriods(shifts: Pass[], cfg: LonCfg): Perioder {
  const PER: Perioder = new Map();
  const by: Record<string, Pass[]> = {}; shifts.forEach(s => { PER.set(s, midPeriod(s, cfg)); (by[s.reg] = by[s.reg] || []).push(s); });
  Object.values(by).forEach(l => { l.sort((x, y) => +x.a - +y.a); for (let i = 1; i < l.length; i++) {
    const x = l[i - 1]!, y = l[i]!, gap = +y.a - +x.b; if (gap < -18e5 || gap > 3 * 36e5 || x.forare === y.forare) continue;
    const px = PER.get(x), py = PER.get(y);
    if (px === 'dag' && py === 'dag' && (dstr(y.b) !== dstr(y.a) || stockholmDelar(y.b).tim >= cfg.dagSlut)) PER.set(y, 'natt');
    else if (px === 'natt' && py === 'natt' && dstr(x.a) === dstr(y.a) && stockholmDelar(x.a).tim >= cfg.dagStart && stockholmDelar(x.a).tim < cfg.dagSlut) PER.set(x, 'dag');
  } });
  return PER;
}
/** Dag eller kväll för ett pass, enligt indelningen från markPeriods (samma pass och inställningar). */
export function shiftPeriod(s: Pass, cfg: LonCfg, per: Perioder): Period { return per.get(s) || midPeriod(s, cfg); }
/** Dag eller kväll per pass-id, som skärmen Körpass visar (legacy: ENG.shiftPeriod efter compute). */
export function passPerioder(shifts: Pass[], cfg: LonCfg): Record<string, Period> {
  const per = markPeriods(shifts, cfg);
  return Object.fromEntries(shifts.map(s => [s.id, shiftPeriod(s, cfg, per)]));
}
/** Kassadagen för ett pass i svensk tid. Nattpass som börjar före dagStart hör till dagen före. */
function kassaDag(s: Pass, per: Period, cfg: LonCfg): string {
  const d = stockholmDatum(s.a);
  return per === 'natt' && stockholmDelar(s.a).tim < cfg.dagStart ? laggTillDagar(d, -1) : d;
}
export function exkl(s: Pass, cfg: LonCfg): number { let e = 0; for (let c = 0; c < 5; c++) e += (s.kontKl[c]! + s.kredKl[c]!) / (1 + cfg.momsKlass[c]! / 100); return e; }

/* Koppla passager till pass enbart på Megtax start- och sluttid för samma bil.
   1) passagen ligger inom passet, 2) annars inom marginalen före start eller efter slut (närmaste pass vinner),
   3) annars ingen förare: passagen läggs i "Passager utan förare" med närmaste pass som förslag. Ingen dag/natt-regel. */
export function matchBro(passages: Passage[], shifts: Pass[], cfg: LonCfg, overrides?: Record<string, string | null>, per: Perioder = markPeriods(shifts, cfg)): MatchadPassage[] {
  const byReg: Record<string, Pass[]> = {}; shifts.forEach(s => (byReg[s.reg] = byReg[s.reg] || []).push(s));
  const mg = (cfg.broMarginalMin || 0) * 6e4;
  const dist = (t: Date, x: Pass) => t < x.a ? +x.a - +t : t > x.b ? +t - +x.b : 0;
  return passages.map(p => {
    const key = p.ts + '|' + p.reg + '|' + p.typ;
    const o: MatchadPassage = { ...p, key, period: p.t ? periodOf(p.t, cfg) : '', shift: null, forare: null, metod: 'omatchad', forslag: null };
    const list = byReg[p.reg] || [];
    let s: Pass | null = null;
    if (p.t) {
      const t = p.t;
      const inne = list.filter(x => t >= x.a && t <= x.b).sort((x, y) => +y.a - +x.a);
      if (inne.length) { s = inne[0]!; o.metod = 'pass'; }
      else {
        const nara = list.map(x => [x, dist(t, x)] as const).sort((x, y) => x[1] - y[1]);
        const inom = nara.filter(x => x[1] <= mg);
        if (inom.length === 1 || (inom.length > 1 && inom[0]![0].forare === inom[1]![0].forare)) { s = inom[0]![0]; o.metod = 'marginal'; }
        else if (nara.length && nara[0]![1] <= 12 * 36e5) { const x = nara[0]![0]; o.forslag = { forare: x.forare, start: x.start, slut: x.slut, min: Math.round(nara[0]![1] / 6e4), annan: inom.length > 1 ? inom[1]![0].forare : null }; }
      }
    }
    if (s) { o.shift = s.id; o.forare = s.forare; o.period = shiftPeriod(s, cfg, per); } // dag/kväll enligt passet i Megtax, inte klockslaget
    if (overrides && overrides[key] !== undefined) { o.forare = overrides[key] || null; o.metod = overrides[key] ? 'manuell' : 'omatchad'; }
    return o;
  });
}

type Forare = Omit<ForareRad, 'bilar' | 'modell' | 'exklMegtax' | 'bomEx' | 'proc' | 'broAvdr' | 'broApris' | 'sem' | 'ob' | 'bonus' | 'fast' | 'brutto' | 'agAvg' | 'extra' | 'formon' | 'skattefri' | 'extraSkatt' | 'nettoJust' | 'kontant' | 'forskott' | 'boltProv'> & { bilar: Set<string> };
type Kassa = Omit<KassaPeriod, 'forare'> & { forare: Set<string> | string[] };

export function compute(shifts: Pass[], passages: Passage[] | null | undefined, cfg0: Partial<LonCfg> | null | undefined, month: Manad | null | undefined, variant: Variant): LonResultat {
  const cfg: LonCfg = { ...variant.DEF, ...(cfg0 || {}) }; month = month || {};
  const man: Record<string, ForareManad> = month.forare || {};
  const per = markPeriods(shifts, cfg);
  const bro = matchBro(passages || [], shifts, cfg, month.overrides || {}, per);
  const kost = (p: Passage) => p.typ === 'bro' ? cfg.broPris : p.typ === 'sturup' ? r2(p.belopp / 1.25) : cfg.cphPris;
  const iLon = (p: Passage) => p.typ === 'bro' || (p.typ === 'sturup' ? cfg.inklSturup : cfg.inklPickup);
  const drivers: Record<string, Forare> = {};
  const D = (id: string) => drivers[id] = drivers[id] || { id, pass: 0, tim: 0, ink: 0, exkl: 0, kont: 0, kred: 0, kontDr: 0, kredDr: 0, km: 0, betKm: 0, bom: 0, bud: 0, broN: 0, cphN: 0, stuN: 0, broSek: 0, bilar: new Set(), pay: {} };
  shifts.forEach(s => {
    const d = D(s.forare); d.pass++; d.tim += s.tim; d.ink += s.kont + s.kred; d.exkl += exkl(s, cfg);
    d.kont += s.kont; d.kred += s.kred; d.kontDr += s.kontDricks; d.kredDr += s.kredDricks; d.km += s.passKm; d.betKm += s.betKm; d.bom += s.bom || 0; d.bud += s.kontKl[0]! + s.kredKl[0]!; d.bilar.add(s.regnr);
    s.pay.forEach(p => d.pay[p.namn] = (d.pay[p.namn] || 0) + p.belopp);
  });
  const fastUtanPass = () => Object.keys(man).forEach(id => { if (man[id]!.modell === 'fast') D(id); }); // fast månadslön utan körpass
  if (variant.fastUtanPass && variant.fastForeBro) fastUtanPass();
  bro.forEach(p => { p.kost = kost(p); p.iLon = iLon(p); if (!p.forare) return; const d = D(p.forare);
    if (p.typ === 'bro') d.broN++; else if (p.typ === 'sturup') d.stuN++; else d.cphN++;
    if (p.iLon) d.broSek += p.kost; });
  if (variant.fastUtanPass && !variant.fastForeBro) fastUtanPass();
  const rows: ForareRad[] = Object.values(drivers).map(d => {
    const m = man[d.id] || {};
    const modell = m.modell || 'procent';
    const bomEx = cfg.bomBortLon ? r2(d.bom / (1 + cfg.momsKlass[2]! / 100)) : 0;
    const boltProv = r2((+(m.boltProv as number) || 0) + (+(m.uberProv as number) || 0)); const exk = r2(d.exkl - bomEx - boltProv); // plattformsavgift Bolt + Uber
    const proc = modell === 'procent' ? r2(exk * cfg.procent / 100) : 0;
    const broAvdr = modell === 'procent' ? r2(d.broSek * cfg.broAndel / 100) : 0;
    const ob = +(m.ob as number) || 0, bonus = +(m.bonus as number) || 0, fast = modell === 'fast' ? (+(m.manadslon as number) || 0) : 0;
    const extra = variant.ingenUtanLonearter && modell === 'ingen' ? [] : laRader(m.rader, cfg.lonearter, +(m.manadslon as number) || 0, cfg.lonearterEgna); const ex = (k: string) => r2(extra.filter(x => x.sida === k).reduce((a, x) => a + x.belopp, 0));
    const exBrutto = ex('brutto'), exSem = r2(extra.filter(x => x.sida === 'brutto' && x.sem).reduce((a, x) => a + x.belopp, 0));
    const sem = modell === 'procent' ? r2((proc - broAvdr + ob + exSem) * cfg.semester / 100) : (modell === 'fast' && m.semFast ? r2((fast + exSem) * cfg.semester / 100) : 0);
    const brutto = r2(proc - broAvdr + sem + ob + bonus + fast + exBrutto);
    const formon = ex('formon'), skattefri = ex('skattefri'), extraSkatt = ex('skatt'), nettoJust = ex('netto');
    const kontant = m.kontant !== undefined && m.kontant !== '' && m.kontant !== null ? +m.kontant
      : variant.kvittaKontantFastLon ? r2(d.kont)
      : modell === 'procent' ? r2(d.kont) : 0; // fast lön (tripkassan): kontanterna sätts in på banken och kvittas inte
    const forskott = +(m.forskott as number) || 0;
    // Lönemodell "ingen": ingen utbetalning, kontanter och förskott kvittas inte utan listas som varning (ingenUtanUtbetalning).
    const utanLon = variant.ingenUtanUtbetalning && modell === 'ingen';
    return { ...d, bilar: [...d.bilar], modell, exklMegtax: r2(d.exkl), bomEx, exkl: exk, proc, broAvdr, broApris: r2(d.broSek), sem, ob, bonus, fast, brutto,
      agAvg: r2((brutto + formon) * cfg.agAvgift / 100), extra, formon, skattefri, extraSkatt, nettoJust, kontant: utanLon ? 0 : kontant, forskott: utanLon ? 0 : forskott, boltProv, ink: r2(d.ink),
      ...(utanLon && (kontant || forskott) ? { ejKvittat: { kontant, forskott } } : {}) };
  }).sort((a, b) => b.ink - a.ink);

  /* Kassaredovisning per bil, dag för dag, dag/natt (som Excelmallen). */
  const bilar: Record<string, KassaBil> = {};
  shifts.forEach(s => {
    const p = shiftPeriod(s, cfg, per), ds = kassaDag(s, p, cfg);
    const b = bilar[s.reg] = bilar[s.reg] || { reg: s.reg, regnr: s.regnr, bilId: s.bilId, dagar: {} };
    const dd = b.dagar[ds] = b.dagar[ds] || { datum: ds, vecka: isoVecka(ds), wd: veckodag(ds), dag: null, natt: null };
    const c = (dd[p] = dd[p] || { kassa: 0, kont: 0, kred: 0, bro: 0, broN: 0, stu: 0, stuN: 0, forare: new Set(), pass: [] } as unknown as KassaPeriod) as unknown as Kassa;
    c.kassa += s.kont + s.kred; c.kont += s.kont; c.kred += s.kred; (c.forare as Set<string>).add(s.forare); c.pass.push(s.id);
  });
  bro.forEach(p => {
    if (!p.shift) return; const s = shifts.find(x => x.id === p.shift); if (!s) return;
    const sp = shiftPeriod(s, cfg, per);
    const c = bilar[s.reg]!.dagar[kassaDag(s, sp, cfg)]![sp]!;
    if (p.typ === 'sturup') { c.stu += p.kost!; c.stuN++; } else { c.bro += p.kost!; if (p.typ === 'bro') c.broN++; }
  });
  const andel = 1 - cfg.redovForarandel / 100;
  Object.values(bilar).forEach(b => Object.values(b.dagar).forEach(dd => (['dag', 'natt'] as const).forEach(k => {
    const c = dd[k]; if (!c) return; c.forare = [...(c.forare as unknown as Set<string>)];
    c.exBro = c.kassa - c.bro - c.stu; c.andel = c.exBro * andel; c.hosForare = c.andel + c.bro + c.stu - c.kred; // = kontant minus förarens andel
  })));
  return { cfg, rows, bro, bilar };
}
