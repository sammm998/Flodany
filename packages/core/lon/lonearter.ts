// Löneartsregistret från ENG i legacy/apps/akarkassan och tripkassan (LA, LA_VER, lonearter, laRader).
// Registret är identiskt i båda apparna. Logiken är oförändrad, rad för rad.
// typ: auto = räknas av appen, belopp = fast belopp, antal = antal × à-pris, faktor = antal × månadslön × faktor.
// sida: brutto = kontant lön (skatt, avgift, AGI 011), formon = förmån (skatt och avgift, betalas inte ut, AGI 012),
// skattefri = betalas ut utan skatt och avgift (t.ex. traktamente AGI 051), skatt = extra skatteavdrag (AGI 001),
// netto = justering efter skatt, info = visas bara. sem = semestergrundande. fas = påslagen från början.
import { r2 } from './hjalp';
import type { Tal } from './types';

export type LoneartTyp = 'auto' | 'belopp' | 'antal' | 'faktor';
export type LoneartSida = 'brutto' | 'formon' | 'skattefri' | 'skatt' | 'netto' | 'info';

export interface Loneart {
  nr: string;
  namn: string;
  typ: LoneartTyp;
  sida: LoneartSida;
  agi: string;
  sem: number;
  fas?: number;
  apris?: number;
  enhet?: string;
  faktor?: number;
  neg?: number;
  hjalp?: string;
}

/** Bolagets egna inställningar per löneart (settings.cfg.lonearter). */
export interface EgenLoneart {
  aktiv?: boolean;
  apris?: number;
  [nyckel: string]: unknown;
}

/** En manuell lönerad för en förare och månad (month.forare[id].rader). */
export interface ManuellRad {
  nr: string;
  antal?: Tal;
  apris?: Tal;
  belopp?: Tal;
  text?: string;
}

/** En beräknad lönerad från en manuell rad. */
export interface ExtraRad {
  kod: string;
  text: string;
  antal: number;
  apris: number;
  belopp: number;
  sida: LoneartSida;
  agi: string;
  sem: boolean;
}

/* Registerversion 1 (2026-10-11). Samma numrering som LDL TaxiLön. */
export const LA: Loneart[] = [
  { nr: '001', namn: 'Månadslön', typ: 'auto', sida: 'brutto', agi: '011', sem: 0, fas: 1 },
  { nr: '004', namn: 'Timlön', typ: 'antal', apris: 0, enhet: 'tim', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '005', namn: 'Per km', typ: 'antal', apris: 2.00, enhet: 'km', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '006', namn: 'Per betald km', typ: 'antal', apris: 1.33, enhet: 'km', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '007', namn: 'Per påslag', typ: 'antal', apris: 6.30, enhet: 'st', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '008', namn: 'Kontanter i bilen, kvittas', typ: 'auto', sida: 'netto', agi: '', sem: 0, fas: 1 },
  { nr: '009', namn: 'Bro, Sturup och CPH', typ: 'auto', sida: 'brutto', agi: '011', sem: 1, fas: 1 },
  { nr: '010', namn: 'Bonus', typ: 'auto', sida: 'brutto', agi: '011', sem: 0, fas: 1 },
  { nr: '020', namn: 'Procentlön', typ: 'auto', sida: 'brutto', agi: '011', sem: 1, fas: 1 },
  { nr: '025', namn: 'Garantilön', typ: 'belopp', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '081', namn: 'Beklädnadsersättning', typ: 'antal', apris: 4.59, enhet: 'dag', sida: 'brutto', agi: '011', sem: 0 },
  { nr: '082', namn: 'Tvättillägg', typ: 'antal', apris: 3.42, enhet: 'dag', sida: 'brutto', agi: '011', sem: 0 },
  { nr: '083', namn: 'Premiekompensation', typ: 'antal', apris: 11.00, enhet: 'st', sida: 'brutto', agi: '011', sem: 0 },
  { nr: '084', namn: 'Verkstadsbesök', typ: 'antal', apris: 108.73, enhet: 'st', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '085', namn: 'Ersättning överskjutande pass', typ: 'antal', apris: 12.46, enhet: 'st', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '088', namn: 'Havandeskapslön', typ: 'antal', apris: 10.68, enhet: 'tim', sida: 'brutto', agi: '011', sem: 1 },
  { nr: '090', namn: 'Sjuklön', typ: 'belopp', sida: 'brutto', agi: '011', sem: 1, fas: 1 },
  { nr: '091', namn: 'Karensavdrag', typ: 'belopp', neg: 1, sida: 'brutto', agi: '011', sem: 1, fas: 1, hjalp: '20 % av en genomsnittlig veckas sjuklön (6 § sjuklönelagen)' },
  { nr: '201', namn: 'OB-tillägg', typ: 'antal', apris: 24.27, enhet: 'tim', sida: 'brutto', agi: '011', sem: 1, fas: 1 },
  { nr: '202', namn: 'Kvalificerat OB', typ: 'antal', apris: 40.58, enhet: 'tim', sida: 'brutto', agi: '011', sem: 1, fas: 1 },
  { nr: '410', namn: 'Semesterlön', typ: 'belopp', sida: 'brutto', agi: '011', sem: 0, fas: 1 },
  { nr: '420', namn: 'Semesterersättning', typ: 'auto', sida: 'brutto', agi: '011', sem: 0, fas: 1 },
  { nr: '480', namn: 'Avdrag obetald semester', typ: 'faktor', faktor: -0.046, enhet: 'dag', sida: 'brutto', agi: '011', sem: 0, fas: 1, hjalp: '4,6 % av månadslönen per dag (semesterlagen 16 b §)' },
  { nr: '485', namn: 'Semestertillägg 0,8 %', typ: 'faktor', faktor: 0.008, enhet: 'dag', sida: 'brutto', agi: '011', sem: 0, fas: 1, hjalp: '0,8 % av månadslönen per betald semesterdag (semesterlagen 16 a §)' },
  { nr: '510', namn: 'Traktamente, skattefritt', typ: 'antal', apris: 180, enhet: 'dag', sida: 'skattefri', agi: '051', sem: 0, fas: 1, hjalp: 'Bara vid tjänsteresa med övernattning mer än 50 km från vanliga verksamhetsorten och bostaden, med reseräkning. Högst 300 kr per hel dag 2026. Redovisas med kryss i AGI-ruta 051, inte med belopp. Uppfylls inte villkoren: använd 511 (Skatteverket).' },
  { nr: '511', namn: 'Traktamente, skattepliktigt', typ: 'belopp', sida: 'brutto', agi: '011', sem: 0, fas: 1, hjalp: 'Redovisas som lön i ruta 011 (i LDL felaktigt på 051)' },
  { nr: '530', namn: 'Förmån', typ: 'belopp', sida: 'formon', agi: '012', sem: 0, fas: 1 },
  { nr: '804', namn: 'Inkört exkl. moms', typ: 'auto', sida: 'info', agi: '', sem: 0, fas: 1 },
  { nr: '912', namn: 'Tabellskatt', typ: 'auto', sida: 'skatt', agi: '001', sem: 0, fas: 1 },
  { nr: '915', namn: 'Frivillig extra skatt', typ: 'belopp', sida: 'skatt', agi: '001', sem: 0, fas: 1 },
  { nr: '970', namn: 'Avdrag löneförskott', typ: 'auto', sida: 'netto', agi: '', sem: 0, fas: 1 },
  { nr: '990', namn: 'Avrundning', typ: 'auto', sida: 'brutto', agi: '011', sem: 0, fas: 1 },
  { nr: '991', namn: 'Nettolönejustering', typ: 'belopp', sida: 'netto', agi: '', sem: 0, fas: 1 }

];
export const LA_VER = 2;
const LAx: Record<string, Loneart> = Object.fromEntries(LA.map(a => [a.nr, a]));

