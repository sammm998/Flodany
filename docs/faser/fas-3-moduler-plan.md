# Fas 3: moduler och tillval per bolag (plan)

Status: **godkänd plan 2026-10-14, inget byggt.** Avsnittet om förarens lönespec godkändes samma dag, med svaren på fråga 17 till 19. Ägarens svar är inlagda (fråga 2, 5, 7, 10, 11 och 12). Ingen migration och ingen kod förrän ägaren säger till att bygget börjar. Övriga frågor sist i filen är öppna. Underlag: ägarens beslut "Produktpaket och bolagsinställningar" i `fas-2-beslut.md`, SPEC-v3.1 (avsnitt 3, 9, 12, 14, 16 och 18) och spec v3 s. 5 till 7.

## Läget i dag

- Spärren går per **modul**. Tabellen `licenses` har en rad per konto och modul (`module_key`, `status`, `ended_at`, `price`).
- `app.har_licens(konto, modul)` används i radsäkerheten för `documents`, `file_runs` och `periods`, i kanalen för livevisning, i serverfunktionen `motor` och i legacy-bryggan. Utan aktiv licens syns inga dokument och inget kan skrivas.
- Menyn visar bara moduler med aktiv licens, men menyn är ingen spärr. Spärren sitter i databasen och på servern.
- **Det finns ingen nivå under modulen.** Allt i Åkarkassan är på eller av. Det går inte att sälja Lön utan Ekonomi, eller att slå på Worldline för ett bolag.

## Mål

1. Ett bolag kan ha delar av en modul: paket och tillval.
2. Spärren sitter i **databasen och på servern**, som modulspärren i dag. Menyn och skärmarna följer bara det databasen redan bestämt.
3. Beroenden hålls av databasen. Ett paket kan inte vara på om det det kräver är av.
4. Allt byggs en gång och är lika för alla bolag som slår på det (beslut 1 i "Produktpaket och bolagsinställningar").
5. Legacy-filerna ändras inte. De kan läsa vilka funktioner som är på, men spärren gäller oavsett om de gör det.

## Paket och tillval

| Nyckel | Modul | Typ | Kräver | Standard | Innehåll |
|---|---|---|---|---|---|
| `akeri.bas` | akarkassan, tripkassan | Paket (kärna) | Modulens licens | På med licensen | Förare och bilar, inställningar, LDL, kassa per bil och dag, Bolt och Uber (kärna enligt beslut 2) |
| `akeri.lon` | akarkassan, tripkassan | Paket | `akeri.bas` | Av | Lön, skattetabeller, lönebesked, anställningsavtal, hittills i år, AGI-filen (beslut 28) |
| `akeri.ekonomi` | akarkassan, tripkassan | Paket | `akeri.bas` (inte Lön: ett åkeri kan ha lönen hos en byrå och bokföringen i Flödia) | Av | Bokföring, bankhändelser, SIE, momsinställningen per bolag |
| `akeri.worldline` | akarkassan, tripkassan | Tillval | `akeri.bas` | Av | Kortbetalningar via Worldline |
| `akeri.kvittning` | akarkassan, tripkassan | Tillval | `akeri.lon` | **Av** (beslut 2) | Förra månadens kontanter kvittas i månadslönen |
| `avrakning.klader` | avrakning | Tillval | Modulens licens | Av | Fliken Kläder i centralens Avräkning (se nedan) |

Centralen (Avräkning) och verkstaden (Verkstad) är egna lösningar med pris per kund. De får inga paket nu, bara tillval där det behövs, som Kläder.

## Datamodell (förslag)

### `public.funktioner`: katalogen

| Kolumn | Typ | Beskrivning |
|---|---|---|
| `nyckel` | text, primärnyckel | till exempel `akeri.lon` |
| `module_key` | text, referens till `modules` | modulen funktionen hör till. För åkeripaketet en rad per modul, eller en kolumn `moduler text[]` (fråga 1) |
| `namn` | text | visas i admin och på fakturaunderlaget |
| `typ` | `paket` eller `tillval` | |
| `kraver` | text[] | nycklar som måste vara på |
| `standard_pa` | boolean | om funktionen slås på när licensen skapas |

Ingen klientskrivning. Inloggade får läsa katalogen, så att skärmarna kan visa namn.

### `public.konto_funktioner`: per bolag

| Kolumn | Typ | Beskrivning |
|---|---|---|
| `tenant_id` | uuid | kontot |
| `nyckel` | text, referens till `funktioner` | |
| `status` | `aktiv` eller `pausad` | samma typ som licenserna |
| `started_at`, `ended_at` | timestamptz | `ended_at` i framtiden betyder att funktionen är uppsagd men gäller till dess |
| `price` | numeric | pris per bolag, eller tomt om priset ingår i modulen |
| `installningar` | jsonb | till exempel för kvittning: från vilken period |

