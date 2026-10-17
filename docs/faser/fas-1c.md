# Fas 1c: Folieringens affärslogik

Datum: 2026-10-11 · Gren: `main` · Underlag: SPEC-v3.1 avsnitt 3, CLAUDE.md (beräkningsmotorerna), `docs/faser/fas-1c-tillagg.md`, `docs/faser/fas-1c-beslut.md`.

**Klart när (v3.1, fas 1):** jämförelsetester mot legacy är gröna och varje motor följer motorkontraktet.
**Status för 1c:** folieringens prislista, fakturanumrering, momsflöde, påminnelser, bokföring och SIE-export ligger i `packages/core/foliering`. Gamla och nya ger exakt samma resultat i alla jämförelser, även id, tidsstämplar och SIE-filerna byte för byte. `npm run ci` är grönt. Därmed är fas 1 (motorerna) klar för alla fyra apparna.

## Ägarens beslut

| Fråga | Beslut |
|---|---|
| Omfattning | CLAUDE.md:s lista och det den behöver. Bank, kalkyl, lönespec, leverantörsfaktura och mejltexter tas senare. |
| Åtgärderna i skärmkoden | Jämförs mot legacy genom att legacys egna händelsehanterare körs. |
| Tillägg 1 till 5 (`fas-1c-tillagg.md`) | Fasta värden för klocka och slump även i legacy, TZ i testet, facit för datumskiften och numrering, BOK_START och kontoplanen i avvikelselistan, ingen testdata för bank. |
| Fynden a till g (`fas-1c-beslut.md`) | Behålls exakt som i legacy och låses av testerna. Rättas i fas 3, ett test per fynd som först visar felet. |

## Vad som byggts

| Commit | Innehåll |
|---|---|
| `cb8915e` Fas 1c: folieringens logik i TypeScript | `packages/core/foliering`: `grund.ts` (grundfunktioner, prislista, konton, SIE-tecken), `motor.ts` (`foliering(S, tid)` med status, numrering, momsflöde, översikt och påminnelser, bokföring, SIE och åtgärderna), `types.ts`, `index.ts` med `folieringEngine`. |
| `3364bbe` Fas 1c: jämförelsetester mot legacy | Sandlåda för legacy-skriptet, drivrutin som gör samma steg i båda, 6 handskrivna scenarier med facit och SIE-filer, 300 slumpade scenarier. `*.se binary` i `.gitattributes`. |
| `cef6cde` Fas 1c: periodSum med typat objekt | Typomvandlingen bort, samma beräkning. |
| Fas 1c: rapport | Den här filen, `fas-1c-tillagg.md` och `fas-1c-beslut.md`. |

### Så flyttades logiken

- **Logiken var blandad med skärmkoden.** Appen är ett enda skript utan motorobjekt. Rena funktioner (status, numrering, momsflöde, bokföring, SIE) är flyttade rad för rad. Det som låg i skärmkoden är utbrutet utan ändrat beteende:
  - påminnelser och nyckeltal ur översiktsvyn, nu `oversikt()` som ger data i stället för HTML
  - åtgärderna ur klickhanteraren, i `atgarder`
  - fältändringar ur input- och change-hanterarna
  - manuell verifikation och export ur bokföringens knappar
- **Tillståndet och tiden skickas in.** Legacy läste appens globala `S` och klockan. `foliering(S, tid)` får tillståndet och `Tid` (`idag`, `nu`, `nuMs`, `slump`). Motorn läser aldrig klockan.
- **Åtgärderna sparar inte själva.** De gör samma ändringar på ärendet som legacy och returnerar vad som ska sparas (`spara`), filer (`filer`, SIE) och meddelanden till användaren, i samma ordning som legacy.
- **Filer:** planen hade `faktura.ts`, `atgarder.ts`, `bokforing.ts` och `sie.ts`. Det blev en `motor.ts`, eftersom all logik delar samma tillstånd och tid, som i legacy. **Uppdelningen görs i fas 3.**

### Filer

```
packages/core/foliering/grund.ts             grundfunktioner, DEF_PRISER, DEF_FORETAG, konton, CP437
packages/core/foliering/motor.ts             foliering(S, tid): all logik och åtgärderna
packages/core/foliering/types.ts             datatyper
packages/core/foliering/index.ts             folieringEngine enligt kitet
packages/core/foliering/jamforelse.test.ts
packages/core/foliering/fixtures/            drivrutin, scenarier, generator, facit och SIE-filer
tests/legacy-foliering.ts                    kör legacy-skriptet i en sandlåda
```

## Testresultat

`npm run ci` (lint, typkontroll, tester), 2026-10-11:

```
> lint       eslint .              inga fel
> typecheck  tsc --noEmit          inga fel
> test       vitest run
 Test Files  7 passed (7)
      Tests  1343 passed (1343)
```

