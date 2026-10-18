// Assistenten: det klienten och serverfunktionen assistent delar. Bara typer och namn, ingen logik.
// Agenten körs på servern (packages/server/assistent.ts) med användarens rättigheter. Klienten skickar en fråga
// och får tillbaka en ström av händelser (text, verktyg och paneler), som chatten visar som i Claude:
// svaret i mitten och det agenten öppnar eller hämtar i en panel till höger.

/** Det klienten skickar till serverfunktionen assistent. */
export interface AssistentAnrop {
  konto: string;
  /** Samtalets id, eller saknas för ett nytt samtal. */
  samtal?: string;
  text: string;
  /** Appen och vyn som är öppen i panelen, så att agenten vet vad användaren tittar på. */
  vy?: { app: string; vy?: string } | null;
  /** Användaren har godkänt eller avböjt ett förslag i panelen. Sparas med panelen, så att den inte kan godkännas igen. */
  beslut?: Beslut;
}

/** Beslutet om ett åtgärdsförslag. Åtgärden har redan körts av klienten mot motor, med användarens rättigheter. */
export interface Beslut { panel: string; utfall: 'utford' | 'avbojd' | 'misslyckad'; meddelanden: string[] }

/** Ett utfört eller föreslaget verktyg, som en rad i svaret. */
export interface VerktygRad { id: string; namn: string; etikett: string; status: 'pagar' | 'klar' | 'fel' }

/** En del av ett meddelande som chatten visar. */
export type Del = { typ: 'text'; text: string } | { typ: 'verktyg'; verktyg: VerktygRad; panel?: string };

export interface ChattMeddelande { id: string; roll: 'anvandare' | 'assistent'; delar: Del[] }

/** En kolumn i en tabell i panelen. */
export interface Kolumn { nyckel: string; namn: string; tal?: boolean }

/** Det som öppnas i panelen till höger. Varje panel har ett id och syns som en flik. */
export type Panel =
  | { id: string; typ: 'app'; rubrik: string; app: string; vy: string | null }
  | { id: string; typ: 'data'; rubrik: string; app: string; kalla: string; data: unknown; avkortad: boolean }
  | { id: string; typ: 'berakning'; rubrik: string; app: string; kalla: string; data: unknown }
  | { id: string; typ: 'atgard'; rubrik: string; app: string; atgard: Atgardsforslag; beslut?: Beslut & { tid: string } }
  | { id: string; typ: 'hjalp'; rubrik: string; app: string; stycken: { rubrik: string; text: string }[] }
  | { id: string; typ: 'andring'; rubrik: string; app: string; andring: Andringsforslag; beslut?: Beslut & { tid: string } };

/**
 * En åtgärd som agenten föreslår. Agenten utför den aldrig själv: användaren godkänner i panelen och klienten
 * anropar då serverfunktionen motor (operationen atgard) med sina egna rättigheter. AI:n föreslår, människan bestämmer.
 */
export interface Atgardsforslag { namn: string; arende: string | null; args: unknown[]; beskrivning: string; krav: string }

/** Händelserna i strömmen från serverfunktionen assistent (text/event-stream, en JSON per data-rad). */
export type AssistentHandelse =
  | { typ: 'samtal'; id: string; titel: string }
  | { typ: 'text'; text: string }
  | { typ: 'verktyg'; verktyg: VerktygRad }
  | { typ: 'panel'; verktyg: string; panel: Panel }
  | { typ: 'klar'; meddelande: ChattMeddelande }
  | { typ: 'fel'; kod: string; text: string };

/** Ett sparat samtal som listan i sidomenyn visar. */
export interface SamtalRad { id: string; titel: string; andrad: string }

/** Ett sparat samtal: det chatten visar och panelerna som öppnades. */
export interface SparatSamtal extends SamtalRad { visning: ChattMeddelande[]; paneler: Panel[] }

/** Föreslagna frågor när ett samtal är tomt, per app. Text som användaren kan skicka direkt. */
export const FORSLAG: Record<string, string[]> = {
  allmant: ['Vad kan du hjälpa mig med?', 'Vilka appar har vi?'],
  avrakning: ['Visa förra månadens avräkning', 'Vilka bilar finns i bilregistret?', 'Öppna Avräkning'],
  akarkassan: ['Öppna Lön och kassa', 'Hur läser jag in löneunderlaget?'],
  tripkassan: ['Öppna Lön och bokföring', 'Hur läser jag in löneunderlaget?'],
  foliering: ['Vilka fakturor är obetalda?', 'Visa månadens siffror i Verkstad', 'Öppna Verkstad'],
};

/** En ändring i ett dokument: fältet (punktad väg, till exempel forare.1006.namn) får värdet, eller tas bort. */
export interface Andring { falt: string; varde?: unknown; taBort?: boolean }

/**
 * En ändring av data i en app som agenten föreslår. Användaren ser före och efter i panelen och godkänner. Då läser
 * klienten dokumentet på nytt, gör samma ändringar (tillampaAndringar) och sparar med sina egna rättigheter.
 */
export interface Andringsforslag {
  sokvag: string;
  andringar: Andring[];
  beskrivning: string;
  /** Fältens värden före och efter, för visningen. */
  rader: { falt: string; fore: unknown; efter: unknown }[];
  nytt: boolean;
}

const FARLIGA = new Set(['__proto__', 'prototype', 'constructor']);
/** Är fältets väg giltig? Högst sex nivåer, inga tomma delar och inga farliga namn. */
export const giltigtFalt = (f: string) => {
  const delar = f.split('.');
  return delar.length >= 1 && delar.length <= 6 && delar.every(d => d.length >= 1 && d.length <= 64 && !/\s/.test(d) && !FARLIGA.has(d));
};

/** Värdet på en punktad väg, eller undefined. */
export function lasFalt(dok: unknown, falt: string): unknown {
  let x = dok;
  for (const d of falt.split('.')) {
    if (x && typeof x === 'object' && Object.hasOwn(x, d)) x = (x as Record<string, unknown>)[d];
    else return undefined;
  }
  return x;
}

/** Ett nytt dokument med ändringarna gjorda. Originalet ändras inte. Mellanliggande objekt skapas vid behov. */
export function tillampaAndringar(dok: Readonly<Record<string, unknown>> | undefined, andringar: Andring[]): Record<string, unknown> {
  const ut = structuredClone((dok ?? {}) as Record<string, unknown>);
  for (const a of andringar) {
    if (!giltigtFalt(a.falt)) throw new Error('Ogiltigt fält: ' + a.falt);
    const delar = a.falt.split('.'), sista = delar.pop()!;
    let x: Record<string, unknown> = ut;
    for (const d of delar) {
      const n = x[d];
      if (!n || typeof n !== 'object' || Array.isArray(n)) x[d] = {};
      x = x[d] as Record<string, unknown>;
    }
    if (a.taBort) delete x[sista]; else x[sista] = structuredClone(a.varde);
  }
  return ut;
}
