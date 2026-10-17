# Fotoläsning av klädlistan

Ägarens uppdrag 2026-10-14. Byggd på servern, **avstängd i alla konton**. Plan och beslut: avsnittet "Fotoläsning av klädlistan via Claude från servern" i `docs/faser/fas-3-moduler-plan.md` (svaren på fråga 10 till 12).

## Får inte slås på förrän

1. **Biträdesavtalet med Anthropic** finns, med Anthropic som underbiträde, och raden i `docs/underbitraden.md` är ifylld med region, avtal och datum. `scripts/konto.mjs` vägrar slå på funktionen så länge raden har platshållare eller säger "Ej i bruk".
2. **Övergångsavtalen** (GDPR art. 28) med de fyra bolagen nämner Anthropic, och registerförteckningen och integritetspolicyn är uppdaterade.
3. **Anthropics standardvillkor för API:t** är kontrollerade och dokumenterade i `docs/underbitraden.md`: att data inte används för träning, hur länge data lagras och var den behandlas. Avtal om nollagring (Zero Data Retention) är önskvärt men inget krav.
4. **Blanketten är ändrad (uppfyllt 2026-10-14):** en ny blankett utan kolumnerna Förare och Åkare togs fram 2026-10-14 (fråga 10 och 11). Gamla blanketter med namnkolumner kan fortfarande förekomma. Servern kastar namn oavsett vilken blankett som fotograferas (se "Inga namn tillbaka" nedan).
5. **Modelltestet** med riktiga, ifyllda blanketter är gjort lokalt hos ägaren och redovisat: andel rätt lästa rader och kostnad per blankett, först med den billigaste modellen. Riktiga blanketter läggs aldrig i repot.

## Hur den slås på (ägaren)

1. Lägg in två hemligheter i Supabase (Edge Functions, Secrets), aldrig i repot eller i chatten:
   - `ANTHROPIC_API_KEY`: nyckeln till Anthropics API.
   - `FOTOLASNING_MODELL`: modellen som valts efter modelltestet.

   Utan dem svarar servern "Fotoläsningen är inte konfigurerad på servern", även om funktionen är på.
2. Slå på funktionen för ett konto i taget:
   `node scripts/konto.mjs funktion --konto <slug> --nyckel avrakning.fotolasning --moln`
   Av igen: samma kommando med `--av`. Varje ändring loggas i `audit_log` (`funktion.insert` och `funktion.update`).

## Så fungerar den

- **Var:** i Avräkning på plattformen, för admin och ekonomi. När funktionen är av visas ingen knapp, och servern svarar 403 (`ingen_funktion`) oavsett vad klienten gör.
- **Fotot:** förminskas i webbläsaren (högst 2 000 punkter, JPEG), skickas till serverfunktionen `motor` (operationen `fotolasning`) och därifrån till Anthropics API. Det sparas inte, varken i databasen, i Storage eller i loggar, och kastas när svaret kommit.
- **Tolkningen:** servern begär svaret som JSON enligt ett fast schema (structured outputs, `output_config.format`), utan tvingat verktyg och utan `temperature`, `top_p` eller `top_k`, som Claude Sonnet 5.5 kräver. Raderna har datum, bilnummer, utbildning (ja eller nej) och antal per plagg (jacka, sommarjacka, väst/slipover, tröja, skjorta, piké, mössa). Instruktionen täcker både den gamla blanketten med namnkolumner och den nya utan.
- **Inga namn tillbaka:** servern läser bara de kända fälten, och varje fält måste ha rätt form (datum ÅÅÅÅ-MM-DD, bilnummer bara siffror, antal 0 till 99). Text som inte passar, till exempel ett namn, kastas och raden markeras osäker.
- **Granskningen:** kryssruta per rad och status, räknad på servern:
  - **Annan månad:** datumet ligger utanför vald månad.
  - **Finns redan:** samma rad är redan tillagd för månaden.
  - **Bil saknas:** bilnumret finns inte i Avräkningens bilregister (`settings/bilar`).
  - **Osäker:** modellen var osäker, eller ett fält gick inte att läsa.

  Bara rader utan status är förvalda. Användaren väljer och trycker "Lägg till valda".
- **Var raderna sparas:** i Avräkningens dokument `klader/<ÅÅÅÅ-MM>`, som `{ rader: [...] }` med datum, bil, utbildning, antal per plagg och tidpunkt. Rader som redan finns hoppas över. Priser, åkeri och raderna på åkeriets avräkning kommer med fliken Kläder (fråga 8 och 9).

## Tak och logg

- **Tak per konto och dag** (svensk tid): kolumnen `foto_per_dag` i tabellen `tak`, standard 20. Över taket svarar servern 429 och händelsen `tak.natt` loggas. Taken för alla anrop (per användare och minut, per konto och timme) gäller också.
- **Fakturaunderlag:** varje läsning räknas i `usage` med typen `ai`.
- **Granskningsloggen:** varje läsning loggas som `fotolasning.last` med användare, tid, månad och antal rader (eller felkoden). Tillagda rader loggas som `fotolasning.tillagd`. Bildens innehåll loggas aldrig.

## Tester

- `packages/server/fotolasning.test.ts`: tolkningen med påhittade bilder och påhittade svar från modellen, inga namn tillbaka från den gamla blanketten, okänd bil, avstängd funktion (403), tak, felsvar och att lägga till.
- `tests/db/fotolasning.test.ts`: mot den lokala serverfunktionen: av från början, pausad, roller, taket per dag, loggen, beroenden och kommandot i `scripts/konto.mjs`.
- `tests/e2e/fotolasning.spec.ts`: knappen syns bara när funktionen är på, och aldrig för läs-rollen.
- `tests/klientpaket.test.ts`: nyckeln, hemligheternas namn och Anthropics adress finns aldrig i klientkoden eller klientpaketet.
- CI anropar aldrig Anthropic. Bilderna i `packages/server/fixtures` är påhittade och ritas av `rita-kladlista.mjs`. De kan användas för ett handtest mot Anthropic innan riktiga blanketter provas.

## Att stämma av vid legacy-bytet

Avräkning-artifacten (version 45 till 47) har en egen fotoläsning med `sample`. Den fanns inte i repot när det här byggdes. Instruktionen och schemat i `packages/server/fotolasning.ts` ska jämföras med artifactens tolkning vid bytet (`docs/faser/legacy-byte-2026-10.md`), och skillnader rapporteras till ägaren.
