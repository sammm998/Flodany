# Fas 1b: Lönemotorn (åkarkassan och tripkassan)

Datum: 2026-10-11 · Gren: `main` · Underlag: SPEC-v3.1 avsnitt 2 och 3, CLAUDE.md (migreringsplanen steg 1).

**Klart när (v3.1, fas 1):** jämförelsetester mot legacy är gröna och varje motor följer motorkontraktet.
**Status för 1b:** åkarkassans och tripkassans motor är sammanslagna till en motor med två varianter. Gamla och nya motorn ger exakt samma resultat i alla jämförelser för båda apparna. `npm run ci` är grönt lokalt och på GitHub. Foliering återstår (fas 1c).

## Ägarens beslut före start

| Fråga | Beslut |
|---|---|
| Skillnaderna mellan apparna | Två förinställningar i en motor. Varje app ger samma resultat som i dag. |
| Lönebeskedet (`lonOf`, `ytd`, `utbMan`) | Ingår i 1b. |
| Arbetsgivaravgift och åldersgränser | Flyttas till konfiguration med giltighetsdatum nu. |
| Bokföring, SIE och bank (bara tripkassan) | Egen fas senare. |

## Vad som byggts

| Commit | Innehåll |
|---|---|
| `135847f` Fas 1b: lönemotorn i TypeScript | `packages/core/lon`: hela `ENG` (parsrar för LDL, bro, Sturup, avräkning och skattetabell, skatt, arbetsgivaravgift, dag och kväll, matchning av passager, `compute`, kassaredovisning) och lönebeskedet (`result`, `utbMan`, `utbDatum`, `ytd`, `lonOf`). Varianterna `AKARKASSAN` och `TRIPKASSAN`. `LON_REGLER` med giltighetsdatum. Kontraktsadaptrar: `lonEngine` och fem parsrar. |
| `fdbc9ec` Fas 1b: jämförelsetester mot legacy | Påhittade fixtures, 7 handskrivna scenarier per app med facitfiler, 300 slumpade scenarier per app. Testerna körs i tidszonen Europe/Stockholm. |
| Fas 1b: rapport | Den här filen. |

### Så flyttades motorn

- Koden är överförd rad för rad, i samma räkneordning och med samma avrundning och samma texter. Bara typer är tillagda.
- `legacy/` är orörd. `tests/legacy-lon.ts` läser `ENG` direkt ur båda apparnas `index.html`. Lönefunktionerna läses ur appens andra skript och körs med appens tillstånd `S` som parameter.
- **En motor, två varianter.** Apparna skilde sig på fem ställen, som nu är inställningar i `Variant`:

| Inställning | Åkarkassan | Tripkassan |
|---|---|---|
| Standardvärden (`DEF`) | utbetalning dag 10 | utbetalning dag 25, provision dag 7, `utbSamma` |
| `fastUtanPass`: fast anställda räknas utan körpass | nej | ja |
| `kvittaKontantFastLon`: kontanter kvittas mot fast lön | ja | nej, sätts in på banken |
| `utbetalningPerModell`: utbetalningsmånad och dag efter lönemodell | nej | ja |
| `anstallningstid`: start- och slutdatum, slutat, demoläge | nej | ja |

- **Tre ändringar mot legacy, alla utan ändrat resultat:**
  1. Arbetsgivaravgiften (31,42 %, 10,21 %, 0 % för födda 1937 eller tidigare, 20,81 % upp till 25 000 kr för 19 till 23 år under 2026-04 till 2027-09) och åldersgränsen för skattekolumn 3 ligger i `LON_REGLER` (`packages/core/lon/regler.ts`). Den version som gäller väljs efter utbetalningsmånad. Nuvarande version gäller från 2025-01. För månader före första versionen används den äldsta, eftersom legacy hade samma regler för alla månader.
  2. Dagens år skickas in (`idag` i motorns konfiguration) i stället för att läsas från klockan. Det behövs för att tolka tiosiffriga personnummer.
  3. Motorn tar emot hela månadens tillstånd och returnerar resultat, lönebesked och utbetalningsdag per förare (`lonEngine`, version `1.0.0`).
- PDF-filerna (bro, Sturup, avräkning) kommer in som text, en rad per rad i PDF:en. Radbygget med pdf.js (`pdfLines`) stannar i webbläsaren, enligt beslut 26.

