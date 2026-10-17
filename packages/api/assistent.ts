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
}

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
  | { id: string; typ: 'atgard'; rubrik: string; app: string; atgard: Atgardsforslag }
  | { id: string; typ: 'hjalp'; rubrik: string; app: string; stycken: { rubrik: string; text: string }[] };

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
