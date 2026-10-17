// Slumpade, påhittade scenarier för folieringen. Fast seed: samma scenarier vid varje körning.
// Varje scenario är ett starttillstånd och en följd av åtgärder över några månader.
// Åtgärderna väljs efter ärendets status, så att flödet går framåt, men ibland väljs en åtgärd
// som inte passar (då ska gammal och ny göra samma sak, även om det blir fel).
import { slump } from '../../avrakning/fixtures/generera';
import { DEF_PRISER } from '../grund';
import type { FolieringState } from '../types';
import type { Start, Steg } from './drivrutin';

export const SEED = 20261013;
export const ANTAL_SCENARIER = 300;
const pad = (n: number) => String(n).padStart(2, '0');

export function genereraStart(nr: number) {
  const g = slump(SEED + nr);
  const forsakring: Record<string, Record<string, unknown>> = {};
  for (let i = 0, n = g.heltal(1, 4); i < n; i++) forsakring[i === 0 && g.chans(0.5) ? 'lf' : 'f' + (i + 1)] = { namn: 'Försäkring ' + (i + 1) + ' AB', kort: 'F' + (i + 1), kontakt: g.chans(0.7) ? 'Kontakt ' + (i + 1) : '', epost: 'skada' + (i + 1) + '@example.se' };
  const fordon: Record<string, Record<string, unknown>> = {};
  for (let i = 0, n = g.heltal(0, 8); i < n; i++) { const reg = 'ABC' + pad(10 + i) + String.fromCharCode(65 + i); fordon[reg] = { reg, bil: g.chans(0.7) ? 650 + i : null, agare: g.chans(0.75) ? 'Ägare ' + (i + 1) + (g.chans(0.5) ? ' AB' : '') : '', epost: '' }; }
  const inst: Record<string, unknown> = {};
  if (g.chans(0.4)) inst.foretag = { villkorDagar: g.val([10, 30, '15', 0, '']), giltighet: g.val([30, 14, '20']), ...(g.chans(0.3) ? { namn: 'Folie Ö "Exempel" AB' } : {}) };
  if (g.chans(0.3)) inst.priser = { items: DEF_PRISER.filter(() => g.chans(0.7)).map(p => ({ ...p, vanlig: g.chans(0.3) ? p.vanlig + 250.5 : p.vanlig, storre: g.chans(0.3) ? String(p.storre) : p.storre })) };
  if (g.chans(0.4)) inst.serie = { nasta: g.val([500, 1001, 1050, '1200', 0]) };
  if (g.chans(0.4)) inst.bokforing = { rarStart: g.val([9, 1, '5', 12]) };
  const kostnader: Record<string, Record<string, unknown>> = {};
  for (let i = 0, n = g.heltal(0, 10); i < n; i++) kostnader['k' + i] = {
    datum: `${g.val([2026, 2026, 2027])}-${pad(g.heltal(1, 12))}-${pad(g.heltal(1, 28))}`, typ: g.val(['material', 'ul', 'ovrigt', 'lon', 'okand']),
    leverantor: g.chans(0.8) ? 'Leverantör ' + i + ' AB' : '', beskrivning: g.chans(0.5) ? 'Beskrivning ' + i : '', fakturanr: g.chans(0.5) ? String(g.heltal(100, 999)) : '',
    belopp: g.chans(0.8) ? g.ore(10, 20000) : g.val(['1 500,50', '', 0]), moms: g.chans(0.6) ? g.ore(0, 5000) : g.val([0, '', '125,25']),
  };
  return { g, start: { forsakring, fordon, inst, kostnader } as Start };
}

