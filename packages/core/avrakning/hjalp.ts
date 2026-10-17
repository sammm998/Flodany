// Hjälpfunktioner från legacy/apps/avrakning/index.html, oförändrade.
import type { PdfItem } from '@flodia/kit';
import type { Manadsetiketter } from './types';

export const MANAD = ['JANUARI', 'FEBRUARI', 'MARS', 'APRIL', 'MAJ', 'JUNI', 'JULI', 'AUGUSTI', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DECEMBER'];
export const MAN3 = ['JAN', 'FEB', 'MARS', 'APR', 'MAJ', 'JUNI', 'JULI', 'AUG', 'SEP', 'OKT', 'NOV', 'DEC'];
export const r2 = (x: number): number => Math.round((x + Number.EPSILON) * 100) / 100;

export interface Rad {
  y: number;
  items: PdfItem[];
}

export function groupLines(items: PdfItem[]): Rad[] {
  const rows: Rad[] = [];
  items.filter(i => i.str && i.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x).forEach(it => {
    let r = rows.find(r => Math.abs(r.y - it.y) < 2.5);
    if (!r) { r = { y: it.y, items: [] }; rows.push(r); }
    r.items.push(it);
  });
  rows.sort((a, b) => a.y - b.y); rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
  return rows;
}

// Spec per förare: frivillig tjänst, aktiv från bolagets fsFrom (ÅÅÅÅ-MM)
export const fsAktiv = (B: { fsFrom?: string } | null | undefined, p: string | null | undefined): boolean => !!(B && B.fsFrom && p && p >= B.fsFrom);
export const ymAdd = (p: string, n: number): string => { const [y, m] = p.split('-').map(Number) as [number, number]; return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
export const deacc = (s: unknown): string => String(s || '').toUpperCase().replace(/[ÉÈÊË]/g, 'E').replace(/[ÁÀÂ]/g, 'A').replace(/Ü/g, 'U');

export function monthLabels(period: string): Manadsetiketter {
  const [y, mo] = period.split('-').map(Number) as [number, number];
  const vxM = (mo - 1 + 2) % 12, vxY = y + Math.floor((mo - 1 + 2) / 12);
  return { namn: MANAD[mo - 1].charAt(0) + MANAD[mo - 1].slice(1).toLowerCase() + ' ' + y,
    lang: MANAD[mo - 1] + y, vx: MAN3[vxM] + String(vxY).slice(2) };
}
