// Fotoläsning av klädlistan (ägarens uppdrag 2026-10-14). Operationen fotolasning i motor, modulen avrakning.
// - las: bilden skickas till Anthropics API och kastas sedan. Den sparas aldrig och loggas aldrig.
//   Svaret tvättas här: bara datum, bilnummer, utbildning och antal per plagg går tillbaka, aldrig namn.
// - lagg_till: de rader användaren valt i granskningstabellen sparas i klader/<period>.
// Statusarna (annan månad, finns redan, bil saknas, osäker) räknas här, inte i webbläsaren (beslut 26).
import { PLAGG, type FotoLast, type FotoMediaTyp, type FotoTillagt, type GranskadRad, type KladRad, type KladStatus, type Plagg } from '@flodia/api';
import { MotorFel } from './fel';
import type { Kontext } from './moduler';

/**
 * Det Anthropics Messages API får: modellen kommer ur konfigurationen, aldrig ur koden. Svaret begärs som JSON
 * enligt schemat (structured outputs, output_config.format). Inget tvingat verktyg (tool_choice av typen tool eller
 * any) och ingen temperature, top_p eller top_k: Claude Sonnet 5.5 svarar då med 400.
 */
export interface ClaudeAnrop {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: 'user'; content: unknown[] }[];
  output_config: { format: { type: 'json_schema'; schema: Record<string, unknown> } };
}
export interface ClaudeSvar { stop_reason?: string | null; content?: { type: string; text?: string }[] }

/** Anthropic från servern. null när nyckeln eller modellen saknas i konfigurationen. */
export interface Fotolasare { modell: string; anropa: (anrop: ClaudeAnrop) => Promise<ClaudeSvar> }

/** Anthropics gräns är 5 MB per bild. Webbläsaren förminskar fotot innan det skickas. */
export const MAX_BILD_BASE64 = 5 * 1024 * 1024;
export const MAX_RADER = 200;

const PLAGG_NYCKLAR = PLAGG.map(p => p.nyckel) as Plagg[];

/** Instruktionen till modellen. Ska tolka blanketten som fotoläsningen i Avräkning-artifacten (stäms av vid legacy-bytet). */
export function instruktion(period: string): { system: string; text: string } {
  const ar = period.slice(0, 4);
  return {
    system: 'Du läser foton av ifyllda klädlistor från en taxicentral och svarar bara med JSON enligt schemat. Du skriver aldrig ut namn, initialer eller annat om personer.',
    text: [
      `Läs klädlistan på bilden. Perioden är ${period}.`,
      'Blanketten har en rad per utlämning, med kolumnerna Datum, Bilnummer, Utbildning och antal per plagg: ' + PLAGG.map(p => p.namn).join(', ') + '.',
      'Det finns två varianter. Den gamla blanketten har också kolumnerna Förare och Åkare med namn. Den nya har inte dem. Båda kan ha "Utlämnad av" med namn eller initialer.',
      'Hoppa över kolumnerna Förare, Åkare och Utlämnad av helt. Skriv aldrig ut namn eller initialer, inte heller om de står i en annan kolumn.',
      `Datum: skriv som ÅÅÅÅ-MM-DD. Saknas året, använd ${ar}. Går datumet inte att läsa, skriv null och markera raden som osäker.`,
      'Bilnummer: bara siffrorna. Gissa aldrig. Går det inte att läsa, skriv null och markera raden som osäker.',
      'Utbildning: true om rutan är ifylld med ja, kryss eller bock, annars false.',
      'Antal: en tom ruta, ett streck eller en nolla är 0. Ett kryss utan siffra är 1.',
      'Markera raden som osäker om någon siffra är svårläst, överstruken eller rättad.',
      'Hoppa över rubrikrader, tomma rader och summarader.',
    ].join('\n'),
  };
}

// minimum och maximum stöds inte i schemat för structured outputs. Gränsen 0 till 99 kontrolleras i tvatta.
const heltal = { type: 'integer', description: 'Antal, 0 till 99' };
export const SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rader: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          datum: { type: ['string', 'null'], description: 'ÅÅÅÅ-MM-DD' },
          bilnummer: { type: ['string', 'null'], description: 'Bara siffror' },
          utbildning: { type: 'boolean' },
          ...Object.fromEntries(PLAGG_NYCKLAR.map(p => [p, heltal])),
          osaker: { type: 'boolean' },
        },
        required: ['datum', 'bilnummer', 'utbildning', ...PLAGG_NYCKLAR, 'osaker'],
        additionalProperties: false,
      },
    },
  },
  required: ['rader'],
  additionalProperties: false,
};