Primärnyckeln är (`tenant_id`, `nyckel`).

**Triggrar:**
- Ett paket kan inte slås på om det det kräver är av, och ett paket kan inte slås av om något som är på kräver det. Felet förklarar vad som saknas, i klartext.
- Varje ändring loggas i `audit_log`, med vem som gjorde den.
- När en licens skapas läggs funktionerna med `standard_pa` in.

### Rättigheter och radsäkerhet

- **Skrivning:** bara servern (service_role), alltså plattformens personal i admin (4a) och `scripts/konto.mjs`. Ingen kund kan slå på något själv i version 1, eftersom det är en fråga om pris och avtal.
- **Läsning:** medlemmar i kontot läser sina egna rader, för menyn och skärmarna. Fråga 3: alla roller, eller bara admin?
- **Ny hjälpfunktion `app.har_funktion(konto uuid, nyckel text)`:**
  - Svarar sant när raden är aktiv och inte har gått ut, när allt som krävs också är aktivt (rekursivt) och när modulens licens är aktiv.
  - Körs med ägarens rättigheter och tom `search_path`, som `app.har_licens`.

### Spärren på data

Dokumenten ligger i `documents` med en sökväg per modul. En funktion behöver kunna kopplas till sökvägar:

- **Tabellen `public.funktion_sokvagar` (`module_key`, `monster`, `nyckel`)** anger vilken funktion en sökväg hör till. Förslag för kassorna, som sparar på toppnivå:

  | Sökväg | Funktion |
  |---|---|
  | `settings`, `seed/demo` | `akeri.bas` |
  | `m-ÅÅÅÅ-MM` (månaden: LDL, passager, kassa) | `akeri.bas` |
  | `skatt`, `avtal-*` | `akeri.lon` |
  | `bok-*`, `bank-*`, `ekonomi-*` | `akeri.ekonomi` |
  | Worldlines filer (när de finns) | `akeri.worldline` |

  Månaden innehåller både kassa och lönekörning i ett och samma dokument. Det gör att lönen i månadsdokumentet inte går att spärra för sig utan att dela dokumentet (fråga 4).
- **En ny kolumn `documents.funktion`** sätts av en trigger från tabellen när ett dokument skapas eller sökvägen ändras. Klienten kan inte välja den.
- **Radsäkerheten för `documents` får villkor för funktionen**, olika för läsning och skrivning (ägarens svar på fråga 5):
  - **Skapa, ändra och ta bort:** `funktion is null or app.har_funktion(tenant_id, funktion)`, alltså bara när funktionen är på. Annars `not_granted`.
  - **Läsa:** `funktion is null or app.hade_funktion(tenant_id, funktion)`, alltså så länge kontot har eller har haft funktionen (aktiv, pausad eller avslutad).
- **Avstängd funktion: datan är läsbar men låst, och raderas aldrig.** Räkenskapsinformation ska bevaras i 7 år (bokföringslagen 7 kap. 2 §). Bolaget kan läsa och exportera, men inte ändra. När funktionen slås på igen kan den ändras som förut. Radering sker bara enligt en egen gallringsregel efter lagstadgad tid, aldrig när en funktion stängs av.
- **Nya tabeller i fas 3** (till exempel `settlements` enligt SPEC-v3.1 avsnitt 8) får kolumnen `funktion` direkt och samma villkor.

### Servern (`motor`)

- Varje operation får en funktion: räkna lön kräver `akeri.lon`, räkna kassa kräver `akeri.bas`, AGI-filen kräver `akeri.lon`. Utan den blir svaret 403 med koden `ingen_funktion` och en svensk text.
- **Kvittningen styrs av funktionen, inte av inställningen i bolagets cfg.** `kontanterManadenEfter` gäller bara när `akeri.kvittning` är på, och från perioden i `installningar`. Det rättar avvikelsen som noterades i beslutet: i dag har Åkarkassan `kontEfterFran: '2026-10'` som standard. Ändringen görs med test och en rapporterad diff, enligt regeln om beräkningar.
- Taket och `usage` räknas som i dag.

### Tester

- **Matrisen** i `tests/db` utökas: varje funktion av och på, för varje roll och konto. Ett konto med Lön av ser inga lönedokument, och kan inte skriva dem, inte heller via rpc eller serverfunktionen.
- **Beroenden:** Lön kan inte vara på utan Bas, och Bas kan inte slås av när Lön är på.
- **Metatest:** varje sökväg som apparna skriver har en rad i `funktion_sokvagar`, eller är uttryckligen fri. En ny sökväg utan funktion stoppar CI.
- **Playwright:** ett bolag med bara Bas ser inte Lön i de nya skärmarna.

## Legacy-apparna

