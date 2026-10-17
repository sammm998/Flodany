# Publicera serverfunktionerna motor och legacy, kontrollera och backa

Gäller molnprojektet `flodia` (tjehcqyltbcenmkwetbs, Stockholm). Nycklar skrivs bara in i ditt eget PowerShell-fönster, aldrig i repot, i en fil eller i chatten. Kör `cls` innan du tar en skärmdump av ett fönster där en nyckel har klistrats in.

## API-nycklarna (läget 2026-10-14)

| Nyckel | Typ | Används av |
|---|---|---|
| `default` | publishable | Appen (Cloudflare Pages, Production och Preview, och GitHub-variabeln `VITE_SUPABASE_ANON_KEY`), serverfunktionerna och kontrollskriptet. Publik. |
| `motor` | secret | Bara serverfunktionen motor. Läses ur `SUPABASE_SECRET_KEYS`, ingen kopierar den. |
| `legacy` | secret | Bara serverfunktionen legacy, på samma sätt. |
| `konto_skript` | secret, tillfällig | Finns bara medan ett skript körs, se regeln nedan. |

- **De äldre JWT-nycklarna** `anon` och `service_role` är avstängda.
- **JWT signing keys:** ECC (P-256) används. Legacy HS256 är återkallad (revoked), så inget som signerats med den gamla hemligheten godtas längre.
- **Secret key `default`** är raderad.
- Se incidentnoteringen `docs/incidenter/2026-10-14-lackt-service-role.md`.

**Ingen reserv i molnet sedan PR #12.** Serverfunktionerna använder i molnet bara sin egen secret key och publishable-nyckeln `default`. Saknas någon av dem startar funktionen inte, och felet säger vilken nyckel som saknas, utan värden. Molnet känns igen på `FLODIA_MILJO = drift` i första hand och på `SB_REGION`, som Supabase bara sätter i molnet, i andra hand. Lokalt (`supabase start` i CI) finns inga secret keys med funktionernas namn, och där används de äldre nycklarna (`packages/server/nycklar.ts`).

Vid start skriver serverfunktionerna i loggen läget och varifrån nycklarna kom, utan värden, till exempel `motor (moln): nycklar från SUPABASE_SECRET_KEYS.motor och SUPABASE_PUBLISHABLE_KEYS.default`. Står det `(lokalt)` i molnet ska det utredas.

**Byta en secret key:** funktionerna läser sin nyckel med namn. Ta bort den gamla, skapa direkt en ny med samma namn och publicera funktionen igen. Under de minuterna svarar funktionen inte.

### Regel: en tillfällig secret key per körning

`scripts/kontrollera-motor.mjs` och `scripts/konto.mjs` kräver en secret key. Den skapas och raderas vid **varje** körning:

1. Supabase, Project Settings, API Keys, Secret keys: skapa `konto_skript`.
   ⚠️ **Nyckeln visas.** Kopiera den bara till PowerShell, aldrig till en skärmdump, en fil eller chatten.
2. Klistra in den med `Read-Host -AsSecureString`, som nedan. Stäng dialogen och töm urklippet. Kör `cls`.
3. Kör skripten.
4. `Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY`, radera `konto_skript` i Supabase och stäng PowerShell-fönstret.

Nyckeln sätts så här. Miljövariabeln heter fortfarande `SUPABASE_SERVICE_ROLE_KEY` i skripten, men värdet är den tillfälliga secret key:

```
$env:SUPABASE_URL = "https://tjehcqyltbcenmkwetbs.supabase.co"
$env:SUPABASE_ANON_KEY = Read-Host "Publishable-nyckeln"
$env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "Secret key konto_skript" -AsSecureString)))
cls
```

## Testkontot (finns)

Kontrollen körs som testanvändaren `motorkontroll@example.se` (ekonomi) i testkontot `motorkontroll` (direktkund, bara Avräkning, påhittad data, fotoläsningen aldrig påslagen). Kontot skapades 2026-10-14 med:

```
node scripts/konto.mjs skapa-konto --namn "Testkonto motorkontroll" --slug motorkontroll --typ direct --moduler avrakning --moln
node scripts/konto.mjs lagg-till --konto motorkontroll --epost motorkontroll@example.se --roll ekonomi --moln
```

Användaren får inget mejl. Kontrollskriptet loggar in den med en e-postlänk som skapas med secret key, samma väg som vid vanlig inloggning.

## Varje publicering

1. **Nyckeln:** skapa `konto_skript` och sätt miljön enligt regeln ovan.
2. **Före:** kör kontrollen mot den version som är publicerad nu och spara resultatet utanför repot.
   ```
   node scripts/kontrollera-motor.mjs --konto motorkontroll --epost motorkontroll@example.se --ut ..\motor-fore.json --moln
   ```