| Del | Antal | Resultat |
|---|---|---|
| Svensk tid satt i testet, CP437, `sieTxt`, `esc` och `plate` mot legacy | 2 | Gröna |
| Handskrivna scenarier, gammal mot ny steg för steg | 6 | Exakt lika |
| Ny motor (utan legacy) mot facit och `.se`-filerna | 6 | Exakt lika |
| Fakturanumrering enligt facit | 1 | Grön |
| **Slumpade scenarier, seed 20261013** | **300** | **Exakt lika i alla** |
| Kontraktet (motorn ändrar inte tillståndet) | 1 | Grön |
| Fas 0, 1a och 1b | 1026 | Gröna |

Utskrift från testkörningen:

```
Foliering: 300 slumpade scenarier (seed 20261013), gammal och ny motor gav samma resultat i alla.
12900 åtgärder (202 kastar samma fel i båda), 1416 kontroller av översikt, påminnelser, fakturor och bokföring.
758 fakturor, 267 momsfakturor, 178 exporterade perioder med 237 verifikationer, 94409 byte SIE jämförda byte för byte.
```

- **Så jämförs det.** Hela legacy-skriptet körs i en sandlåda (`tests/legacy-foliering.ts`). `new Date()`, `Date.now()` och `Math.random()` ger samma fasta värden som den nya koden får, så att id och tidsstämplar jämförs (tillägg 1). Åtgärderna görs genom legacys egna klick-, input- och change-hanterare. Efter varje åtgärd jämförs hela tillståndet och allt som sparas, visas och laddas ner. Översiktens att göra-lista finns i legacy bara som HTML. Den nya listan skrivs ut likadant och jämförs med HTML:en.
- **SIE byte för byte.** Varje export jämförs som bytes. Facit sparas som `.se`-filer (CP437, CRLF). `*.se binary` i `.gitattributes` hindrar git från att ändra radsluten.
- **Tidszon (tillägg 2).** `process.env.TZ = 'Europe/Stockholm'` sätts i testfilen, och ett test kontrollerar det.
- **Handskrivna scenarier:**

| Scenario | Täcker |
|---|---|
| `momsflode` | Hela flödet med export av tre perioder |
| `agareSaknas` | Ägare saknas, momsfaktura för hand, ångrad betalning efter låsning |
| `numrering` | Serien lägre än högsta nr, makulering av högsta, M-nummer efter makulering (tillägg 3) |
| `numreringUtanSerie` | Fakturanummer återanvänds (fynd a) |
| `datumskiften` | Vintertid 2026-10-25, årsskiftet och sommartid 2027-03-28, med förfallodag och påminnelse över skiftet. Räkenskapsår som kalenderår (tillägg 2) |
| `sie` | Svenska tecken, citattecken, radbrytning, tankstreck och € |

- **Datumskiften.** Fakturan räknas som förfallen först dagen efter förfallodatum. Påminnelsen kommer tillbaka efter exakt 7 dagar, även över skiftena.
- **Motprov**, alla återställda och gröna efteråt:

| Ändring | Röda tester |
|---|---|
| Moms 24 % | 62 |
| Fakturor börjar på 1002 | 252 |
| Påminnelse efter 6 dagar | 82 |
| CP437: Å blir 142 | 51 |
| Id med ett tecken till | 301 |
| `andrad` utan millisekunder | 313 |

All testdata är påhittad: "Försäkring 1 AB", "Ägare Ett AB", "Handläggare Ett", regnummer `ABCnnX`, e-post på `example.se`.

## Kända fel att rätta

Fynden finns i legacy och är medvetet kvar (regeln för fas 1: inga logikändringar). Testerna låser dem. De rättas på plattformen i fas 3, med ett test per fynd som först visar felet.

