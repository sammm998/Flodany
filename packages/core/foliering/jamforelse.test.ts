// Jämförelsetester: samma påhittade ärenden och åtgärder genom gamla motorn (legacy/apps/foliering)
// och nya. Allt ska vara exakt lika, även id, tidsstämplar och SIE-filen byte för byte.
// Tidszonen sätts här i testet (inte i datorn), eftersom "idag" i legacy räknas i lokal tid.
process.env.TZ = 'Europe/Stockholm';

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as ny from './index';
import { Par, forut, idagFor, stegNamn, type Tidpunkt } from './fixtures/drivrutin';
import { ANTAL_SCENARIER, SEED, genereraStart, nastaSteg } from './fixtures/generera';
import { SCENARIER, kl, type Scenario } from './fixtures/scenarier';

const FACIT = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'facit');
type Fn = (...a: unknown[]) => unknown;

/** JSON som går att jämföra och spara: Map blir objekt, ArrayBuffer blir base64. */
const tillJson = (x: unknown): unknown => JSON.parse(JSON.stringify(x, (_k, v) => (v instanceof Map ? Object.fromEntries(v) : v instanceof ArrayBuffer ? 'base64:' + Buffer.from(v).toString('base64') : v)) ?? 'null');
// Skärmens esc och plate, kopierade ur legacy (bara för att skriva ut att göra-listan som HTML i testet).
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const plate = (r: string, lg?: boolean) => r ? `<span class="plate${lg ? ' lg' : ''}"><i>S</i><span>${esc(ny.plateTxt(r))}</span></span>` : '<span class="muted">Inget reg nr</span>';
const utanA = <T extends { a: { id: string } }>(x: T) => { const { a, ...r } = x; return { ...r, id: a.id }; };

/** Allt som läses ut ur tillståndet en viss dag, i gammal och ny. */
function kontroll(par: Par, t: Tidpunkt, medLegacy = true) {
  par.klocka.ms = t.ms; par.klocka.slump = t.slump;
  const F = par.F(t);
  const n = (() => {
    const ar = [...par.N.arenden.values()];
    const { nyckeltal, attGora } = F.oversikt();
    const bok = Object.fromEntries(F.perioder().map(p => { const V = F.utkast(p); return [p, { V, varningar: F.varningar(p, V), summa: F.periodSum(V), sie: F.bygSie(p, V) }]; }));
    return {
      idag: idagFor(t.ms),
      arenden: ar.map(a => ({ id: a.id, fak: F.fakStatus(a.faktura), moms: F.momsStatus(a), belopp: F.belopp(a), fnOffert: F.fnOffert(a), fnFaktura: a.faktura ? F.fnFaktura(a) : null, fnMoms: a.moms && a.faktura ? F.fnMoms(a) : null })),
      nasta: F.nastaFaktura(), momsAttSkicka: F.momsAttSkicka().map(a => a.id), fakturor: F.allaFakturor(), oppna: F.openItems(),
      // Att göra-listan finns i legacy bara som HTML. Den nya listan skrivs ut likadant och jämförs med HTML:en.
      oversikt: ar.length ? { kpi: nyckeltal.map(k => [k.cls, k.lbl, ny.kr(k.belopp), k.text]), antal: attGora.length, todo: attGora.slice(0, 12).map(x => ({ sev: x.sev, b: `${plate(x.reg)} ${esc(x.h)}`, s: esc(x.s), id: esc(x.id), btn: x.btn })) } : null,
      perioder: F.perioder(), forstaOppna: F.forstaOppna(), bok,
    };
  })();
  if (!medLegacy) return { gammal: null, ny: n };
  const L = par.L.fn as unknown as Record<string, Fn>, LS = par.L.S as unknown as { arenden: Map<string, ny.Arende> };
  const g = (() => {
    const ar = [...LS.arenden.values()];
    const html = String(L.viewOversikt!());
    const kpi = [...html.matchAll(/<div class="kpi ([^"]*)"><span class="lbl">(.*?)<\/span><span class="v">(.*?)<\/span><span class="s">(.*?)<\/span><\/div>/g)].map(m => [m[1], m[2], m[3], m[4]]);
    const todo = [...html.matchAll(/<li><span class="sev (\w+)"><\/span><div class="t"><b>([\s\S]*?)<\/b><small>([\s\S]*?)<\/small><\/div><button class="sm" data-act="open" data-id="([^"]*)">([^<]*)<\/button><\/li>/g)].map(m => ({ sev: m[1], b: m[2], s: m[3], id: m[4], btn: m[5] }));
    const antal = ar.length ? +((html.match(/>(\d+) punkter</) || [])[1] ?? 0) : 0;
    const bok = Object.fromEntries((L.perioder!() as string[]).map(p => { const V = L.utkast!(p); return [p, { V, varningar: L.varningar!(p, V), summa: L.periodSum!(V), sie: L.bygSie!(p, V) }]; }));
    return {
      idag: L.today!(),
      arenden: ar.map(a => ({ id: a.id, fak: L.fakStatus!(a.faktura), moms: L.momsStatus!(a), belopp: L.belopp!(a), fnOffert: L.fnOffert!(a), fnFaktura: a.faktura ? L.fnFaktura!(a) : null, fnMoms: a.moms && a.faktura ? L.fnMoms!(a) : null })),
      nasta: L.nastaFaktura!(), momsAttSkicka: (L.momsAttSkicka!() as ny.Arende[]).map(a => a.id),
      fakturor: (L.allaFakturor!() as { a: ny.Arende }[]).map(utanA), oppna: (L.openItems!() as { a: ny.Arende }[]).map(utanA),
      oversikt: ar.length ? { kpi, antal, todo } : null,
      perioder: L.perioder!(), forstaOppna: L.forstaOppna!(), bok,
    };
  })();
  return { gammal: g, ny: n };
}

