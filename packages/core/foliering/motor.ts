// Folieringens affärslogik från legacy/apps/foliering/index.html. I legacy läste funktionerna appens
// globala tillstånd S och klockan. Här får de tillståndet och tiden som parametrar (foliering(S, tid)).
// Logiken är i övrigt oförändrad, rad för rad. Det som låg i skärmkoden (påminnelser i översikten,
// åtgärderna i klickhanteraren, fältändringar, bokföringens knappar) är utbrutet utan ändrat beteende.
import {
  BOK_START, DEF_FORETAG, DEF_PRISER, FS, KONTON, KOST_KONTO, KTYP, OFFERT_DAGAR, PAMINN_DAGAR,
  addDays, clone, cp437, daysBetween, kr, normReg, pAdd, pNamn, pSlut, parseAmount, r2, setPath, sieD, sieNamn, sieTxt, sumRows,
} from './grund';
import type { Arende, BokDoc, Faktura, FolieringState, Forsakring, Fordon, Momsfaktura, Pris, Rad, Tid, Utfall, Verifikation } from './types';
import { manadsnamn } from '../tid';
import { kontrollera, type ForkravLage } from './forkrav';

export interface AttGora {
  sev: 'bad' | 'warn' | 'info';
  o: number;
  id: string;
  reg: string;
  h: string;
  s: string;
  btn: string;
}

export interface Nyckeltal {
  lbl: string;
  belopp: number;
  text: string;
  cls: string;
}

export interface FakturaPost {
  id: string;
  typ: 'Faktura' | 'Moms';
  nr: string;
  till: string;
  belopp: number;
  datum: string;
  forfall: string;
  st: string | null;
  bd: string;
}

export interface Varning {
  niva: 'bad' | 'warn' | 'info';
  text: string;
}

export interface Periodsumma {
  int: number; kost: number; utg: number; ing: number; bank: number; res: number; moms: number;
}

export interface ManuellUtkast {
  datum: string;
  text: string;
  bokslut: boolean;
  rader: { k: number | string; d: unknown; c: unknown }[];
}

export interface FolieringVal {
  /** Kör åtgärderna utan förkrav, exakt som legacy. Bara för jämförelsetester, aldrig på servern. */
  utanForkrav?: boolean;
}

