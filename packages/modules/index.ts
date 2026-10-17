// Modulernas manifest (spec v3 s. 10): plattformen bygger menyn, uppladdningsstegen och guiden härifrån.
// En ny app är en ny post, inte en ändring i plattformen. Klientkod: uppladdningar pekar på parsrar med
// nyckel (som serverfunktionen motor känner igen), aldrig med import (beslut 26).

export type Roll = 'admin' | 'ekonomi' | 'las';

export interface Uppladdning { nyckel: string; etikett: string; /** Parserns nyckel i serverfunktionen. */ parser: string; kravs: boolean }
export interface Vy { nyckel: string; namn: string }
export interface Variant { namn: string; vyer: Vy[] }
export interface ModulManifest {
  nyckel: string;
  namn: string;
  /** Personuppgifter om anställda (lön): läs-rollen har ingen åtkomst, som modules.kanslig i databasen. */
  kanslig: boolean;
  varianter: { main: Variant; sub?: Variant };
  uppladdningar: Uppladdning[];
  /** Guidens nyckel i @flodia/guides, om det finns en guide. */
  guide?: string;
}

export const defineModule = (m: ModulManifest): ModulManifest => m;

/**
 * Appernas namn som användaren ser, på ett ställe: menyn, brödsmulan, Hem, guiderna, flikens titel och raden under
 * bolagsnamnet i de nuvarande apparna. Ändra här för att byta namn. Nyckeln (id, adress och databasnyckel) ändras aldrig.
 * tidigare: gamla namn, så att sökningen hittar appen även på dem.
 */
export const VISNINGSNAMN = {
  avrakning: { namn: 'Avräkning', tidigare: [] },
  // Ägarens beslut 2026-10-15: Åkarkassan heter Lön och kassa, Tripkassan heter Lön och bokföring.
  akarkassan: { namn: 'Lön och kassa', tidigare: ['Åkarkassan'] },
  tripkassan: { namn: 'Lön och bokföring', tidigare: ['Tripkassan'] },
  foliering: { namn: 'Verkstad', tidigare: [] },
} as const satisfies Record<string, { namn: string; tidigare: readonly string[] }>;

/** Söker appar på nuvarande och tidigare namn, utan hänsyn till versaler. Svarar med nycklarna som matchar. */
export function sokApp(fraga: string): string[] {
  const q = fraga.trim().toLocaleLowerCase('sv');
  if (!q) return [];
  return Object.entries(VISNINGSNAMN).filter(([, v]) => [v.namn, ...v.tidigare].some(n => n.toLocaleLowerCase('sv').includes(q))).map(([k]) => k);
}

export const avrakning = defineModule({
  nyckel: 'avrakning', namn: VISNINGSNAMN.avrakning.namn, kanslig: false, guide: 'avrakning',
  varianter: {
    main: { namn: VISNINGSNAMN.avrakning.namn, vyer: [{ nyckel: 'filer', namn: 'Filer' }, { nyckel: 'kontroll', namn: 'Kontroll' }, { nyckel: 'godkann', namn: 'Godkänn' }, { nyckel: 'utskick', namn: 'Utskick' }] },
    sub: { namn: 'Min avräkning', vyer: [{ nyckel: 'manad', namn: 'Månad' }, { nyckel: 'per-bil', namn: 'Per bil' }, { nyckel: 'historik', namn: 'Historik' }] },
  },
  uppladdningar: [
    { nyckel: 'tc', etikett: 'TaxiCaller, fakturor per konto (PDF)', parser: 'tc', kravs: true },
    { nyckel: 'tc-csv', etikett: 'TaxiCaller, debiteringskunder (CSV)', parser: 'tc-csv', kravs: false },
    { nyckel: 'bamb', etikett: 'Bambora, kortbetalningar (Excel)', parser: 'bamb', kravs: true },
    { nyckel: 'app', etikett: 'TaxiCaller, appbetalningar (CSV)', parser: 'app', kravs: true },
  ],
});

const LONEFILER = [
  { nyckel: 'ldl', etikett: 'Megtax, löneunderlag (LDL.txt)', parser: 'ldl', kravs: true },
  { nyckel: 'bro', etikett: 'Øresundsbron, samlingsfaktura (PDF)', parser: 'bro', kravs: false },
  { nyckel: 'sturup', etikett: 'Swedavia, Sturup (PDF)', parser: 'sturup', kravs: false },
  { nyckel: 'avr', etikett: 'Avräkning från taxicentralen (PDF)', parser: 'avr', kravs: false },
  { nyckel: 'skatt', etikett: 'Skatteverket, månadstabeller (txt)', parser: 'skatt', kravs: false },
];
const LONEVYER = [{ nyckel: 'manad', namn: 'Månad' }, { nyckel: 'forare', namn: 'Förare' }, { nyckel: 'lon', namn: 'Lön' }];

export const akarkassan = defineModule({ nyckel: 'akarkassan', namn: VISNINGSNAMN.akarkassan.namn, kanslig: true, varianter: { main: { namn: VISNINGSNAMN.akarkassan.namn, vyer: LONEVYER } }, uppladdningar: LONEFILER });
export const tripkassan = defineModule({ nyckel: 'tripkassan', namn: VISNINGSNAMN.tripkassan.namn, kanslig: true, varianter: { main: { namn: VISNINGSNAMN.tripkassan.namn, vyer: LONEVYER } }, uppladdningar: LONEFILER });
export const foliering = defineModule({
  nyckel: 'foliering', namn: VISNINGSNAMN.foliering.namn, kanslig: false,
  varianter: { main: { namn: VISNINGSNAMN.foliering.namn, vyer: [{ nyckel: 'arenden', namn: 'Ärenden' }, { nyckel: 'fakturor', namn: 'Fakturor' }, { nyckel: 'bokforing', namn: 'Bokföring' }] } },
  uppladdningar: [],
});

export const MODULER: ModulManifest[] = [avrakning, akarkassan, tripkassan, foliering];
export const modulFor = (nyckel: string) => MODULER.find(m => m.nyckel === nyckel) ?? null;

export interface Licens { module_key: string; variant: string; status: string; ended_at: string | null }

/** Modulerna som syns i menyn: aktiv licens, och inte en känslig modul för läs-rollen. */
export function synligaModuler(licenser: Licens[], roll: Roll, nu = new Date()): { modul: ModulManifest; variant: 'main' | 'sub' }[] {
  const ut: { modul: ModulManifest; variant: 'main' | 'sub' }[] = [];
  for (const m of MODULER) {
    const l = licenser.find(x => x.module_key === m.nyckel);
    if (!l || l.status !== 'aktiv' || (l.ended_at && new Date(l.ended_at) <= nu)) continue;
    if (m.kanslig && roll === 'las') continue;
    ut.push({ modul: m, variant: l.variant === 'sub' && m.varianter.sub ? 'sub' : 'main' });
  }
  return ut;
}
