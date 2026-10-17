# Fas 1a: Kit-kontrakt och avräkningsmotorn

Datum: 2026-10-11 · Gren: `main` · Underlag: SPEC-v3.1 avsnitt 2 och 3.

**Klart när (v3.1, fas 1):** jämförelsetester mot legacy är gröna och varje motor följer motorkontraktet.
**Status för 1a:** avräkningens motor är flyttad och följer kontraktet. Gamla och nya motorn ger exakt samma resultat i alla jämförelser. `npm run ci` är grönt. Åkarkassan, tripkassan och foliering återstår (fas 1b och framåt).

## Vad som byggts

| Commit | Innehåll |
|---|---|
| `5afd29c` Fas 1a: kit-kontrakt | `packages/kit`: `FileParser`, `ParseResult`, `FileInput`, `Engine`, `Rule`, `Finding` och `valjParser` (högst `detect` vinner, under 0,6 blir svaret "fråga användaren"). |
| `31b68c6` Fas 1a: avräkningsmotorn i TypeScript | `packages/core/avrakning`: `compute`, `parseTaxiCaller`, `parseBambora`, `parseTcCsv`, `parseApp`, `countPassages`, `monthLabels` och hjälpfunktionerna de behöver. Kontraktsadaptrar: `avrakningEngine` och fyra parsrar (`tc`, `tc-csv`, `bamb`, `app`). |
| `9b0a595` Fas 1a: jämförelsetester mot legacy | Påhittade fixtures, 8 handskrivna scenarier med facitfiler, 300 slumpade scenarier med fast seed. |
| `e5339be` Fas 1a: valfri context i FileParser.parse | `parse(input, context?)`. `tc-csv` får tidigare månaders kontonamn via `context.kontonamn`, som legacy gör med `kontoNamn()`. |

### Så flyttades motorn

- Koden är överförd rad för rad, i samma räkneordning och med samma avrundning och samma texter. Bara typer är tillagda. Därför blir även flyttalen exakt lika.
- `legacy/` är orörd. Testerna läser den gamla motorn direkt ur `legacy/apps/avrakning/index.html` (`tests/legacy-avrakning.ts`), plockar ut skriptet fram till första DOM-anropet och kör det i Node.
- `FileInput` innehåller redan uppläst innehåll (PDF-textobjekt, rader eller text). Filerna läses fortfarande i webbläsaren med pdf.js och SheetJS, så servern behöver inte se kundens filer.
- `avrakningEngine.compute(input, config)` tar månadens data som indata och inställningarna som konfiguration. Version `1.0.0`.

### Filer

```
packages/kit/index.ts                         kontrakten
packages/core/avrakning/types.ts              datatyper för S, D och resultatet
packages/core/avrakning/hjalp.ts              r2, MANAD, MAN3, ymAdd, fsAktiv, deacc, groupLines, monthLabels
packages/core/avrakning/parsers.ts            parsrarna
packages/core/avrakning/compute.ts            compute
packages/core/avrakning/index.ts              motor och parsrar enligt kontrakten
packages/core/avrakning/jamforelse.test.ts    jämförelsetesterna
packages/core/avrakning/fixtures/             påhittade testfiler, scenarier, generator och facit
tests/legacy-avrakning.ts                     laddar gamla motorn ur legacy
```

## Testresultat

`npm run ci` (lint, typkontroll, tester), 2026-10-11:

```
> lint       eslint .              inga fel
> typecheck  tsc --noEmit          inga fel
> test       vitest run
 Test Files  5 passed (5)
      Tests  375 passed (375)
```

| Del | Antal | Resultat |
|---|---|---|
| Parsrarna på påhittade filer, gammal mot ny | 10 | Exakt lika |
| `compute` på 8 handskrivna scenarier, gammal mot ny | 8 | Exakt lika |
| Ny motor mot facitfiler (gamla motorns resultat) | 8 | Exakt lika |
| **Slumpade scenarier, seed 20261011** | **300** | **Exakt lika i alla 300** |
| Kit, kontrakt, context och filigenkänning | 14 | Gröna |
| Fas 0 (legacy-kontrollsummor, texter, tokens) | 35 | Gröna |

Utskrift från testkörningen:

```
Avräkning: 300 slumpade scenarier (seed 20261011), gammal och ny motor gav samma resultat i alla.
2 kastar samma fel i båda. Övriga gav 5180 körningar, 8136 fakturarader och 35 olika kontrolltyper.
```

