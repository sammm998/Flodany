// Ingången för Edge Function legacy. Legacy-filerna läses in som text vid paketeringen och finns bara
// i serverfunktionens paket, aldrig i klientbygget (se legacy.ts, undantaget från beslut 26).
import avrakning from '../../legacy/apps/avrakning/index.html';
import akarkassan from '../../legacy/apps/akarkassan/index.html';
import tripkassan from '../../legacy/apps/tripkassan/index.html';
import foliering from '../../legacy/apps/foliering/index.html';
import type { LegacyApp } from './legacy';

export { hanteraLegacy } from './legacy';
export { tjansterFranMiljo } from './tjanster';
export { nycklarFranMiljo } from './nycklar';
export { startaFellogg } from '@flodia/api';
export const FILER: Record<LegacyApp, string> = { avrakning, akarkassan, tripkassan, foliering };
