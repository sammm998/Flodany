// Startar Chrome för Lighthouse. Misslyckas starten (till exempel "waiting for dynamic debugging port" i CI)
// görs ett nytt försök, en gång. Det gäller bara starten av webbläsaren, aldrig mätningen: en sida som får
// för låga värden fäller fortfarande jobbet.

/**
 * @template T
 * @param {() => Promise<T>} starta
 * @param {(text: string) => void} [logg]
 * @returns {Promise<T>}
 */
export async function startaChrome(starta, logg = console.warn) {
  try {
    return await starta();
  } catch (e) {
    logg(`Chrome startade inte (${e instanceof Error ? e.message : String(e)}). Startar om en gång.`);
    return await starta();
  }
}