export function claudeAnrop(modell: string, period: string, bild: { mediaTyp: FotoMediaTyp; base64: string }): ClaudeAnrop {
  const { system, text } = instruktion(period);
  return {
    // Tänkandet räknas mot max_tokens, därför marginal.
    model: modell, max_tokens: 16000, system,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: bild.mediaTyp, data: bild.base64 } }, { type: 'text', text }] }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  };
}

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
function period(x: unknown): string {
  if (typeof x !== 'string' || !PERIOD.test(x)) throw new MotorFel(400, 'ogiltigt', 'Välj månad (ÅÅÅÅ-MM).');
  return x;
}

const MAGI: Record<FotoMediaTyp, (b: Uint8Array) => boolean> = {
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': b => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x),
  'image/webp': b => String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP',
};

/** Bilden kontrolleras (typ, storlek och att innehållet är en bild av den typen) innan den skickas vidare. */
export function kontrolleraBild(x: unknown): { mediaTyp: FotoMediaTyp; base64: string } {
  const b = (x ?? {}) as { mediaTyp?: unknown; base64?: unknown };
  if (typeof b.mediaTyp !== 'string' || !(b.mediaTyp in MAGI)) throw new MotorFel(400, 'ogiltigt', 'Fotot ska vara JPEG, PNG eller WebP.');
  if (typeof b.base64 !== 'string' || !b.base64) throw new MotorFel(400, 'ogiltigt', 'Fotot saknas.');
  if (b.base64.length > MAX_BILD_BASE64) throw new MotorFel(413, 'for_stor', 'Fotot är för stort. Ta det på nytt eller förminska det.');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b.base64)) throw new MotorFel(400, 'ogiltigt', 'Fotot kunde inte läsas.');
  const huvud = Uint8Array.from(atob(b.base64.slice(0, 16)), c => c.charCodeAt(0));
  if (!MAGI[b.mediaTyp as FotoMediaTyp](huvud)) throw new MotorFel(400, 'ogiltigt', 'Fotot kunde inte läsas.');
  return { mediaTyp: b.mediaTyp as FotoMediaTyp, base64: b.base64 };
}

function giltigtDatum(s: string): boolean {
  const [a, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(a!, m! - 1, d!));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m! - 1 && t.getUTCDate() === d;
}

/**
 * Tvättar en rad från modellen eller klienten. Bara de kända fälten läses, och varje fält måste ha rätt form:
 * text som inte är ett datum eller ett bilnummer (till exempel ett namn) kastas och raden blir osäker.
 */
export function tvatta(x: unknown): KladRad | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  const antalIn = (r.antal && typeof r.antal === 'object' ? r.antal : r) as Record<string, unknown>;
  let osaker = r.osaker === true;
  const datumText = typeof r.datum === 'string' ? r.datum.trim() : null;
  const datum = datumText && /^\d{4}-\d{2}-\d{2}$/.test(datumText) && giltigtDatum(datumText) ? datumText : null;
  if (!datum) osaker = true;
  const bilIn = r.bilnummer ?? r.bil;
  const bilText = typeof bilIn === 'number' ? String(bilIn) : typeof bilIn === 'string' ? bilIn.trim() : '';
  const bil = /^\d{1,5}$/.test(bilText) ? String(Number(bilText)) : null;
  if (!bil) osaker = true;
  const antal = {} as Record<Plagg, number>;
  for (const p of PLAGG_NYCKLAR) {
    const v = antalIn[p] ?? 0;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 99) antal[p] = v;
    else { antal[p] = 0; osaker = true; }
  }
  const utbildning = r.utbildning === true;
  if (!utbildning && PLAGG_NYCKLAR.every(p => antal[p] === 0)) return null;
  return { datum, bil, utbildning, antal, osaker };
}

const nyckel = (r: KladRad) => [r.datum, r.bil, r.utbildning ? 1 : 0, ...PLAGG_NYCKLAR.map(p => r.antal[p])].join('|');

interface SparadRad extends KladRad { id: string; kalla: 'foto'; tillagd: string }
export const kladSokvag = (p: string) => 'klader/' + p;

async function lasLage(ctx: Kontext, p: string): Promise<{ bilar: Set<string>; sparade: SparadRad[] }> {
  const db = ctx.db();
  const [b, k] = await Promise.all([db.doc('settings/bilar').get(), db.doc(kladSokvag(p)).get()]);
  const lista = (b.exists ? (b.data() as { list?: unknown }).list : null);
  const bilar = new Set((Array.isArray(lista) ? lista : []).map(x => String(Number((x as { bil?: unknown })?.bil))).filter(x => x !== 'NaN'));
  const rader = (k.exists ? (k.data() as { rader?: unknown }).rader : null);
  return { bilar, sparade: Array.isArray(rader) ? (rader as SparadRad[]) : [] };
}

