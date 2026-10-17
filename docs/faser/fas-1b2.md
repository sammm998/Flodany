# Fas 1b2: Nya versioner av Åkarkassan och Tripkassan

Datum: 2026-10-11 · Gren: `main` · Underlag: `docs/faser/fas-1b2-uppdrag.md`, ägarens beslut i `docs/faser/fas-1b2-beslut.md`.

**Status:** legacy-filerna för åkarkassan och tripkassan är bytta mot apparnas versioner från 2026-10-11, anonymiserade på samma sätt som tidigare. `packages/core/lon` följer de nya versionerna. Gamla och nya motorn ger exakt samma resultat i alla jämförelser för båda apparna. `npm run ci` är grönt.

## Vad som byggts

| Commit | Innehåll |
|---|---|
| `8f26535` Fas 1b2: avsiktligt byte av legacy | De anonymiserade filerna och nya kontrollsummor i `tests/legacy.sha256`. Röd ensam, eftersom motorn uppdateras i nästa commit. Pushas tillsammans med den (godkänt av ägaren). |
| `85f7015` Fas 1b2: lönearter i lönemotorn | Löneartsregistret, lönearter i beräkningen och lönebeskedet, fyra nya inställningar i `Variant`, `lonEngine` version 1.1.0. |
| `a4f4237` Fas 1b2: jämförelsetester med lönearter | Generatorn, registertestet och två nya handskrivna scenarier. |
| `ed4e91a` Fas 1b2: tester som låser beslut 4, 5 och 6 | Se Avvikelser och beslut. |
| Fas 1b2: rapport | Den här filen, uppdraget och beslutet. |

### Det nya i apparna

- **Löneartsregistret**, version 1 (`LA_VER = 1`): 33 arter med LDL TaxiLöns numrering. Typ (räknas av appen, belopp, antal gånger à-pris, antal gånger månadslön gånger faktor), sida (lön, förmån, skattefritt, extra skatt, justering efter skatt, info), AGI-ruta och semestergrundande. Hjälptexter, bland annat för 510 (traktamente). Registret är identiskt i båda apparna.
- **Lönearter i beräkningen:** manuella rader per förare och månad. Semestergrundande arter ingår i semesterunderlaget. Förmån ger skatt och arbetsgivaravgift men betalas inte ut. Skattefria rader och justeringar läggs till efter skatt. Rad 915 är frivillig extra skatt.
- **Hittills i år efter utbetalningsdatum** i tripkassan.
- **Lönemodell "ingen"** ger inga extra lönearter i tripkassan.

### Så flyttades det

- `packages/core/lon/lonearter.ts` är ny: `LA`, `LA_VER`, `lonearter`, `laRader`. Registret är kopierat maskinellt ur legacy, och ett test kontrollerar att det är identiskt med båda legacy-filerna.
- `compute`, `lonOf` och `ytd` är ändrade rad för rad, i samma räkneordning och med samma avrundning och texter. Den enda formändringen: `apris` och `belopp` i `laRader` deklareras utan startvärde (ESLint), eftersom alla grenar sätter dem.
- **Skillnaderna mellan apparna** är nu nio inställningar i `Variant`. De fyra nya:

| Inställning | Åkarkassan | Tripkassan |
|---|---|---|
| `ingenUtanLonearter`: lönemodell "ingen" får inga extra lönearter | nej | ja |
| `ytdEfterUtbetalningsdatum`: hittills i år efter utbetalningsdatum | nej | ja |
| `varnaSkattetabellAr`: fel om skattetabellen gäller ett annat år än utbetalningsåret | nej | ja |
| `formonText`: tillägg i texten för förmånsrader | " (förmån, betalas inte ut)" | inget |

- **Inte flyttat:** redigeringen av lönearter och registret i gränssnittet, PDF-lönespecen, och bokföringskontona för lönearter i tripkassans bokföring (`genAuto`). Bokföringen tas i en egen fas enligt beslutet i 1b.

## Anonymisering

De nya filerna är byggda så här: gammal legacy plus kodställena från de nya versionerna. På varje ställe där den gamla filen var anonymiserad behölls den gamla raden. Ett skript utanför repot klassade varje ändrat ställe. Riktiga värden har inte skrivits i repot, i commits eller i chatten.

