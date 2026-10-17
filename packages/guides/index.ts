// Guidesystemet (spec v3 s. 16): välkomstguide, kom igång, hjälp per vy och filhjälp.
// Texterna ligger här så att de kan skrivas om utan att röra koden. En mening per sak, inga tankstreck.
import { VISNINGSNAMN } from '@flodia/modules';

export interface Kort { rubrik: string; text: string }

/** Det kom igång-listan läser i kontot. Allt med användarens rättigheter. */
export interface KontoLage {
  /** Ett dokument i modulen, eller undefined. */
  dokument: (path: string) => Readonly<Record<string, unknown>> | undefined;
  /** Antal dokument i en samling i modulen. */
  antal: (samling: string) => number;
  /** Dokumenten i en samling i modulen ('' är toppnivån, där kassorna sparar sina dokument). */
  dokumenten: (samling: string) => { id: string; data: Readonly<Record<string, unknown>> }[];
  /** Antal publicerade perioder i modulen. */
  publicerade: number;
  /** Antal skickade inbjudningar från kontot (syns bara för admin). */
  inbjudningar: number;
}

export interface Steg {
  nyckel: string;
  text: string;
  /** Bockas av av sig självt när det är gjort (delas av alla i kontot). */
  klar: (l: KontoLage) => boolean;
}

export interface GuideManifest {
  modul: string;
  variant: 'main' | 'sub';
  /** Samlingarna som kom igång-listan läser, live. */
  samlingar: string[];
  /** Välkomstguiden: 3 till 5 kort. Första kortet erbjuder exempeldata. */
  welcome: Kort[];
  checklist: Steg[];
  /** Hjälp per vy ("Så funkar det"). Nyckeln är vyns nyckel i manifestet. */
  help: Record<string, string>;
  /** Filhjälp per uppladdning ("Var hittar jag filen?"). Ägaren fyller i stegen. */
  fileHelp: Record<string, { var: string; nar: string }>;
}

const lista = (l: KontoLage, path: string) => { const d = l.dokument(path); return Array.isArray(d?.list) && d.list.length > 0; };
const FYLLS_I = 'Ägaren fyller i.';

/** Avräkning, huvudkund. Texterna från spec v3 s. 46. */
export const avrakningMain: GuideManifest = {
  modul: 'avrakning', variant: 'main', samlingar: ['settings', 'months'],
  welcome: [
    { rubrik: 'Välkommen till Avräkning', text: 'Varje månad drar du in filerna. Vi räknar ut vad varje åkare ska ha.' },
    { rubrik: 'Tio minuter i månaden', text: 'Det tar cirka tio minuter när du har filerna.' },
    { rubrik: 'Inget konstigt slinker igenom', text: 'Vi visar det som ser konstigt ut innan du godkänner.' },
    { rubrik: 'Åkarna ser sin del', text: 'När du publicerar får varje åkare sin del i appen.' },
  ],
  checklist: [
    { nyckel: 'bolag', text: 'Lägg till ert bolag och logga', klar: l => lista(l, 'settings/bolag') },
    { nyckel: 'bilar', text: 'Läs in bilregistret', klar: l => lista(l, 'settings/bilar') },
    { nyckel: 'priser', text: 'Kontrollera priser och procentsatser', klar: l => l.dokument('settings/params') !== undefined },
    { nyckel: 'akare', text: 'Bjud in åkarna', klar: l => l.inbjudningar > 0 },
    { nyckel: 'forsta-manad', text: 'Gör första månaden', klar: l => l.antal('months') > 0 },
    { nyckel: 'publicera', text: 'Publicera', klar: l => l.publicerade > 0 },
  ],
  help: {
    filer: 'Dra in allt på en gång. Saknas något står det på raden.',
    kontroll: 'Röda rader behöver en titt. Markera dem som kontrollerade.',
    godkann: 'Månaden låses. Rättelser blir en ny version.',
    utskick: 'Åkarna får notis och mejl. Du ser vem som öppnat.',
  },
  fileHelp: {
    tc: { var: FYLLS_I, nar: FYLLS_I },
    'tc-csv': { var: FYLLS_I, nar: FYLLS_I },
    bamb: { var: FYLLS_I, nar: FYLLS_I },
    app: { var: FYLLS_I, nar: FYLLS_I },
  },
};

const ifylld = (d: Readonly<Record<string, unknown>> | undefined) => !!d && Object.keys(d).length > 0;
const kassaInst = (l: KontoLage) => l.dokument('settings') as { cfg?: Record<string, unknown>; forare?: Record<string, { person?: { bank?: string } }> } | undefined;

/**
 * Lön och kassa (akarkassan) och Lön och bokföring (tripkassan): åkeripaketet, samma guide för båda enligt ägarens
 * beslut 2026-10-14. Namnen kommer från VISNINGSNAMN i @flodia/modules.
 * Texterna från spec v3 s. 47 (Åkarkassan). Kort 2 är ändrat och godkänt av ägaren: avräkning, bro och Sturup
 * kommer automatiskt från centralen först när delningen finns (fas 3).
 * Kassorna sparar sina dokument på toppnivå: settings, skatt, m-ÅÅÅÅ-MM och avtal-<id>.
 */