function granska(r: KladRad, p: string, bilar: Set<string>, finns: Set<string>): GranskadRad {
  const status: KladStatus[] = [];
  if (r.datum && !r.datum.startsWith(p + '-')) status.push('annan_manad');
  if (finns.has(nyckel(r))) status.push('finns_redan');
  if (!r.bil || !bilar.has(r.bil)) status.push('bil_saknas');
  if (r.osaker) status.push('osaker');
  return { ...r, status, vald: status.length === 0 };
}

/** Raderna ur modellens JSON-svar, eller null om svaret inte är JSON med en lista rader. */
function lasJsonRader(text: string | undefined): unknown {
  if (typeof text !== 'string') return null;
  try { return (JSON.parse(text) as { rader?: unknown } | null)?.rader ?? null; } catch { return null; }
}

export async function fotolasning(data: unknown, ctx: Kontext, lasare: Fotolasare | null): Promise<FotoLast | FotoTillagt> {
  const d = (data ?? {}) as { steg?: unknown; period?: unknown; bild?: unknown; rader?: unknown };
  const p = period(d.period);

  if (d.steg === 'las') {
    const bild = kontrolleraBild(d.bild);
    let rader: KladRad[];
    try {
      if (!lasare) throw new MotorFel(503, 'ej_konfigurerad', 'Fotoläsningen är inte konfigurerad på servern.');
      const svar = await lasare.anropa(claudeAnrop(lasare.modell, p, bild));
      if (svar.stop_reason === 'refusal') throw new MotorFel(422, 'avbojd', 'Fotot kunde inte läsas. Fyll i raderna för hand.');
      // JSON-svaret ligger i textblocket. Tänkandet kommer i egna block och läses inte. Ett svar som slutat
      // på max_tokens kan vara avbrutet och godtas inte.
      if (svar.stop_reason !== 'end_turn') throw new MotorFel(502, 'ai_fel', 'Fotot kunde inte läsas just nu. Försök igen om en stund.');
      const ut = lasJsonRader(svar.content?.find(c => c.type === 'text')?.text);
      if (!Array.isArray(ut)) throw new MotorFel(502, 'ai_fel', 'Fotot kunde inte läsas just nu. Försök igen om en stund.');
      rader = ut.slice(0, MAX_RADER).map(tvatta).filter((r): r is KladRad => r !== null);
    } catch (e) {
      // Även misslyckade läsningar loggas, utan bildens innehåll.
      await ctx.logga('fotolasning.last', p, { rader: 0, fel: e instanceof MotorFel ? e.kod : 'serverfel' });
      throw e;
    }
    const { bilar, sparade } = await lasLage(ctx, p);
    const finns = new Set(sparade.map(nyckel));
    const granskade = rader.map(r => granska(r, p, bilar, finns));
    await ctx.logga('fotolasning.last', p, { rader: granskade.length, osakra: granskade.filter(r => r.osaker).length });
    return { period: p, rader: granskade };
  }

  if (d.steg === 'lagg_till') {
    if (!Array.isArray(d.rader) || d.rader.length === 0) throw new MotorFel(400, 'ogiltigt', 'Välj minst en rad.');
    if (d.rader.length > MAX_RADER) throw new MotorFel(400, 'ogiltigt', 'För många rader.');
    const rader = d.rader.map(tvatta);
    if (rader.some(r => r === null)) throw new MotorFel(400, 'ogiltigt', 'En rad saknar plagg eller utbildning.');
    const { sparade } = await lasLage(ctx, p);
    const finns = new Set(sparade.map(nyckel));
    const nya: SparadRad[] = [];
    for (const r of rader as KladRad[]) {
      const k = nyckel(r);
      if (finns.has(k)) continue;
      finns.add(k);
      nya.push({ ...r, id: `${ctx.tid.nuMs.toString(36)}-${sparade.length + nya.length + 1}`, kalla: 'foto', tillagd: ctx.tid.nu });
    }
    if (nya.length) await ctx.db().doc(kladSokvag(p)).set({ rader: [...sparade, ...nya] });
    await ctx.logga('fotolasning.tillagd', p, { rader: nya.length, hoppade: rader.length - nya.length });
    return { period: p, tillagda: nya.length, hoppade: rader.length - nya.length };
  }

  throw new MotorFel(400, 'ogiltigt', 'Okänt steg.');
}