| Fil | Rad | Typ |
|---|---|---|
| akarkassan | 156 | bolagsnamn |
| akarkassan | 176 | skripttagg för `claude-shim.js` (saknas i appen, behållen i legacy) |
| akarkassan | 507 | bolagsnamn |
| akarkassan | 525 | seed-sökväg |
| akarkassan | 1197 | namn på anställda |
| akarkassan | 1207 | regnummer och leverantör |
| tripkassan | 29 | bolagsnamn |
| tripkassan | 156, 157 | regnummer, bolagsnamn |
| tripkassan | 177 | skripttagg för `claude-shim.js` |
| tripkassan | 509 | bolagsnamn, orgnr, adress, postadress, regnummer |
| tripkassan | 527 | seed-sökväg |
| tripkassan | 686 | regnummer |
| tripkassan | 1264 | regnummer, bolagsnamn |
| tripkassan | 1982 | regnummer |
| tripkassan | 2039 | bolagsnamn |

Kontroller:
- Diffen mellan ny legacy och appens version innehåller bara raderna ovan: 6 ställen i åkarkassan, 9 i tripkassan.
- Diffen mellan gammal och ny legacy innehåller bara kod: 14 ställen i åkarkassan, 20 i tripkassan.
- Inget av de ersatta värdena finns kvar i filerna (kontrollerat per ord och per fras).
- I de 261 nya kodraderna söktes efter regnummer, orgnr, personnummer, telefon, mejl, postnummer och gatuadress. De enda träffarna var falska ("AGI 011" och "AGI 051").

## Testresultat

`npm run ci` (lint, typkontroll, tester), 2026-10-11:

```
> lint       eslint .              inga fel
> typecheck  tsc --noEmit          inga fel
> test       vitest run
 Test Files  7 passed (7)
      Tests  1356 passed (1356)
```

| Del | Antal | Resultat |
|---|---|---|
| Parsrar och skatt, gammal mot ny, per app | 2 × 7 | Exakt lika |
| Handskrivna scenarier, gammal mot ny, per app | 2 × 9 | Exakt lika |
| `lonEngine` mot facitfiler, per app | 2 × 9 | Exakt lika |
| **Slumpade scenarier, seed 20261012** | **2 × 300** | **Exakt lika i alla** |
| Registret identiskt med legacy | 2 | Grönt |
| Låsta beteenden (beslut 4, 5, 6) | 3 | Gröna |

Utskrift från testkörningen:

```
Lön (akarkassan): 300 slumpade scenarier (seed 20261012), gammal och ny motor gav samma resultat i alla.
0 kastar samma fel i båda. 6632 körpass och 1206 lönebesked jämförda.
33 av 33 lönearter i indata, 23 av 23 manuella lönearter på lönebesked.
Lön (tripkassan): 300 slumpade scenarier (seed 20261012), gammal och ny motor gav samma resultat i alla.
0 kastar samma fel i båda. 6632 körpass och 1463 lönebesked jämförda.
33 av 33 lönearter i indata, 23 av 23 manuella lönearter på lönebesked.
```

- Lönearterna i generatorn har en egen slumpström. De 300 scenarierna från 1b är därför desamma och har fått lönearter tillagda: bolagets val i registret (av, på, eget à-pris), manuella rader av alla typer (även tomma och negativa värden, à-pris som tom sträng, egen text, okända nummer), lönemodell "ingen", historik med fullständiga utbetalningsdatum före och efter perioden, och skattetabell för fel år.
- De 10 arter som appen räknar själv (till exempel 020 och 912) förekommer i indata men hoppas över, som i legacy. Därför hamnar 23 arter på lönebesked.
- Nya handskrivna scenarier: `lonearter` (alla sidor, fast lön med faktorarter, lönemodell "ingen", skattetabell för fel år) och `ytdUtbetalning` (december med `utbSamma`, utbetalning i januari).
- Facitfilerna från 1b fick bara de nya fälten. Inga värden har ändrats.
- Tripkassan har 1463 lönebesked mot 1491 i 1b, eftersom generatorn ibland sätter "ingen" på fast anställda, som då inte tas med.
- **Motprov** (återställt efteråt, alla gröna igen):
  - à-priset för art 201 ändrat: 70 röda tester.
  - Åkarkassan med tripkassans regel för lönemodell "ingen": 41 röda.
  - Tripkassan med den gamla regeln för hittills i år: 34 röda.
  - Åkarkassans historik med utbetalning samma månad som perioden: testet för beslut 4 blev rött.

## Avvikelser och beslut