3. **Notera versionen och committen** som är publicerad nu: `npx.cmd supabase functions list` (kolumnen version) och raden i tabellen nedan.
4. **Publicera** från `main`:
   ```
   npm.cmd ci
   npm.cmd run bygg:funktioner
   npx.cmd supabase functions deploy motor --use-api
   npx.cmd supabase functions deploy legacy --use-api
   ```
   Har PR:en en ny migration körs `npx.cmd supabase db push` först. Motor kan läsa nya kolumner, och utan migrationen fungerar inget anrop.
5. **Efter:** samma kontroll, jämförd med körningen före. Prova också bryggan (app.flodia.se, ett internt konto, **Öppna nuvarande app**).
   ```
   node scripts/kontrollera-motor.mjs --konto motorkontroll --epost motorkontroll@example.se --ut ..\motor-efter.json --jamfor ..\motor-fore.json --moln
   ```
   Kontrollen räknar en avräkning med påhittad testdata (scenariot grund i `packages/core/avrakning/fixtures`) och kräver att svaret är lika med det gyllene facit och med körningen före. Den kräver också att fotoläsningen svarar 403 (`ingen_funktion`) i testkontot. Allt annat ger "NEJ" och felkod 1.
6. **Radera** `konto_skript` och stäng PowerShell (regeln ovan).

## Backa till föregående version

Supabase sparar inte gamla versioner att välja mellan. Man backar genom att publicera föregående commit igen:

```
git switch --detach <föregående commit>
npm.cmd ci
npm.cmd run bygg:funktioner
npx.cmd supabase functions deploy motor --use-api
git switch main
npm.cmd ci
```

Kör sedan kontrollen igen, jämförd med `motor-fore.json`. Migrationerna backas inte: de lägger bara till, och äldre versioner av motor fungerar med dem.

**Backa aldrig till en commit före `8e6e7f5`.** Äldre versioner läser bara de äldre JWT-nycklarna, som är avstängda, och skulle sluta fungera direkt.

## Publicerade versioner

**motor**

| Version | Commit | Datum | Innehåll |
|---|---|---|---|
| 12 | `9d3c329` | 2026-10-14 | Fotoläsningen (avstängd), funktioner per konto, tak per dag |
| 13 | `c4ee66d` | 2026-10-14 | Fotoläsningen med structured outputs (Claude Sonnet 5.5) |
| 14 | `8e6e7f5` | 2026-10-14 | Läser de nya API-nycklarna, med de äldre som reserv |
| 15 och 16 | `8e6e7f5` | 2026-10-14 | Ingen ny kod. Versionerna kom till mellan 14 och 17, när secret keys `motor` och `legacy` skapades. |
| 17 | `8e6e7f5` | 2026-10-14 | Publicerad igen efter att secret keys skapats. Kontrollerad före och efter avstängningen av de äldre nycklarna och efter återkallelsen av HS256 (sha256 `829ca469f54a9ed6`). |
| 18 till 23 | | | Nummer som Supabase hoppade över mellan 17 och 24. Supabase räknar varje försök, också omtag. Utrett och stängt i incidentnoteringen. |
| 24 | `b51b433` | 2026-10-15 | Ingen reserv i molnet (PR #12). Loggen: `motor (moln)`. Kontrollerad före och efter (sha256 `829ca469f54a9ed6`). |

**legacy**

| Version | Commit | Datum | Innehåll |
|---|---|---|---|
| 12 | `8e6e7f5` | 2026-10-14 | Läser de nya API-nycklarna, med de äldre som reserv |
| 13 och 14 | `8e6e7f5` | 2026-10-14 | Ingen ny kod, som för motor 15 och 16 |
| 15 | `8e6e7f5` | 2026-10-14 | Publicerad igen efter att secret keys skapats. Bryggan provad efter varje steg i nyckelbytet. |
| 16 till 21 | | | Nummer som Supabase hoppade över mellan 15 och 22. Supabase räknar varje försök, också omtag. Utrett och stängt i incidentnoteringen. |
| 22 | `b51b433` | 2026-10-15 | Ingen reserv i molnet (PR #12). Loggen: `legacy (moln)`. Bryggan provad med Tripkassan. |
| 23 till 26 | | | Nummer som Supabase räknade mellan 22 och 27 (se ovan). |
| 27 | `af99443` | 2026-10-15 | Legacy-texterna för Lön och kassa och Lön och bokföring, och SIE-filens namn från bolaget (PR #21). |
