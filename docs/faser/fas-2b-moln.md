# Fas 2b i molnet: checklista för ägaren

Projektet heter `flodia`, ligger i regionen `eu-north-1` (Stockholm) och har adressen `https://tjehcqyltbcenmkwetbs.supabase.co`. Projektets id (ref) är `tjehcqyltbcenmkwetbs`. Adressen och id:t är inte hemliga.

**Inställningarna när projektet skapades:**
- **Data API:** på.
- **"Automatically expose new tables":** av. Migrationerna ger därför alla rättigheter uttryckligen. `authenticated` får bara det som behövs, `service_role` får rättigheter för servern och skripten, och `anon` får ingenting. Lokalt och i CI gäller samma läge (migrationen `20261012080000_ingen_automatisk_exponering.sql`), och metatestet kontrollerar det.
- **"Enable automatic RLS":** på. Migrationerna slår ändå på och tvingar radsäkerhet på varje tabell.

**Nycklar och lösenord**
- Du lägger själv in alla nycklar och lösenord, i Supabase, Brevo, GitHub Secrets eller din lokala `.env`, som ignoreras av git.
- Skriv dem aldrig i chatten. Claude Code ber aldrig om dem.

**Menyerna** kan heta något annat i den version du ser. Sök i så fall på ordet inom citattecken.

## Läge (2026-10-13)

