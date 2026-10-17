// Påhittad klientkod som bryter mot beslut 26: den importerar en motor. Används bara av tests/klientpaket.test.ts
// för att visa att kontrollen av klientpaketet slår larm. Får aldrig importeras av riktig klientkod.
import { avrakningEngine, parsrar } from '@flodia/core/avrakning';

export const motor = { avrakningEngine, parsrar };