/** Nästa steg utifrån det nya tillståndet just nu. Samma tillstånd ger samma steg. */
export function nastaSteg(g: ReturnType<typeof slump>, N: FolieringState, perioder: string[], forstaOppna: string | null, idag: string): Steg {
  const A = [...N.arenden.values()];
  if (!A.length || g.chans(0.1)) return { typ: 'nytt' };
  const r = g.r();
  if (r < 0.05 && perioder.length) return { typ: 'export', p: g.chans(0.8) && forstaOppna ? forstaOppna : g.val(perioder) };
  if (r < 0.09 && perioder.length) {
    const p = g.val(perioder), b = g.ore(1, 5000), dag = p + '-' + pad(g.heltal(1, 28));
    return { typ: 'manuell', p, bm: { datum: g.chans(0.85) ? dag : idag, text: g.chans(0.9) ? 'Verifikation ' + g.heltal(1, 99) : ' ', bokslut: g.chans(0.3),
      rader: [{ k: g.val([7010, 6570, '4010']), d: String(b).replace('.', ','), c: '' }, { k: g.val([1930, 2910]), d: '', c: g.chans(0.9) ? b : b + 1 }, ...(g.chans(0.3) ? [{ k: '', d: '1', c: '' }] : [])] } };
  }
  const a = g.val(A), id = a.id;
  const k = (act: string, form?: Record<string, string>): Steg => ({ typ: 'klick', act, id, ...(form ? { form } : {}) });
  const datum = () => idag.slice(0, 8) + pad(g.heltal(1, 28));
  const regs = [...N.fordon.keys()];
  const redigera = (): Steg => g.val<() => Steg>([
    () => ({ typ: 'text', id, f: 'reg', v: regs.length && g.chans(0.7) ? g.val([g.val(regs), g.val(regs).toLowerCase().replace(/(\d)/, ' $1')]) : 'abc 99z' }),
    () => ({ typ: 'text', id, f: 'skadenr', v: 'SK-' + g.heltal(100, 99999) }),
    () => ({ typ: 'text', id, f: 'agare', v: g.chans(0.8) ? 'Ägare ' + g.heltal(1, 9) : '' }),
    () => ({ typ: 'text', id, f: 'bil', v: g.val(['650', '', 'X1']) }),
    () => ({ typ: 'text', id, f: 'notering', v: 'Notering ' + g.heltal(1, 9) }),
    () => ({ typ: 'pris', id, pid: g.chans(0.9) ? g.val(DEF_PRISER).id : 'saknas' }),
    () => ({ typ: 'val', id, f: 'storlek', v: g.val(['vanlig', 'storre']) }),
    () => ({ typ: 'val', id, f: 'forsakring', v: g.val([...N.forsakring.keys(), 'okand']) }),
    () => ({ typ: 'val', id, f: 'offert.datum', v: g.chans(0.9) ? datum() : '' }),
    () => ({ typ: 'rad', id, i: g.heltal(0, 3), falt: g.val(['antal', 'apris', 'text'] as const), v: g.val(['2', '3', '1 250,50', '', 'Foliering egen rad']) }),
    () => k('egenrad'),
    () => ({ typ: 'klick', act: 'delrad', id, i: g.heltal(0, 3) }),
    () => k('addlog', g.chans(0.8) ? { '#logTxt': 'Anteckning ' + g.heltal(1, 9) } : undefined),
  ])();
  if (g.chans(0.04)) return k(g.val(['skickad', 'skapaFaktura', 'betald', 'obetald', 'makulera', 'skapaMoms', 'momsSkickad', 'momsBetald', 'momsObetald', 'paminnelseKlar', 'fakturaSkickad']));
  const f = a.faktura, m = a.moms;
  const val: (() => Steg)[] = [];
  switch (a.status) {
    case 'utkast': val.push(redigera, redigera, redigera, () => k('skickad'), () => k('skapaFaktura')); break;
    case 'skickad': val.push(redigera, () => k('offertIgen'), () => k('godkand', g.chans(0.6) ? { '#godkAv': 'Handläggare ' + g.heltal(1, 5) } : undefined), () => k('avslag'), () => k('skapaFaktura')); break;
    case 'godkand': val.push(redigera, () => k('skapaFaktura'), () => k('skapaFaktura')); break;
    case 'avslag': val.push(() => k('ateroppna')); break;
    default:
      if (f && !f.betald) val.push(() => k('fakturaSkickad'), () => k('paminnelseKlar'), () => k('betald', g.chans(0.5) ? { '#betDat': datum() } : undefined), () => k('betald'),
        () => ({ typ: 'val', id, f: 'faktura.datum', v: datum() }), () => k('makulera'));
      if (f && f.betald) {
        val.push(() => k('obetald'));
        if (!m) val.push(() => k('skapaMoms'), () => ({ typ: 'text', id, f: 'agare', v: 'Ägare ' + g.heltal(1, 9) }));
        if (m && !m.skickad) val.push(() => k('momsSkickad'), () => k('momsSkickad'));
        if (m && !m.betald) val.push(() => k('momsBetald', g.chans(0.5) ? { '#mBetDat': datum() } : undefined), () => k('momsBetald'));
        if (m && m.betald) val.push(() => k('momsObetald'));
        if (g.chans(0.2)) val.push(() => k('makulera'));
      }
      if (!val.length) val.push(redigera);
  }
  return g.val(val)();
}