- Varje slumpat scenario går genom parsrarna (TaxiCaller som PDF eller CSV, Bambora, app, bropassager) och sedan genom `compute`. Generatorn varierar bilar, bolag, terminaler och kassörer (även okända), belopp (även negativa och ören), datum, period, typ av körning, återbetalningar, appbetalningar, passager, manuella poster, förra månadens avräkning, reskontra, Visma och Öresundsfakturan.
- Jämförelsen är strikt (`toStrictEqual`). Saknade fält och skillnaden mellan 0 och -0 räknas. Kastar en motor ett fel ska den andra kasta samma fel.
- Nya motorn får frysta indata, vilket visar att den inte ändrar indata.
- De handskrivna scenarierna täcker grundfallet, CSV, växelavgift (innevarande, rabatt, gratisperioder, efterdebitering), Öresundsbron, CPH och Sturup, skulder och förskott, Visma-avstämning, tom månad och månad utan period.
- **Motprov:** `Math.round` byttes tillfälligt mot `Math.floor` i nya motorn. 237 tester blev röda. Efter återställning var alla gröna.

Facitfilerna skrivs om från gamla motorn med `SKRIV_FACIT=1 npx vitest run packages/core/avrakning` (PowerShell: `$env:SKRIV_FACIT=1; npx vitest run packages/core/avrakning`). Gör det bara när ägaren har godkänt en ändring av resultatet.

## Avvikelser och beslut

| Nr | Avvikelse | Beslut |
|---|---|---|
| 1 | Inga skillnader i resultat mellan gammal och ny motor. | Godkänt. |
| 2 | Känt fel i gamla motorn, se Kända brister 1. | Rättas inte nu. Rättas i fas 3. |
| 3 | Den oanvända variabeln `auto` i `compute` är borttagen. Ingen påverkan på resultatet. | Godkänt. |
| 4 | Kontonamn för TaxiCaller-CSV kunde inte skickas via kontraktet. | Rättat: valfri `context` i `FileParser.parse`. |
| 5 | Hårdkodade värden i motorn. | Flyttas till konfiguration i fas 3, se Kända brister 2. |
| 6 | Kontrollerna i `compute` är inte `Rule`-objekt. | Görs i fas 3. |
| 7 | pdf.js och SheetJS körs inte i testerna. | Skuggkörning i början av fas 3, se Kända brister 4. |
| 8 | Säkerhetsvärdena i `detect` (0,7 till 0,95) är valda i fas 1a. Reglerna bakom dem kommer från `handleFile` i legacy. | Godkänt. |
| 9 | `fsProv` och `fsVisa` flyttades inte. De läser global data och används bara för PDF och mejl. | Godkänt. Följer med när PDF och mejl flyttas. |

## Kända brister

1. **`compute` kraschar utan period.** Om ingen period finns och ett bolag har växelavgift (ej gratis) kastar motorn `TypeError: Cannot read properties of null (reading 'slice')`, eftersom månadsetiketten byggs av en period som saknas. Felet finns i legacy och är medvetet kvar i nya motorn. Scenariot `utanPeriod` och facitfilen `utanPeriod.json` låser beteendet. **Rättas i fas 3:** först ett test som visar felet, sedan rättelsen, och diffen visas för ägaren.
2. **Hårdkodade värden i motorn** flyttas till konfiguration med giltighetsdatum i fas 3: priset för specifikation per förare (99 kr om inget anges), skuldgränsen (50 000 kr) och kundnummerprefixet `9119` för åkare.
3. **Texten "Taxi Malmö" finns i kontrollmeddelandena** (till exempel "Taxi Malmö har obetald skuld till åkare"). **Den måste bort innan första externa kund** och ersättas med bolagsnamnet från tenant-inställningarna.
4. **Filläsningen är inte testad mot riktiga filer.** pdf.js och SheetJS körs inte i testerna. CSV läses i testerna med en enkel läsare som efterliknar SheetJS (`raw: false`). **Fas 3 börjar med en skuggkörning:** ägaren kör en riktig månad lokalt genom gamla appen och nya motorn och jämför resultaten. Filerna läggs i `riktiga-filer/`, som redan finns i `.gitignore` och aldrig committas.
5. **Kontrollerna är inte `Rule`-objekt än.** `compute` bygger fortfarande sin kontrollista själv. De görs om till regler enligt kitet i fas 3.
6. **Parsrarna för Öresund, Sturup, Visma, kundreskontra och bank** är inte flyttade (ingick inte i 1a). Formen på deras data är typad och testas med påhittade värden i `compute`.

## Vad ägaren ska kontrollera

- [ ] Kör `npm install` och sedan `npm run ci`. Sista raden ska visa `Tests 375 passed (375)`.
- [ ] Kör `npx vitest run packages/core/avrakning --reporter=verbose` och se raden "300 slumpade scenarier".
- [ ] Kör `git log --oneline` och se de fem commits för fas 1a (fyra ovan plus "Fas 1a: rapport").
- [ ] Läs kontrakten i `packages/kit/index.ts`.
- [ ] Klistra in den här rapporten hos Claude (Cowork) för granskning innan fas 1b.