| Steg | Status |
|---|---|
| 0 till 3 | Klart |
| 4.1, 4.2 | Klart. Lösenordsreglerna är skärpta (16 tecken, bokstäver, siffror och symboler) som extra skydd, fast inga lösenord används. |
| 4.3 SMTP | Klart. Custom SMTP via Brevo (inloggning@flodia.se, avsändarnamn Inloggning, smtp-relay.brevo.com:587, intervall 60 sekunder). Brevo kunde först inte skapa SMTP-nyckeln, löst via support. |
| 4.6 sessionens längd | Klart. Access token 600 sekunder, refresh token rotation på med reuse interval 10, time-box och inactivity timeout av. |
| 4.4 mallen, 4.5 gränser, 4.7 hooken | Klart. E-post 30 per timme (standard), övriga gränser orörda. Hooken körs av supabase_auth_admin. |
| 5.2 spårning i Brevo | **Väntar.** Går inte att stänga av förrän första mejlet skickats. Görs direkt efter första testinloggningen i steg 11, innan någon riktig användare får mejl. |
| 5 DNS | Klart. SPF `v=spf1 include:spf.brevo.com ~all` (en post), DKIM brevo1 och brevo2 som CNAME (DNS only), DMARC `p=none` med rapporter till Brevo. Inga MX-poster: flodia.se tar inte emot mejl än. |
| 4.7 rättigheter efter hooken | Kontrollerat: authenticated har kvar schemat app och app.har_roll, bara supabase_auth_admin kör hooken. |
| 5 DPA Brevo | Ingår i Brevos villkor, PDF sparad. |
| 6 GitHub | Variables inlagda (`SUPABASE_PROJECT_REF`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` med publishable-nyckeln, `VITE_FLODIA_MILJO`). Secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) läggs **inte** in förrän ett deploy-flöde behöver dem (ägarens beslut 2026-10-13). |
| 7 nyckel | Ingen `.env`. Egen secret key `konto_skript` bara i minnet i PowerShell, raderas efter steg 8. Sedan 2026-10-14 skapas och raderas den vid varje körning (`docs/publicera-motor.md`). |
| 8 konton | Klart. Fyra interna konton för ägarens egna bolag: en huvudkund (avräkning), två underkunder under den (tripkassan respektive åkarkassan) och en direktkund (verkstad). Ägaren är admin i alla fyra. Nyckeln `konto_skript` är raderad. Bolagens namn står inte i repot. |
| 9 Sentry | Hoppas över tills vidare. Felloggningen är avstängd utan DSN. Görs före första kund. |
| 10 underbiträden | Klart. `docs/underbitraden.md` med Supabase och Brevo (avtal och region), Cloudflare, Sentry och Anthropic att fylla i. Ägaren för in dem i registerförteckningen utanför repot. |
| 11A e-post | Klart: mejlet når inkorgen, SPF, DKIM (flodia.se) och DMARC PASS. |
| 5.3 spårning i Brevo | **Öppet, hindrar riktiga användare.** Brevo skriver om inloggningslänken via sendibt3.com (klickspårning) och lägger till en avregistreringslänk (List-Unsubscribe). Det går inte att stänga av för SMTP i Brevos inställningar, bara anonym spårning (påslagen). Ärende hos Brevo. Tills det är löst får inga riktiga användare inloggningsmejl. Reserv: användaren loggar in med koden, som inte skrivs om. Löses det inte byts e-posttjänst (ny post i docs/underbitraden.md). |
| 12 plattformen på Cloudflare Pages | Klart. Projektet flodia byggs från main, `app.flodia.se` Active (CNAME till flodia.pages.dev, proxied, lagd manuellt). GitHub-appen har bara åtkomst till repot. Kontrollerat utifrån utan nycklar (2026-10-13): motor och legacy svarar 401 med vårt felmeddelande utan inloggning, CORS bara för app.flodia.se, okända adresser på plattformen (även /legacy/...) ger appens index.html, ingen legacy-kod och ingen källkodskarta. |
| 11B inloggning hela vägen | Klart (ägaren, 2026-10-13). |
| Miljö | **Drift** (ägarens beslut 2026-10-13). `FLODIA_MILJO` och `VITE_FLODIA_MILJO` ändras från `test` till `drift`, se steg 13. |
| 13 miljön drift | Klart: `FLODIA_MILJO` i Supabase, `VITE_FLODIA_MILJO` i Cloudflare Pages (nytt bygge, Success) och i GitHub Variables. |
| 13.4 Supabase Pro | Klart 2026-10-14, dagliga säkerhetskopior finns. Supabase Storage används inte, så allt ingår i säkerhetskopiorna. |
| Riktiga uppgifter | Får läggas in i huvudkunden och underkunden med Åkarkassan först när övergångsavtalen (GDPR art. 28) med ägaren är underskrivna (fas-2-beslut.md, 2026-10-14). Övriga konton bara exempeldata. Inga externa kunder förrän det nya bolaget tagit över kontona. |

## Steg 0: innan du börjar

1. **Plattformens adress** är `https://app.flodia.se` (ägarens val 2026-10-13), på Cloudflare Pages.
2. **Koden.** Migrationerna och funktionerna ligger på main när `fas-2f` är sammanslagen. Säg till Claude Code att slå ihop den först. Hämta sedan i repot:
   ```
   git checkout main
   git pull
   ```


## Nyckelstatus (2026-10-14)

Efter att den äldre `service_role`-nyckeln visats i klartext (`docs/incidenter/2026-10-14-lackt-service-role.md`):

- **De äldre JWT-nycklarna** `anon` och `service_role` är avstängda.
- **JWT signing keys:** ECC (P-256) används, och Legacy HS256 är återkallad.
- **Publishable-nyckeln** `default` används av appen (Cloudflare Production och Preview, Preview branch: None) och av serverfunktionerna.
- **Secret keys:** `motor` och `legacy`, en per serverfunktion. `default` är raderad.
- **`konto_skript`** finns bara medan ett skript körs.

Allt om nycklarna står i `docs/publicera-motor.md`.

## Steg 1: kontrollera projektet

1. **Regionen:** Project Settings, "General". Regionen ska vara eu-north-1 (Stockholm).
2. **Vad API:t visar:** Project Settings, "Data API". Under "Exposed schemas" ska bara `public` (och `graphql_public`) finnas, inte `app`.
3. **MFA:** Account, "Security". MFA ska vara på för ditt Supabase-konto.
4. **Personuppgiftsbiträdesavtalet:** Organization settings, "Legal" eller "DPA". Skriv under det.

## Steg 2: databasen (migrationerna)

Kör i en egen terminal, inte här i Claude Code, eftersom kommandona frågar efter lösenord:

```
npx supabase login
npx supabase link --project-ref tjehcqyltbcenmkwetbs
npx supabase db push
```

- `login` öppnar webbläsaren.
- `link` frågar efter databasens lösenord. Skriv det i terminalen.
- `db push` visar sju migrationer: `ingen_automatisk_exponering`, `karnan`, `inloggning`, `dokument`, `nfc`, `kassor_och_tak` och `rattigheter_service_role`. Svara `y`.

**Kontroll**
- I Table Editor ska tabellerna finnas, med RLS markerat på varje tabell.
- `modules` ska ha 4 rader.
- `tak` ska ha en rad utan konto, med 60 och 3000.

**Kör inte** `supabase config push`. `config.toml` har värden som bara gäller lokalt, till exempel höjda gränser för testerna.

## Steg 3: serverfunktionerna

I samma terminal:

```
npm ci
npm run bygg:funktioner
npx supabase functions deploy motor --use-api
npx supabase functions deploy legacy --use-api
```

`--use-api` paketerar på Supabases server, så Docker behövs inte. Båda funktionerna kräver inloggning (`verify_jwt`) enligt `config.toml`.

Lägg sedan in hemligheterna för funktionerna under Edge Functions, "Secrets" (Manage secrets). Gör det i webbläsaren, inte på kommandoraden.

| Namn | Värde |
|---|---|
| `PLATTFORM_URL` | `https://app.flodia.se` |
| `FLODIA_MILJO` | `test` |
| `SENTRY_DSN` | Lämna bort tills Sentry finns (steg 9). |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEYS` och `SUPABASE_SECRET_KEYS` sätter Supabase själv. Sedan 2026-10-14 läser funktionerna de nya nycklarna (secret keys `motor` och `legacy`), se `docs/publicera-motor.md`.

**JWT:** projektet signerar med de nya nycklarna (ECC P-256, ES256). Legacy HS256 är återkallad (revoked) sedan 2026-10-14. Gatewayens kontroll "Verify JWT with legacy secret" är därför av för båda funktionerna (`verify_jwt = false`, deploy med `--no-verify-jwt`). Funktionerna kontrollerar själva inloggning, medlemskap, roll, licens och internt konto.

## Steg 4: inloggningen (Authentication)

### 4.1 E-post och självregistrering
Gå till Authentication, "Sign In / Providers":
- **Email:** på.
- **"Allow new users to sign up":** av. Konton skapas bara med `scripts/konto.mjs`.
- **"Email OTP Expiration":** 900 sekunder. Länken gäller i 15 minuter.
- **"Email OTP Length":** 6.

### 4.2 Adresserna
Gå till Authentication, "URL Configuration":
- **"Site URL":** `https://app.flodia.se`.
- **"Redirect URLs":** exakt `https://app.flodia.se/logga-in/bekrafta`, och inget annat. Inga `localhost`-adresser.

### 4.3 SMTP via Brevo
Gå till Authentication, "Emails", "SMTP Settings", och slå på "Enable Custom SMTP":

| Fält | Värde |
|---|---|
| Sender email | `inloggning@flodia.se` |
| Sender name | `Inloggning` (neutralt: samma mejl går till alla kunders användare, SPEC-v3.1 15.2.3) |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | ditt SMTP-användarnamn i Brevo (SMTP & API, fliken SMTP) |
| Password | en ny SMTP-nyckel från samma sida i Brevo. Döp den till `supabase-flodia`. Klistra in den direkt i Supabase. |
| "Minimum interval between emails" | 60 sekunder |

### 4.4 Mejlmallen
Gå till Authentication, "Emails", "Templates", "Magic Link":
- **Subject:** `Din inloggningslänk`
- **Body:** hela innehållet i `supabase/templates/inloggning.html` från repot.

### 4.5 Gränser
Gå till Authentication, "Rate Limits":
- **E-post per timme:** högst vad Brevo-planen tillåter. Förslag: 30.
- Övriga gränser behåller standardvärdena.

### 4.6 Sessionens längd
Sök på "JWT expiry" eller "Access token expiry". Den ligger under Project Settings, "JWT Keys", eller Authentication, "Sessions".
- **Access token expiry:** 600 sekunder, alltså 10 minuter, som i `config.toml`.
- **Refresh token rotation:** på. Reuse interval 10 sekunder.

### 4.7 Hooken som stoppar lösenord
Gå till Authentication, "Hooks", "Add hook", och välj "Customize Access Token (JWT) Claims":
- **Typ:** Postgres.
- **Schema:** `app`.
- **Funktion:** `kontroll_inloggning`.
- Slå på hooken.

## Steg 5: Brevo

1. **Domänen:** `flodia.se` är autentiserad med DKIM och DMARC (`p=none`). Klart.
2. **SPF:** kontrollera i Cloudflare DNS att `flodia.se` har en SPF-post med Brevo, till exempel `v=spf1 include:spf.brevo.com ~all`. Finns det redan en SPF-post ska Brevo läggas till i den. Det får bara finnas en.
3. **Stäng av spårningen för transaktionsmejl:** gå till "Transactional", "Settings", och sök på "Tracking". Stäng av "Track clicks" och "Track opens".
   - Klickspårning skriver om inloggningslänken så att den går via Brevo. Det kan förstöra länken och lämnar ut vem som loggar in.
4. **Personuppgiftsbiträdesavtalet:** godkänn Brevos DPA under kontots inställningar.
5. **DMARC:** efter två veckor utan fel ändras DMARC till `p=quarantine` i Cloudflare.

## Steg 6: GitHub Secrets och variabler

Gå till `Mommerff11/flodia`, Settings, "Secrets and variables", "Actions". CI använder inget av detta i dag. Det är för driftsättningen senare.

**Secrets (hemliga):**

| Namn | Var du hittar den |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com, Account, "Access Tokens". Skapa en som heter `github-flodia`. |
| `SUPABASE_DB_PASSWORD` | Databasens lösenord. |

**Variables (inte hemliga):**

| Namn | Värde |
|---|---|
| `SUPABASE_PROJECT_REF` | `tjehcqyltbcenmkwetbs` |
| `VITE_SUPABASE_URL` | `https://tjehcqyltbcenmkwetbs.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | den publika nyckeln (Project Settings, "API Keys", anon eller publishable) |
| `VITE_FLODIA_MILJO` | `test` |

**Lägg aldrig service-nyckeln** (service_role eller secret) i GitHub.

## Steg 7: nyckeln för skripten, bara i minnet

Ingen `.env`-fil (ägarens beslut 2026-10-13: den hemliga nyckeln får inte ligga i en fil). Skapa en egen secret key i Supabase (Project Settings, "API Keys") som heter `konto_skript`. Lägg den bara i minnet i en egen PowerShell-flik:

```powershell
$env:SUPABASE_URL = 'https://tjehcqyltbcenmkwetbs.supabase.co'
$s = Read-Host -AsSecureString 'Secret key konto_skript'
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $s).Password
Remove-Variable s
```

`scripts/konto.mjs` läser båda från miljön (`process.env`). Efter steg 8: `Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY`, stäng fliken och radera nyckeln `konto_skript` i Supabase.

## Steg 8: dina egna bolag som interna

Bara interna konton får legacy-bryggan, alltså de nuvarande apparna i plattformen. Markera aldrig en kund som intern. Varje kommando kräver `--moln`.

1. Skapa ett bolag som internt:
   ```
   node scripts/konto.mjs skapa-konto --namn "<Bolagets namn>" --slug <kort-namn> --typ main --moduler avrakning,akarkassan,tripkassan,foliering --intern --moln
   ```
2. Markera ett befintligt bolag:
   ```
   node scripts/konto.mjs intern --konto <kort-namn> --moln
   ```
3. Ta bort markeringen:
   ```
   node scripts/konto.mjs intern --konto <kort-namn> --av --moln
   ```
4. Lägg till dig själv som admin:
   ```
   node scripts/konto.mjs lagg-till --konto <kort-namn> --epost <din adress> --roll admin --moln
   ```
5. Kontrollera:
   ```
   node scripts/konto.mjs lista --konto <kort-namn> --moln
   ```

`intern` kan bara ändras med service-nyckeln, aldrig från klienten. Det visar testerna för radsäkerheten.

## Steg 9: Sentry (när det är dags)

1. **Organisationen:** skapa den i EU-regionen ("European Union", Frankfurt). Den går inte att flytta efteråt.
2. **DSN:** en DSN i EU har formen `https://<nyckel>@o<nummer>.ingest.de.sentry.io/<nummer>`. Annars förblir felloggningen avstängd.
3. **Personuppgiftsbiträdesavtalet:** Settings, "Legal".
4. **Lagringstid:** högst 90 dagar (fas-2-beslut.md, beslut 10). Kontrollera under organisationens inställningar.
5. **Larm:** under "Alerts". Ett vid nytt fel och ett vid många fel, med e-post till dig. När taket för anrop nås kommer en varning med texten "Taket för anrop nått".
6. **Lägg in DSN:en:** som `SENTRY_DSN` i steg 3 (Supabase Secrets) och som variabeln `VITE_SENTRY_DSN` i steg 6.