| Nr | Avvikelse | Beslut |
|---|---|---|
| 1 | Inga skillnader i resultat mellan gammal och ny motor. | Godkänt. |
| 2 | Ändringen i Ekonomi (bara pass som startar i månaden) syns inte i diffen. Filtret fanns redan i legacy, i importen och inte i motorn. | Godkänt. Ingen åtgärd. |
| 3 | Bokföringskonton för lönearter finns bara i tripkassans bokföring. De är inte flyttade. | Godkänt. Tas i bokföringsfasen. |
| 4 | Känd brist 1 från 1b (hittills i år i tripkassan) har appen rättat. Motorn följer efter. Åkarkassan har kvar sin gamla regel. | Löst för tripkassan. Ett test låser att åkarkassans gamla och nya regel ger samma resultat, även för december. Se förklaringen nedan. |
| 5 | Åkarkassan räknar lönearter för en förare med lönemodell "ingen". Bruttolön och arbetsgivaravgift kommer med i summorna, men inget lönebesked visas. Tripkassan räknar 0. | Behålls exakt som i legacy och låses av ett test. Rättas i lönefasen med ett test som först visar felet. Se rutinen nedan. |
| 6 | `laRader` bryr sig inte om `aktiv`: en avslagen art som redan finns bland månadens rader räknas ändå. Arter som appen räknar själv och okända nummer hoppas över utan varning. | Behålls och låses av ett test. Tas upp i lönefasen. |
| 7 | Arbetsgivaravgiften räknas på två sätt (Känd brist 2 från 1b), nu på bruttolön plus förmån. | Oförändrat. Rättas i lönefasen. |
| 8 | `lonEngine` version 1.1.0, eftersom utdata fått nya fält. | Godkänt. |
| 9 | 1463 lönebesked i tripkassan mot 1491 i 1b. | Godkänt. |

### Varför felet med hittills i år inte kan uppstå i åkarkassan (beslut 4)

Felet i tripkassan kom av att utbetalningen kan ske samma månad som perioden (`utbSamma`) för fast lön men månaden efter för provision. Året för hittills i år togs från utbetalningsmånaden utan lönemodell, så fast lön och provision kunde hamna på olika år.

Åkarkassan har ingen `utbSamma` och ingen utbetalningsdag per lönemodell. Utbetalningen sker alltid månaden efter perioden, på samma dag för alla förare, och samma datum sparas i lönehistoriken när lönen låses. Därmed gäller:

- Utbetalningsåret är alltid året för månaden efter perioden. December 2026 betalas ut i januari 2027 och räknas till 2027 med båda reglerna.
- En tidigare period har alltid ett tidigare utbetalningsdatum. Att sortera efter period (gamla regeln) och efter utbetalningsdatum (nya regeln) ger samma urval.

Testet kör båda reglerna för varje månad från 2025-12 till 2027-03, med fyra utbetalningsdagar, med och utan ingående belopp, för både provision och fast lön (256 jämförelser), och jämför dessutom mot legacy.

### Rutin tills beslut 5 är rättat

Kontroll 2026-10-11: ingen förare i åkarkassans riktiga data har lönemodell "ingen" eller slutdatum. Felet påverkar alltså inte lönerna i dag.

**Rutin:** sätt inte lönemodell "ingen" eller slutdatum på en förare i Åkarkassan som har lönearter samma månad.

## Kända brister

1. ~~Hittills i år räknas på fel år i tripkassan.~~ **Löst** i appen och i motorn (beslut 4).
2. **Arbetsgivaravgiften räknas på två sätt.** Oförändrat från 1b. Rättas i lönefasen.
3. **Hårdkodade värden i motorn** flyttas i fas 3, som i 1b. Nytt: à-priser och faktorer i löneartsregistret (till exempel 4,6 % och 0,8 % enligt semesterlagen) är registervärden. Bolaget kan ändra à-pris, men satser som följer lag ska ha giltighetsdatum när reglerna flyttas till konfiguration.
4. **Lönemodell "ingen" i åkarkassan** räknar lönearter (beslut 5). Rättas i lönefasen, med test först.
5. **`laRader` och `aktiv`** (beslut 6). Tas upp i lönefasen.
6. Kraven för fas 2 från 1b (tider i Europe/Stockholm, ta bort `WeakMap`) gäller fortfarande.

## Vad ägaren ska kontrollera

- [ ] Kör `npm run ci`. Sista raden ska visa `Tests 1356 passed (1356)`.
- [ ] Kör `npx vitest run packages/core/lon --reporter=verbose` och se de två raderna "300 slumpade scenarier" med "33 av 33 lönearter".
- [ ] Öppna `legacy/apps/akarkassan/index.html` och `legacy/apps/tripkassan/index.html` på raderna i anonymiseringstabellen och kontrollera att inga riktiga uppgifter finns.
- [ ] Läs tabellen över de nya inställningarna i `Variant` och bekräfta att skillnaderna mellan apparna är avsiktliga.
