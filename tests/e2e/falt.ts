// Regeln i docs/designsystem.md: fält i samma rad har samma underkant och samma höjd.
// Mäter alla synliga fält i sidans eget dokument (inte i ramar, så legacy-apparna ingår aldrig).
import type { Page } from '@playwright/test';

export const TOLERANS = 1;

export interface FaltAvvikelse { rad: string[]; underkant: number[]; hojd: number[] }

/** Fält som överlappar vertikalt i samma behållare och skiljer mer än toleransen i underkant eller höjd. */
export async function faltAvvikelser(page: Page, tolerans = TOLERANS): Promise<FaltAvvikelse[]> {
  return page.evaluate((tol) => {
    const SELEKTOR = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea';
    const namn = (el: HTMLElement) => {
      const id = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const etikett = (id?.textContent ?? el.closest('label')?.textContent ?? el.getAttribute('aria-label') ?? el.getAttribute('placeholder') ?? el.getAttribute('name') ?? el.tagName).trim();
      return etikett.replace(/\s+/g, ' ').slice(0, 60);
    };
    const falt = [...document.querySelectorAll<HTMLElement>(SELEKTOR)]
      // Cellen är fältet med sin etikett (label eller .fl-falt). Rader grupperas efter cellerna, eftersom en etikett
      // som bryts trycker ner rutan så långt att rutorna själva inte längre överlappar.
      .map(el => { const cell = (el.closest('.fl-falt, label') as HTMLElement | null) ?? el; return { el, r: el.getBoundingClientRect(), c: cell.getBoundingClientRect(), behallare: el.closest('form, [role="dialog"], header, aside, main, body')! }; })
      .filter(f => f.r.width > 0 && f.r.height > 0 && getComputedStyle(f.el).visibility !== 'hidden');
    const ut: { rad: string[]; underkant: number[]; hojd: number[] }[] = [];
    const sedda = new Set<HTMLElement>();
    for (const f of falt) {
      if (sedda.has(f.el)) continue;
      // En rad: fält i samma behållare vars celler överlappar vertikalt med det här fältets cell.
      const rad = falt.filter(g => g.behallare === f.behallare && g.c.top < f.c.bottom && f.c.top < g.c.bottom);
      rad.forEach(g => sedda.add(g.el));
      if (rad.length < 2) continue;
      const underkant = rad.map(g => Math.round(g.r.bottom * 10) / 10), hojd = rad.map(g => Math.round(g.r.height * 10) / 10);
      if (Math.max(...underkant) - Math.min(...underkant) > tol || Math.max(...hojd) - Math.min(...hojd) > tol)
        ut.push({ rad: rad.map(g => namn(g.el)), underkant, hojd });
    }
    return ut;
  }, tolerans);
}

/** Läsbar text för ett fel: vy, bredd och vilka fält som skiljer sig. */
export function beskriv(vy: string, bredd: number, a: FaltAvvikelse[]): string[] {
  return a.map(x => `${vy} vid ${bredd} punkter: ${x.rad.map((n, i) => `"${n}" underkant ${x.underkant[i]} höjd ${x.hojd[i]}`).join(', ')}`);
}
