// Grundfunktioner och konstanter från legacy/apps/foliering/index.html, oförändrade.
// Hårdkodade priser, konton och startdatum står här som i legacy. De flyttas till konfiguration i fas 3.

export const r2 = (x: unknown): number => Math.round((+(x as number) + Number.EPSILON) * 100) / 100;
export function fmt(n0: unknown, dec?: boolean): string {
  let n = +(n0 as number) || 0; const neg = n < 0; n = Math.abs(n);
  const showDec = dec === true || (dec !== false && Math.round(n * 100) % 100 !== 0);
  const [i0, d] = n.toFixed(2).split('.') as [string, string]; const i = i0.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + i + (showDec ? ',' + d : '');
}
export const kr = (n: unknown, dec?: boolean): string => fmt(n, dec) + ' kr';
export const addDays = (d: string, n: number): string => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string): number => Math.round((+new Date(b + 'T12:00:00Z') - +new Date(a + 'T12:00:00Z')) / 864e5);
export const sumRows = (rows: { antal?: unknown; apris?: unknown }[] | null | undefined): number => r2((rows || []).reduce((a, r) => a + (+(r.antal as number) || 0) * (+(r.apris as number) || 0), 0));
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
export const plateTxt = (r: unknown): string => { const s = String(r || '').toUpperCase().replace(/\s/g, ''); return /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(s) ? s.slice(0, 3) + ' ' + s.slice(3) : s; };
export const normReg = (r: unknown): string => String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function parseAmount(s: unknown): number | null {
  if (typeof s === 'number') return s;
  let t = String(s ?? '').replace(/−/g, '-').replace(/\s| /g, '').replace(/kr|SEK/gi, '');
  if (!/\d/.test(t)) return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, ''); else t = t.replace(/,/g, '');
  const n = parseFloat(t); return isNaN(n) ? null : n;
}
export function setPath(o: Record<string, unknown>, p: string, v: unknown): void { const k = p.split('.'); let x = o; for (let i = 0; i < k.length - 1; i++) x = (x[k[i]!] = x[k[i]!] || {}) as Record<string, unknown>; x[k[k.length - 1]!] = v; }

