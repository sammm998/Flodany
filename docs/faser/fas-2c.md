# Fas 2c: documents-API (rapport)

Klar 2026-10-12 på grenen `fas-2c`. Grenen utgår från `fas-2b`, som ligger kvar tills molndelen av 2b är klar. Ingen av dem är sammanslagen med main.

## Vad som är byggt

**`packages/api`**
- `skapaDb({ supabase, konto, modul })` har samma gränssnitt som `legacy/shared/claude-shim.js`:
  - `doc` och `collection`
  - `get`, `set` (med `merge`), `update`, `delete` och `add`
  - `onSnapshot`
  - samma form på ögonblicksbilderna (`exists`, `data()`, `docs`, `size`, `empty`, `forEach`, `id`, `ref`)
  - samma sortering (`localeCompare`)
  - samma normalisering av sökvägar
- `skapaClaude(...)` ger `use('db' | 'downloads' | 'user')`, så att legacy-bryggan i 2e kan koppla `window.claude.use` direkt.
- Kassans sökvägar `data/users/<uid>/...` lagras utan prefixet, eftersom kontot är nyckeln (spec v3 s. 9). Två användare i samma konto ser därför samma kassa. `collection('data/users/' + uid)` listar dokumenten på toppnivå, som kassan gör när den listar månader.

**Databasen (migrationen `20261014090000_dokument.sql`)**
- `dok_skriv` sparar ett dokument i ett enda anrop, utan risk att två skrivningar krockar. Den ersätter dokumentet eller sammanfogar på toppnivå, och skapar det om det saknas.
- `dok_ta_bort` tar bort ett dokument. Ett dokument som syns men inte får tas bort ger `not_granted` i stället för att ingenting händer.
- Båda körs med den inloggades rättigheter, så radsäkerheten och licensen gäller som vanligt.

**Livevisning**
- Varje ändring i `documents` skickas på en privat kanal per konto och modul (`dok:<konto>:<modul>`).
- Händelsen innehåller bara sökväg, samling, vad som hände och version, plus meddelandets eget id. Den innehåller aldrig dokumentets data. Klienten hämtar sedan dokumentet med sina egna rättigheter.
- Bara medlemmar med licens får ta emot (radsäkerhet på `realtime.messages`). Ingen klient får skicka.
- Vid anslutning läses allt en gång till, så att inget som ändrats under tiden missas.

**Sökvägar**
- Sökvägar får nu innehålla å, ä och ö. I 2a godtogs bara ASCII, eftersom databasens C-locale räknar `[[:alnum:]]` som ASCII.
- Regeln är nu allt utom snedstreck, blanksteg och styrtecken, och inga delar som är `.` eller `..`. Samma regel gäller i API:t.

## Tester

**Kontraktssviten (`packages/api/kontrakt.ts`)** innehåller 11 tester som körs mot både shimmen och databasen:
- dokument som saknas
- data i flera nivåer
- ersättning och sammanfogning
- update som skapar
- delete
- normalisering
- direkta barn och sortering
- nästlade sökvägar och `add`
- fryst data respektive kopia
- `onSnapshot` på dokument och på samling

**`tests/db/dokument.test.ts`** innehåller kontraktet mot databasen plus:
- läs-rollen får `not_granted`
- ett annat konto ser ingenting och får `not_granted`
- `invalid_argument`
- licens
- moduler i samma konto är skilda åt
- kassans sökvägar
- livevisningen:
  - konto A och anon får aldrig händelser från B, inte heller vid borttagning
  - händelser utan data
  - klienten kan inte skicka egna händelser
  - `onSnapshot` i fel konto ger fel och aldrig data, medan en annan användare i rätt konto ser ändringen

| CI-jobb | Resultat |
|---|---|
| ci | 1388 tester gröna, varav kontraktet mot shimmen 11 |
| databas | 91 tester gröna (2a: 58, 2b: 12, 2c: 21), körning 38243240335, grön två gånger i rad |

## Skillnader mot shimmen

Skillnaderna är avsiktliga. De följer claude.ai:s riktiga runtime eller plattformens krav.

| Nr | Skillnad | Varför |
|---|---|---|
| 1 | `data()` är fryst. | Som i claude.ai. Apparna klonar redan innan de ändrar. |
| 2 | Fel har `code`: `not_granted`, `invalid_argument` eller `unavailable`. | Avräkningen läser `not_granted` och `invalid_argument` (avrakning:1903 och 1938). |
| 3 | Ett dokument i ett konto man inte har tillgång till ser ut att saknas, i stället för att ge fel. Att ta bort något man inte ser är inget fel. | Radsäkerheten avslöjar inte vad som finns i andra konton. |
| 4 | `onSnapshot` ser ändringar från alla användare och flikar. En ändring som inte ändrar innehållet ger ingen ny ögonblicksbild. | Shimmen ser bara den egna fliken. Apparna ritar om på varje ögonblicksbild, så en likadan behövs inte. |
| 5 | Sökvägar med blanksteg eller styrtecken ger `invalid_argument`. | Inga av apparnas sökvägar har det. |

## Fynd på vägen