Legacy-filerna är frysta. De kan inte dölja flikar själva. Förslaget har två delar:

1. **Spärren gäller ändå.** Legacy sparar via bryggan, alltså documents-API:t med användarens rättigheter. En flik vars funktion är av kan inte läsa eller spara sina dokument. Den visar då tomt eller ett felmeddelande. Det är säkert, men inte snyggt.
2. **Bryggan berättar vad som är på.** `window.claude.use('funktioner')` ger `{ aktiva: string[] }`, alltså de nycklar som är på för kontot, och kan bara läsas.
   - Kontraktet beskrivs här och i `packages/api`.
   - Kommande legacy-byten, med ägarens avsiktliga commits, kan läsa det och dölja flikar.
   - Gamla legacy-filer som inte läser det fungerar som i punkt 1.

**Kvittningen räknas i webbläsaren i legacy-kassorna**, från `cfg.kontEfterFran`, och kan inte styras av servern där. Tills skärmarna är byggda på plattformen gäller spärren för kvittning bara i motorn. Fråga 6 gäller hur det ska hanteras i legacy under övergången.

## Fliken Kläder i centralens Avräkning

Underlag: ägarens beslut 5. Fliken byggs när underlaget har kommit.

- **Artiklar** (ägarens svar på fråga 7):

  | Art | Namn | Anmärkning |
  |---|---|---|
  | 72 | Tröja | Ingår i utbildningen |
  | 73 | Skjorta | Ingår i utbildningen |
  | 74 | Väst/slipover | |
  | 75 | Mössa | |
  | 76 | Byxor | Säljs inte ännu, ska inte gå att välja |
  | 78 | Jacka | Ingår i utbildningen |
  | 79 | Sommarjacka | |
  | 80 | Piké | |
  | 11 | Utbildning | 2 000 kr exkl. moms |

  Artikel 77 är inte använd.
- **Priser per bolag:** centralens standardpris per artikel, och ett avvikande pris per åkeri, alltså per bolag i avräkningens bolagsregister. De sparas i centralens Avräkning, till exempel som `settings/klader`: `{ artiklar: { nr: { namn, pris, moms } }, perBolag: { <bolagets nyckel>: { nr: pris } } }`. Fråga 8 gäller hur bolaget identifieras.
- **Utbildning (artikel 11, 2 000 kr exkl. moms):** i utbildningen ingår 1 st vardera av jacka (78), skjorta (73) och tröja (72). De rader som ingår får pris 0 kr och texten "ingår i utbildning". Fler plagg än det som ingår kostar ordinarie pris. Regeln ligger i motorn (`packages/core/avrakning`), med test.
- **Hur det hamnar på åkeriets avräkning:** som rader i månadens manuella poster för bolaget, med artikel, text, antal, à-pris och moms 25 %. Avräkningen har redan stöd för artikel på manuella poster (`extra` med `art`), så avräkningens beräkning behöver inte ändras, bara få raderna. Fråga 9 gäller om kläderna ska stå som en egen rubrik på avräkningen.
- **Funktionen** heter `avrakning.klader`. Den kräver Avräkningens licens och är av som standard.
- **Delning:** när delningen till åkerierna byggs (de öppna besluten i `fas-2-plan.md`) följer klädraderna med som andra rader på avräkningen.

## Fotoläsning av klädlistan via Claude från servern

**Status 2026-10-14:** byggd på servern och avstängd i alla konton, på ägarens uppdrag (`docs/fotolasning.md`). Funktionen är `avrakning.fotolasning` i de nya tabellerna `funktioner` och `konto_funktioner` (katalogen och raderna per konto enligt datamodellen nedan). Spärren på dokument (`documents.funktion` och `funktion_sokvagar`) och övriga paket byggs med resten av fas 3.

**Förslag till flöde:**
**Blanketten ändras först** (ägarens svar på fråga 10 till 12): kolumnerna Förare och Åkare tas bort, och "Utlämnad av" skrivs med initialer. Blanketten innehåller då inga personuppgifter. Bilnumret anger åkeriet, via avräkningens bilregister.

1. Användaren fotograferar den ifyllda blanketten i webbläsaren.
2. Bilden skickas till serverfunktionen `motor`, med en ny tolkningsoperation för bilder och parsern `kladlista`.
3. Servern anropar Claude via Anthropics Messages API med bilden (base64) och begär strukturerad utdata enligt ett JSON-schema: rader med bilnummer, artikel, antal, storlek om den finns, initialer, och en markering när läsningen är osäker. Åkeriet slås upp från bilnumret på servern.
4. Svaret visas som ett **utkast** som användaren granskar och rättar. Inget sparas förrän användaren godkänt. Samma princip som i Inkorg: AI:n föreslår, människan bestämmer.
5. **Fotot sparas inte**, varken hos Flödia eller i Storage. Papperslistan är underlaget och arkiveras av centralen. Bara det godkända resultatet sparas, som rader på avräkningen.

