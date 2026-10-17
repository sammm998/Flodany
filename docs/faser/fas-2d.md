# Fas 2d: serverfunktioner (rapport)

Klar 2026-10-12 på grenen `fas-2d`. Grenen utgår från `fas-2c`. Den innehåller också kraven från granskningen av 2c, som finns i `fas-2c.md` under "Krav från ägarens granskning". Ingen av grenarna `fas-2b`, `fas-2c` och `fas-2d` är sammanslagen med main.

## Vad som är byggt

**`packages/server`: serverfunktionen motor (beslut 26)**
- Anropet är `POST { konto, modul, operation, data }` med användarens token. Svaret är `{ resultat }` eller `{ fel: { kod, text } }`.
- Kontrollerna sker i den här ordningen:
  1. Inloggning ger 401 `ej_inloggad`.
  2. Roll ger 403 `ingen_behorighet`. Läs-rollen får räkna men inte tolka filer eller göra åtgärder.
  3. Licens ger 403 `ingen_licens`.
  4. Tak ger 429 `for_manga`. Taket läses ur tabellen `tak` per konto (se Ägarens beslut nedan).
- Därefter registreras anropet i `usage`, som är underlaget för faktura och tak.
- Operationer:
  - `tolka`: filigenkänning och parsrar. Webbläsaren skickar bara texten eller raderna. En okänd fil ger 422 `okand_fil` med frågan "Vilken fil skulle det vara?".
  - `berakna`: avräkningen, Åkarkassan och Tripkassan (servern tolkar LDL, bro och Sturup själv) och Verkstaden (tillståndet läses ur dokumenten).
  - `atgard`: Verkstadens åtgärder med förkrav. Tillståndet läses och sparas med användarens rättigheter, så radsäkerheten gäller. Varje åtgärd loggas i `audit_log` med vem som gjorde den.
- Tiden räknas på servern i svensk tid, även `idag` för lönen. Klienten skickar aldrig tid.
- Fel från förkraven ger 409 `fel_lage`, 404 `saknas` eller 400 `ogiltigt`, med samma svenska text som i motorn.
- Interna fel ger 500 med en allmän text och visas aldrig för klienten.
- CORS gäller bara plattformens adresser (`PLATTFORM_URL`), och bara POST godtas.

**Ny åtgärd `taBortArende`**
- Den tar bort ett ärende, men inte om ärendet har faktura eller momsfaktura (ägarens beslut 4 i 2.0).
- I legacy raderade knappen direkt i databasen och gick alltid.

**Edge Function `supabase/functions/motor`**
- Ett tunt Deno-skal. `npm run bygg:funktioner` paketerar `packages/server` med esbuild, minifierat och utan källkodskarta.
- Paketeringen committas inte. Den byggs i CI och vid driftsättning.

**`packages/api`**
- `anropaMotor` anropar funktionen i regionen Stockholm (`eu-north-1`).
- `MotorSvarFel` bär kod, text och status.

**Kontrollen av klientpaketet (SPEC-v3.1 16.1.1 och 16.1.2), i tre lager**
1. **ESLint** förbjuder import av `@flodia/core`, `@flodia/kit` och `@flodia/server` i klientkod (`apps`, `packages/api`, `ui`, `guides`, `modules`). Typer går bra.
2. **`forbjudKarna`** stoppar bygget om motorkod ändå hamnar i grafen. Det finns för esbuild nu och för Vite i 2e.
3. **`granska`** letar i det färdiga paketet efter:
   - 277 fingeravtryck, alltså strängar som bara finns i motorkoden
   - källkodskartor
   - JWT
   - servernycklar

`npm run kontroll:klient` ingår i `npm run ci`. Klientpaketet är i dag `packages/api`. Plattformen läggs till i 2e.

## Tester

| Var | Vad | Resultat |
|---|---|---|
| `packages/server/motor.test.ts` | 13 tester med påhittade tjänster: behörighet, licens, tak, tolkning, avräkning lika med gyllene facit, lön lika med motorn direkt, åtgärder med serverns svenska tid (2026-12-31 23:30 UTC ger 2027-01-01), borttagning, åtgärdsnamn från objektets prototyp nekas, HTTP, CORS, för stort anrop, interna fel döljs | gröna |
| `tests/klientpaket.test.ts` | Självtest: alla tre lager slår larm på påhittad klientkod som importerar en motor, och det riktiga klientpaketet går igenom | gröna |
| `tests/db/motor.test.ts` | Edge Function i Deno mot lokal Supabase: 401, fel konto, fel roll, licens, tak, trasigt anrop, avräkning lika med facit, lön lika med motorn, tolkning, och hela flödet för ett ärende med radsäkerhet, granskningslogg och usage | gröna |

| CI-jobb | Resultat |
|---|---|
| ci | 1406 tester gröna, klientpaketet granskat |
| databas | 101 tester gröna (2a: 58, 2b: 12, 2c och kraven: 23, 2d: 8), körning 38252081222, grön vid första försöket med `retry: 0` |