1. **Kanaler med samma ämne.** `supabase.channel()` ger tillbaka en befintlig kanal med samma ämne, även en som håller på att stängas eller har fått fel. API:t delar därför en kanal per klient och ämne och öppnar en ny först när den gamla är helt stängd (`navFor`).
2. **Testklienternas token.** Testklienterna gav bara Realtime användarens token manuellt. När Realtime anslöt igen föll den tillbaka på anon-nyckeln och fick "Unauthorized". Testklienterna skapas nu med `accessToken`. Plattformens klient har en riktig session och påverkas inte, men 2e ska ha ett test i webbläsaren med en lång session.
3. **Realtimes logg i CI.** Loggen skrivs nu ut i CI när jobbet misslyckas, så att sådana fel går att se direkt.

## Kvar till senare

- **Kontroll av version vid skrivning** (krock mellan två som sparar samtidigt). `version` finns och räknas upp, men apparna använder den inte. Den tas upp i fas 3 när skärmarna byggs.
- **Hur länge Realtime sparar meddelanden.** Det sköter Realtime själv (partitioner per dag). Det kontrolleras i drift (2f).

## Krav från ägarens granskning av 2c (gjort på grenen fas-2d)

2c godkändes 2026-10-12 med två krav och två kontroller. Allt är gjort och testat i `fas-2d`. CI-körning 38245977442 gick igenom vid första försöket, utan omkörning (93 databastester, `retry: 0`).

1. **Ny token vid varje förnyelse.** `packages/api` lyssnar på `TOKEN_REFRESHED` och inloggning och ger Realtime den nya token (`foljToken`). supabase-js gör det också själv, men livevisningen ska inte hänga på bibliotekets inre.
   - Testet skapar en token som bara gäller i 20 sekunder, ansluter, förnyar och väntar tills den korta token har gått ut. Därefter syns en ändring fortfarande.
2. **Deterministisk livevisning.** Testerna väntar på `SUBSCRIBED` eller `CHANNEL_ERROR` (`db.redo()` och kanalens status) med en tidsgräns, och har inga fasta pauser.
   - Där testet ska visa att något inte kommer fram används ett vittne: en andra lyssnare, en riktig ändring efter den falska, eller en ändring i samlingen efter en ändring längre ner. När vittnet har sett sin händelse hade den andra också kommit.
   - Testet av inloggningsmejl till okänd adress kontrollerar Mailpit direkt, eftersom Supabase Auth skickar mejlet innan svaret kommer.
3. **NFC.** Sökvägar lagras alltid i NFC (migrationen `20261015090000_nfc.sql`): en trigger, en kontroll i tabellen, och `dok_skriv` och `dok_ta_bort` normaliserar. API:t normaliserar också. Testet skriver "Åkeri" som a plus ring via API:t, via rpc förbi API:t och direkt med SQL. Allt hamnar på samma sökväg i NFC och hittas med båda stavningarna.
4. **Vad kassorna sparar under `data/users/<uid>/`.** Se nästa avsnitt.

## Vad kassorna sparar under data/users/&lt;uid&gt;/

Bara Åkarkassan och Tripkassan använder `data/users/<uid>/`. Avräkningen och Verkstad sparar redan per bolag. Källan är `legacy/apps/akarkassan/index.html` och `legacy/apps/tripkassan/index.html`.

| Dokument | App | Innehåll | Personuppgifter |
|---|---|---|---|
| `settings` | båda | Inställningar (procent, semester, priser, dag och kväll, utbetalningsdag, lönearter) och förarregistret: namn, lönemodell, månadslön, anställning och `person` med personnummer, skattetabell, bankkonto, adress och postadress. Dessutom lönehistorik per månad (`lonHist`). | Ja, om förarna: personnummer, bankkonto, adress, lön. |
| `skatt` | båda | Skatteverkets skattetabeller. | Nej. |
| `ekonomi-2026` | båda | Bolagets ekonomi per månad. Appen läser dokumentet men skriver det inte; det skrevs av en månadsavstämning i Claude. | Nej, bolagsdata. |
| `m-ÅÅÅÅ-MM` | båda | Månadens LDL-text från Megtax (förarnummer, pass, tider, belopp), passager (bro och Sturup med regnummer), filnamn, och per förare: kontanter, förskott, bonus, lönearter, plattformsavgifter och manuella kopplingar. | Ja, om förarna: arbetstid, inkomst, förskott. Regnummer. |
| `avtal-<id>` | Åkarkassan | Anställningsavtal per förare, med versioner. | Ja, om föraren. |
| `bok-ÅÅÅÅ-MM` | Tripkassan | Bokföringen för månaden. | Kan innehålla namn i verifikationstexter. |
| `bank-ÅÅÅÅ-MM` | Tripkassan | Bankhändelser för månaden. | Kan innehålla namn i banktexter. |

Appen sparar också en kopia av allt i webbläsarens localStorage (nycklar som börjar med `ak_` och `tt_`), och vald flik (`_tab`).

**Bedömning**
- Inget av detta är personligt för den inloggade användaren: inga egna inställningar och ingen egen data. Allt är bolagets lönedata.
- Det är därför rätt att det delas i kontot, och kontot är nyckeln.
- Men det innehåller personuppgifter om förarna. På claude.ai såg bara ägaren dem. På plattformen ser varje medlem i kontot med licens för modulen allt, även rollen läs.

**Frågor till ägaren**
1. Ska rollen läs se kassorna (lön, personnummer, bankkonto)? Förslag: nej. Kassorna kräver ekonomi eller admin även för att läsa. Det byggs i lönefasen med ett test först, och förs in i registerförteckningen.
2. Legacy-bryggan (2e) lämnar localStorage-kopior i webbläsaren. Förslag: bryggan stänger av den kopian, eller rensar den vid utloggning, och används bara på interna konton, som redan beslutat.
