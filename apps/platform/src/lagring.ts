// Webbläsarens lagring. Används bara för bekvämlighet, aldrig för behörighet.
/** Legacy-apparna sparar kopior i webbläsaren (ak_, tt_, shim:). De rensas vid utloggning (fråga 2 i fas-2c.md). */
export const LEGACY_PREFIX = ['ak_', 'tt_', 'shim:'];
export function rensaLegacyKopior(lagring: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage): number {
  const bort: string[] = [];
  try { for (let i = 0; i < lagring.length; i++) { const k = lagring.key(i); if (k && LEGACY_PREFIX.some(p => k.startsWith(p))) bort.push(k); } } catch { return 0; }
  for (const k of bort) { try { lagring.removeItem(k); } catch { /* lagringen är avstängd */ } }
  return bort.length;
}