/** Bolagets egen löneart (registerversion 2): ett nummer som inte finns i registret, på från början. */
export interface EgenArt extends Partial<Omit<Loneart, 'nr'>> {
  nr: string;
  konto?: string;
  [nyckel: string]: unknown;
}

/**
 * Lönearter som bolaget använt: registret och bolagets egna arter (egna), med bolagets inställningar (aktiv, à-pris).
 * Fas 1-arterna och egna arter är på från början. En egen art med ett nummer som finns i registret hoppas över.
 */
export function lonearter(own?: Record<string, EgenLoneart> | null, egna?: EgenArt[] | null): (Loneart & EgenLoneart & { aktiv: boolean; egen?: number })[] {
  own = own || {};
  const E = (egna || []).filter(e => e && e.nr && !LAx[e.nr]).map(e => ({ ...e, egen: 1, fas: 1 }) as unknown as Loneart & { egen: number });
  return [...LA, ...E].sort((x, y) => x.nr.localeCompare(y.nr)).map(a => ({ ...a, ...(own[a.nr] || {}), aktiv: own[a.nr]?.aktiv ?? !!a.fas }));
}

/** Manuella lönerader för en förare: [{ nr, antal, apris, belopp, text }] till beräknade rader. */
export function laRader(rader: ManuellRad[] | null | undefined, own: Record<string, EgenLoneart> | null | undefined, manadslon: number, egna?: EgenArt[] | null): ExtraRad[] {
  const L = Object.fromEntries(lonearter(own, egna).map(a => [a.nr, a]));
  return (rader || []).map(x => {
    const a = L[x.nr]; if (!a || a.typ === 'auto') return null;
    let antal = 1, apris: number, belopp: number;
    if (a.typ === 'antal') { antal = +(x.antal as number) || 0; apris = x.apris !== undefined && x.apris !== '' ? +x.apris : (a.apris || 0); belopp = antal * apris; }
    else if (a.typ === 'faktor') { antal = +(x.antal as number) || 0; apris = r2((manadslon || 0) * a.faktor!); belopp = antal * apris; }
    else { belopp = a.neg ? -Math.abs(+(x.belopp as number) || 0) : (+(x.belopp as number) || 0); apris = belopp; }
    return { kod: a.nr, text: x.text || a.namn, antal, apris: r2(apris), belopp: r2(belopp), sida: a.sida, agi: a.agi, sem: !!a.sem };
  }).filter(Boolean) as ExtraRad[];
}
