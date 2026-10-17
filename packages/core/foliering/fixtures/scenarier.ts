// Handskrivna, påhittade scenarier för folieringen. Varje steg sker vid en viss lokal tid (svensk tid).
// Ärenden som skapas med "nytt" heter $1, $2 ... i stegen.
import { franStockholm } from '../../tid';
import type { Arende } from '../types';
import type { Start, Steg } from './drivrutin';

export type Handelse = [tid: string, steg: Steg | 'kontroll'];
export interface Scenario { start: Start; handelser: Handelse[] }

const FORS = {
  lf: { namn: 'Försäkring 1 AB', kort: 'F1', kontakt: 'Kontakt Ett', epost: 'skador@example.se', adress1: 'Box 1', adress2: '100 00 Exempelstad' },
  f2: { namn: 'Försäkring 2 AB', kort: 'F2', kontakt: '', epost: 'skada@example.com' },
};
const FORDON = {
  ABC12A: { reg: 'ABC12A', bil: 650, agare: 'Ägare Ett AB', adress: 'Exempelgatan 1', epost: 'agare1@example.se' },
  ABC34B: { reg: 'ABC34B', bil: 651, agare: 'Ägare Två AB', epost: '' },
};

/** Ett färdigt ärende med faktura, för scenarier som börjar mitt i flödet. */
function arende(id: string, o: Partial<Arende> & { nr?: number; fdatum?: string }): Arende {
  const rader = [{ pid: 'sf-fram', text: 'Foliering stötfångare fram', antal: 1, apris: 4000 }, { text: 'Foliering extra', antal: 2, apris: 750.5 }];
  const { nr, fdatum, ...rest } = o;
  return {
    id, reg: 'ABC12A', skadenr: 'SK-' + id, forsakring: 'lf', agare: '', bil: null, storlek: 'vanlig', skadedatum: '', notering: '', status: nr ? 'fakturerad' : 'godkand',
    offert: { datum: '2026-08-03', giltigTom: '2026-09-02', rader, godkandAv: '' },
    faktura: nr ? { nr, datum: fdatum || '2026-08-10', forfall: '2026-08-20', utfort: fdatum || '2026-08-10', rader, betald: false, betaldDatum: '', paminnelse: '' } : null,
    moms: null, logg: [{ d: '2026-08-03', t: 'Ärendet skapat' }], skapad: '2026-08-03', ...rest,
  };
}

const k = (id: string, act: string, form?: Record<string, string>): Steg => ({ typ: 'klick', act, id, ...(form ? { form } : {}) });