**Teknik:**
- **Modell:** den billigaste som klarar ett test med riktiga, ifyllda blanketter, inte Opus (ägarens beslut). Testet görs först med Claude Haiku 5.5 och sedan Claude Sonnet 5.5 om Haiku inte räcker. Resultatet (andel rätt lästa rader och kostnad per blankett) redovisas för ägaren innan modellen väljs. De riktiga blanketterna används bara lokalt hos ägaren och läggs aldrig i repot. Svar som avböjs (`stop_reason: refusal`) hanteras.
- **API-nyckeln** ligger bara i Supabase Secrets (`ANTHROPIC_API_KEY`), aldrig i klienten (CLAUDE.md, steg 4).
- **Tak och kostnad:** anropet räknas i `usage` och mot taket per konto, som andra anrop till `motor`.
- **Loggning** sker utan bildens innehåll.
- **CI** anropar aldrig Anthropic. Testerna ersätter API:t med påhittade svar och använder påhittade bilder. Skarpt test görs för hand.

**Personuppgifter och avtal, krav innan något byggs:**
- Med den ändrade blanketten skickas inga personuppgifter till Anthropic. Anthropic förs ändå in som **underbiträde** innan funktionen byggs, eftersom en blankett kan vara felaktigt ifylld.
- Innan bygget ska Anthropic föras in med syfte, region och avtal i:
  - `docs/underbitraden.md`, där raden i dag står som "Ej i bruk"
  - övergångsavtalen (GDPR art. 28) med de fyra bolagen, och senare kundavtalen
  - registerförteckningen och integritetspolicyn
- **Region:** Anthropic behandlar data i USA, med standardavtalsklausulerna i Anthropics personuppgiftsbiträdesavtal. Det räcker, eftersom blanketten saknar personuppgifter (ägarens svar på fråga 11). Om anropet kan begränsas till EU (parametern `inference_geo`) kontrolleras ändå när det byggs.
- **Lagring hos Anthropic:** API-data används inte för träning. **Nollagring (zero data retention) begärs hos Anthropic** innan funktionen används (ägarens svar på fråga 12). Utan den sparas data hos Anthropic en begränsad tid, i dag upp till 30 dagar.

## Förarens lönespec i appen

Ägarens uppdrag 2026-10-14. Bara plan, inget byggt. Gäller Åkarkassan och Tripkassan (åkeripaketet, Lön).

### Krav

1. **Ny roll `forare`** i `public.roll` (i dag `admin`, `ekonomi` och `las`). En förare är kopplad till exakt en rad i förarregistret i sitt konto.
2. **Inbjudan:** admin bjuder in föraren med e-postadressen från förarregistret. Inloggning sker med e-postlänk eller koden i mejlet, som för övriga användare. BankID kommer i version 2.
3. **Bara en vy:** "Mina lönespecar", som fungerar i 375 punkters bredd. Den visar en lista per månad och en PDF att ladda ner. Inget annat i plattformen syns för föraren.
4. **Radsäkerhet:** föraren läser bara sina egna lönespecar, och bara när lönekörningen är godkänd. Utkast syns aldrig.
5. **Personnummer** visas maskerat på skärmen, med bara de fyra sista siffrorna. Det fullständiga numret finns bara i PDF:en.
6. **Loggning:** varje visning och nedladdning loggas i `audit_log`.

### Datamodell (förslag)

- **`public.forare_konton`** (`tenant_id`, `forare_id`, `user_id`) kopplar en inloggning till en rad i förarregistret.
  - `forare_id` är förarens nummer i registret, alltså nyckeln i kassans `settings.forare` (förarnumret från LDL).
  - (`tenant_id`, `forare_id`) och (`tenant_id`, `user_id`) är unika, så en förare har exakt en rad och en rad har exakt en förare.
  - En person som kör för två åkerier har en rad i vart och ett av kontona.
  - Bara servern skriver i tabellen, vid inbjudan och när anställningen slutar.
  - Kolumnerna `sista_lon` (period för sista lönen) och `las_till` sätts när föraren slutar. `las_till` är 30 juni året efter sista lönen (ägarens beslut, fråga 18).
- **`public.lonespecar`**: en rad per förare och period, skapad av servern när lönen för föraren godkänns.
  - Kolumner: `tenant_id`, `module_key`, `forare_id`, `period`, `utbetalning` (datum), `version`, `godkand_at`, `godkand_av` och `data` (lönebeskedets rader och summor, som motorn räknat).
  - Raden ändras aldrig. En rättelse blir en ny version med orsak, samma princip som "en publicerad avräkning kan inte ändras" i spec v3 s. 7.
  - Utkast skapas aldrig i tabellen. Det som inte är godkänt finns bara i kassans månadsdokument, som föraren inte kan läsa.
  - **Personnumret sparas i lönespecraden när lönen godkänns**, som del av den låsta versionen (ägarens beslut, fråga 19). Ett ändrat personnummer i registret ändrar aldrig en godkänd lönespec.