/** Logiken bunden till ett tillstånd och en tidpunkt. Åtgärderna kontrollerar läget först (forkrav.ts). */
export function foliering(S: FolieringState, tid: Tid, val: FolieringVal = {}) {
  const today = () => tid.idag;
  const foretag = () => ({ ...DEF_FORETAG, ...(S.inst.foretag || {}) }) as typeof DEF_FORETAG & Record<string, unknown>;
  const priser = (): Pris[] => (S.inst.priser?.items?.length ? S.inst.priser.items : DEF_PRISER as Pris[]);
  const fors = (id: string): Forsakring => S.forsakring.get(id) || { id, namn: id || 'Okänt bolag', epost: '', adress1: '', adress2: '', kontakt: '', kort: 'X' };
  const forsList = () => [...S.forsakring.values()].sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const arList = () => [...S.arenden.values()];
  const belopp = (a: Arende) => a.faktura ? sumRows(a.faktura.rader) : sumRows(a.offert?.rader);
  const aDatum = (a: Arende) => a.faktura?.datum || a.offert?.datum || a.skapad || '';
  function fakStatus(f: Faktura | Momsfaktura | null | undefined) { if (!f) return null; if (f.betald) return 'betald'; return f.forfall && f.forfall < today() ? 'forfallen' : 'obetald'; }
  /* Rutin: momsfakturan skickas till fordonsägaren först när försäkringsbolaget har betalat. */
  function momsStatus(a: Arende) { const m = a.moms; if (!m) return null; if (m.betald) return 'betald'; if (!m.skickad) return a.faktura?.betald ? 'ejskickad' : 'vantar'; return fakStatus(m); }
  const momsAttSkicka = () => arList().filter(a => a.faktura?.betald && !(a.moms && (a.moms.skickad || a.moms.betald))).sort((x, y) => (x.faktura!.betaldDatum || '').localeCompare(y.faktura!.betaldDatum || ''));
  function log(a: Arende, t: string) { (a.logg = a.logg || []).push({ d: today(), t }); }
  const agareInfo = (a: Arende): Fordon => S.fordon.get(normReg(a.reg)) || {};
  const momsBelopp = (a: Arende) => r2(belopp(a) * 0.25);
  function momsEfterBetalning(a: Arende) {
    if (a.moms && (a.moms.skickad || a.moms.betald)) return false;
    const F = foretag(), t = today();
    if (!a.agare) { const v = agareInfo(a); if (v.agare) a.agare = v.agare; }
    if (!a.agare) { log(a, `Momsfaktura M-${a.faktura!.nr} kan inte skapas: fordonsägare saknas`); return false; }
    a.moms = { nr: 'M-' + a.faktura!.nr, datum: t, forfall: addDays(t, +F.villkorDagar || 10), till: a.agare, betald: false, betaldDatum: '', skickad: '' };
    log(a, `Momsfaktura ${a.moms.nr} klar att skicka till ${a.agare} (${kr(momsBelopp(a), true)}), daterad ${t}`);
    return true;
  }
  function nastaFaktura() { let m = 0; for (const a of S.arenden.values()) if (a.faktura?.nr) m = Math.max(m, +a.faktura.nr); return Math.max(m + 1, +(S.inst.serie?.nasta || 0), 1001); }
  function rowText(p: Pris | undefined, n: number) { return n > 1 && p?.textN ? p.textN.replace('{n}', String(n)) : p?.text; }
  function repris(a: Arende) { const P = priser(); (a.offert.rader || []).forEach(r => { const p = P.find(x => x.id === r.pid); if (p) r.apris = a.storlek === 'storre' ? +p.storre : +p.vanlig; }); }

  /* ============ Listor ============ */
  function allaFakturor(): FakturaPost[] {
    const out: (FakturaPost & { a: Arende })[] = [];
    for (const a of S.arenden.values()) {
      if (a.faktura) out.push({ a, id: a.id, typ: 'Faktura', nr: String(a.faktura.nr), till: fors(a.forsakring).namn, belopp: belopp(a), datum: a.faktura.datum, forfall: a.faktura.forfall, st: fakStatus(a.faktura), bd: a.faktura.betaldDatum });
      if (a.moms) out.push({ a, id: a.id, typ: 'Moms', nr: a.moms.nr, till: a.moms.till, belopp: momsBelopp(a), datum: a.moms.datum, forfall: a.moms.forfall, st: momsStatus(a), bd: a.moms.betaldDatum });
    }
    return out.sort((x, y) => (y.datum || '').localeCompare(x.datum || '') || y.nr.localeCompare(x.nr)).map(x => { const { a, ...rest } = x; void a; return rest; });
  }
  function openItems() {
    const o: { id: string; typ: 'f' | 'm'; nr: string; belopp: number; fs: string }[] = [];
    for (const a of S.arenden.values()) {
      if (a.faktura && !a.faktura.betald) o.push({ id: a.id, typ: 'f', nr: String(a.faktura.nr), belopp: belopp(a), fs: a.forsakring });
      if (a.moms && a.moms.skickad && !a.moms.betald) o.push({ id: a.id, typ: 'm', nr: a.moms.nr, belopp: momsBelopp(a), fs: 'agare:' + a.agare });
    }
    return o;
  }

  /* ============ Översikt: nyckeltal och påminnelser (ur viewOversikt) ============ */
  function oversikt() {
    const L = arList(), t = today();
    const skick = L.filter(a => a.status === 'skickad'), godk = L.filter(a => a.status === 'godkand');
    const obet = L.filter(a => a.faktura && !a.faktura.betald), forf = obet.filter(a => a.faktura!.forfall < t);
    const momsOpen = L.filter(a => a.moms && a.moms.skickad && !a.moms.betald);
    const month = t.slice(0, 7);
    const betM = L.filter(a => a.faktura?.betald && (a.faktura.betaldDatum || '').slice(0, 7) === month);
    const s = (arr: Arende[]) => arr.reduce((x, a) => x + belopp(a), 0);
    const nyckeltal: Nyckeltal[] = [
      { lbl: 'Väntande offerter', belopp: s(skick), text: skick.length + ' offerter väntar på svar', cls: 'acc' },
      { lbl: 'Att fakturera', belopp: s(godk), text: godk.length + ' godkända offerter', cls: '' },
      { lbl: 'Utestående fakturor', belopp: s(obet), text: obet.length + ' fakturor ej betalda', cls: '' },
      { lbl: 'Förfallet', belopp: s(forf), text: forf.length ? forf.length + ' fakturor har passerat förfallodatum' : 'Inget förfallet', cls: forf.length ? 'hot' : '' },
      { lbl: 'Moms att få in', belopp: momsOpen.reduce((x, a) => x + momsBelopp(a), 0), text: momsOpen.length + ' momsfakturor till fordonsägare', cls: '' },
      { lbl: 'Inbetalt ' + manadsnamn(t), belopp: s(betM), text: betM.length + ' fakturor betalda', cls: '' },
    ];
    // Att göra
    const todo: (Omit<AttGora, 'id' | 'reg'> & { a: Arende })[] = [];
    for (const a of forf) { const f = a.faktura!; const pd = f.paminnelse, sen = pd && pd >= f.forfall ? daysBetween(pd, t) : null, behov = sen == null || sen >= PAMINN_DAGAR;
      todo.push({ sev: behov ? 'bad' : 'info', o: -daysBetween(f.forfall, t), a, h: behov ? `Faktura ${f.nr} är förfallen, påminnelse behövs` : `Faktura ${f.nr} förfallen, påmind ${pd}`, s: `${fors(a.forsakring).namn} · ${kr(belopp(a))} · förföll ${f.forfall} (${daysBetween(f.forfall, t)} dagar)${pd ? ' · senaste påminnelse ' + pd : ''}${behov ? '' : ' · ny påminnelse ' + addDays(pd, PAMINN_DAGAR)}`, btn: behov ? 'Påminn' : 'Öppna' }); }
    for (const a of godk) todo.push({ sev: 'warn', o: 0, a, h: 'Godkänd offert att fakturera', s: `${fors(a.forsakring).namn} · ${kr(belopp(a))}${a.offert?.godkandAv ? ' · godkänd av ' + a.offert.godkandAv : ''}`, btn: 'Fakturera' });
    for (const a of skick) { const sk = a.offert?.skickad || a.offert?.datum || t, pm = a.offert?.paminnelse, sen = pm && pm >= sk ? pm : sk, d = daysBetween(sen, t); if (d >= OFFERT_DAGAR) todo.push({ sev: 'warn', o: 10 - d, a, h: pm ? `Offert utan svar, ny påminnelse (senast ${pm})` : `Offert utan svar i ${d} dagar, påminn`, s: `${fors(a.forsakring).namn} · ${kr(belopp(a))} · skickad ${sk}${a.offert?.giltigTom && a.offert.giltigTom < t ? ' · giltighet har gått ut' : ''}`, btn: 'Påminn' }); }
    for (const a of momsAttSkicka()) todo.push({ sev: 'warn', o: -1, a, h: `Momsfaktura M-${a.faktura!.nr} ska skickas till ägaren`, s: `${a.agare || 'Fordonsägare saknas'} · moms ${kr(momsBelopp(a), true)} · ${fors(a.forsakring).namn} betalade ${a.faktura!.betaldDatum}`, btn: 'Skicka' });
    for (const a of L.filter(a => a.status === 'utkast')) todo.push({ sev: 'info', o: 5, a, h: 'Utkast som inte är skickat', s: `${fors(a.forsakring).namn} · ${kr(belopp(a))}`, btn: 'Öppna' });
    todo.sort((x, y) => ({ bad: 0, warn: 1, info: 2 }[x.sev] - { bad: 0, warn: 1, info: 2 }[y.sev]) || x.o - y.o);
    const attGora: AttGora[] = todo.map(({ a, ...x }) => ({ ...x, id: a.id, reg: a.reg }));
    return { nyckeltal, attGora };
  }

  /* ============ Bokföring ============ */
  const rarStart = () => +(S.inst.bokforing?.rarStart || 9);
  function rarFor(p: string) { const [y, m] = p.split('-').map(Number) as [number, number], s = rarStart(), sy = m >= s ? y : y - 1, st = `${sy}-${String(s).padStart(2, '0')}`; return { start: st + '-01', slut: pSlut(pAdd(st, 11)), forsta: st }; }
  function perioder() { const out: string[] = [], end = today().slice(0, 7); for (let p = BOK_START; p <= end; p = pAdd(p, 1)) out.push(p); return out; }
  const bDoc = (p: string): BokDoc | null => S.bokforing.get(p) || null;
  const last = (p: string) => bDoc(p)?.status === 'last';
  const forstaOppna = () => perioder().find(p => !last(p)) || null;
  const lastaKeys = () => new Set([...S.bokforing.values()].filter(d => d.status === 'last').flatMap(d => d.keys || []));
  const rnd = (x: number) => r2(x);
  const regTxt = (a: Arende) => normReg(a.reg);

  /* Händelser i appen som ska bli verifikationer under perioden p */
  function genAuto(p: string): Verifikation[] {
    const out: Verifikation[] = [], inP = (d: string | undefined) => d && d.slice(0, 7) === p;
    for (const a of S.arenden.values()) {
      const f = a.faktura;
      if (f?.betald && inP(f.betaldDatum)) { const b = belopp(a); out.push({ key: 'fbet:' + a.id, datum: f.betaldDatum, typ: 'auto', text: `Inbetalning faktura ${f.nr} ${regTxt(a)} skada ${a.skadenr}`, rader: [{ k: 1930, b, t: `${fors(a.forsakring).namn} faktura ${f.nr}` }, { k: 3001, b: -b, t: `Foliering faktura ${f.nr} ${regTxt(a)}` }] }); }
      const m = a.moms;
      if (m?.betald && inP(m.betaldDatum)) { const b = momsBelopp(a); out.push({ key: 'mbet:' + a.id, datum: m.betaldDatum, typ: 'auto', text: `Inbetalning momsfaktura ${m.nr} ${regTxt(a)}`, rader: [{ k: 1930, b, t: `${m.till} ${m.nr}` }, { k: 2611, b: -b, t: `Utg moms 25 % ${m.nr}` }] }); }
    }
    for (const k of S.kostnader.values()) {
      if (!inP(k.datum) || !KOST_KONTO[k.typ]) continue;
      const bel = rnd(+k.belopp || 0), mo = rnd(+(k.moms as number) || 0);
      const rader = [{ k: KOST_KONTO[k.typ]!, b: bel, t: k.beskrivning || KTYP[k.typ]! }]; if (mo) rader.push({ k: 2641, b: mo, t: 'Ingående moms' }); rader.push({ k: 1930, b: -rnd(bel + mo), t: k.leverantor || '' });
      out.push({ key: 'kost:' + k.id, datum: k.datum, typ: 'auto', text: `${KTYP[k.typ]} ${k.leverantor || ''}${k.fakturanr ? ' faktura ' + k.fakturanr : ''}`.trim(), rader, varn: 'Bokas som betald på fakturadatum. Ändra datumet i kostnaden om den betalades en annan dag.' });
    }
    // Återföring av bokslutsposter från föregående låsta period
    const pr = bDoc(pAdd(p, -1));
    if (pr?.status === 'last') for (const v of pr.ver || []) if (v.bokslut) out.push({ key: `rev:${pr.period}:${v.nr}`, datum: p + '-01', typ: 'aterforing', text: `Återföring A${v.nr} ${v.text}`.slice(0, 90), rader: v.rader.map(r => ({ k: r.k, b: -r.b, t: r.t })) });
    // Bokslut vid räkenskapsårets sista månad
    const R = rarFor(p);
    if (pSlut(p) === R.slut) {
      const sl = R.slut, rader: { k: number; b: number; t: string }[] = []; let moms = 0;
      for (const a of S.arenden.values()) {
        const f = a.faktura; if (!f || !f.datum || f.datum > sl) continue;
        if (!(f.betald && f.betaldDatum && f.betaldDatum <= sl)) { const b = belopp(a); rader.push({ k: 1510, b, t: `Faktura ${f.nr} ${regTxt(a)}` }, { k: 3001, b: -b, t: `Foliering faktura ${f.nr}` }); }
        if (!(a.moms?.betald && a.moms.betaldDatum && a.moms.betaldDatum <= sl)) moms += momsBelopp(a);
      }
      if (moms) rader.push({ k: 1510, b: rnd(moms), t: 'Moms fordonsägare, obetald' }, { k: 2611, b: -rnd(moms), t: 'Utg moms 25 %, obetald' });
      if (rader.length) out.push({ key: 'bokslut:' + p, datum: sl, typ: 'bokslut', bokslut: true, text: `Bokslut kontantmetod, obetalda kundfordringar ${sl}`, rader });
    }
    return out;
  }
  /* Händelser som hör till en låst period men som inte kom med i exporten */
  function efterreg(p: string): Verifikation[] {
    if (p !== forstaOppna()) return [];
    const keys = lastaKeys(), out: Verifikation[] = [];
    for (const q of perioder()) { if (q >= p || !last(q)) continue;
      for (const v of genAuto(q)) if (!keys.has(v.key) && v.typ === 'auto') out.push({ ...v, key: v.key, datum: p + '-01', typ: 'efterreg', text: `Efterreg. ${v.datum}: ${v.text}`.slice(0, 90), orig: v.datum }); }
    return out;
  }
  /* Bokförda händelser i låsta perioder som inte längre finns i appen (t.ex. ångrad betalning) */
  function forsvunna() {
    const out: { p: string; v: Verifikation }[] = [];
    for (const d of S.bokforing.values()) { if (d.status !== 'last') continue; const now = new Set(genAuto(d.period).map(v => v.key));
      for (const v of d.ver || []) if (/^(fbet|mbet|kost):/.test(v.key || '') && !now.has(v.key)) out.push({ p: d.period, v }); }
    return out;
  }
  const ORDNING: Record<string, number> = { aterforing: 0, efterreg: 1, auto: 2, manuell: 3, bokslut: 4 };
  function utkast(p: string): Verifikation[] {
    const d = bDoc(p);
    if (d?.status === 'last') return clone(d.ver || []);
    const keys = lastaKeys();
    const L: Verifikation[] = [...genAuto(p).filter(v => !keys.has(v.key)), ...efterreg(p), ...(d?.manuella || []).map(m => ({ ...m, key: 'man:' + m.id, typ: 'manuell' }))];
    L.sort((a, b) => a.datum.localeCompare(b.datum) || (ORDNING[a.typ]! - ORDNING[b.typ]!));
    const R = rarFor(p); let nr = 1;
    for (const q of perioder()) if (q < p && q >= R.forsta && last(q)) nr += (bDoc(q)!.ver || []).length;
    L.forEach(v => { v.nr = nr++; v.rader = v.rader.map(r => ({ k: +r.k, b: rnd(r.b), t: r.t || '' })); });
    return L;
  }
  const verSum = (v: Verifikation) => rnd(v.rader.reduce((s, r) => s + r.b, 0));
  function periodSum(V: Verifikation[]): Periodsumma {
    const s = { int: 0, kost: 0, utg: 0, ing: 0, bank: 0 };
    for (const v of V) for (const r of v.rader) { const k = +r.k;
      if (k >= 3000 && k < 4000) s.int -= r.b; else if (k >= 4000 && k < 9000) s.kost += r.b;
      if (k >= 2610 && k <= 2639) s.utg -= r.b; if (k >= 2640 && k <= 2649) s.ing += r.b; if (k === 1930) s.bank += r.b; }
    // Avrundning i samma ordning som legacy: först de fem summorna, sedan resultat och moms av de avrundade värdena.
    const a = { int: rnd(s.int), kost: rnd(s.kost), utg: rnd(s.utg), ing: rnd(s.ing), bank: rnd(s.bank) };
    return { ...a, res: rnd(a.int - a.kost), moms: rnd(a.utg - a.ing) };
  }
  function varningar(p: string, V: Verifikation[]): [string, string][] {
    const w: [string, string][] = [], inP = (d: string | undefined) => d && d.slice(0, 7) === p;
    V.filter(v => Math.abs(verSum(v)) > 0.005).forEach(v => w.push(['bad', `Verifikation A${v.nr} balanserar inte (diff ${kr(verSum(v), true)}).`]));
    for (const a of S.arenden.values()) { if (a.faktura?.betald && !a.faktura.betaldDatum) w.push(['bad', `Faktura ${a.faktura.nr} är markerad betald men saknar betaldatum, den kommer inte med.`]); }
    const jobb = arList().filter(a => a.faktura && inP(a.faktura.utfort || a.faktura.datum));
    if (jobb.length && !V.some(v => v.typ !== 'aterforing' && v.rader.some(r => +r.k === 7010))) w.push(['warn', `${jobb.length} jobb utförda i perioden men ingen lön bokad. Lägg in löneutbetalningen som verifikation när lönen betalas (eller som upplupen lön i bokslutet).`]);
    V.filter(v => v.typ === 'efterreg').forEach(v => w.push(['warn', `A${v.nr}: händelsen ${v.orig} hör till en låst period och bokas nu som efterregistrering.`]));
    V.filter(v => v.varn).forEach(v => w.push(['info', `A${v.nr}: ${v.varn}`]));
    if (p === forstaOppna()) forsvunna().forEach(x => w.push(['bad', `${pNamn(x.p)} A${x.v.nr} (${x.v.text}) är exporterad men händelsen finns inte längre i appen. Rätta med en manuell verifikation.`]));
    if (pSlut(p) === rarFor(p).slut) w.push(['info', 'Räkenskapsårets sista månad: kontrollera upplupen lön och andra skulder per ' + pSlut(p) + ' och lägg in dem som manuell verifikation markerad som bokslut.']);
    return w;
  }

  /* SIE4I: teckentabell PC8 (CP437), radslut CRLF */
  function bygSie(p: string, V: Verifikation[]): ArrayBuffer {
    const F = foretag(), R = rarFor(p), gen = sieD(today());
    const used = [...new Set(V.flatMap(v => v.rader.map(r => +r.k)))].sort((a, b) => a - b);
    const L = ['#FLAGGA 0', '#FORMAT PC8', '#SIETYP 4', '#PROGRAM "Foliering Demo" 1.0', '#GEN ' + gen, '#FNAMN ' + sieTxt(F.namn), '#ORGNR ' + F.orgnr, `#RAR 0 ${sieD(R.start)} ${sieD(R.slut)}`, '#KPTYP BAS2014', '#VALUTA SEK'];
    used.forEach(k => L.push(`#KONTO ${k} ${sieTxt(KONTON[k] || 'Konto ' + k)}`));
    V.forEach(v => { L.push(`#VER A ${v.nr} ${sieD(v.datum)} ${sieTxt(v.text)} ${gen}`, '{'); v.rader.forEach(r => L.push(`#TRANS ${r.k} {} ${(+r.b).toFixed(2)} ${sieD(v.datum)} ${sieTxt(r.t)}`)); L.push('}'); });
    return cp437(L.join('\r\n') + '\r\n');
  }

  /* ============ Åtgärder (ur klickhanteraren, change- och input-hanterarna och bokAct) ============ */
  const nytt = (): Utfall => ({ spara: [], filer: [], meddelanden: [] });
  function saveA(a: Arende, u: Utfall) { a.andrad = tid.nu; S.arenden.set(a.id, a); u.spara.push(['arenden/' + a.id, clone(a)]); }
  const put = (u: Utfall, path: string, obj: unknown) => { u.spara.push([path, clone(obj)]); };
  const atgard = (fn: (u: Utfall, t: string) => void): Utfall => { const u = nytt(); fn(u, today()); return u; };

  const ratt = {
    nyttArende: () => atgard(u => {
      const fid = S.forsakring.has('lf') ? 'lf' : (forsList()[0]?.id || '');
      const n: Arende = { id: 'a' + tid.nuMs.toString(36) + tid.slump().toString(36).slice(2, 6), reg: '', skadenr: '', forsakring: fid, agare: '', bil: null, storlek: 'vanlig', skadedatum: '', notering: '', status: 'utkast',
        offert: { datum: today(), giltigTom: addDays(today(), +foretag().giltighet || 30), rader: [], godkandAv: '' }, faktura: null, moms: null, logg: [{ d: today(), t: 'Ärendet skapat' }], skapad: today() };
      S.arenden.set(n.id, n); saveA(n, u);
    }),
    egenRad: (a: Arende) => atgard(u => { a.offert.rader.push({ text: 'Foliering ', antal: 1, apris: 0 }); saveA(a, u); }),
    taBortRad: (a: Arende, i: number) => atgard(u => { a.offert.rader.splice(i, 1); saveA(a, u); }),
    offertSkickad: (a: Arende) => atgard((u, t) => { a.status = 'skickad'; a.offert.skickad = t; log(a, 'Offert skickad till ' + fors(a.forsakring).namn + ' (' + kr(belopp(a)) + ')'); saveA(a, u); u.meddelanden.push('Offerten är markerad som skickad.'); }),
    godkand: (a: Arende, vem: string) => atgard(u => { const who = vem.trim(); a.status = 'godkand'; a.offert.godkandAv = who; log(a, 'Offert godkänd' + (who ? ' av ' + who : '')); saveA(a, u); }),
    avslag: (a: Arende) => atgard(u => { a.status = 'avslag'; log(a, 'Offerten fick avslag'); saveA(a, u); }),
    ateroppna: (a: Arende) => atgard(u => { a.status = 'skickad'; log(a, 'Ärendet återöppnat'); saveA(a, u); }),
    skapaFaktura: (a: Arende) => atgard((u, t) => {
      const nr = nastaFaktura(), F = foretag();
      if (a.status === 'skickad' || a.status === 'utkast') log(a, 'Offert godkänd');
      a.faktura = { nr, datum: t, forfall: addDays(t, +F.villkorDagar || 10), utfort: t, rader: clone(a.offert.rader.map(r => ({ text: r.text, antal: +r.antal, apris: +r.apris }))), betald: false, betaldDatum: '', paminnelse: '' };
      a.status = 'fakturerad'; log(a, `Faktura ${nr} skapad (${kr(belopp(a))}), förfaller ${a.faktura.forfall}`);
      saveA(a, u); if (+(S.inst.serie?.nasta || 0) <= nr) put(u, 'installningar/serie', { nasta: nr + 1 });
      u.meddelanden.push(`Faktura ${nr} skapad. Registret är uppdaterat.`);
    }),
    betald: (a: Arende, datum?: string) => atgard((u, t) => { const d = datum || t; a.faktura!.betald = true; a.faktura!.betaldDatum = d; a.status = 'betald'; log(a, `Faktura ${a.faktura!.nr} betald ${d}`); const nm = momsEfterBetalning(a); saveA(a, u); if (nm) u.meddelanden.push(`Momsfaktura ${a.moms!.nr} är klar att skicka till ${a.agare}.`); }),
    angraBetalning: (a: Arende) => atgard(u => { a.faktura!.betald = false; a.faktura!.betaldDatum = ''; a.status = 'fakturerad'; log(a, `Betalning av faktura ${a.faktura!.nr} ångrad`); saveA(a, u); }),
    makulera: (a: Arende) => atgard(u => { log(a, `Faktura ${a.faktura!.nr} makulerad`); a.faktura = null; a.moms = null; a.status = 'godkand'; saveA(a, u); }),
    skapaMoms: (a: Arende) => atgard((u, t) => { const F = foretag(); a.moms = { nr: 'M-' + a.faktura!.nr, datum: t, forfall: addDays(t, +F.villkorDagar || 10), till: a.agare, betald: false, betaldDatum: '', skickad: '' }; log(a, `Momsfaktura ${a.moms.nr} skapad till ${a.agare} (${kr(momsBelopp(a), true)})`); saveA(a, u); }),
    momsBetald: (a: Arende, datum?: string) => atgard((u, t) => { const d = datum || t; a.moms!.betald = true; a.moms!.betaldDatum = d; log(a, `Momsfaktura ${a.moms!.nr} betald ${d}`); saveA(a, u); }),
    angraMomsBetalning: (a: Arende) => atgard(u => { a.moms!.betald = false; a.moms!.betaldDatum = ''; log(a, `Betalning av ${a.moms!.nr} ångrad`); saveA(a, u); }),
    anteckning: (a: Arende, text: string) => atgard(u => { const v = text.trim(); if (!v) return; log(a, v); saveA(a, u); }),
    offertPaminnelse: (a: Arende) => atgard((u, t) => { a.offert.paminnelse = t; log(a, `Påminnelse om offerten skickad till ${fors(a.forsakring).namn} (${kr(belopp(a))})`); saveA(a, u); u.meddelanden.push('Noterat i historiken.'); }),
    fakturaSkickad: (a: Arende) => atgard(u => { log(a, `Faktura ${a.faktura!.nr} skickad till ${fors(a.forsakring).namn}`); saveA(a, u); u.meddelanden.push('Noterat i historiken.'); }),
    momsSkickad: (a: Arende) => atgard((u, t) => { a.moms!.skickad = t; delete a.moms!.importerad; log(a, `Momsfaktura ${a.moms!.nr} skickad till ${a.moms!.till}`); saveA(a, u); u.meddelanden.push('Noterat i historiken.'); }),
    paminnelseNoterad: (a: Arende) => atgard((u, t) => { a.faktura!.paminnelse = t; log(a, `Påminnelse skickad för faktura ${a.faktura!.nr}`); saveA(a, u); u.meddelanden.push('Påminnelsen är noterad.'); }),

    /** Rad ur prislistan (change på #addPris). */
    laggTillPris: (a: Arende, pid: string) => atgard(u => {
      const p = priser().find(x => x.id === pid); if (!p) return;
      a.offert.rader.push({ pid: p.id, text: p.text, antal: 1, apris: a.storlek === 'storre' ? +p.storre : +p.vanlig }); saveA(a, u);
    }),
    /** Val eller datum i ärendet (change på select och date). */
    valtFalt: (a: Arende, f: string, value: string) => atgard(u => {
      setPath(a, f, value);
      if (f === 'storlek') { repris(a); log(a, 'Storlek ändrad till ' + (value === 'storre' ? 'större bil' : 'vanlig bil') + ', priser uppdaterade'); }
      if (f === 'offert.datum' && value) a.offert.giltigTom = addDays(value, +foretag().giltighet || 30);
      if (f === 'faktura.datum' && value) a.faktura!.forfall = addDays(value, +foretag().villkorDagar || 10);
      saveA(a, u);
    }),
    /** Textfält i ärendet (input, sparas efter en stund), och för reg nr även uppslag i fordonsregistret (change). */
    textFalt: (a: Arende, f: string, value: string) => atgard(u => {
      let v: unknown = value; if (f === 'reg') v = normReg(v); if (f === 'bil') v = v ? +(v as string) || v : null;
      setPath(a, f, v); saveA(a, u);
    }),
    /** Ärendet sparas när skadenr, ägare eller bil lämnas (change). */
    spara: (a: Arende) => atgard(u => { saveA(a, u); }),
    regAndrat: (a: Arende, value: string) => atgard(u => {
      const v = S.fordon.get(normReg(value));
      if (v) { if (!a.agare) a.agare = v.agare || ''; if (a.bil == null || a.bil === '') a.bil = v.bil ?? null; }
      saveA(a, u);
    }),
    /** Offertrad: text, antal eller pris (input). */
    radFalt: (a: Arende, i: number, falt: 'text' | 'antal' | 'apris', value: string) => atgard(u => {
      const r: Rad | undefined = a.offert.rader[i]; if (!r) return;
      if (falt === 'text') r.text = value;
      else { const v = parseAmount(value); r[falt] = v ?? 0;
        if (falt === 'antal' && r.pid) { const p = priser().find(x => x.id === r.pid); if (p?.textN) r.text = rowText(p, r.antal)!; } }
      saveA(a, u);
    }),

    /** Ta bort ärendet. I legacy raderade knappen direkt i databasen (delA). Förkrav: ingen faktura (fas 2, beslut 4). */
    taBortArende: (a: Arende) => atgard(u => { S.arenden.delete(a.id); (u.taBort ??= []).push('arenden/' + a.id); u.meddelanden.push('Ärendet är borttaget.'); }),

    /** Manuell verifikation i en öppen period (bokAct bmSave). */
    manuellVerifikation: (p: string, bm: ManuellUtkast) => atgard(u => {
      const rader = bm.rader.filter(r => r.k && (parseAmount(r.d) || parseAmount(r.c))).map(r => ({ k: +r.k, b: rnd((parseAmount(r.d) || 0) - (parseAmount(r.c) || 0)), t: '' }));
      if (!bm.text.trim()) { u.meddelanden.push('Skriv en text för verifikationen.'); return; }
      if (!bm.datum || bm.datum.slice(0, 7) !== p) { u.meddelanden.push('Datumet ska ligga i ' + pNamn(p) + '.'); return; }
      if (rader.length < 2 || Math.abs(rader.reduce((s, r) => s + r.b, 0)) > 0.005) { u.meddelanden.push('Verifikationen balanserar inte.'); return; }
      rader.forEach(r => r.t = bm.text.trim());
      const d: BokDoc = clone(bDoc(p) || { period: p, status: 'oppen', manuella: [] }); d.manuella = d.manuella || [];
      d.manuella.push({ id: 'm' + tid.nuMs.toString(36), datum: bm.datum, text: bm.text.trim(), bokslut: !!bm.bokslut, rader, skapad: tid.nu });
      S.bokforing.set(p, d); put(u, 'bokforing/' + p, d); u.meddelanden.push('Verifikationen är sparad i ' + pNamn(p) + '.');
    }),
    /** Export och låsning av perioden (bokAct bokExport, efter bekräftelse). */
    exporteraPeriod: (p: string) => atgard(u => {
      if (p !== forstaOppna() || last(p)) return;
      const V = utkast(p); if (!V.length || V.some(v => Math.abs(verSum(v)) > 0.005)) { u.meddelanden.push('Verifikationerna balanserar inte.'); return; }
      u.filer.push({ namn: sieNamn(p), data: bygSie(p, V), mapp: 'Bokföring' });
      const prev = bDoc(p) || ({} as Partial<BokDoc>);
      const d: BokDoc = { period: p, status: 'last', exporterad: tid.nu, fil: sieNamn(p), manuella: prev.manuella || [], keys: V.map(v => v.key), summa: periodSum(V),
        ver: V.map(v => ({ nr: v.nr, datum: v.datum, text: v.text, key: v.key, typ: v.typ, bokslut: !!(v.bokslut || v.typ === 'bokslut'), rader: v.rader })) };
      S.bokforing.set(p, d); put(u, 'bokforing/' + p, d); u.meddelanden.push(pNamn(p) + ' är exporterad och låst.');
    }),
  };

  /* Förkraven (fynd f): varje åtgärd kontrollerar läget innan den körs och kastar AtgardsFel. */
  const lage: ForkravLage = {
    idag: today(), priser, forsakringFinns: id => S.forsakring.has(id), momsStatus, last, forstaOppna, pSlut,
    harRodaPunkter: p => varningar(p, utkast(p)).some(w => w[0] === 'bad'),
  };
  const atgarder: typeof ratt = val.utanForkrav ? ratt : Object.fromEntries(Object.entries(ratt).map(([namn, fn]) =>
    [namn, (...args: unknown[]) => { kontrollera(lage, namn, args); return (fn as (...a: unknown[]) => Utfall)(...args); }])) as typeof ratt;

  /* Filnamn för PDF */
  const fnOffert = (a: Arende) => `offert_${fors(a.forsakring).kort || 'X'}_${String(a.skadenr || '').replace(/[^\w-]/g, '')}_${normReg(a.reg)}.pdf`;
  const fnFaktura = (a: Arende) => `faktura_${a.faktura!.nr}_${normReg(a.reg)}_${String(a.skadenr || '').replace(/[^\w-]/g, '')}.pdf`;
  const fnMoms = (a: Arende) => `moms_${a.moms!.nr}_${normReg(a.reg)}_fak${a.faktura!.nr}.pdf`;

  return {
    foretag, priser, fors, forsList, arList, belopp, aDatum, fakStatus, momsStatus, momsAttSkicka, momsBelopp, agareInfo, momsEfterBetalning, nastaFaktura, rowText, repris, log,
    allaFakturor, openItems, oversikt,
    rarFor, perioder, forstaOppna, genAuto, efterreg, forsvunna, utkast, verSum, periodSum, varningar, bygSie,
    atgarder, fnOffert, fnFaktura, fnMoms, FS,
  };
}