## Steg 10: registerförteckningen

Lägg till Supabase (drift, EU), Brevo (e-post) och, när de finns, Sentry och värden för plattformen som underbiträden i `docs/integritetspolicy.md` och registerförteckningen.

## Steg 12: plattformen på Cloudflare Pages

Plattformen (`apps/platform`) är statiska filer. Den innehåller inga motorer och inga legacy-filer (granskas i CI, beslut 26). Bara den publika nyckeln byggs in.

1. **Koppla repot:** Cloudflare, "Workers & Pages", "Create", fliken "Pages", "Connect to Git". Ge Cloudflares GitHub-app åtkomst bara till repot `Mommerff11/flodia` ("Only select repositories").
2. **Bygget:**

   | Fält | Värde |
   |---|---|
   | Project name | `flodia` |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run build -w @flodia/platform` |
   | Build output directory | `apps/platform/dist` |
   | Root directory | (tomt, repots rot) |

3. **Miljövariabler** (Variables and Secrets, för Production). Ingen av dem är hemlig:

   | Namn | Värde |
   |---|---|
   | `NODE_VERSION` | `24` (som `.nvmrc`) |
   | `VITE_SUPABASE_URL` | `https://tjehcqyltbcenmkwetbs.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | den publika nyckeln (publishable), samma som i GitHub |
   | `VITE_FLODIA_MILJO` | `test` |

   Lägg aldrig en secret key eller service_role i Cloudflare.