- **Godkännandet** sker på plattformen innan förarens lönespec byggs (ägarens beslut, fråga 16), eftersom lönespecen ska vara en låst version av den godkända lönen. I dag godkänns lönen i legacy-kassan och sparas i månadsdokumentet (`lonekorning`, låsning per förare i Åkarkassan v33). Det godkännandet skapar inga lönespecar.

### Radsäkerhet och rättigheter

- **Rollen `forare` får ingen åtkomst genom dagens regler.** De bygger på medlemskap (`app.mina_konton`, `app.far_lasa`), och en förare är medlem i kontot. Annars skulle föraren till exempel kunna läsa Avräkningens dokument, kontots rad och andra medlemmar.
  - Förslag: `app.mina_konton()` och övriga hjälpfunktioner räknar bara roller som inte är `forare`.
  - En ny hjälpfunktion, `app.forare_id(konto)`, ger förarens id för den inloggade.
  - Metatestet kontrollerar att varje regel antingen utesluter `forare` eller uttryckligen tillåter den.
- **`lonespecar`, läsning:** `app.forare_id(tenant_id) = forare_id and godkand_at is not null` för föraren. Admin och ekonomi läser alla i kontot. Läs-rollen läser inga, eftersom kassorna är känsliga (ägarens beslut efter 2d).
- **`lonespecar`, skrivning:** bara servern. Ingen klient, inte heller admin, kan ändra en lönespec.
- **Föraren** får också läsa sin egen profil och kontots namn, för kontoväljaren och sidhuvudet. Föraren ser inga andra medlemmar.
- **Serverfunktionerna:** `motor` och `legacy` svarar 403 för rollen `forare`. Bryggan och de nuvarande apparna når föraren aldrig.

### Lagring och läsrätt (ägarens beslut 2026-10-14)

- **Så länge kontot är aktivt** ser föraren alla sina lönespecar (fråga 17).
- **Lagringstid:** lönespecarna sparas i 7 år som bokföringsunderlag (bokföringslagen 7 kap. 2 §) och gallras därefter av ett schemalagt jobb på servern. Gallringen loggas.
- **När föraren slutat** har föraren läsrätt till och med 30 juni året efter sista lönen (`las_till`). Därefter stängs förarens konto automatiskt (fråga 18):
  - `app.forare_id(konto)` ger inget efter `las_till`, så radsäkerheten stänger av läsningen samma dag.
  - Hooken vid inloggning (`app.kontroll_inloggning`) nekar inloggning för en användare vars enda medlemskap är som förare med passerat `las_till`. Ett schemalagt jobb spärrar sedan användaren i Supabase Auth.
  - Lönespecarna finns kvar hos arbetsgivaren i sju år, även när föraren inte längre kan se dem.

### Skärmen och PDF:en

- **Skalet för föraren** saknar meny. Det visar bolagets namn, "Mina lönespecar" och utloggning. Alla andra adresser i kontot ger "Ingen åtkomst".
- **Listan** har en rad per månad: period, utbetalningsdag och nettolön. Personnumret visas som `********-1234`, med bara de fyra sista siffrorna.
- **PDF:en skapas på servern** (en ny operation i `motor`) bara från den sparade raden i `lonespecar`, aldrig från förarregistret. Den innehåller det fullständiga personnumret från raden. Det fullständiga numret skickas alltså aldrig till webbläsaren som data, bara inuti PDF:en. Motorn för lönebeskedet finns redan i `packages/core/lon`.
- **Loggning:** `lonespec.visad` när listan eller en månad öppnas, och `lonespec.nedladdad` när PDF:en hämtas. Båda loggas med användare, förare och period. Föraren kan inte läsa loggen.

### Tester

- **Förare A kan aldrig läsa förare B:s lönespecar**, varken i samma konto eller i ett annat. Det prövas via tabellen, rpc, `motor` och livevisningen.
- **Föraren ser aldrig en lön som inte är godkänd.** Före godkännandet finns ingen rad. Efter godkännandet finns raden, och en ny version syns först när den är godkänd.
- **Föraren når inga andra vyer eller tabeller.** Matrisen i `tests/db` får rollen `forare`, och föraren ska se noll rader i alla tabeller utom de egna lönespecarna, den egna profilen och kontots namn. `motor` och `legacy` svarar 403. I Playwright ger varje annan adress "Ingen åtkomst".
- **En förare i konto A når aldrig konto B.**
- **Personnumret** är maskerat i allt som skickas till webbläsaren utom PDF:en.
- **Varje visning och nedladdning** finns i `audit_log`.
- **En förare med slutdatum efter gränsen nekas inloggning:** när `las_till` har passerat nekar hooken inloggningen, och föraren kan inte läsa någon lönespec. Före gränsen kan föraren logga in och läsa.
- **Personnumret i PDF:en kommer från den sparade raden:** ett ändrat personnummer i registret ändrar inte en godkänd lönespec eller dess PDF.
- **Gallringen** tar bort lönespecar äldre än 7 år och inga andra.

