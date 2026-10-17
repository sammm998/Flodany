// Ingången för demoläget på Railway (scripts/bygg-demo.mjs). Körs bara på servern. Legacy-filerna läses in som
// text vid paketeringen och lämnas bara ut med DEMO_NUVARANDE_APPAR=ja (packages/server/demo.ts).
import avrakning from '../../legacy/apps/avrakning/index.html';
import akarkassan from '../../legacy/apps/akarkassan/index.html';
import tripkassan from '../../legacy/apps/tripkassan/index.html';
import foliering from '../../legacy/apps/foliering/index.html';
import type { LegacyApp } from './legacy';

export { demo } from './demo';
export const FILER: Record<LegacyApp, string> = { avrakning, akarkassan, tripkassan, foliering };