## Fynd på vägen

1. **En händelse från Realtime kom aldrig fram** (körning 38247769541). Felet kom strax efter att Realtime startat mot databasen. Den andra av två ändringar syntes inte inom 15 sekunder, och loggen visade inga fel på kanalen. Livevisningen litar därför inte längre bara på Realtime:
   - Egna skrivningar meddelar lyssnarna på samma klient direkt, som shimmen gör.
   - Medan någon lyssnar läses allt om var 30:e sekund (`OMLASNING_MS`).
   - Testerna av andra användares ändringar går fortfarande bara via Realtime. Annars skulle säkerhetsnätet dölja ett fel där.
2. **Klienter som skapats med `accessToken`** kastar fel först när man anropar `supabase.auth.onAuthStateChange`, inte när man läser `supabase.auth`. `foljToken` fångar felet vid anropet.

## Avvikelser från planen

| Nr | Avvikelse | Skäl och beslut |
|---|---|---|
| 1 | Servern hämtar inte `satser` från databasen än. Lönen använder `LON_REGLER` i koden som förut. | Tabellen fylls i fas 3, när de hårdkodade värdena flyttas med test (beslutat till fas 3 i rapporterna för fas 1). Serverns kontext är förberedd för det. |
| 2 | Kontrollen av klientpaketet granskar i dag `packages/api`. | Plattformen finns från 2e och läggs till i samma kontroll (`scripts/bygg-klient.mjs`). Vite-pluginen finns redan. |
| 4 | Ett anrop räknas i `usage` även när förkraven nekar åtgärden. | Det är ett godkänt anrop mot motorn. Taket skyddar motorn, inte bara lyckade åtgärder. |
| 5 | Två samtidiga åtgärder på samma ärende: den sista vinner. | Kontroll av version tas i fas 3 med skärmarna (samma som i 2c). |

## Vad ägaren kan kontrollera

1. CI-körning 38252081222, jobben ci och databas.
2. `packages/server/moduler.ts`, som visar vad varje modul får göra på servern.
3. Att läs-rollen får räkna (`berakna`). Det behövs för att visa resultat. Frågan om läs-rollen ska se kassorna alls finns i `fas-2c.md`.

## Ägarens beslut efter 2d (2026-10-12), gjort på fas-2d

1. **Läs-rollen har ingen åtkomst alls till kassorna** (personnummer, bankkonton, löner). En maskad vy kan komma i version 2.
   - `modules.kanslig` är sant för `akarkassan` och `tripkassan`.
   - Hjälpfunktionen `app.far_lasa` kräver admin eller ekonomi för en känslig modul.
   - Det gäller läsning i `documents`, `file_runs`, `periods` och `shares`, kanalen för livevisningen, och serverfunktionen, där varken räkning eller tolkning tillåts.
   - Testerna: matrisen har nu rader i både en vanlig och en känslig modul i varje konto. Riktade tester visar att läs ser avräkningen men inte kassorna, att en användare som är läs i A och ekonomi i B ser kassan i B men inte i A, att kanalen nekas, och att Edge Function svarar 403.
2. **Taket läses ur tabellen `tak` per konto**, så det kan ändras utan driftsättning.
   - Raden utan konto är standarden: 60 anrop per minut och användare, 3000 per timme och konto. En rad för ett konto ersätter standarden.
   - Taket ändras av plattformen. Kontots admin kan läsa sitt tak.
   - När taket nås blir svaret 429 med koden `for_manga` och en svensk text som säger om det är användarens minut eller kontots timme. Händelsen `tak.natt` loggas i granskningsloggen, en gång per användare och minut, med gränserna och antalen.
   - Test: ett tak på 2 för ett konto ger 429 på tredje anropet och en enda loggad händelse. Ett ändrat tak gäller direkt.
3. **Omläsningen var 30:e sekund räknas inte mot taket och pausas när fliken är dold.**
   - Omläsningen gör bara vanliga läsningar och anropar aldrig motorn. Den stoppas vid `visibilitychange` till dold och läser om direkt när fliken syns igen.
   - Test med påhittad flik och klocka (`packages/api/omlasning.test.ts`): omläsning med jämna mellanrum, inga anrop till serverfunktionen, ingen omläsning medan fliken är dold, direkt omläsning när den syns, inget efter avslut. Mot databasen: fem omläsningar ändrar inte `usage`.

CI-körning 38254668687: ci grön (1410 tester), databas grön (109 tester).

Två fel i testmodellen hittades på vägen, inte i databasen. Mål-raden för `tak` ersatte kontots befintliga rad, och ett test räknade med en dokumentrad från ett tidigare test.

## Nästa steg

2e, när ägaren säger till: skal och guidesystem, `apps/platform` med Vite, React och TanStack, legacy-bryggan för interna konton, och Playwright i 1280 och 375 punkters bredd.