### Klart när

- En **testförare** med påhittade uppgifter, i underkunden med Åkarkassan, loggar in i mobilen och laddar ner sin godkända lönespec.
- Alla tester ovan är gröna i CI.

### Krav innan riktiga förare bjuds in (bekräftat av ägaren 2026-10-14)

Riktiga förare bjuds inte in förrän den externa säkerhetsgranskningen är gjord och omskrivningen av inloggningslänken är löst.

- **Undantaget från beslut 15** gäller bara när ägaren är enda användaren (fas-2-beslut.md, 2026-10-13). Riktiga förare är nya användare. De kan bjudas in först när den externa säkerhetsgranskningen är gjord, eller när ägaren uttryckligen beslutar något annat.
- **Brevos omskrivning av inloggningslänken** (docs/faser/fas-2b-moln.md, steg 5.3) måste vara löst innan förare får inloggningsmejl.
- **Förarna ska informeras** om behandlingen av personuppgifter, enligt arbetsgivarens integritetspolicy.

## Förarjämförelse: km och betalt

Ägarens uppdrag 2026-10-14. Bara plan, inget byggt. Gäller Åkarkassan och Tripkassan.

### Vyn

- **Ny vy i lönemodulen** för rollerna admin och ekonomi. Rollen `forare` når den aldrig. Läs-rollen når den inte heller, eftersom kassorna är känsliga (ägarens beslut efter 2d).
- **Per förare och månad visas:**

  | Mått | Beräkning |
  |---|---|
  | Körda km | summan av `passKm` |
  | Betalda km | summan av `betKm` |
  | Tomkörda km | körda km minus betalda km |
  | Betald andel | betalda km delat med körda km |
  | Intäkt per kört km | intäkt delat med körda km |
  | Intäkt per timme | intäkt delat med summan av `tim` |
  | Antal pass | antal körpass |
  | Plattformsavgift | Bolt och Uber, i en egen kolumn (fråga 21) |

- **Sortering och filter** per bil och period. Standardsortering är **lägst betald andel först**.
- **Flagga** när förarens betalda andel ligger mer än X procentenheter under snittet för samma bil i samma månad. X ställs in per konto, standard 10.

### Beräkningen

- **Motorn räknar** i `packages/core/lon`, i en ny funktion som körs på servern via `motor`. Vyn visar bara resultatet (beslut 26).
- **Ingen ny filtyp.** Datan kommer från de körpass som redan läses in från LDL (`Pass`: `passKm`, `betKm`, `tim`, `kont`, `kred`, `regnr`, `forare`).
- **Per förare och bil:** jämförelsen görs per bil, eftersom snittet gäller samma bil. En förare som kört flera bilar får en rad per bil, och en summarad.
- **Snittet för bilen** räknas som bilens totala betalda km delat med totala körda km samma månad, alltså vägt med kilometer (ägarens beslut, fråga 20).
- **Flaggan:** förarens andel är lägre än bilens snitt minus X procentenheter. En förare som ensam kört bilen jämförs med sig själv och flaggas aldrig.
- **Division med noll:** med 0 körda km eller 0 timmar blir andelen och intäkten per km eller timme tomma, inte noll eller fel. Raden visas men flaggas inte.
- **Intäkt** är inkört exklusive moms, **före** plattformsavgiften för Bolt och Uber. Plattformsavgiften visas i en egen kolumn (ägarens beslut, fråga 21).
- **Inställningen X** sparas i kontots inställningar för modulen, med giltighetsdatum som andra satser. Värdet kontrolleras på servern (0 till 100).

### Konsekvensbedömning per konto (ägarens beslut, fråga 23)

- **Åkeriet är personuppgiftsansvarigt** och gör konsekvensbedömningen enligt GDPR art. 35.
- **Flödia levererar en mall** i `docs/` för konsekvensbedömningen av förarjämförelsen. Den tas fram innan vyn byggs.
- **Vyn är avslagen per konto** tills kontots admin har bekräftat i plattformen att konsekvensbedömningen är gjord.
  - Bekräftelsen sparas per konto, med vem som bekräftade och när, och loggas i `audit_log` som `forarjamforelse.konsekvensbedomning`.
  - Spärren gäller i motorn, inte bara i vyn: före bekräftelsen svarar `motor` med 403 och en svensk text om att konsekvensbedömningen måste bekräftas av kontots admin.
  - Bara admin kan bekräfta. Ekonomi ser texten men kan inte bekräfta.