### Filer

```
packages/core/lon/types.ts          datatyper
packages/core/lon/hjalp.ts          r2, toDate, dstr, tstr, isoWeek, normReg, decode
packages/core/lon/parsers.ts        LDL, bro, Sturup, avräkning, skattetabell
packages/core/lon/regler.ts         LON_REGLER med giltighetsdatum, reglerFor
packages/core/lon/skatt.ts          tabellSkatt, fodelsear, skattekolumn, agAvgift
packages/core/lon/compute.ts        varianter, dag och kväll, matchBro, compute
packages/core/lon/lonebesked.ts     result, utbMan, utbDatum, ytd, lonOf
packages/core/lon/index.ts          motor och parsrar enligt kontrakten
packages/core/lon/jamforelse.test.ts
packages/core/lon/fixtures/         påhittade filer, scenarier, generator och facit
tests/legacy-lon.ts                 laddar gamla motorn ur legacy
vitest.config.ts                    testerna körs i Europe/Stockholm
```

## Testresultat

`npm run ci` (lint, typkontroll, tester), 2026-10-11:

```
> lint       eslint .              inga fel
> typecheck  tsc --noEmit          inga fel
> test       vitest run
 Test Files  6 passed (6)
      Tests  1026 passed (1026)
```

CI på GitHub är grönt för `fdbc9ec`.

| Del | Antal | Resultat |
|---|---|---|
| Parsrar och skatt, gammal mot ny, per app | 2 × 7 | Exakt lika |
| Handskrivna scenarier, gammal mot ny, per app | 2 × 7 | Exakt lika |
| `lonEngine` mot facitfiler, per app | 2 × 7 | Exakt lika |
| **Slumpade scenarier, seed 20261012** | **2 × 300** | **Exakt lika i alla** |
| Kontrakt, regler, tidszon, skillnaden mellan apparna | 7 | Gröna |
| Fas 0 och fas 1a | 375 | Gröna |

Utskrift från testkörningen:

```
Lön (akarkassan): 300 slumpade scenarier (seed 20261012), gammal och ny motor gav samma resultat i alla.
0 kastar samma fel i båda. 6632 körpass och 1206 lönebesked jämförda.
Lön (tripkassan): 300 slumpade scenarier (seed 20261012), gammal och ny motor gav samma resultat i alla.
0 kastar samma fel i båda. 6632 körpass och 1491 lönebesked jämförda.
```

- Varje slumpat scenario går genom parsrarna (LDL, bro, Sturup, avräkning), sedan `result`, och sedan lönebesked, utbetalningsdag, utbetalningsmånad och hittills i år per förare. Generatorn varierar förare, bilar, körpass (även övertagning av bilen, tomma pass och felaktiga tider), belopp per momsklass, Bolt och bomkörning, passager före, under och efter passen, manuella flyttar av passager, inställningar, lönemodell, anställningstid, skatt (tabell, kolumn, engångsskatt, jämkning), hittills i år och period.
- De handskrivna scenarierna täcker grundfallet, fast lön (där apparna skiljer sig), skatt och arbetsgivaravgift (kolumn 3, född 1937, ungdomsnedsättning, engångsskatt, jämkning, saknad tabell, tiosiffrigt personnummer med +), hittills i år, december med egna inställningar, ingen period och demoläge. Körpassen i `ldl.txt` går över omställningen till sommartid 2026-03-29.
- **Motprov:** arbetsgivaravgiften ändrad till 31,43 % gav 587 röda tester. Åkarkassan med tripkassans kontantregel gav 118 röda tester. Efter återställning var alla gröna.
- **Tidszon:** samma motor körd i UTC gav ett körpass över sommartidsomställningen en timme för mycket (förare 1002: 17,42 timmar i stället för 16,42). Svensk tid ger den verkliga tiden.

Personnummer i testdata har månad och dag 0000. Det datumet finns inte, så numren kan aldrig tillhöra en verklig person.

## Avvikelser och beslut