4. **Spara och bygg.** Bygget ska sluta med "Success". Adressen blir `https://flodia.pages.dev`.
5. **Egen adress:** projektet, "Custom domains", "Set up a custom domain", `app.flodia.se`. DNS ligger redan hos Cloudflare, så posten skapas automatiskt. Vänta tills status är "Active".
6. **Förhandsbyggen:** under Settings, "Builds", "Branch control": bygg bara `main` (stäng av automatiska förhandsbyggen för andra grenar), så att inga andra versioner ligger ute.
7. **Kontroll:** öppna `https://app.flodia.se`. Inloggningssidan ska visas på svenska, med "Drivs av Flödia" längst ner. Öppna också `https://app.flodia.se/valj-konto` direkt: samma app ska visas (inte 404), eftersom Pages skickar okända adresser till appen när det inte finns någon 404-sida.

Cloudflare (Pages) är tillagd i `docs/underbitraden.md`.

## Steg 13: miljön drift och Supabase Pro

1. **Supabase, Edge Functions, "Secrets":** ändra `FLODIA_MILJO` från `test` till `drift`. Funktionerna läser hemligheterna när de startar, så ingen ny deploy behövs. Värdet används bara som miljö i felloggningen (Sentry).
2. **Cloudflare Pages, projektet flodia, Settings, "Variables and Secrets" (Production):** ändra `VITE_FLODIA_MILJO` från `test` till `drift`. Variablerna byggs in när plattformen byggs, så ett nytt bygge behövs: under "Deployments", välj den senaste produktionsversionen och "Retry deployment" (eller vänta på nästa push till main).
3. **GitHub, Settings, "Secrets and variables", "Actions", fliken Variables:** ändra `VITE_FLODIA_MILJO` till `drift`, så att den stämmer när ett deploy-flöde byggs.
4. **Supabase Pro:** uppgradera organisationen och kontrollera under Database, "Backups" att dagliga säkerhetskopior finns. Först därefter får riktiga uppgifter läggas in.