/** Kör ett handskrivet scenario. Returnerar gammal och ny logg (utfall per steg, kontroller, sluttillstånd). */
async function korScenario(sc: Scenario, medLegacy = true) {
  const par = new Par(sc.start, medLegacy);
  const skapade: string[] = [];
  const logg: { gammal: unknown[]; ny: unknown[] } = { gammal: [], ny: [] };
  for (const [tid, h] of sc.handelser) {
    const t: Tidpunkt = { ms: kl(tid), slump: 0.5 };
    if (h === 'kontroll') { const k = kontroll(par, t, medLegacy); logg.gammal.push({ tid, kontroll: tillJson(k.gammal) }); logg.ny.push({ tid, kontroll: tillJson(k.ny) }); continue; }
    const s = 'id' in h && h.id.startsWith('$') ? { ...h, id: skapade[+h.id.slice(1) - 1]! } : h;
    const fore = new Set(par.N.arenden.keys());
    const r = await par.steg(s, t);
    for (const id of par.N.arenden.keys()) if (!fore.has(id)) skapade.push(id);
    logg.gammal.push({ tid, steg: s, utfall: tillJson(r.gammal.utfall) }); logg.ny.push({ tid, steg: s, utfall: tillJson(r.ny.utfall) });
    if (medLegacy) { const st = par.tillstand(); expect(tillJson(st.ny), tid).toStrictEqual(tillJson(st.gammal)); }
  }
  const st = par.tillstand();
  return { par, gammal: { logg: logg.gammal, slut: tillJson(st.gammal) }, ny: { logg: logg.ny, slut: tillJson(st.ny) } };
}

// ===== Grunden =====

