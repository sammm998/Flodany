// Skatte- och avgiftsregler med giltighetsdatum. Ändras årligen, därför här och inte i koden.
// Värdena är desamma som i legacy (åkarkassan och tripkassan, ENG.agAvgift och ENG.skattekolumn).

export interface AgSats {
  /** Andel som decimaltal, till exempel 0.3142 för 31,42 %. */
  sats: number;
  /** Texten som visas på lönebeskedet. */
  text: string;
}

/** Tillfälligt nedsatt avgift för unga, avgränsad i tid. */
export interface AgUngdom extends AgSats {
  /** Första och sista utbetalningsmånad (ÅÅÅÅ-MM) som nedsättningen gäller. */
  fran: string;
  till: string;
  /** Födelseår mellan (utbetalningsår minus maxAlder) och (utbetalningsår minus minAlder). */
  minAlder: number;
  maxAlder: number;
  /** Nedsättningen gäller lön upp till taket, resten med full avgift. */
  tak: number;
}

export interface LonRegler {
  /** Första utbetalningsmånad (ÅÅÅÅ-MM) som reglerna gäller. */
  giltigFran: string;
  ag: {
    full: AgSats;
    /** Födda detta år eller tidigare betalar ingen arbetsgivaravgift. */
    ingenTomFodelsear: number;
    ingen: AgSats;
    /** Födda (utbetalningsår minus franAlder) eller tidigare: nedsatt avgift. */
    aldre: AgSats & { franAlder: number };
    ungdom: AgUngdom[];
  };
  skatt: {
    /** Födda (år minus franAlder) eller tidigare får skattetabellens kolumn 3, övriga kolumn 1. */
    kolumn3FranAlder: number;
  };
}

export const LON_REGLER: LonRegler[] = [
  {
    giltigFran: '2025-01',
    ag: {
      full: { sats: 0.3142, text: '31,42 %' },
      ingenTomFodelsear: 1937,
      ingen: { sats: 0, text: '0 %' },
      aldre: { sats: 0.1021, text: '10,21 %', franAlder: 67 },
      ungdom: [{ fran: '2026-04', till: '2027-09', minAlder: 19, maxAlder: 23, sats: 0.2081, tak: 25000, text: '20,81 % upp till 25 000 kr' }],
    },
    skatt: { kolumn3FranAlder: 67 },
  },
];

/**
 * Reglerna för en utbetalningsmånad: den senaste versionen vars giltigFran är samma eller tidigare.
 * Före den första versionen används den äldsta (legacy hade samma regler för alla månader).
 */
export function reglerFor(utbMan: string, regler: LonRegler[] = LON_REGLER): LonRegler {
  const sorterade = [...regler].sort((a, b) => a.giltigFran.localeCompare(b.giltigFran));
  let vald = sorterade[0];
  for (const r of sorterade) if (r.giltigFran <= utbMan) vald = r;
  if (!vald) throw new Error('Inga löneregler är inlagda');
  return vald;
}
