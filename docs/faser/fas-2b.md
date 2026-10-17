# Fas 2b: inloggning, konton och roller (rapport, lokala delen)

Grenen `fas-2b`. Allt som går att bygga och testa utan molnkonton är klart. Det som återstår kräver ägarens konton, domän och e-posttjänst (se nedan) och väntar enligt fas-2-beslut.md.

## Vad som är byggt

**Inloggning med e-postlänk**
- Mejlet är på svenska och har ämnet "Din inloggningslänk".
- Mejlet är neutralt, utan varumärke, eftersom samma mejl går till alla kunders användare (SPEC-v3.1 15.2.3). Mallen finns i `supabase/templates/inloggning.html`.
- Länken går till plattformens sida `/logga-in/bekrafta` med `token_hash`, som plattformen verifierar (2e). Mejlet har också en sexsiffrig kod för den som loggar in på en annan enhet.
- Länken gäller i 15 minuter och kan bara användas en gång.
- Det måste gå minst 60 sekunder mellan två mejl till samma adress.

**Ingen självregistrering**
- Ett okänt konto får inget mejl, och inget konto skapas.
- Konton skapas bara av plattformen.

**Inget lösenord**
- Supabase har ingen inställning som stänger av lösenord. En hook (`app.kontroll_inloggning`, migrationen `20261013090000_inloggning.sql`) stoppar därför varje inloggning med lösenord. Meddelandet är "Inloggning med lösenord används inte. Logga in med länken i e-posten."
- Det gäller även en användare som har fått ett lösenord.
- Bara Supabase Auth får köra hooken.

**Roller**
- Rollerna är admin, ekonomi och läs (beslut 7). Regler och tester kommer från 2a.
- Ändringar i medlemskap loggas med vem som gjorde dem.

**Kontoväljaren**
- Uppgifterna hämtas med `memberships` och `tenants`, filtrerat på den egna användaren.
- Testet visar att en användare med flera konton får alla sina konton med typ och roll, och inga andra. En användare med ett konto får bara det.
- Själva väljaren, URL:en med kontot och senast valda konto byggs i 2e.

**`scripts/konto.mjs`**
- Kommandon: `skapa-konto`, `lagg-till`, `byt-roll`, `ta-bort`, `sparra` (även `--hav`) och `lista`.
- Skriptet körs med service-nyckeln, som aldrig skrivs ut. Lokalt hämtas nycklarna från `supabase status`.
- Mot en databas i molnet krävs flaggan `--moln`.
- Skriptet ersätter admin och inbjudningar tills de finns i gränssnittet (4a).

**Spärr och utloggning**
- En spärrad användare kan inte logga in och kan inte förnya sin session.
- Utloggning överallt gör alla sessioner ogiltiga.
- En åtkomsttoken som redan är utfärdad gäller tills den löper ut, högst en timme. Det är inbyggt i Supabase. Se Risker.

**`.env.example`** finns med tomma värden.

## Tester

`tests/db/inloggning.test.ts` kör mot den lokala Mailpit i CI-jobbet `databas`:
- mejlet på svenska, utan varumärke och tankstreck
- länken loggar in och kan inte användas igen
- koden loggar in, men inte med fel kod
- okänd adress
- självregistrering
- lösenord
- förnyad session
- spärr och hävd spärr
- utloggning överallt
- kontoväljarens uppgifter
- skriptets kontroller, inklusive att sista admin inte kan tas bort och att skriptet vägrar molnet utan `--moln`

| CI-jobb | Resultat |
|---|---|
| ci | 1377 tester gröna |
| databas | 70 tester gröna (2a: 58, 2b: 12), körning 38239135064 |

## Avvikelser och fynd

| Nr | Vad | Beslut |
|---|---|---|
| 1 | I Supabase CLI betyder `[auth.email] enable_signup` att e-postinloggning är påslagen över huvud taget. Självregistreringen styrs av `[auth] enable_signup`. | Rättat och kommenterat i `config.toml`. CI hittade felet. |
| 2 | Radsäkerheten låter en medlem se alla medlemmar i sitt konto. Det är avsiktligt, för att admin ska se kontots användare. Kontoväljarens fråga filtrerar därför på den egna användaren. | Gränssnittet i 2e använder samma fråga. |
| 3 | E2E-testet i webbläsaren (logga in, välja konto, byta konto) kräver plattformens skärmar. | Görs i 2e med Playwright. Delen i databasen och e-posten är testad här. |

## Risker

- **Åtkomsttoken gäller i högst en timme efter spärr eller utloggning.** Det kan kortas med `jwt_expiry` om ägaren vill. Det kostar fler förnyelser.
- **Hooken måste också slås på i molnet.** Annars fungerar lösenord där om någon lyckas sätta ett. Det ingår i driftsättningen nedan och kontrolleras med samma test mot testmiljön.

## Kvar i 2b, väntar på ägaren

Det här kräver konton i molnet, domän och e-posttjänst, och görs först när ägaren säger till:

1. Supabase-projektet `flodia-test` i Stockholm: köra migrationerna med `supabase db push`, slå på hooken, sätta site URL och tillåtna adresser för omdirigering, och lägga in mejlmallen.
2. E-posttjänsten som SMTP i Supabase, med avsändaradress på ägarens domän.
3. Kontrollera att riktiga inloggningsmejl passerar SPF, DKIM och DMARC (mail-tester eller "Visa original" i Gmail).

Ägarens punkter i planens avsnitt C (2 Supabase, 4 domän och avsändare, 5 e-posttjänst) behövs för detta. Inga nycklar ska skrivas i chatten.
