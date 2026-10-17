// Avräkningsmotorn från legacy/apps/avrakning/index.html (compute). Logiken är oförändrad,
// rad för rad i samma ordning, så att flyttalen blir exakt lika. Bara typer är tillagda.
import { MAN3, deacc, fsAktiv, monthLabels, r2, ymAdd } from './hjalp';
import type { Bolag, BolagResultat, FakturaRad, Indata, Installningar, Kontroll, KundKorning, KundResultat, Manadsetiketter, PerBil, ReskontraPost, Resultat, Tal, VismaFaktura } from './types';

type ReskPost = ReskontraPost & { via?: true };
type Summerbar = 'kort' | 'refund' | 'dricks' | 'person' | 'bud' | 'utland' | 'app' | 'bro' | 'sturup' | 'cph';
type Kund = Omit<KundResultat, 'r592' | 'r593' | 'r594' | 'total' | 'taxicaller' | 'diff'>;

// S = inställningar {params, bilar[], terminaler[], kassor[], bolag[]}
// D = {tc, bamb, app, bro:{bil:antal}, sturup:{}, cph:{}, manuellt:{bolag:{forskott, oppna, rabatt}}}
export function compute(S: Installningar, D: Indata): Resultat {
  const P = S.params, period = D.tc?.period || D.period;
  const O0 = D.oresund, cphPris = O0?.kostCph && O0?.nCph ? Math.max(P.cph, Math.ceil(O0.kostCph / O0.nCph * 100) / 100) : P.cph;
  const L: Manadsetiketter = period ? monthLabels(period) : { namn: '', lang: '', vx: '' };
  const bilar = new Map<number, Record<string, unknown> & { avr: string; reg?: string }>(); S.bilar.forEach(b => bilar.set(+b.bil, { ...b, avr: (b.avr || b.bolag || '').trim() }));
  const term = new Map(S.terminaler.map(t => [String(t.id).trim(), t.bil == null || t.bil === '' ? null : +t.bil]));
  const kass = new Map(S.kassor.map(k => [+k.kassor, +k.bil]));
  const pb = new Map<number, PerBil>(); const bil = (b: number) => { if (!pb.has(b)) pb.set(b, { bil: b, kort: 0, refund: 0, dricks: 0, person: 0, bud: 0, utland: 0, app: 0, bro: 0, sturup: 0, cph: 0 }); return pb.get(b)!; };
  const kontroll: Kontroll[] = [];
  const okandTerm: Record<string, number> = {};
  for (const t of (D.bamb || [])) {
    const b = term.has(t.tid) ? term.get(t.tid) : (kass.has(t.kassor) ? kass.get(t.kassor) : t.kassor);
    if (b == null || !bilar.has(b)) { const k = '…' + t.tid.slice(-6) + ' / kassör ' + t.kassor; okandTerm[k] = (okandTerm[k] || 0) + (t.refund ? -t.belopp : t.belopp); continue; }
    const x = bil(b);
    // kort = netto (köp minus återbetalningar), refund = återbetalt belopp
    if (t.refund) { x.kort -= t.belopp; x.refund += t.belopp; } else { x.kort += t.belopp; x.dricks += t.dricks; }
  }
  for (const t of (D.tc?.trips || [])) bil(t.bil as number)[t.typ] += t.belopp;
  for (const a of (D.app?.app || [])) bil(a.bil).app += a.belopp;
  for (const k of ['bro', 'sturup', 'cph'] as const) for (const [b, n] of Object.entries(D[k] || {})) if (n) bil(+b)[k] += +n;
  for (const [b, pr] of Object.entries(D.sturupRad || {})) if (!(D.sturup && D.sturup[b] != null)) bil(+b).sturup += Object.values(pr).reduce((a, n) => a + n, 0);
  for (const [b, x] of pb) {
    const inf = bilar.get(b);
    x.reg = inf?.reg || ''; x.bolag = inf ? inf.avr : '(saknas i bilregistret)';
    if (!inf) kontroll.push({ niva: 'fel', typ: 'Bil saknas i bilregistret', vad: 'Bil ' + b, belopp: x.kort + x.person + x.bud + x.utland + x.app, atgard: 'Lägg till bilen under Inställningar, Bilar.' });
  }
  for (const [k, v] of Object.entries(okandTerm)) kontroll.push({ niva: 'fel', typ: 'Kortbetalningar utan bil', vad: 'Terminal ' + k, belopp: v, atgard: 'Koppla terminalen till en bil under Inställningar, Terminaler.' });

  const man = D.manuellt || {};
  const RK = D.skuldMed ? D.reskontra : null, rkBy: Record<string, ReskontraPost[]> = {};
  if (D.reskontra && !D.skuldMed) kontroll.push({ niva: 'info', typ: 'Tidigare skulder räknas inte med', vad: 'Kundreskontra ' + (D.reskontra.datum || '') + ' är inläst men används inte denna månad', belopp: null, atgard: 'Bocka i "Räkna in tidigare skulder" i ruta 6 först när ekonomen har registrerat alla betalningar i Visma.' });
  if (RK) for (const p of RK.poster) (rkBy[String(p.kn)] = rkBy[String(p.kn)] || []).push(p);
  const nrm = (s: unknown) => deacc(s).replace(/[^A-ZÅÄÖ0-9]/g, '').replace(/AKTIEBOLAG$|AB$/, '');
  const used = new Set<string>();
  const reskFor = (B: Bolag): ReskPost[] => {
    if (!RK) return [];
    const out: ReskPost[] = [];
    const kns = [String(B.kn ?? ''), ...String(B.kn2 ?? '').split(/[,\s]+/)].filter(Boolean);
    for (const k of kns) for (const p of (rkBy[k] || [])) { out.push(p); used.add(k); }
    for (const [k, L] of Object.entries(rkBy)) if (!kns.includes(k) && (!k.startsWith('9119') || !B.kn) && L[0] && nrm(L[0].namn) === nrm(B.namn)) { L.forEach(p => out.push({ ...p, via: true })); used.add(k); }
    return out.sort((a, b) => a.fdat.localeCompare(b.fdat));
  };
  const bolag: BolagResultat[] = [];
  const bolagNamn = new Set(S.bolag.map(b => b.namn));
  for (const B of S.bolag) {
    const cars = [...pb.values()].filter(x => x.bolag === B.namn).sort((a, b) => a.bil - b.bil);
    const sum = (k: Summerbar) => cars.reduce((a, x) => a + x[k], 0);
    const rows: FakturaRad[] = [];
    const add = (art: number | null, text: string, antal: Tal | undefined, apris: number, moms: number) => { const s = r2((antal as number) * apris); if (Math.abs(s) >= 0.005) rows.push({ art, text, antal: antal as Tal, apris: r2(apris), summa: s, moms }); };
    const M = man[B.namn] || {};
    // Växelavgift tas i förskott: avräkningsmånad M tar ut avgiften för M+2 (samma linje för alla).
    // Undantag vxInn (INNEVARANDE): M+1. Gratis t.o.m. jämförs mot avgiftsmånaden.
    // Efterdebitering: antal bilar som saknades på förra avräkningen (förra avgiftsmånaden), räknat per bil.
    const off = +(B.vxInn as Tal) ? 1 : 2, inn = +(B.vxInn as Tal) ? ' INNEVARANDE' : '';
    const vxP = period ? ymAdd(period, off) : null, vxPrev = period ? ymAdd(period, off - 1) : null;
    const lab = (q: string) => MAN3[+q.slice(5, 7) - 1] + q.slice(2, 4);
    const gratisFor = (p: string | null) => B.gratisTom === 'alltid' || (!!B.gratisTom && !!p && p <= B.gratisTom);
    const vxAntal = gratisFor(vxP) ? 0 : (+(B.vx as Tal) || 0), rabPct = Math.min(100, Math.max(0, +(B.vxRab as Tal) || 0));
    const vxBrutto = r2(vxAntal * P.vx * (1 - rabPct / 100));
    const vxSumma = r2(vxBrutto - (+(M.rabatt as Tal) || 0));
    const prevB = D.prevSummary ? (D.prevSummary.bolag || []).find(x => String(x.kn) === String(B.kn) || x.namn === B.namn) : null;
    const prevHar = !!(prevB && (prevB.rows || []).length);
    // Antal bilar med ordinarie växelavgift på förra avräkningen (oavsett hur månaden är skriven i texten; efterdebiteringar räknas inte)
    const nPrevVx = prevHar ? prevB!.rows!.filter(r => r.art === 1 && !/efterdeb/i.test(String(r.text))).reduce((a, r) => a + (+r.antal || 0), 0) : 0;
    const nPrevTl = prevHar ? prevB!.rows!.filter(r => r.art === 8 && !/saknades|kredit/i.test(String(r.text))).reduce((a, r) => a + (+r.antal || 0), 0) : 0;
    const ovr = (v: unknown) => v !== undefined && v !== null && v !== '';
    let nBak = vxAntal && prevHar && !gratisFor(vxPrev) ? Math.max(0, vxAntal - nPrevVx) : 0;
    if (+(M.ejBak as Tal)) nBak = 0; if (ovr(M.vxBak)) nBak = Math.max(0, +(M.vxBak as Tal) || 0);
    const bak = nBak > 0;
    if (bak) rows.push({ art: 1, text: 'Växelavgift Åkare ' + lab(vxPrev!) + inn + ' (efterdebitering)', antal: nBak, apris: P.vx, summa: r2(nBak * P.vx * (1 - rabPct / 100)), moms: 25, bak: true, ...(rabPct ? { rabattPct: rabPct } : {}) });
    if (vxAntal) rows.push({ art: 1, text: 'Växelavgift Åkare ' + lab(vxP!) + inn, antal: vxAntal, apris: P.vx, summa: vxSumma, moms: 25, rabatt: +(M.rabatt as Tal) || 0, ...(rabPct ? { rabattPct: rabPct } : {}) });
    add(8, 'Taklampa hyra', B.tl, P.tl, 25);
    let nTlBak = (+(B.tl as Tal) || 0) && prevHar && nPrevVx > 0 ? Math.max(0, (+(B.tl as Tal) || 0) - nPrevTl) : 0;
    if (ovr(M.tlBak)) nTlBak = Math.max(0, +(M.tlBak as Tal) || 0);
    if (nTlBak) { add(8, 'Taklampa hyra ' + lab(ymAdd(period!, 1)) + ' saknades', nTlBak, P.tl, 25); rows[rows.length - 1]!.bak = true; }
    if (fsAktiv(B, period)) { const nb = cars.filter(x => x.person + x.bud + x.utland + x.app !== 0).length; add(57, 'Specifikation per förare ' + L.lang, nb, P.fs ?? 99, 25); }
    add(50, 'Krediter persontransport', 1, -sum('person') / (1 + P.m6), 6);
    add(51, 'Krediter bud', 1, -sum('bud') / (1 + P.m25), 25);
    add(54, 'Krediter Utland', 1, -sum('utland'), 0);
    for (const x of cars) add(52, 'Kontokort bil ' + x.bil, 1, -(x.kort + x.refund), 0);
    for (const x of cars) if (x.refund) { add(52, 'Återbetalning kort bil ' + x.bil, 1, x.refund, 0); kontroll.push({ niva: 'info', typ: 'Återbetalning kort dras från åkaren', vad: B.namn + ', bil ' + x.bil, belopp: r2(x.refund), atgard: 'Refund i Bambora (pengarna gick tillbaka till kunden). Egen rad art 52, 0 % moms. Ligger felet hos centralen: lägg en kreditrad under Övriga rader.' }); }
    for (const x of cars) add(56, 'Dricks bil ' + x.bil, 1, -x.dricks, 0);
    add(55, 'In app payment', 1, -sum('app'), 0);
    const bas = sum('kort') + sum('person') + sum('bud') + sum('utland') + sum('app');
    add(53, 'Service avgifter', 1, P.sa * bas, 25);
    for (const x of cars) {
      const fp = D.broRad?.[x.bil];
      if (fp && Object.values(fp).reduce((a, n) => a + n, 0) === x.bro) for (const [p, n] of Object.entries(fp).sort((a, b) => +a[0] - +b[0])) add(16, 'Oresundsbron ' + L.lang + ' ' + x.bil, n, +p, 25);
      else add(16, 'Oresundsbron ' + L.lang + ' ' + x.bil, x.bro, P.bro, 25);
    }
    { const pr: Record<string, number> = {};
      for (const x of cars) {
        const fr = D.sturupRad?.[x.bil];
        if (fr && !(D.sturup && D.sturup[x.bil] != null)) for (const [a, n] of Object.entries(fr)) pr[a] = (pr[a] || 0) + n;
        else if (x.sturup) pr[P.sturup.toFixed(2)] = (pr[P.sturup.toFixed(2)] || 0) + x.sturup;
      }
      for (const [a, n] of Object.entries(pr).sort((p, q) => +p[0] - +q[0])) add(15, 'Sturup passeringar ' + L.lang, n, +a, 25);
    }
    add(17, 'CPH PARKERING', sum('cph'), cphPris, 25);
    for (const f of (D.forskottRad || []).filter(f => f.med && f.bolag === B.namn).sort((a, b) => a.datum.localeCompare(b.datum)))
      add(59, 'FÖRSKOTTSBETALNING ' + f.datum.replace(/-/g, '.'), 1, +f.belopp, 0);
    if (+(M.forskott as Tal)) add(59, 'FÖRSKOTTSBETALNING', 1, +(M.forskott as Tal), 0);
    if (+(M.oppna as Tal)) add(null, 'Övriga poster (manuellt)', 1, +(M.oppna as Tal), 0);
    for (const e of (M.extra || [])) { if (!e || !String(e.text || '').trim()) continue; const a = e.art === '' || e.art == null ? null : +e.art;
      const n0 = rows.length; add(isNaN(a as number) ? null : a, String(e.text).trim(), +(e.antal as Tal) || 1, +(e.apris as Tal) || 0, [0, 6, 25].includes(+(e.moms as Tal)) ? +(e.moms as Tal) : 25);
      if (rows.length > n0) { rows[n0]!.extra = true; if (e.skuld) rows[n0]!.skuld = true; } }
    for (const p of reskFor(B)) { add(null, 'F' + p.nr + ' (' + p.fdat + ')' + (p.via ? ' kundnr ' + p.kn : ''), 1, p.saldo, 0); rows[rows.length - 1]!.skuld = true; }
    const bas25 = rows.filter(r => r.moms === 25).reduce((a, r) => a + r.summa, 0);
    const bas6 = rows.filter(r => r.moms === 6).reduce((a, r) => a + r.summa, 0);
    const netto = rows.reduce((a, r) => a + r.summa, 0);
    const moms25 = r2(bas25 * P.m25), moms6 = r2(bas6 * P.m6);
    const brutto = netto + moms25 + moms6, att = Math.round(brutto);
    const kredit = sum('kort') + sum('person') + sum('bud') + sum('utland') + sum('app');
    const forsk = rows.filter(r => r.art === 59).reduce((a, r) => a + r.summa, 0);
    const skuld = r2(rows.filter(r => r.skuld).reduce((a, r) => a + r.summa, 0));
    bolag.push({ ...B, forsk, skuld, manad: Math.round(att - skuld), bilar: cars.map(x => x.bil), rows, netto: r2(netto), moms25, moms6, oresavr: r2(att - brutto), att,
      kredit, kort: sum('kort'), deb: sum('person') + sum('bud') + sum('utland'), app: sum('app'), bro: sum('bro'), sturup: sum('sturup'), cph: sum('cph'), aktiv: rows.length > 0 });
    if (B.gratisTom === 'alltid') kontroll.push({ niva: 'info', typ: 'Gratis växelavgift (alltid)', vad: B.namn, belopp: null, atgard: 'Avtalad gratis växelavgift utan slutdatum.' });
    else if (B.gratisTom && gratisFor(vxP)) { if (rows.length) kontroll.push({ niva: 'info', typ: 'Gratis växelavgift', vad: B.namn + ' t.o.m. ' + B.gratisTom, belopp: null, atgard: 'Avgiften för ' + L.vx + ' tas inte ut. Första avgiften tas i avräkningen två månader före första betalmånaden.' }); }
    else if (B.gratisTom && !B.vx) kontroll.push({ niva: 'fel', typ: 'Gratis växelavgift har gått ut', vad: B.namn + ' (gratis t.o.m. ' + B.gratisTom + ')', belopp: null, atgard: 'Sätt antal växelavgift under Inställningar, Bolag.' });
    else if (!B.vx && kredit > 0) kontroll.push({ niva: 'info', typ: 'Krediter men ingen växelavgift', vad: B.namn, belopp: kredit, atgard: 'Kontrollera om bolaget ska avräknas denna månad.' });
    if (fsAktiv(B, period) && rows.some(r => r.art === 57)) kontroll.push({ niva: 'info', typ: 'Spec per förare debiteras', vad: B.namn, belopp: rows.find(r => r.art === 57)!.summa, atgard: 'Art 57, antal bilar med körningar i månaden.' });
    if (bak) kontroll.push({ niva: 'info', typ: 'Växelavgift efterdebiteras', vad: B.namn + ': ' + nBak + ' st ' + lab(vxPrev!) + ' saknades i förra avräkningen' + (prevHar ? ' (där fanns ' + nPrevVx + ' av ' + vxAntal + ')' : ''), belopp: r2(nBak * P.vx * (1 - rabPct / 100)), atgard: 'Tas med som extra rad art 1. Stämmer det inte: skriv rätt antal i "Efterdebitering växelavgift, antal" under bolagets manuella poster (0 = ingen).' });
    if (nTlBak) kontroll.push({ niva: 'info', typ: 'Taklampa efterdebiteras', vad: B.namn + ': ' + nTlBak + ' st saknades i förra avräkningen (där fanns ' + nPrevTl + ' av ' + B.tl + ')', belopp: r2(nTlBak * P.tl), atgard: 'Extra rad art 8. Stämmer det inte: skriv rätt antal i "Efterdebitering taklampa, antal" (0 = ingen).' });
    if (rabPct) kontroll.push({ niva: 'info', typ: 'Rabatt på växelavgift', vad: B.namn + ': ' + rabPct + ' %', belopp: null, atgard: 'Skriv rabatten i Vismas rabattkolumn på raden art 1.' });
  }
  if (RK) {
    const [py, pm] = (period || '0000-00').split('-').map(Number) as [number, number], last = period ? new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10) : null;
    if (last && RK.datum !== last) kontroll.push({ niva: 'info', typ: 'Kundreskontran har annat datum', vad: 'Reskontradatum ' + RK.datum + ', avräkningsmånaden slutar ' + last, belopp: null, atgard: 'Ta ut kundreskontralistan per sista dagen i avräkningsmånaden.' });
    const prev: Record<string, number> | null = D.prevSummary ? Object.fromEntries((D.prevSummary.bolag || []).map(b => [b.namn, b.skuld || 0])) : null;
    for (const b of bolag) {
      if (!b.skuld) continue;
      if (b.skuld >= (P.skuldGrans || 50000)) kontroll.push({ niva: 'fel', typ: 'Hög skuld hos åkare', vad: b.namn, belopp: b.skuld, atgard: 'Obetalda avräkningar enligt kundreskontran. Följ upp betalning eller kvitta mot kommande utbetalningar.' });
      if (prev && prev[b.namn] != null && b.skuld > prev[b.namn]! + 1) kontroll.push({ niva: 'info', typ: 'Skulden har ökat', vad: b.namn + ': ' + r2(prev[b.namn]!) + ' kr blir ' + b.skuld + ' kr', belopp: r2(b.skuld - prev[b.namn]!), atgard: 'Kontrollera varför förra avräkningen inte är betald.' });
      if (b.skuld < 0) kontroll.push({ niva: 'info', typ: 'Taxi Malmö har obetald skuld till åkare', vad: b.namn, belopp: b.skuld, atgard: 'Tidigare avräkning är inte utbetald. Den räknas med i Att betala.' });
    }
    const bolagKn = new Set(S.bolag.flatMap(b => [String(b.kn ?? ''), ...String(b.kn2 ?? '').split(/[,\s]+/)]).filter(Boolean));
    for (const [k, L] of Object.entries(rkBy)) if (k.startsWith('9119') && !bolagKn.has(k) && !used.has(k)) {
      const s = r2(L.reduce((a, p) => a + p.saldo, 0)); if (s) kontroll.push({ niva: 'info', typ: 'Tidigare åkare med öppet saldo', vad: k + ' ' + L[0]!.namn + ' (' + L.length + ' fakturor, äldsta ' + L[0]!.fdat + ')', belopp: s, atgard: s > 0 ? 'Gammal fordran. Överväg inkasso eller bortskrivning.' : 'Taxi Malmö är skyldig. Kontrollera och betala ut.' });
    }
  }
  const perBolagKredit: Record<string, number> = {};
  for (const x of pb.values()) perBolagKredit[x.bolag!] = (perBolagKredit[x.bolag!] || 0) + x.kort + x.person + x.bud + x.utland + x.app;
  for (const [n, v] of Object.entries(perBolagKredit)) if (v && !bolagNamn.has(n) && n !== 'IGNORERA' && n !== '(saknas i bilregistret)')
    kontroll.push({ niva: 'fel', typ: 'Bolag saknas under Bolag', vad: n, belopp: v, atgard: 'Lägg till bolaget under Inställningar, Bolag, annars faktureras det inte.' });
  { const ej: Record<string, { n: number; s: number }> = {}; for (const e of (D.app?.ejApp || [])) { const x = ej[e.bil] = ej[e.bil] || { n: 0, s: 0 }; x.n++; x.s += +e.belopp || 0; }
    for (const [b, x] of Object.entries(ej)) kontroll.push({ niva: 'info', typ: 'Kortbetalning utanför appen (räknas inte)', vad: 'Bil ' + b + ', ' + x.n + ' st', belopp: r2(x.s), atgard: 'Troligen egen terminal. Ingen åtgärd om det stämmer.' }); }
  if (D.oresund) {
    const O = D.oresund, nb = Object.values(D.bro || {}).reduce<number>((a, x) => a + (+x || 0), 0), nc = Object.values(D.cph || {}).reduce<number>((a, x) => a + (+x || 0), 0);
    for (const [r, n] of Object.entries(O.okandaBro || {})) kontroll.push({ niva: 'fel', typ: 'Bropassager på okänt reg nr', vad: r + ', ' + n + ' passager', belopp: n * P.bro, atgard: 'Lägg till bilen med reg nr under Inställningar, Bilar, annars faktureras passagerna inte.' });
    for (const [r, n] of Object.entries(O.okandaCph || {})) kontroll.push({ niva: 'fel', typ: 'CPH-hämtningar på okänt reg nr', vad: r + ', ' + n + ' st', belopp: n * P.cph, atgard: 'Lägg till bilen med reg nr under Inställningar, Bilar.' });
    if (O.manader?.length && period && !O.manader.includes(period))
      kontroll.push({ niva: 'info', typ: 'Brofakturan avser andra månader', vad: 'Faktura ' + (O.fakturadatum || '') + ', passager ' + O.manader.join(', '), belopp: null, atgard: 'Kontrollera att det är rätt brofaktura för ' + L.namn + '.' });
    const kontor = Object.entries(O.ovriga || {}).filter(([k]) => k.startsWith('bro|')).reduce((s, [, n]) => s + n, 0) * P.bro;
    if (O.prisAndring) kontroll.push({ niva: 'info', typ: 'Öresundsbron: nytt pris', vad: 'Fakturan har ' + O.prisAndring.till + ' kr per passage (tidigare ' + O.prisAndring.fran + ' kr)', belopp: null, atgard: 'Priset under Inställningar är uppdaterat. Åkarna debiteras fakturans pris.' });
    const nbx = bolag.reduce((s, b) => s + b.rows.filter(r => r.art === 16).reduce((a, r) => a + r.summa, 0), 0);
    if (O.kostBro != null) { const d = r2(nbx + kontor - O.kostBro);
      kontroll.push({ niva: Math.abs(d) > 1 ? 'fel' : 'info', typ: 'Öresundsbron: vidarefakturerat mot kostnad', vad: nb + ' passager, ' + r2(nbx) + ' kr' + (kontor ? ' + kontorets brickor ' + kontor + ' kr' : '') + ' mot fakturans ' + O.kostBro + ' kr exkl moms', belopp: d, atgard: d ? 'Passager saknas eller är fel kopplade. Diff ska vara 0.' : 'Stämmer.' }); }
    if (O.kostCph != null) kontroll.push({ niva: r2(nc * cphPris - O.kostCph) < -1 ? 'fel' : 'info', typ: 'CPH parkering: vidarefakturerat mot kostnad', vad: nc + ' st x ' + cphPris + ' kr mot fakturans ' + O.kostCph + ' kr exkl moms', belopp: r2(nc * cphPris - O.kostCph), atgard: 'Priset per hämtning följer fakturans kostnad (avrundat uppåt), så Taxi Malmö lägger aldrig ut.' });
  }
  if (D.oresund?.ovriga) for (const [k, n] of Object.entries(D.oresund.ovriga)) { const [t, o] = k.split('|');
    kontroll.push({ niva: 'info', typ: (t === 'bro' ? 'Bropassager' : 'CPH') + ' utan bil (kontorets bricka)', vad: o + ', ' + n + ' st', belopp: n * (t === 'bro' ? P.bro : P.cph), atgard: 'Faktureras inte vidare. Kontrollera att brickan är Taxi Malmös egen.' }); }
  if (D.sturupInfo) { const I = D.sturupInfo;
    for (const o of I.okanda || []) kontroll.push({ niva: 'fel', typ: 'Sturup: bil saknas i bilregistret', vad: 'Bil ' + o.bil + ' ' + o.reg + ', ' + o.antal + ' passager', belopp: o.belopp, atgard: 'Lägg till bilen under Inställningar, Bilar, annars faktureras passagerna inte.' });
    for (const a of I.avvik || []) kontroll.push({ niva: 'info', typ: 'Sturup: reg nr och bilnummer stämmer inte', vad: a.bilFil != null ? `Filen säger bil ${a.bilFil} med ${a.regFil}, registret säger bil ${a.bil}` : `Bil ${a.bil}: filen har ${a.regFil}, registret har ${a.regReg}`, belopp: null, atgard: a.bilFil != null ? 'Avräknat på bilen enligt reg nr. Kontrollera.' : 'Avräknat på bilnumret. Uppdatera reg nr i bilregistret om bilen bytts.' });
    if (I.period && period && I.period !== period) kontroll.push({ niva: 'info', typ: 'Sturupfakturan avser annan månad', vad: 'Passager ' + I.period, belopp: null, atgard: 'Kontrollera att det är rätt fil för ' + L.namn + '.' });
  }
  // Avstämning mot Visma (facit inläst för månaden): per faktura och artikel
  if (D.visma?.bolag) {
    const AN: Record<string, string> = { 1: 'växelavgift', 8: 'taklampa', 15: 'Sturup', 16: 'bron', 17: 'CPH', 50: 'krediter person', 51: 'krediter bud', 52: 'kontokort', 53: 'serviceavgift', 54: 'krediter utland', 55: 'app', 56: 'dricks', 57: 'spec per förare', 59: 'förskott' };
    const used = new Set<object>();
    for (const b of bolag.filter(x => x.aktiv)) {
      const v: VismaFaktura | undefined = D.visma.bolag.find(x => String(x.kn) === String(b.kn)); if (!v) { kontroll.push({ niva: 'fel', typ: 'Saknas i Visma', vad: b.namn + ' (kundnr ' + b.kn + ')', belopp: b.att, atgard: 'Avräkningen finns inte bland Vismas fakturor för månaden.' }); continue; }
      used.add(v);
      const d = Math.round(b.att - v.att); if (Math.abs(d) < 2) continue;
      const sa: Record<string, number> = {}, sv: Record<string, number> = {}; for (const r of b.rows) { const k: string | number = r.art == null ? (r.skuld ? 'skuld' : 'övrigt') : r.art; sa[k] = (sa[k] || 0) + r.summa; }
      const vRows: NonNullable<VismaFaktura['rows']> = v.rows || [];
      for (const r of vRows) { const k: string | number = r.art == null ? (/^F\d{5}/.test(r.text) ? 'skuld' : 'övrigt') : r.art; sv[k] = (sv[k] || 0) + (+r.summa || 0); }
      const det = [...new Set([...Object.keys(sa), ...Object.keys(sv)])].map(k => [k, r2((sa[k] || 0) - (sv[k] || 0))] as const).filter(([, x]) => Math.abs(x) >= 1).map(([k, x]) => (AN[k] || (isNaN(+k) ? k : 'art ' + k)) + ' ' + (x > 0 ? '+' : '') + x).join(', ');
      kontroll.push({ niva: 'fel', typ: 'Avviker mot Visma', vad: b.namn + ', faktura ' + (v.nr || '') + (det ? ': ' + det + ' (exkl moms)' : ''), belopp: d, atgard: 'Sidan minus Visma, inkl moms. Rätta i Visma eller lägg mellanskillnaden på nästa månad.' });
    }
    for (const v of D.visma.bolag) if (!used.has(v)) kontroll.push({ niva: 'info', typ: 'Finns bara i Visma', vad: (v.namn || '') + ' faktura ' + (v.nr || '') + ' (kundnr ' + v.kn + ')', belopp: v.att, atgard: 'Kontrollera bolaget under Inställningar, Bolag (kundnr).' });
  }
  const tip = [...pb.values()].reduce((a, x) => a + x.dricks, 0);
  if (tip) kontroll.push({ niva: 'info', typ: 'Dricks krediteras åkarna (art 56, 0 % moms)', vad: 'Alla bilar', belopp: tip, atgard: 'Åkeriet betalar ut dricksen till föraren som lön.' });

  // Kundfakturor
  const kon = new Map<number | string | undefined, Kund>();
  for (const t of (D.tc?.trips || [])) {
    const k = t.konto?.nr; if (!kon.has(k)) kon.set(k, { nr: k, namn: t.konto?.namn, n: 0, person: 0, bud: 0, utland: 0 });
    const x = kon.get(k)!; x.n++; x[t.typ] += t.belopp;
    (x.korn = x.korn || []).push({ d: t.datum, t: t.tid, p: t.pass.replace(/\s+/g, ' ').trim().slice(0, 60), r: t.rutt.split('Info:')[0]!.split('Id:')[0]!.replace(/#\d+\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 160), b: t.bil, s: t.belopp, y: t.typ[0]!, f: String(t.forare || '').replace(/\s+/g, ' ').trim() } satisfies KundKorning);
  }
  const kund = [...kon.values()].map(x => {
    const tot = x.person + x.bud + x.utland, tcb = D.tc?.fakt?.[x.nr as string];
    const o: KundResultat = { ...x, r592: r2(x.person / (1 + P.m6)), r593: r2(x.bud / (1 + P.m25)), r594: r2(x.utland), total: r2(tot), taxicaller: tcb ?? null, diff: tcb == null ? null : r2(tot - tcb) };
    if (o.diff) kontroll.push({ niva: 'fel', typ: 'Kundfaktura avviker mot TaxiCaller', vad: 'Konto ' + x.nr + ' ' + x.namn, belopp: o.diff, atgard: 'Kontrollera körningarna i TaxiCaller.' });
    return o;
  }).sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));

  const aktiva = bolag.filter(b => b.aktiv);
  const kpi = {
    kundTotal: r2(kund.reduce((a, k) => a + k.total, 0)), kundAntal: kund.length, korningar: (D.tc?.trips || []).length,
    kort: r2(bolag.reduce((a, b) => a + b.kort, 0)), app: r2(bolag.reduce((a, b) => a + b.app, 0)),
    vx: aktiva.reduce((a, b) => a + b.rows.filter(r => r.art === 1).reduce((s, r) => s + r.summa, 0), 0),
    serv: r2(aktiva.reduce((a, b) => a + (b.rows.find(r => r.art === 53)?.summa || 0), 0)),
    skuldPos: aktiva.reduce((a, b) => a + Math.max(0, b.skuld || 0), 0), skuldNeg: aktiva.reduce((a, b) => a + Math.min(0, b.skuld || 0), 0),
    utbet: aktiva.filter(b => b.att < 0).reduce((a, b) => a + b.att, 0), inbet: aktiva.filter(b => b.att > 0).reduce((a, b) => a + b.att, 0),
    fel: kontroll.filter(k => k.niva === 'fel').length
  };
  return { period, L, perBil: [...pb.values()].sort((a, b) => a.bil - b.bil), bolag, kund, kontroll, kpi };
}
