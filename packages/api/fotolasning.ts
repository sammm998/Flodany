// Fotoläsning av klädlistan: det klienten och serverfunktionen motor delar (operationen fotolasning).
// Bara typer och namn, ingen tolkning. Tolkningen och statusarna räknas på servern (beslut 26).

/** Funktionen i public.konto_funktioner. Av i alla konton tills ägaren slår på den (docs/fotolasning.md). */
export const FOTOLASNING = 'avrakning.fotolasning';

/** Plaggen på klädlistan, i blankettens ordning, med artikelnummer (fas-3-moduler-plan.md, fliken Kläder). */
export const PLAGG = [
  { nyckel: 'jacka', namn: 'Jacka', art: 78 },
  { nyckel: 'sommarjacka', namn: 'Sommarjacka', art: 79 },
  { nyckel: 'vast', namn: 'Väst/slipover', art: 74 },
  { nyckel: 'troja', namn: 'Tröja', art: 72 },
  { nyckel: 'skjorta', namn: 'Skjorta', art: 73 },
  { nyckel: 'pike', namn: 'Piké', art: 80 },
  { nyckel: 'mossa', namn: 'Mössa', art: 75 },
] as const;
export type Plagg = (typeof PLAGG)[number]['nyckel'];

/** En rad på klädlistan. Inga namn: förare, åkare och initialer läses aldrig ut. */
export interface KladRad {
  /** ÅÅÅÅ-MM-DD, eller null om datumet inte gick att läsa. */
  datum: string | null;
  /** Bilnumret (bara siffror), eller null om det inte gick att läsa. */
  bil: string | null;
  utbildning: boolean;
  antal: Record<Plagg, number>;
  /** Läsningen är osäker: något på raden var svårläst eller ogiltigt. */
  osaker: boolean;
}

/** annan_manad: datumet ligger utanför perioden. finns_redan: raden är redan tillagd. bil_saknas: bilen finns inte i bilregistret. */
export type KladStatus = 'annan_manad' | 'finns_redan' | 'bil_saknas' | 'osaker';

export interface GranskadRad extends KladRad {
  status: KladStatus[];
  /** Förvald i granskningstabellen: bara rader utan status. */
  vald: boolean;
}

export type FotoMediaTyp = 'image/jpeg' | 'image/png' | 'image/webp';

/** Anropen till motor med operation fotolasning och modul avrakning. */
export type FotoAnrop =
  | { steg: 'las'; period: string; bild: { mediaTyp: FotoMediaTyp; base64: string } }
  | { steg: 'lagg_till'; period: string; rader: KladRad[] };

export interface FotoLast { period: string; rader: GranskadRad[] }
export interface FotoTillagt { period: string; tillagda: number; hoppade: number }

export const KLAD_STATUS: Record<KladStatus, string> = {
  annan_manad: 'Annan månad',
  finns_redan: 'Finns redan',
  bil_saknas: 'Bil saknas',
  osaker: 'Osäker',
};