function akeriGuide(modul: 'akarkassan' | 'tripkassan', namn: string): GuideManifest {
  return {
    modul, variant: 'main', samlingar: [''],
    welcome: [
      { rubrik: `Välkommen till ${namn}`, text: 'Lön och kassa för dina förare, varje månad.' },
      { rubrik: 'Filerna', text: 'Du laddar upp LDL från Megtax, och centralens avräkning, bro och Sturup tills de kommer automatiskt.' },
      { rubrik: 'Godkänn lönen', text: 'Du godkänner lönen, förarna får lönespecen i appen.' },
    ],
    checklist: [
      { nyckel: 'forare', text: 'Lägg till förarna och bankkonton', klar: l => Object.values(kassaInst(l)?.forare ?? {}).some(f => !!f?.person?.bank) },
      { nyckel: 'skatt', text: 'Läs in skattetabellen', klar: l => ifylld((l.dokument('skatt') as { tabeller?: Record<string, unknown> } | undefined)?.tabeller) },
      { nyckel: 'procent', text: 'Ställ in procentlön och avdrag', klar: l => ifylld(kassaInst(l)?.cfg) },
      { nyckel: 'forsta-lon', text: 'Gör första lönen', klar: l => l.dokumenten('').some(d => /^m-\d{4}-\d{2}$/.test(d.id) && !!d.data.lonekorning) },
      { nyckel: 'avtal', text: 'Skicka anställningsavtal', klar: l => l.dokumenten('').some(d => d.id.startsWith('avtal-')) },
    ],
    help: {
      manad: 'Det som saknas för månaden står överst.',
      forare: 'Förare med personnummer, bankkonto och skattetabell. Här finns också anställningsavtalen.',
      lon: 'Klicka på en förare för hela uträkningen.',
    },
    fileHelp: {
      ldl: { var: FYLLS_I, nar: FYLLS_I },
      bro: { var: FYLLS_I, nar: FYLLS_I },
      sturup: { var: FYLLS_I, nar: FYLLS_I },
      avr: { var: FYLLS_I, nar: FYLLS_I },
      skatt: { var: FYLLS_I, nar: FYLLS_I },
    },
  };
}
export const akarkassanGuide = akeriGuide('akarkassan', VISNINGSNAMN.akarkassan.namn);
export const tripkassanGuide = akeriGuide('tripkassan', VISNINGSNAMN.tripkassan.namn);

/** Verkstad (modulen foliering). Texterna från spec v3 s. 47. */
export const verkstadGuide: GuideManifest = {
  modul: 'foliering', variant: 'main', samlingar: ['installningar', 'forsakring', 'arenden'],
  welcome: [
    { rubrik: 'Välkommen till Verkstad', text: 'Ett ärende per bil och skada, från offert till betalt.' },
    { rubrik: 'Momsfakturan', text: 'Momsfakturan till fordonsägaren skapas när försäkringsbolaget betalat.' },
    { rubrik: 'Betalningarna', text: 'Läs in bankfilen så matchas betalningarna själv.' },
    { rubrik: 'Bokföringen', text: 'Exportera SIE till bokföringen.' },
  ],
  checklist: [
    { nyckel: 'foretag', text: 'Fyll i företagsuppgifter', klar: l => ifylld(l.dokument('installningar/foretag')) },
    { nyckel: 'priser', text: 'Kontrollera prislistan', klar: l => l.dokument('installningar/priser') !== undefined },
    { nyckel: 'forsakring', text: 'Lägg till försäkringsbolag', klar: l => l.antal('forsakring') > 0 },
    { nyckel: 'arende', text: 'Skapa första ärendet', klar: l => l.antal('arenden') > 0 },
  ],
  help: {
    arenden: 'Status visar nästa steg för varje ärende.',
    fakturor: 'Förslag på matchning mot betalningarna, du bekräftar.',
    bokforing: 'Röda punkter måste rättas innan export.',
  },
  fileHelp: {},
};

export const GUIDER: GuideManifest[] = [avrakningMain, akarkassanGuide, tripkassanGuide, verkstadGuide];
export const guideFor = (modul: string, variant: 'main' | 'sub' = 'main') => GUIDER.find(g => g.modul === modul && g.variant === variant) ?? null;

/** Kom igång: hur många steg som är klara och vilket som är nästa. */
export function komIgang(g: GuideManifest, l: KontoLage) {
  const steg = g.checklist.map(s => ({ nyckel: s.nyckel, text: s.text, klar: s.klar(l) }));
  return { steg, klara: steg.filter(s => s.klar).length, totalt: steg.length, nasta: steg.find(s => !s.klar) ?? null };
}

/** Välkomstguidens steg i guide_progress (per användare). */
export const VALKOMMEN_KLAR = 'valkommen';