export const MAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
export const pAdd = (p: string, n: number): string => { const [y, m] = p.split('-').map(Number) as [number, number], t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
export const pSlut = (p: string): string => addDays(pAdd(p, 1) + '-01', -1);
export const pNamn = (p: string): string => { const [y, m] = p.split('-'); return MAN[+m! - 1] + ' ' + y; };

/* ============ Standardvärden (används om databasen saknar inställningar) ============ */
export const DEF_FORETAG = { namn: 'Demo Foliering AB', adress: 'Box 0000', postort: '211 00 Malmö', orgnr: '559000-0001', momsnr: 'SE559000000101', epost: 'info@example.se', bg: '0000-0000', underskrift: 'Förnamn Efternamn', titel: 'VD', villkorDagar: 10, giltighet: 30 };
export const DEF_PRISER = [
  { id: 'sf-fram', kat: 'Stötfångare', text: 'Foliering stötfångare fram', vanlig: 4000, storre: 5500, mv: 2, ms: 2.4 },
  { id: 'sf-bak', kat: 'Stötfångare', text: 'Foliering stötfångare bak', vanlig: 3500, storre: 5000, mv: 1.8, ms: 2.2 },
  { id: 'dorr', kat: 'Dörrar', text: 'Foliering 1 dörr', textN: 'Foliering {n} dörrar', vanlig: 1500, storre: 2000, perSt: true, mv: 1, ms: 1.2 },
  { id: 'kapa-vf', kat: 'Kåpor och sidodetaljer', text: 'Foliering vänster sidokåpa fram', vanlig: 1000, storre: 1500, mv: 0.7, ms: 0.85 },
  { id: 'kapa-hb', kat: 'Kåpor och sidodetaljer', text: 'Foliering höger bakkåpa', vanlig: 1000, storre: 1500, mv: 0.7, ms: 0.85 },
  { id: 'kapa-sb', kat: 'Kåpor och sidodetaljer', text: 'Foliering sidokåpa bak', vanlig: 1000, storre: 1500, mv: 0.7, ms: 0.85 },
  { id: 'spegel', kat: 'Kåpor och sidodetaljer', text: 'Foliering backspegel', textN: 'Foliering {n} backspeglar', vanlig: 500, storre: 700, perSt: true, mv: 0.25, ms: 0.3 },
  { id: 'dek-2', kat: 'Dekaler', text: 'Dekalering, båda sidor', vanlig: 3000, storre: 3000, mv: 0, ms: 0 },
  { id: 'dek-1', kat: 'Dekaler', text: 'Dekalering, en sida', vanlig: 1500, storre: 1500, mv: 0, ms: 0 },
  { id: 'dek-h', kat: 'Dekaler', text: 'Dekalering, halv sida', vanlig: 750, storre: 750, mv: 0, ms: 0 },
  { id: 'dek-mh', kat: 'Dekaler', text: 'Dekalering motorhuv', vanlig: 750, storre: 750, mv: 0, ms: 0 },
  { id: 'motorhuv', kat: 'Övriga ytor', text: 'Foliering motorhuv', vanlig: 2500, storre: 3500, mv: 1.6, ms: 1.9 },
  { id: 'baklucka', kat: 'Övriga ytor', text: 'Foliering baklucka', vanlig: 2000, storre: 3000, mv: 1.4, ms: 1.7 },
  { id: 'hel', kat: 'Helfoliering', text: 'Helfoliering hel bil', vanlig: 25000, storre: 30000, mv: 16, ms: 19 }
];
export const ST: Record<string, { t: string; c: string }> = {
  utkast: { t: 'Utkast', c: 'muted' }, skickad: { t: 'Offert skickad', c: 'info' }, godkand: { t: 'Godkänd', c: 'warn' },
  fakturerad: { t: 'Fakturerad', c: 'accent' }, betald: { t: 'Betald', c: 'good' }, avslag: { t: 'Avslag', c: 'bad' }
};
export const STEG = ['utkast', 'skickad', 'godkand', 'fakturerad', 'betald'];
export const FS: Record<string, [string, string]> = { betald: ['Betald', 'good'], forfallen: ['Förfallen', 'bad'], obetald: ['Ej betald', 'warn'], ejskickad: ['Ej skickad', 'muted'], vantar: ['Väntar på försäkringsbolaget', 'muted'] };
/* Rutin: påminnelse till försäkringsbolaget första bankdagen efter förfallodagen, sedan var 7:e dag tills betalt. */
export const PAMINN_DAGAR = 7;
/* Rutin: offerter utan skriftligt godkännande påminns var 5:e dag. */
export const OFFERT_DAGAR = 5;

/* ============ Bokföring ============ */
export const KTYP: Record<string, string> = { material: 'Folie och material', lon: 'Lön', ul: 'Underleverantör', ovrigt: 'Övrigt' };
export const KONTON: Record<number, string> = { 1510: 'Kundfordringar', 1630: 'Skattekonto', 1930: 'Företagskonto', 2081: 'Aktiekapital', 2611: 'Utgående moms på försäljning inom Sverige, 25 %', 2641: 'Debiterad ingående moms', 2710: 'Personalskatt', 2731: 'Avräkning lagstadgade sociala avgifter', 2890: 'Övriga kortfristiga skulder', 2910: 'Upplupna löner', 2940: 'Upplupna lagstadgade sociala avgifter', 3001: 'Försäljning inom Sverige, 25 % moms', 4010: 'Inköp material och varor', 4600: 'Legoarbeten och underentreprenader', 6570: 'Bankkostnader', 6990: 'Övriga externa kostnader', 7010: 'Löner till kollektivanställda', 7082: 'Semesterlöner till kollektivanställda', 7510: 'Arbetsgivaravgifter', 8423: 'Kostnadsränta för skatter och avgifter' };
export const BOK_START = '2026-08';
export const KOST_KONTO: Record<string, number> = { material: 4010, ul: 4600, ovrigt: 6990 };

/* SIE4I */
export const CP437: Record<string, number> = { 'Ç': 128, 'ü': 129, 'é': 130, 'â': 131, 'ä': 132, 'à': 133, 'å': 134, 'ç': 135, 'ê': 136, 'ë': 137, 'è': 138, 'ï': 139, 'î': 140, 'ì': 141, 'Ä': 142, 'Å': 143, 'É': 144, 'æ': 145, 'Æ': 146, 'ô': 147, 'ö': 148, 'ò': 149, 'û': 150, 'ù': 151, 'ÿ': 152, 'Ö': 153, 'Ü': 154, 'ø': 155, '£': 156, 'Ø': 157, 'á': 160, 'í': 161, 'ó': 162, 'ú': 163, 'ñ': 164, 'Ñ': 165, '§': 21 };
export function cp437(s: string): ArrayBuffer { const out = new Uint8Array(s.length); let n = 0; for (const ch of s) { const c = ch.charCodeAt(0); out[n++] = c < 128 ? c : (CP437[ch] ?? 63); } return out.slice(0, n).buffer; }
export const sieTxt = (s: unknown): string => '"' + String(s ?? '').replace(/[\u2013\u2014]/g, '-').replace(/["\\]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 100) + '"';
export const sieD = (d: string): string => d.replace(/-/g, '');
export const sieNamn = (p: string): string => `SIE_DemoFoliering_${p}.se`;
