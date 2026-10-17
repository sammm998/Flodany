// Varumärke nivå 1 (SPEC-v3.1 15.1 och 15.2.1): kunden väljer bara huvudfärgen. Statusfärgerna är fasta.
// Färgen används på knappar och aktiv meny med vit text, så den måste klara WCAG AA (4,5:1 mot vitt).
// En färg som inte klarar det, eller inte går att läsa, ersätts med standardfärgen och ett skäl.

export const STANDARD_ACCENT = '#1F4D3A';
export const AA = 4.5;

/** #RGB eller #RRGGBB till [r, g, b] 0 till 255, annars null. */
export function lasFarg(farg: unknown): [number, number, number] | null {
  if (typeof farg !== 'string') return null;
  const m = farg.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split('').map(c => c + c).join('') : m[1]!;
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Relativ luminans enligt WCAG 2.2. */
export function luminans([r, g, b]: [number, number, number]): number {
  const k = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
}

/** Kontrastkvoten mellan två färger, 1 till 21. */
export function kontrast(a: [number, number, number], b: [number, number, number]): number {
  const [l1, l2] = [luminans(a), luminans(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export interface Accent { farg: string; godkand: boolean; skal?: string }

/** Kontots huvudfärg om den klarar AA mot vit text, annars standardfärgen och varför. */
export function valjAccent(farg: unknown): Accent {
  if (farg === undefined || farg === null || farg === '') return { farg: STANDARD_ACCENT, godkand: true };
  const rgb = lasFarg(farg);
  if (!rgb) return { farg: STANDARD_ACCENT, godkand: false, skal: 'Färgen kunde inte läsas. Ange den som till exempel #1F4D3A.' };
  const k = kontrast(rgb, [255, 255, 255]);
  if (k < AA) return { farg: STANDARD_ACCENT, godkand: false, skal: `Färgen ger för låg kontrast mot vit text (${k.toFixed(1).replace('.', ',')}:1, minst 4,5:1 krävs).` };
  return { farg: (farg as string).trim().toUpperCase(), godkand: true };
}