- Därefter visas rutan om information till förarna för varje användare, se nedan.

### Rutan om information till förarna

- Första gången vyn öppnas visas en ruta: **"Förarna ska informeras om uppföljningen (GDPR art. 13). Har ni kollektivavtal kan förhandling krävas (MBL 11 §)."**
- Rutan kvitteras. Vyn går inte att använda innan den är kvitterad.
- Rutan kvitteras **en gång per användare** (ägarens beslut, fråga 22). Kvitteringen loggas i `audit_log` som `forarjamforelse.kvitterad`, med användare och tid. Rutan visas inte igen för samma användare i samma konto.

### Export

- Export till Excel och PDF av det som visas, med samma sortering och filter.
- Filen byggs av motorns resultat. Ingen beräkning sker i webbläsaren.
- Varje export loggas i `audit_log` som `forarjamforelse.export`, med period och filter.

### Tester

- **Rätt beräkning mot påhittade körpass:** alla sju måtten per förare och bil, bilens snitt, och summaraden för en förare som kört flera bilar.
- **Förare med 0 km** (och 0 timmar) ger ingen division med noll. Måtten blir tomma, och raden flaggas inte.
- **Flaggan följer kontots gräns:** med standard 10 och med en annan gräns för ett konto. Exakt på gränsen flaggas inte. En förare som ensam kört bilen flaggas inte.
- **Rollen `forare` når aldrig vyn:** varken i plattformen, via `motor` (403) eller via tabellerna. Detsamma gäller läs-rollen.
- **Konsekvensbedömningen:** vyn är stängd för kontot innan admin har bekräftat, både i plattformen och i `motor` (403). Ekonomi kan inte bekräfta. Efter bekräftelsen är vyn öppen, och bekräftelsen finns i `audit_log`.
- **Kvitteringen:** vyn går inte att använda innan användaren kvitterat rutan, en gång per användare, och kvitteringen finns i `audit_log` med användare och tid.
- **Exporten** loggas.

## Ordning (förslag)

1. **Katalogen, `konto_funktioner`, `app.har_funktion` och testerna.** Befintliga konton får alla funktioner de använder i dag på, så ingenting ändras för dem.
2. **`funktion_sokvagar` och villkoret i radsäkerheten**, med metatest.
3. **Servern:** funktion per operation, och kvittningen styrd av `akeri.kvittning`, av som standard, med test och diff.
4. **Bryggan:** `window.claude.use('funktioner')`.
5. **Fliken Kläder**, när underlaget har kommit.
6. **Fotoläsningen**, först när blanketten är ändrad, Anthropic finns i underbiträdeslistan och i de underskrivna biträdesavtalen, nollagring är begärd, och modelltestet med riktiga blanketter är redovisat.
7. **Förarens lönespec**, efter steg 1 och 2, när lönen godkänns på plattformen. Riktiga förare först enligt kraven ovan.
8. **Förarjämförelsen**, efter steg 3, när lönemodulens skärmar finns på plattformen.

## Öppna frågor

1. Gäller åkeripaketets nycklar båda kassorna med samma namn (`akeri.lon` för både Åkarkassan och Tripkassan), eller ska de ha en rad per modul?
3. Ska alla roller se vilka paket och tillval bolaget har, eller bara admin?
4. Månadsdokumentet i kassorna innehåller både kassa och lönekörning. Ska lönen flyttas till ett eget dokument på plattformen, så att Lön kan spärras för sig? Legacy kan inte ändras, så det gäller de nya skärmarna.
6. Kvittningen räknas i webbläsaren i legacy-kassorna. Räcker det att den bara styrs i motorn tills skärmarna är byggda, eller ska `kontEfterFran` tas bort ur bolagens inställningar redan nu?
8. Hur identifieras ett åkeri i klädpriserna: kundnumret i avräkningens bolagsregister, org.nr, eller kontot i Flödia när delningen finns?
9. Ska kläderna stå som en egen rubrik på åkeriets avräkning, eller bland övriga rader?
13. Ska Worldline och Bolt och Uber läsas som filer (som i dag) eller via API? Förslaget är filer i version 1, i linje med beslut 28: inga integrationer.
14. Vem slår på paket och tillval i version 1: bara plattformens personal med `scripts/konto.mjs`, eller ska admin i 4a få det?
15. Ska samma regel som för funktioner gälla när en hel moduls licens upphör, så att datan blir läsbar men låst i 7 år i stället för helt dold som i dag?