describe('foliering: grund och SIE-tecken', () => {
  it('testerna körs i svensk tid', () => {
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(-60);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(-120);
  });
  it('CP437 för svenska tecken, CRLF och okända tecken', () => {
    const b = new Uint8Array(ny.cp437('ÅÄÖåäöéÉ€x\r\n'));
    expect([...b]).toEqual([143, 142, 153, 134, 132, 148, 130, 144, 63, 120, 13, 10]);
    const par = new Par({});
    const L = par.L.fn as unknown as Record<string, Fn>;
    for (const r of ['ABC12A', 'abc 12a', 'X<1>', '']) expect(plate(r)).toBe(L.plate!(r));
    expect(esc('<a href="x">\'&\'</a>')).toBe(L.esc!('<a href="x">\'&\'</a>'));
    for (const s of ['ÅÄÖ åäö é É ü Ü ø æ ñ § £ € ™ \u2013 \u2014 "citat" \\ \r\n rad', 'x'.repeat(150)]) {
      expect(Buffer.from(ny.cp437(s))).toEqual(Buffer.from(L.cp437!(s) as ArrayBuffer));
      expect(ny.sieTxt(s)).toBe(L.sieTxt!(s));
    }
  });
});

// ===== Handskrivna scenarier, plus gyllene facit =====

describe('foliering: handskrivna scenarier', () => {
  it.each(Object.keys(SCENARIER))('%s: gammal och ny ger samma resultat', async (namn) => {
    const r = await korScenario(SCENARIER[namn]!);
    expect(r.ny).toStrictEqual(r.gammal);
    if (process.env.SKRIV_FACIT) {
      const dir = join(FACIT, namn);
      mkdirSync(dir, { recursive: true });
      // Tankstreck i testdatan skrivs som \u-escape (regel i CLAUDE.md: inga tankstreck i filerna).
      writeFileSync(join(dir, 'facit.json'), JSON.stringify(r.gammal, null, 1).replace(/[\u2013\u2014]/g, c => '\\u' + c.charCodeAt(0).toString(16)) + '\n');
      for (const s of r.gammal.logg as { utfall?: { filer?: { namn: string; data: string }[] } }[])
        for (const f of s.utfall?.filer || []) writeFileSync(join(dir, f.namn), Buffer.from(f.data.slice(7), 'base64'));
    }
  });

  it.each(Object.keys(SCENARIER))('%s: nya motorn ger gyllene facit och samma SIE-filer', async (namn) => {
    const dir = join(FACIT, namn);
    expect(existsSync(join(dir, 'facit.json')), 'facit saknas, kör med SKRIV_FACIT=1').toBe(true);
    const r = await korScenario(SCENARIER[namn]!, false);
    expect(r.ny).toStrictEqual(JSON.parse(readFileSync(join(dir, 'facit.json'), 'utf8')));
    const se = readdirSync(dir).filter(f => f.endsWith('.se'));
    const filer = (r.ny.logg as { utfall?: { filer?: { namn: string; data: string }[] } }[]).flatMap(s => s.utfall?.filer || []);
    expect(filer.map(f => f.namn).sort()).toEqual([...se].sort());
    for (const f of filer) expect(Buffer.from(f.data.slice(7), 'base64').equals(readFileSync(join(dir, f.namn))), f.namn).toBe(true);
  });
});

it('fakturanumrering enligt facit', async () => {
  const fak = (r: Awaited<ReturnType<typeof korScenario>>) => Object.values((r.ny.slut as { arenden: Record<string, ny.Arende> }).arenden).map(a => [a.id, a.faktura?.nr ?? null, a.moms?.nr ?? null]);
  const m = await korScenario(SCENARIER.numrering!, false);
  // serie.nasta 1002 är lägre än högsta nr 1003: nästa faktura blir 1004, serien går till 1005.
  // Makulerad högsta faktura (1004) ger inte samma nummer igen eftersom serien är 1005.
  expect(fak(m)).toEqual([['n1', 1001, null], ['n2', 1006, 'M-1006'], ['n3', 1005, null], ['n4', 1007, null]]);
  const u = await korScenario(SCENARIER.numreringUtanSerie!, false);
  // Utan serie: makulerad högsta faktura 1002 får samma nummer igen. Därefter finns serien (1003).
  expect(fak(u)).toEqual([['u1', 1003, null], ['u2', 1002, 'M-1002']]);
});

// ===== 300 slumpade scenarier, fast seed =====

const statistik = { steg: 0, fel: 0, fakturor: 0, moms: 0, ver: 0, export: 0, sieBytes: 0, kontroller: 0, nekade: [] as string[] };