1. **a. Fakturanummer kan återanvändas. Hög prioritet.** Utan `serie.nasta` i inställningarna får en makulerad högsta faktura samma nummer igen (facit `numreringUtanSerie`: 1002 två gånger). Legacy uppdaterar serien i databasen men inte i minnet, och litar på att databasen skickar tillbaka ändringen. **Lagkrav:** en faktura ska ha ett löpnummer som unikt identifierar den (mervärdesskattelagen 2023:200, 17 kap). Makulerade nummer får aldrig delas ut igen.
2. **f. Felaktiga åtgärder kraschar. Måste vara klart i fas 2, innan API:t öppnas.** En åtgärd i fel läge, till exempel "betald" på ett ärende utan faktura, kastar TypeError. 202 av 12 900 slumpade åtgärder gjorde det, likadant i båda. Legacy skyddas bara av att knappen inte visas. På plattformen tar servern emot anrop direkt, så varje åtgärd ska kontrollera läget och ge ett tydligt fel.
3. **c. Momsfakturan ligger kvar när försäkringsbolagets betalning ångras. Hög prioritet.** Den kan fortfarande skickas och betalas (facit `agareSaknas`). Rättelse: är den inte skickad ska den tas bort. Är den skickad ska en kreditfaktura skapas.
4. **b. En tom månad blockerar bokföringen. Medel.** En månad utan verifikationer kan inte exporteras, och meddelandet blir det missvisande "Verifikationerna balanserar inte." Bara första öppna period kan låsas, så inga senare månader går att exportera förrän någon lägger in en verifikation. Provat: export av 2026-08 utan händelser ger meddelandet, och 2026-09 gör ingenting. Rättelse: en tom månad ska kunna låsas, och meddelandet ska säga vad som är fel.
5. **g. SIE-filen ändrar text tyst. Låg.** Tecken utanför CP437 blir `?` (€ i firmanamnet), citattecken tas bort och texter kortas till 100 tecken. Rättelse: behåll CP437, men visa en varning med vilka tecken som byttes.
6. **e. Betalningsvillkor 0 blir 10 dagar. Låg.** `+villkorDagar || 10` gör att 0 aldrig gäller.
7. **d. Momsfakturan dateras den dag betalningen registreras,** inte på försäkringsbolagets betaldatum. **Behålls:** det är fakturans utfärdandedatum. Ingen åtgärd.

## Avvikelser

| Nr | Avvikelse | Beslut |
|---|---|---|
| 1 | Inga skillnader i resultat mellan gammal och ny. | Godkänt. |
| 2 | Ändringar utan ändrat resultat: tid och slump skickas in, översikten ger data i stället för HTML, åtgärderna returnerar vad som ska sparas, fakturalistorna har `id` i stället för en referens till ärendet. | Godkänt. |
| 3 | Hårdkodade momssatser, priser och konton, se nedan. | Flyttas inte i 1c. Fas 3. |
| 4 | Fynden a till g. | Se Kända fel att rätta. |
| 5 | Planens fyra filer blev en `motor.ts`. | Delas upp i fas 3. |
| 6 | `*.se binary` i `.gitattributes` (utanför paketet). | Behövs för SIE-facit. |

### Hårdkodat (flyttas i fas 3, i samma steg som avräkningens och lönens)

- **Moms:** 25 % i momsbeloppet (`belopp * 0.25`) och i texter ("Utg moms 25 %", kontonamnen för 2611 och 3001).
- **Priser:** `DEF_PRISER` (14 priser, vanlig och större bil, meter folie per del). `DEF_FORETAG` med betalningsvillkor 10 dagar och offertens giltighet 30 dagar. Både företagsuppgifter och priser kan redan ändras per kund i inställningarna, men standardvärdena står i koden.
- **Kontoplanen:** `KONTON` (20 BAS-konton med namn), `KOST_KONTO` (material 4010, underleverantör 4600, övrigt 6990), och kontonummer direkt i koden: 1930, 3001, 2611, 2641, 1510, samt 7010 i varningen om lön.
- **Bokföringen:**
  - `BOK_START = '2026-08'` (första bokföringsperiod)
  - räkenskapsåret börjar i september om inget anges
  - bokslut enligt kontantmetoden
  - `#PROGRAM "Foliering Demo"` och filnamnet `SIE_DemoFoliering_` i SIE-filen
- **Numrering och rutiner:** fakturastart 1001, prefixet `M-` för momsfakturor, påminnelse efter 7 dagar (`PAMINN_DAGAR`) och offertpåminnelse efter 5 dagar (`OFFERT_DAGAR`).
- **Försäkringsbolag:** id `lf` används som standard för nya ärenden.

### Tas senare (ägarens beslut)

Bankmatchning och bankgirospecifikation, kalkyl och ekonomi (`kalk`, med arbetsgivaravgift 31,42 %, semester 12 % och skatt 32 % hårdkodat), lönespecar, leverantörsfakturor, mejltexter och löneverifikation i bokföringen. Vyer, PDF och Excel stannar i skärmkoden.

## Krav för fas 2 (utöver fas 1b)

1. Varje åtgärd kontrollerar läget och ger ett tydligt fel (fynd f).
2. "Idag" räknas uttryckligen i Europe/Stockholm i koden, som kravet för lönen i fas 1b.

## Vad ägaren ska kontrollera

- [ ] Kör `npm run ci`. Sista raden ska visa `Tests 1343 passed (1343)`.
- [ ] Kör `npx vitest run packages/core/foliering --reporter=verbose` och se raden "300 slumpade scenarier".
- [ ] Öppna en SIE-fil i `packages/core/foliering/fixtures/facit/momsflode/` i Visma eller ett annat bokföringsprogram och kontrollera att den läses in.
- [ ] Läs Kända fel att rätta och bekräfta prioriteringen.
- [ ] Klistra in den här rapporten hos Claude (Cowork) för granskning innan fas 2.