## Före första kund: en adress som tar emot mejl

`flodia.se` har inga MX-poster och tar inte emot mejl. Innan kunder kommer behövs minst en mottagaradress, till exempel `support@flodia.se` via Cloudflare Email Routing (vidarebefordran till ägarens brevlåda). Den behövs för support, för svar på mejl från plattformen och som kontaktadress i integritetspolicyn och biträdesavtalet. Lägg till MX- och SPF-poster enligt Cloudflare, och se till att SPF-posten fortfarande är en enda post som tar med både Brevo och Cloudflare.

## Steg 11: kontroll (Claude Code gör den när du säger till)

**Först:** skicka en testinloggning till din egen adress. Stäng sedan direkt av "Track clicks" och "Track opens" för transaktionsmejl i Brevo (steg 5.3). Ingen riktig användare får mejl innan det är gjort. Kontrollera därefter med en ny testinloggning att länken i mejlet börjar med `https://app.flodia.se/logga-in/bekrafta`.


- Inloggning med e-postlänken och med koden till din egen adress.
- Mejlets huvud ska visa `spf=pass`, `dkim=pass` och `dmarc=pass` ("Visa original" i Gmail). Testa också på mail-tester.com.
- Länken i mejlet ska börja med `https://app.flodia.se/logga-in/bekrafta`, inte med en adress hos Brevo.
- Lösenordsinloggning ska stoppas (hooken).
- En användare utan konto ska inte se något.
- Bryggan ska ge 403 för ett externt konto och appen för ett internt.
- Åtkomsttoken ska gälla i 10 minuter och förnyas.
- Alla rättigheter ska vara exakt som i metatestet. Samma kontroll körs mot molnets databas, bara med läsning.
