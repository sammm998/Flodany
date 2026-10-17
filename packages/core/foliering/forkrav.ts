// Förkrav per åtgärd (fynd f, fas 2). I legacy skyddades åtgärderna bara av att knappen inte visades.
// På plattformen tar servern emot anrop direkt, så varje åtgärd kontrollerar läget först och ger ett
// tydligt fel i stället för att krascha eller tyst göra något ogiltigt.
// Förkraven följer när legacy visar knappen (legacy/apps/foliering/index.html, viewArende och viewBokforing).
import type { Arende, Pris } from './types';

export type AtgardsFelKod = 'saknas' | 'fel_lage' | 'ogiltigt';

export class AtgardsFel extends Error {
  readonly kod: AtgardsFelKod;
  constructor(kod: AtgardsFelKod, text: string) { super(text); this.name = 'AtgardsFel'; this.kod = kod; }
}

/** Det förkraven behöver läsa ur motorn. */
export interface ForkravLage {
  idag: string;
  priser: () => Pris[];
  forsakringFinns: (id: string) => boolean;
  momsStatus: (a: Arende) => string | null;
  last: (p: string) => boolean;
  forstaOppna: () => string | null;
  /** Röda punkter under Kontroll för perioden. */
  harRodaPunkter: (p: string) => boolean;
  pSlut: (p: string) => string;
}

type Svar = [AtgardsFelKod, string] | null;
type Kontroll = (L: ForkravLage, ...args: never[]) => Svar;

