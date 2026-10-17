# Fas 2a: databas och radsäkerhet (rapport)

Klar 2026-10-12 på grenen `fas-2a`, inte sammanslagen med main. Planen finns i `fas-2-plan.md`, besluten i `fas-2-beslut.md`.

## Vad som är byggt

**`supabase/config.toml`**
- Ingen självregistrering.
- Storage, Analytics och Edge Runtime är avstängda tills de behövs (Edge Runtime i 2d).
- Gränsen för inloggningsförsök är höjd, men bara i den lokala konfigurationen, för testerna.

**`supabase/migrations/20261012090000_karnan.sql`: tabellerna i planens avsnitt B**
- Tabellerna är `tenants`, `profiles`, `memberships`, `modules`, `licenses`, `documents`, `periods`, `file_runs`, `shares`, `offers`, `invites`, `guide_progress`, `audit_log`, `usage`, `satser` och `platform_staff`.
- Radsäkerhet är påslagen och tvingad på varje tabell.
- Rättigheterna ges uttryckligen, ibland per kolumn:
  - `anon` får ingenting.
  - Inbjudans token kan aldrig läsas av klienten.
  - `satser` och `platform_staff` har ingen klientåtkomst alls.
- Hjälpfunktionerna `app.mina_konton`, `app.har_roll`, `app.har_licens`, `app.delar_konto` och `app.ar_underkund` ligger i schemat `app`, som inte syns i API:t.
- Dokument kräver aktiv licens för modulen.
- Triggrar:
  - Kontot på en rad kan aldrig bytas, inte ens förbi radsäkerheten.
  - Ett konto kan aldrig stå utan admin.
  - Ändringar i medlemskap, konton och perioder loggas i `audit_log`, med vem som gjorde dem.
  - Version och ändringsinfo uppdateras vid varje ändring av dokument och perioder.
  - En profil skapas automatiskt när en användare skapas.
- Gränser för dokument: högst 2 MB, giltig sökväg (inga `..`, inga tomma delar) och högst 512 tecken.
- `app.rensa_granskningslogg()` tar bort händelser som är äldre än 3 år (beslut 10). Schemaläggningen görs i 2f.
- Klienten får anropa två funktioner: `logga` och `markera_delning_oppnad`. Båda kontrollerar själva medlemskapet.

**Tester (`tests/db`) och CI**
- Testerna körs med `npm run test:db` mot en lokal Supabase. `npm run ci` kräver fortfarande inte Docker.
- Nytt CI-jobb `databas` startar Supabase i GitHubs runner och kör testerna. Det behöver inga hemligheter.
- CI körs nu också vid push till grenar som heter `fas-*`.

## Hur testet "konto A kan aldrig läsa konto B" fungerar

**Testvärld**
- Varje testfil skapar en egen värld med påhittade konton:
  - A (huvudkund)
  - Asub (underkund till A)
  - B (direktkund)
- I varje konto finns en admin, en ekonomi och en läs. Dessutom finns en användare med konton i både A och B, en inloggad användare utan konto, en ur personalen och anon.
- Användarna loggar in med inloggningslänk och verifiering, som i drift. Ingen lösenordsinloggning används.

**Läsning**
- För varje tabell och användare jämförs exakt vilka rader användaren ser med modellen i `tests/db/tabeller.ts`.
- Både rader för mycket och rader för lite är fel.

**Skrivning**
- För varje tabell, användare och konto prövas skapa, ändra och ta bort, och att flytta en rad till ett annat konto.
- Resultatet kontrolleras direkt i Postgres.
- En kontrollsumma över alla andra kontons rader måste vara oförändrad efter varje användare.

**Metatest**
- Varje tabell i `public` ska ha radsäkerhet påslagen och tvingad, och ha en post i modellen.
- Rättigheterna ska vara exakt de väntade.
- Inga vyer får finnas.
- Anon får inte köra någon funktion.
- Bara kända funktioner får köras med ägarens rättigheter, och de ska ha tom `search_path`.
- En ny tabell utan radsäkerhet eller testfall stoppar därmed CI.

**Kontroll av testerna**
- Fem avsiktliga läckor öppnas och stängs: läsa allt, ändra allt, skapa i alla konton, ta bort med fel roll, samt läsa och ta bort i andra konton.
- Testerna upptäcker alla fem. Efteråt bekräftas att allt är som förut.

**Riktade tester (`roller.test.ts`)**
- Sista admin.
- Delning bara från huvudkund till egen underkund.
- Bara mottagaren markerar en delning som öppnad.
- Huvudkund och underkund ser inte varandras data.
- Licens som är pausad eller har gått ut.
- `logga` bara i egna konton.
- Gränser, version, profil, att personalen inte ser kunddata, och att granskningsloggen rensas efter 3 år.

## Resultat

CI-körning 38236696001 på `fas-2a` är grön:

| Jobb | Resultat |
|---|---|
| ci | 1377 tester gröna (lint, typkontroll, motorer och legacy) |
| databas | Migrationen kör, `supabase db lint` utan fel, 58 tester gröna |

## Avvikelser från planen

| Nr | Avvikelse | Skäl |
|---|---|---|
| 1 | Testerna har bara körts i CI, inte lokalt. | Disken C: var full och Docker kunde inte starta (ägarens val 2026-10-12). |
| 2 | Testerna ligger i `tests/db` i stället för `tests/rls`. | De omfattar mer än radsäkerhet: triggrar, gränser och lagringstid. |
| 3 | En ren delete-läcka går inte att utnyttja mot andra konton. | Postgres kräver läsrätt för att ta bort en rad. Kontrollen prövar därför både en rollläcka och läsning med borttagning tillsammans. |
| 4 | Lösenordsinloggning är inte avstängd med en inställning. | Inga användare har lösenord och självregistrering är av. Detta tas i 2b. |
| 5 | `shares`, `offers` och `invites` finns och testas, men används först i 4a. | Enligt planen. |

## Vad ägaren kan kontrollera

1. CI-körningen: https://github.com/Mommerff11/flodia/actions/runs/38236696001 (jobbet databas, steget Databastester).
2. Modellen i `tests/db/tabeller.ts`. Funktionerna `syns` och `far` säger i klartext vem som får se och göra vad i varje tabell.
3. Att grenen `fas-2a` slås ihop med main när 2a är godkänd.

## Nästa steg

2b: inloggning, konton och roller. Det kräver avsändardomän och e-posttjänst först när vi driftsätter. Allt lokalt kan byggas före.