export const SCENARIER: Record<string, Scenario> = {
  // Hela flödet: offert, påminnelse om offert, faktura, påminnelser var 7:e dag, betalning, momsfaktura till ägaren, export.
  momsflode: {
    start: { forsakring: FORS, fordon: FORDON, kostnader: { k1: { datum: '2026-08-20', typ: 'material', leverantor: 'Leverantör 1 AB', beskrivning: 'Folie', fakturanr: '501', belopp: 1200, moms: 300 } } },
    handelser: [
      ['2026-09-01 09:00', { typ: 'nytt' }],
      ['2026-09-01 09:01', { typ: 'text', id: '$1', f: 'reg', v: 'abc 12a' }],
      ['2026-09-01 09:02', { typ: 'text', id: '$1', f: 'skadenr', v: 'SK-1001-26' }],
      ['2026-09-01 09:03', { typ: 'pris', id: '$1', pid: 'sf-fram' }],
      ['2026-09-01 09:04', { typ: 'pris', id: '$1', pid: 'dorr' }],
      ['2026-09-01 09:05', { typ: 'rad', id: '$1', i: 1, falt: 'antal', v: '2' }],
      ['2026-09-01 09:06', { typ: 'val', id: '$1', f: 'storlek', v: 'storre' }],
      ['2026-09-01 09:07', k('$1', 'skickad')],
      ['2026-09-05 08:00', 'kontroll'],
      ['2026-09-06 08:00', 'kontroll'],
      ['2026-09-07 10:00', k('$1', 'offertIgen')],
      ['2026-09-08 10:00', k('$1', 'godkand', { '#godkAv': ' Handläggare Ett ' })],
      ['2026-09-10 10:00', k('$1', 'skapaFaktura')],
      ['2026-09-10 10:05', k('$1', 'fakturaSkickad')],
      ['2026-09-20 12:00', 'kontroll'],
      ['2026-09-21 08:00', 'kontroll'],
      ['2026-09-21 08:30', k('$1', 'paminnelseKlar')],
      ['2026-09-27 08:00', 'kontroll'],
      ['2026-09-28 08:00', 'kontroll'],
      ['2026-09-30 09:00', k('$1', 'betald', { '#betDat': '2026-09-29' })],
      ['2026-09-30 09:01', 'kontroll'],
      ['2026-10-02 09:00', k('$1', 'momsSkickad')],
      ['2026-10-15 09:00', k('$1', 'momsBetald', { '#mBetDat': '2026-10-14' })],
      ['2026-10-16 09:00', { typ: 'export', p: '2026-08' }],
      ['2026-10-16 09:01', { typ: 'export', p: '2026-09' }],
      ['2026-11-02 09:00', { typ: 'export', p: '2026-10' }],
      ['2026-11-02 09:01', 'kontroll'],
    ],
  },

  // Fordonsägare saknas när försäkringsbolaget betalar. Ägaren läggs in, momsfakturan skapas för hand.
  // Betalningen ångras efter att perioden låsts: efterregistrering och varning om försvunnen händelse.
  agareSaknas: {
    start: { forsakring: FORS, fordon: FORDON, arenden: [arende('a2', { reg: 'ABC99Z', nr: 1001 })] },
    handelser: [
      ['2026-08-25 10:00', k('a2', 'betald')],
      ['2026-08-25 10:01', 'kontroll'],
      ['2026-08-26 10:00', { typ: 'text', id: 'a2', f: 'agare', v: 'Ägare Tre' }],
      ['2026-08-26 10:01', k('a2', 'skapaMoms')],
      ['2026-08-26 10:02', k('a2', 'momsSkickad')],
      ['2026-09-02 10:00', { typ: 'export', p: '2026-08' }],
      ['2026-09-03 10:00', k('a2', 'obetald')],
      ['2026-09-03 10:01', k('a2', 'momsBetald', { '#mBetDat': '2026-08-31' })],
      ['2026-09-03 10:02', 'kontroll'],
      ['2026-09-04 10:00', k('a2', 'momsObetald')],
      ['2026-09-04 10:01', k('a2', 'betald', { '#betDat': '2026-09-04' })],
      ['2026-09-04 10:02', 'kontroll'],
    ],
  },

  // Fakturanumrering: serie.nasta lägre än högsta nr, makulera den högsta och skapa ny, momsfakturans M-nummer efter makulering.
  numrering: {
    start: {
      forsakring: FORS, fordon: FORDON, inst: { serie: { nasta: 1002 } },
      arenden: [arende('n1', { nr: 1001 }), arende('n2', { nr: 1003, reg: 'ABC34B' }), arende('n3', {}), arende('n4', { reg: 'ABC34B' })],
    },
    handelser: [
      ['2026-08-11 10:00', k('n3', 'skapaFaktura')],
      ['2026-08-11 10:01', k('n2', 'betald')],
      ['2026-08-11 10:02', 'kontroll'],
      ['2026-08-12 10:00', k('n3', 'makulera')],
      ['2026-08-12 10:01', k('n3', 'skapaFaktura')],
      ['2026-08-12 10:02', k('n2', 'makulera')],
      ['2026-08-12 10:03', k('n2', 'skapaFaktura')],
      ['2026-08-13 10:00', k('n2', 'betald')],
      ['2026-08-13 10:01', k('n4', 'skapaFaktura')],
      ['2026-08-13 10:02', 'kontroll'],
    ],
  },

  // Utan serie i inställningarna: makulerad högsta faktura får samma nummer igen.
  numreringUtanSerie: {
    start: { forsakring: FORS, fordon: FORDON, arenden: [arende('u1', { nr: 1001 }), arende('u2', { nr: 1002, reg: 'ABC34B' })] },
    handelser: [
      ['2026-08-11 10:00', k('u2', 'betald')],
      ['2026-08-11 10:01', k('u2', 'makulera')],
      ['2026-08-11 10:02', k('u2', 'skapaFaktura')],
      ['2026-08-11 10:03', k('u2', 'betald')],
      ['2026-08-11 10:04', k('u1', 'makulera')],
      ['2026-08-11 10:05', k('u1', 'skapaFaktura')],
      ['2026-08-11 10:06', 'kontroll'],
    ],
  },

  // Datumskiften: 31 dec till 1 jan, sista mars (sommartid) och sista oktober (vintertid),
  // med förfallodag och påminnelse över skiftet. Räkenskapsåret är kalenderår (bokslut i december).
  datumskiften: {
    start: {
      forsakring: FORS, fordon: FORDON, inst: { bokforing: { rarStart: 1 } },
      arenden: [arende('d1', {}), arende('d2', { reg: 'ABC34B' }), arende('d3', {}), arende('d4', { status: 'godkand' })],
    },
    handelser: [
      // Vintertid: natten till 2026-10-25 går klockan från 03:00 till 02:00.
      ['2026-10-15 10:00', k('d1', 'skapaFaktura')],
      ['2026-10-21 10:00', k('d4', 'skickad')],
      ['2026-10-25 02:30', 'kontroll'],
      ['2026-10-25 23:59', 'kontroll'],
      ['2026-10-26 00:30', 'kontroll'],
      ['2026-10-26 00:31', k('d1', 'paminnelseKlar')],
      ['2026-11-01 23:30', 'kontroll'],
      ['2026-11-02 00:30', 'kontroll'],
      // Årsskiftet
      ['2026-12-27 10:00', k('d2', 'skapaFaktura')],
      ['2026-12-31 23:59', 'kontroll'],
      ['2027-01-01 00:01', k('d1', 'betald')],
      ['2027-01-01 00:02', 'kontroll'],
      ['2027-01-06 23:59', 'kontroll'],
      ['2027-01-07 00:01', 'kontroll'],
      ['2027-01-07 00:02', k('d2', 'paminnelseKlar')],
      ['2027-01-14 00:05', 'kontroll'],
      ['2027-01-15 09:00', { typ: 'export', p: '2026-08' }],
      ['2027-01-15 09:01', { typ: 'export', p: '2026-09' }],
      ['2027-01-15 09:02', { typ: 'export', p: '2026-10' }],
      ['2027-01-15 09:03', { typ: 'export', p: '2026-11' }],
      ['2027-01-15 09:04', { typ: 'export', p: '2026-12' }],
      ['2027-01-15 09:05', 'kontroll'],
      // Sommartid: natten till 2027-03-28 går klockan från 02:00 till 03:00.
      ['2027-03-18 10:00', k('d3', 'skapaFaktura')],
      ['2027-03-28 01:30', 'kontroll'],
      ['2027-03-28 03:30', 'kontroll'],
      ['2027-03-28 23:59', 'kontroll'],
      ['2027-03-29 00:30', 'kontroll'],
      ['2027-03-29 00:31', k('d3', 'paminnelseKlar')],
      ['2027-04-05 00:30', 'kontroll'],
    ],
  },

  // SIE-filen: svenska tecken, citattecken, radbrytning, tankstreck och tecken utanför CP437.
  sie: {
    start: {
      forsakring: { lf: { namn: 'Försäkring Ö AB', kort: 'FÖ' } }, fordon: FORDON,
      inst: { foretag: { namn: 'Ångström & Söner "Exempel" AB \u2013 É€' } },
      kostnader: {
        k1: { datum: '2026-08-05', typ: 'material', leverantor: 'Öresunds Folie AB', beskrivning: 'Folie \u2014 matt, café\nrad två', fakturanr: '77', belopp: '1 234,50', moms: 308.63 },
        k2: { datum: '2026-08-06', typ: 'ul', leverantor: 'Underlev Ä AB', beskrivning: '', belopp: 500 },
        k3: { datum: '2026-08-07', typ: 'lon', leverantor: 'Bokförs inte', belopp: 999 },
        k4: { datum: '2026-08-08', typ: 'ovrigt', leverantor: '', belopp: 0.004, moms: 0 },
      },
      arenden: [arende('s1', { nr: 1001, reg: 'ABC34B', skadenr: 'SKÅ-1' })],
    },
    handelser: [
      ['2026-08-20 10:00', k('s1', 'betald', { '#betDat': '2026-08-19' })],
      ['2026-08-21 10:00', { typ: 'manuell', p: '2026-08', bm: { datum: '2026-08-31', text: 'Lön "augusti" ÅÄÖ åäö', bokslut: true, rader: [{ k: 7010, d: '10 000,00', c: '' }, { k: '2910', d: '', c: '10000' }, { k: '', d: '5', c: '' }] } }],
      ['2026-08-21 10:01', { typ: 'manuell', p: '2026-08', bm: { datum: '2026-09-01', text: 'Fel månad', bokslut: false, rader: [{ k: 1930, d: '1', c: '' }, { k: 3001, d: '', c: '1' }] } }],
      ['2026-08-21 10:02', { typ: 'manuell', p: '2026-08', bm: { datum: '2026-08-15', text: 'Balanserar inte', bokslut: false, rader: [{ k: 1930, d: '2', c: '' }, { k: 3001, d: '', c: '1' }] } }],
      ['2026-08-21 10:03', { typ: 'manuell', p: '2026-08', bm: { datum: '2026-08-15', text: '  ', bokslut: false, rader: [] } }],
      ['2026-09-01 10:00', 'kontroll'],
      ['2026-09-01 10:01', { typ: 'export', p: '2026-08' }],
      ['2026-09-01 10:02', 'kontroll'],
    ],
  },
};

/** Lokal tid "ÅÅÅÅ-MM-DD hh:mm" till millisekunder (svensk tid). */
export const kl = (s: string): number => { const [d, t] = s.split(' ') as [string, string]; const [y, m, dd] = d.split('-').map(Number) as [number, number, number]; const [h, mi] = t.split(':').map(Number) as [number, number]; return franStockholm(y, m, dd, h, mi).getTime(); };