describe(`foliering: ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED})`, () => {
  const nummer = Array.from({ length: ANTAL_SCENARIER }, (_, i) => i);
  it.each(nummer)('scenario %i', async (i) => {
    const { g, start } = genereraStart(i);
    const par = new Par(start);
    let ms = new Date(2026, 7, g.heltal(1, 20), g.heltal(0, 23), g.heltal(0, 59)).getTime();
    const antal = g.heltal(15, 70);
    for (let k = 0; k < antal; k++) {
      ms += g.heltal(0, 7 * 24 * 60) * 6e4;
      const t: Tidpunkt = { ms, slump: g.r() };
      const F = par.F(t);
      const s = nastaSteg(g, par.N, F.perioder(), F.forstaOppna(), idagFor(ms));
      const r = await par.steg(s, t);
      expect(r.ny.utfall, `steg ${k}: ${JSON.stringify(s)}`).toStrictEqual(r.gammal.utfall);
      const st = par.tillstand();
      expect(st.ny, `tillstånd efter steg ${k}`).toStrictEqual(st.gammal);
      statistik.steg++;
      const fu = forut(r.ny.utfall);
      if (r.forkrav) statistik.nekade.push([stegNamn(s), fu, r.forkrav.message].join(' | '));
      else expect(fu, `steg ${k} släpps igenom av förkraven men kastar: ${JSON.stringify(s)}`).not.toBe('kastade');
      if ('fel' in r.ny.utfall) statistik.fel++;
      else for (const f of r.ny.utfall.filer) { statistik.export++; statistik.sieBytes += f.data.byteLength; }
      if (k % 10 === 9 || k === antal - 1) { const kk = kontroll(par, t); expect(kk.ny, `kontroll efter steg ${k}`).toStrictEqual(kk.gammal); statistik.kontroller++; }
    }
    for (const a of par.N.arenden.values()) { if (a.faktura) statistik.fakturor++; if (a.moms) statistik.moms++; }
    for (const d of par.N.bokforing.values()) statistik.ver += (d.ver || []).length;
  });

  it('sammanställning', () => {
    const s = statistik;
    console.log(`Foliering: ${ANTAL_SCENARIER} slumpade scenarier (seed ${SEED}), gammal och ny motor gav samma resultat i alla. ${s.steg} åtgärder (${s.fel} kastar samma fel i båda), ${s.kontroller} kontroller av översikt, påminnelser, fakturor och bokföring. ${s.fakturor} fakturor, ${s.moms} momsfakturor, ${s.export} exporterade perioder med ${s.ver} verifikationer, ${s.sieBytes} byte SIE jämförda byte för byte.`);
    const per = new Map<string, number>();
    for (const k of s.nekade) per.set(k, (per.get(k) || 0) + 1);
    console.log('Nekade av förkraven:' + String.fromCharCode(10) + [...per].sort().map(([k, v]) => v + ' | ' + k).join(String.fromCharCode(10)));
    // Fynd f: alla åtgärder som kastar i legacy nekas av förkraven (se expect i varje steg ovan).
    expect(s.nekade.filter(k => k.includes(' | kastade | ')).length).toBe(s.fel);
    expect(s.export).toBeGreaterThan(50);
    expect(s.moms).toBeGreaterThan(50);
  });
});

// ===== Kontraktet =====

describe('foliering: kitets kontrakt', () => {
  it('motorn har nyckel och version, och ändrar inte tillståndet', () => {
    expect(ny.folieringEngine.key).toBe('foliering');
    expect(ny.folieringEngine.version).toMatch(/^\d+\.\d+\.\d+$/);
    const par = new Par(SCENARIER.agareSaknas!.start, false);
    const fore = tillJson(par.N);
    const u = ny.folieringEngine.compute({ S: par.N, period: '2026-08' }, { idag: '2026-09-01', nu: '2026-09-01T08:00:00.000Z', nuMs: 0, slump: () => 0 });
    expect(tillJson(par.N)).toStrictEqual(fore);
    expect(u.bokforing?.period).toBe('2026-08');
    expect(u.fakturor).toHaveLength(1);
  });
});