| Nr | Avvikelse | Beslut |
|---|---|---|
| 1 | Inga skillnader i resultat mellan gammal och ny motor. | Godkänt. |
| 2 | Tre ändringar utan ändrat resultat (regler, klocka, motorns form). | Godkänt. |
| 3 | Motorn tolkar tider i serverns lokala tid, som legacy. | Godkänt för 1b. Krav för fas 2, se Krav nedan. |
| 4 | Hittills i år räknas på fel år i tripkassan i ett fall. | Behålls. Rättas i lönefasen, se Kända brister 1. |
| 5 | Utan period blir utbetalningsdatumet `-10`. | Godkänt. |
| 6 | Två olika beräkningar av arbetsgivaravgift. | Rättas i lönefasen, se Kända brister 2. |
| 7 | Hårdkodade värden i motorn. | Flyttas i fas 3, se Kända brister 3. |
| 8 | Dag och kväll per körpass sparas i en `WeakMap` som hela modulen delar. | Krav för fas 2, se Krav nedan. |
| 9 | Inte flyttat: bokföring, SIE, bank, lönelistor, PDF-lönespecar, `lonAvstamning`. | Godkänt. Bokföringen tas i en egen fas. |
| 10 | `ldl.txt` sparas med Unix-radslut i repot (`.gitattributes`). Windows-radslut testas ändå, generatorn skriver sådana. | Godkänt. |

## Krav för fas 2

1. **Tider tolkas uttryckligen i Europe/Stockholm i koden,** inte via serverns tidszon. Tester visar att körpass, timmar, dag och kväll och matchning av passager blir rätt över omställningen till sommartid och tillbaka till vintertid, oavsett vilken tidszon servern går i. (I dag styrs det av `process.env.TZ` i `vitest.config.ts`.)
2. **`WeakMap` för dag och kväll tas bort** ur lönemotorn. Ett test visar att två beräkningar som körs samtidigt inte påverkar varandra.

## Kända brister

1. **Hittills i år räknas på fel år i tripkassan.** `ytd` tar året från `utbMan()` utan lönemodell. Med inställningen `utbSamma` blir det periodens år i stället för utbetalningsåret. Exempel: provisionslön för december 2026 betalas ut i januari 2027 men summeras med 2026. Felet finns i legacy och är medvetet kvar. **Rättas i lönefasen:** först ett test som visar felet, sedan rättelsen. Hittills i år ska räknas efter utbetalningsår.
2. **Arbetsgivaravgiften räknas på två sätt.** Lönebeskedet räknar efter ålder och `LON_REGLER`. Men `compute` räknar `agAvg` per förare med den fasta satsen i inställningarna (31,42 %), och den används i Ekonomi och i resultatet (lönekostnad = bruttolön plus `agAvg`). Tripkassan använder lönekörningens belopp när en lönekörning är sparad, men den fasta satsen innan dess. **Ekonomi kan därför i dag visa för hög lönekostnad för förare med nedsatt avgift** (äldre, födda 1937 eller tidigare, och unga med ungdomsnedsättningen). **I lönefasen ska båda räkna efter `LON_REGLER`.**
3. **Hårdkodade värden i motorn** flyttas till konfiguration med giltighetsdatum i fas 3, i samma steg som avräkningens:
   - momsen 25 % i Sturup-priset (`belopp / 1,25`)
   - momsklassen för bomkörning
   - 3 timmar för när en förare tar över bilen
   - 12 timmar för förslag på förare till en passage
4. **Utan period blir utbetalningsdatumet `-10`** (tom månad följd av dagen). Legacy gör likadant. Godkänt.
5. **PDF-läsningen är inte testad mot riktiga filer.** Parsrarna testas med påhittad text i samma form som `pdfLines` ger. Skuggkörningen i början av fas 3 ska även omfatta en riktig månad i åkarkassan eller tripkassan.

## Vad ägaren ska kontrollera

- [ ] Kör `npm run ci`. Sista raden ska visa `Tests 1026 passed (1026)`.
- [ ] Kör `npx vitest run packages/core/lon --reporter=verbose` och se de två raderna "300 slumpade scenarier".
- [ ] Läs `packages/core/lon/regler.ts` och kontrollera satserna och datumen för arbetsgivaravgiften.
- [ ] Läs tabellen över varianterna ovan och bekräfta att skillnaderna mellan apparna är avsiktliga.
- [ ] Klistra in den här rapporten hos Claude (Cowork) för granskning innan fas 1c.