const DATUM = /^\d{4}-\d\d-\d\d$/;
const giltigtDatum = (d: string) => { if (!DATUM.test(d)) return false; const [y, m, dag] = d.split('-').map(Number) as [number, number, number], t = new Date(Date.UTC(y, m - 1, dag)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === dag; };
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

const fel = (kod: AtgardsFelKod, text: string): Svar => [kod, text];
const harRader = (a: Arende) => (a.offert?.rader?.length ?? 0) > 0;
const status = (a: Arende, ...ok: string[]) => ok.includes(a.status);

function arende(a: unknown): Svar {
  return a && typeof a === 'object' && typeof (a as Arende).id === 'string' && (a as Arende).offert ? null : fel('saknas', 'Ärendet finns inte.');
}
function olast(a: Arende): Svar {
  return a.faktura ? fel('fel_lage', 'Offerten är låst eftersom den är fakturerad.') : null;
}
function harFaktura(a: Arende): Svar {
  return a.faktura ? null : fel('fel_lage', 'Ärendet har ingen faktura.');
}
function harMoms(a: Arende): Svar {
  return a.moms ? null : fel('fel_lage', 'Ärendet har ingen momsfaktura.');
}
function datumOmAngivet(d: unknown): Svar {
  return d === undefined || d === '' || (typeof d === 'string' && giltigtDatum(d)) ? null : fel('ogiltigt', 'Datumet ska skrivas ÅÅÅÅ-MM-DD.');
}
const forst = (...k: (() => Svar)[]): Svar => { for (const f of k) { const s = f(); if (s) return s; } return null; };

/** Fält som går att ändra med valtFalt (val och datum) och textFalt, som i legacy. */
export const VALDA_FALT = ['storlek', 'forsakring', 'skadedatum', 'offert.datum', 'offert.giltigTom', 'faktura.datum', 'faktura.forfall', 'faktura.utfort'] as const;
export const TEXT_FALT = ['reg', 'skadenr', 'agare', 'bil', 'notering'] as const;
const OFFERTFALT = ['storlek', 'offert.datum', 'offert.giltigTom'];

/** En rad per åtgärd: förkravet i ord (för ägaren och dokumentationen) och kontrollen. */
export const FORKRAV: Record<string, { krav: string; kontroll: Kontroll }> = {
  nyttArende: { krav: 'Inga.', kontroll: () => null },
  egenRad: { krav: 'Offerten är inte fakturerad.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => olast(a)) },
  taBortRad: { krav: 'Offerten är inte fakturerad. Raden finns.', kontroll: (_L, a: Arende, i: number) => forst(() => arende(a), () => olast(a), () => (Number.isInteger(i) && a.offert.rader[i] ? null : fel('saknas', 'Raden finns inte.'))) },
  laggTillPris: { krav: 'Offerten är inte fakturerad. Priset finns i prislistan.', kontroll: (L, a: Arende, pid: string) => forst(() => arende(a), () => olast(a), () => (L.priser().some(p => p.id === pid) ? null : fel('saknas', 'Priset finns inte i prislistan.'))) },
  radFalt: { krav: 'Offerten är inte fakturerad. Raden finns. Fältet är text, antal eller à-pris.', kontroll: (_L, a: Arende, i: number, falt: string) => forst(() => arende(a), () => olast(a), () => (Number.isInteger(i) && a.offert.rader[i] ? null : fel('saknas', 'Raden finns inte.')), () => (['text', 'antal', 'apris'].includes(falt) ? null : fel('ogiltigt', 'Fältet går inte att ändra.'))) },
  offertSkickad: { krav: 'Status utkast. Offerten har minst en rad.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (status(a, 'utkast') ? null : fel('fel_lage', 'Bara en offert som är utkast kan markeras som skickad.')), () => (harRader(a) ? null : fel('fel_lage', 'Offerten har inga rader.'))) },
  godkand: { krav: 'Status utkast eller skickad.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (status(a, 'utkast', 'skickad') ? null : fel('fel_lage', 'Bara en offert som är utkast eller skickad kan godkännas.'))) },
  avslag: { krav: 'Status skickad eller godkänd.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (status(a, 'skickad', 'godkand') ? null : fel('fel_lage', 'Bara en skickad eller godkänd offert kan få avslag.'))) },
  ateroppna: { krav: 'Status avslag.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (status(a, 'avslag') ? null : fel('fel_lage', 'Bara ett ärende med avslag kan återöppnas.'))) },
  offertPaminnelse: { krav: 'Status är inte utkast (offerten är skickad). Offerten har minst en rad.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (status(a, 'utkast') ? fel('fel_lage', 'Offerten är inte skickad än.') : null), () => (harRader(a) ? null : fel('fel_lage', 'Offerten har inga rader.'))) },
  skapaFaktura: { krav: 'Ingen faktura. Status utkast, skickad eller godkänd. Offerten har minst en rad.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (a.faktura ? fel('fel_lage', 'Ärendet har redan en faktura.') : null), () => (status(a, 'utkast', 'skickad', 'godkand') ? null : fel('fel_lage', 'Ärendet kan inte faktureras i det här läget.')), () => (harRader(a) ? null : fel('fel_lage', 'Offerten har inga rader.'))) },
  fakturaSkickad: { krav: 'Fakturan finns.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harFaktura(a)) },
  paminnelseNoterad: { krav: 'Fakturan finns och är inte betald.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harFaktura(a), () => (a.faktura!.betald ? fel('fel_lage', 'Fakturan är redan betald.') : null)) },
  betald: { krav: 'Fakturan finns och är inte betald. Betaldatum, om det anges, är ett giltigt datum.', kontroll: (_L, a: Arende, datum?: string) => forst(() => arende(a), () => harFaktura(a), () => (a.faktura!.betald ? fel('fel_lage', 'Fakturan är redan betald.') : null), () => datumOmAngivet(datum)) },
  angraBetalning: { krav: 'Fakturan finns och är betald.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harFaktura(a), () => (a.faktura!.betald ? null : fel('fel_lage', 'Fakturan är inte betald.'))) },
  makulera: { krav: 'Fakturan finns och är inte betald.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harFaktura(a), () => (a.faktura!.betald ? fel('fel_lage', 'En betald faktura kan inte makuleras. Ångra betalningen först.') : null)) },
  skapaMoms: { krav: 'Fakturan finns och är betald. Ingen momsfaktura. Fordonsägare är ifylld.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harFaktura(a), () => (a.faktura!.betald ? null : fel('fel_lage', 'Momsfakturan skapas när försäkringsbolaget har betalat.')), () => (a.moms ? fel('fel_lage', 'Ärendet har redan en momsfaktura.') : null), () => (a.agare ? null : fel('fel_lage', 'Fyll i fordonsägare först.'))) },
  momsSkickad: { krav: 'Momsfakturan finns och väntar inte på försäkringsbolagets betalning.', kontroll: (L, a: Arende) => forst(() => arende(a), () => harMoms(a), () => (L.momsStatus(a) === 'vantar' ? fel('fel_lage', 'Momsfakturan skickas när försäkringsbolaget har betalat.') : null)) },
  momsBetald: { krav: 'Momsfakturan finns, är skickad och är inte betald. Betaldatum, om det anges, är ett giltigt datum.', kontroll: (_L, a: Arende, datum?: string) => forst(() => arende(a), () => harMoms(a), () => (a.moms!.betald ? fel('fel_lage', 'Momsfakturan är redan betald.') : null), () => (a.moms!.skickad ? null : fel('fel_lage', 'Momsfakturan är inte skickad.')), () => datumOmAngivet(datum)) },
  angraMomsBetalning: { krav: 'Momsfakturan finns och är betald.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => harMoms(a), () => (a.moms!.betald ? null : fel('fel_lage', 'Momsfakturan är inte betald.'))) },
  anteckning: { krav: 'Texten är inte tom.', kontroll: (_L, a: Arende, text: string) => forst(() => arende(a), () => (typeof text === 'string' && text.trim() ? null : fel('ogiltigt', 'Skriv en text.'))) },
  valtFalt: {
    krav: 'Fältet är storlek, försäkringsbolag, skadedatum, offertdatum, giltig till, fakturadatum, förfallodatum eller utfört. Offertens fält kräver att offerten inte är fakturerad, fakturans fält att fakturan finns. Storlek är vanlig eller större, försäkringsbolaget finns, datum är giltiga eller tomma.',
    kontroll: (L, a: Arende, f: string, value: string) => forst(
      () => arende(a),
      () => ((VALDA_FALT as readonly string[]).includes(f) ? null : fel('ogiltigt', 'Fältet går inte att ändra.')),
      () => (OFFERTFALT.includes(f) ? olast(a) : f.startsWith('faktura.') ? harFaktura(a) : null),
      () => (f === 'storlek' && !['vanlig', 'storre'].includes(value) ? fel('ogiltigt', 'Storleken ska vara vanlig eller större.') : null),
      () => (f === 'forsakring' && !L.forsakringFinns(value) ? fel('saknas', 'Försäkringsbolaget finns inte.') : null),
      () => (f.endsWith('datum') || f.endsWith('giltigTom') || f.endsWith('forfall') || f.endsWith('utfort') ? datumOmAngivet(value) : null)),
  },
  textFalt: { krav: 'Fältet är reg nr, skadenummer, fordonsägare, bilnummer eller notering.', kontroll: (_L, a: Arende, f: string) => forst(() => arende(a), () => ((TEXT_FALT as readonly string[]).includes(f) ? null : fel('ogiltigt', 'Fältet går inte att ändra.'))) },
  spara: { krav: 'Ärendet finns.', kontroll: (_L, a: Arende) => arende(a) },
  regAndrat: { krav: 'Ärendet finns.', kontroll: (_L, a: Arende) => arende(a) },
  taBortArende: { krav: 'Ärendet har ingen faktura och ingen momsfaktura (ägarens beslut 2c, fråga 4). Legacy tillät alltid.', kontroll: (_L, a: Arende) => forst(() => arende(a), () => (a.faktura || a.moms ? fel('fel_lage', 'Ett ärende med faktura kan inte tas bort.') : null)) },
  manuellVerifikation: { krav: 'Perioden (ÅÅÅÅ-MM) är inte låst. Övriga kontroller (text, datum i perioden, balans) ger meddelanden som förut.', kontroll: (L, p: string) => (PERIOD.test(p) ? (L.last(p) ? fel('fel_lage', 'Perioden är låst.') : null) : fel('ogiltigt', 'Perioden ska skrivas ÅÅÅÅ-MM.')) },
  exporteraPeriod: {
    krav: 'Perioden är den första öppna. Månaden är slut. Inga röda punkter under Kontroll. Tom eller obalanserad period ger meddelanden som förut.',
    kontroll: (L, p: string) => forst(
      () => (PERIOD.test(p) ? null : fel('ogiltigt', 'Perioden ska skrivas ÅÅÅÅ-MM.')),
      () => (L.last(p) ? fel('fel_lage', 'Perioden är redan låst.') : null),
      () => (p === L.forstaOppna() ? null : fel('fel_lage', 'Bara den första öppna perioden kan exporteras.')),
      () => (L.pSlut(p) < L.idag ? null : fel('fel_lage', 'Månaden är inte slut.')),
      () => (L.harRodaPunkter(p) ? fel('fel_lage', 'Rätta de röda punkterna under Kontroll först.') : null)),
  },
};

/** Kastar AtgardsFel om åtgärden inte får köras i det här läget. */
export function kontrollera(L: ForkravLage, namn: string, args: unknown[]): void {
  const k = FORKRAV[namn];
  if (!k) throw new AtgardsFel('ogiltigt', 'Okänd åtgärd.');
  const s = (k.kontroll as (L: ForkravLage, ...a: unknown[]) => Svar)(L, ...args);
  if (s) throw new AtgardsFel(s[0], s[1]);
}