## Besvarade frågor

2. Kräver Ekonomi också Lön, eller bara Bas?
   **Svar (ägaren 2026-10-14):** Nej. Ekonomi kräver bara Bas. Ett åkeri kan ha lönen hos en byrå och bokföringen i Flödia.
5. När en funktion stängs av: ska datan vara helt spärrad (förslaget), eller läsbar men inte skrivbar, så att bolaget kan exportera?
   **Svar (ägaren 2026-10-14):** Läsbar men låst, aldrig raderad (bokföringslagen 7 kap. 2 §, 7 år).
7. Vilka artiklar är 72 till 80 (namn och storlekar), och vilka av dem är jacka, skjorta och tröja som ingår i utbildningen?
   **Svar (ägaren 2026-10-14):** Se tabellen under Fliken Kläder. I utbildningen ingår 78, 73 och 72, 1 st vardera. Byxor (76) säljs inte ännu.
10. Ska fotot av klädlistan sparas, till exempel som underlag vid tvist, eller räcker det godkända resultatet? Sparas det behövs Storage, och då gäller förslaget om säkerhetskopior av filer.
   **Svar (ägaren 2026-10-14):** Fotot sparas inte. Papperslistan är underlaget.
11. Räcker det att Anthropic behandlar bilderna i USA med standardavtalsklausuler, eller ska fotoläsningen vänta tills EU-behandling går att välja?
   **Svar (ägaren 2026-10-14):** Ja, eftersom blanketten ändras så att den saknar personuppgifter. Anthropic förs ändå in som underbiträde.
12. Ska nollagring hos Anthropic avtalas innan fotoläsningen används?
   **Svar (ägaren 2026-10-14):** Ja, nollagring begärs.
16. Godkänns lönen på plattformen innan förarens lönespec byggs, eller ska servern också läsa godkännandet i den nuvarande kassan (`lonekorning` i månadsdokumentet)? Förslaget är plattformen, eftersom legacy inte kan anropa servern när lönen godkänns.
   **Svar (ägaren 2026-10-14):** Ja. Lönen godkänns på plattformen innan förarens lönespec byggs, eftersom specen ska vara en låst version av den godkända lönen.
17. Hur länge ska föraren kunna se gamla lönespecar? Förslaget är så länge anställningen pågår och därefter tills lönespecen gallras (lagstadgad tid).
   **Svar (ägaren 2026-10-14):** Föraren ser alla sina lönespecar så länge kontot är aktivt. Lönespecarna sparas i 7 år som bokföringsunderlag (BFL 7 kap. 2 §), därefter gallras de.
18. Ska en förare som slutat kunna logga in och hämta sina lönespecar, och i så fall hur länge?
   **Svar (ägaren 2026-10-14):** En förare som slutat har läsrätt till och med 30 juni året efter sista lönen. Därefter stängs kontot automatiskt. Test: en förare med slutdatum efter gränsen nekas inloggning.
19. Ska personnumret i PDF:en hämtas från förarregistret när PDF:en skapas (förslaget), eller sparas i lönespecen vid godkännandet, så att ett ändrat personnummer i registret inte ändrar gamla lönespecar?
   **Svar (ägaren 2026-10-14):** Personnumret sparas i lönespecraden när lönen godkänns, som del av den låsta versionen. PDF:en läser från den sparade raden, aldrig från registret.
20. Ska bilens snitt vara vägt med kilometer (bilens totala betalda km delat med totala körda km, förslaget) eller ett vanligt medelvärde av förarnas andelar?
   **Svar (ägaren 2026-10-14):** Bilens snitt vägs med kilometer.
21. Ska intäkten vara inkört exklusive moms (förslaget, som i lönen) eller inklusive moms, och före eller efter plattformsavgiften för Bolt och Uber?
   **Svar (ägaren 2026-10-14):** Intäkten räknas exklusive moms, före plattformsavgiften för Bolt och Uber. Plattformsavgiften visas i en egen kolumn.
22. Ska rutan om information till förarna kvitteras en gång per användare (förslaget) eller en gång per konto?
   **Svar (ägaren 2026-10-14):** Rutan kvitteras en gång per användare, och kvitteringen loggas med användare och tid.
23. Behövs en konsekvensbedömning (GDPR art. 35) för uppföljningen av förarna innan vyn används med riktiga uppgifter?
   **Svar (ägaren 2026-10-14):** Ja. Åkeriet är personuppgiftsansvarigt och gör konsekvensbedömningen enligt GDPR art. 35. Flödia levererar en mall i docs/. Vyn är avslagen per konto tills kontots admin har bekräftat att konsekvensbedömningen är gjord, och bekräftelsen loggas i audit_log. Test: vyn är stängd innan bekräftelsen.
