# Fas 2: ägarens beslut om planen (2026-10-11)

Planen är godkänd med dessa beslut och ändringar. Pausa efter varje delsteg som planen säger.

## Beslut i avsnitt C

1. Ägare: produkten ägs privat av ägaren tills ett eget aktiebolag är bildat. Konton hos Supabase, Sentry, e-posttjänst, hosting, domän och GitHub skapas på ägaren privat och flyttas till bolaget när det finns. Inga konton eller avtal skapas på Taxi Malmö AB. Avtalet om koden mellan Taxi Malmö AB och ägaren är fortfarande öppet och hanteras utanför repot.
7. Roller: bara admin, ekonomi och läs nu, enligt förslaget.
8. Legacy-bryggan: ja, bara för interna konton (`tenants.intern`), enligt förslaget.
9. Storleksgräns per dokument: 2 MB.
10. Lagringstid: `audit_log` 3 år (det är ingen räkenskapsinformation, och kortare lagring följer principen om lagringsminimering i GDPR art. 5.1 e). Sentry 90 dagar. Skriv inte "som bokföring" i dokumenten.

Övriga punkter i C gör ägaren själv. Fråga inte efter nycklar eller lösenord i chatten.

## Ordning

1. Allt som går att bygga och testa lokalt (Supabase CLI i Docker, Mailpit) byggs först, i planens ordning. Driftsättning till testmiljön i molnet väntar tills ägaren har gjort punkterna i C och säger till.
2. Förkravstabellen i 2.0 punkt 3 visas för ägaren och Claude (Cowork) innan den commitas.
3. Inga riktiga personuppgifter i seed, tester, loggar eller lokal databas.

## Beslut 2026-10-13: undantag från beslut 15 för två av ägarens egna bolag

**Beslut (ägaren):** riktiga uppgifter får läggas in från och med 2026-10-13 i två av de fyra interna kontona i molnprojektet: huvudkunden (Avräkning) och underkunden med Åkarkassan. De två andra kontona (underkunden med Tripkassan och direktkunden med Verkstad) har bara exempeldata tills personuppgiftsbiträdesavtal och den externa säkerhetsgranskningen (beslut 15) är klara. Kontonas kortnamn står i ägarens anteckningar, inte i repot.

**Skäl (ägaren):** bolagen är ägarens egna, och bara ägaren har åtkomst (enda användaren, roll admin). Ingen extern part får åtkomst till uppgifterna.

**Villkor:**
- Ingen annan användare läggs till i de två kontona förrän den externa granskningen är klar. Ägarens egna e-postadresser räknas som ägaren (tre adresser, alla redan tillagda, listade i ägarens anteckningar och inte i repot). Underkunden med Tripkassan har även en användare som inte är ägaren, och det kontot omfattas inte av undantaget.
- Inga riktiga uppgifter läggs in förrän projektet är uppgraderat till Supabase Pro med dagliga säkerhetskopior.
- Undantaget gäller inte delning till andra konton (`shares`), som byggs i fas 3.
- Undantaget upphör om något av villkoren bryts. Då gäller beslut 15 som förut.

**Följder som ägaren tar ställning till** (Claude Code, 2026-10-13):
1. Molnprojektet `flodia` var tänkt som testmiljö, med ett separat driftprojekt först efter granskningen (fas-2-plan.md, avsnitt C). Med riktiga uppgifter är det i praktiken drift. Antingen blir det driftprojektet (miljön ändras från `test` till `drift`, och en separat testmiljö skapas vid behov), eller så flyttas de riktiga uppgifterna senare till ett nytt driftprojekt.
2. Supabase gratisnivå pausar projekt efter en tids inaktivitet och har inga säkerhetskopior att återställa från. Med riktiga uppgifter bör projektet ligga på en betald nivå med dagliga säkerhetskopior.
3. Det finns inget verktyg som flyttar befintliga uppgifter från claude.ai till plattformen. Uppgifterna läggs in för hand i de nuvarande apparna via bryggan, eller så byggs en import.
4. Vilka konton som får ha riktiga uppgifter styrs bara av detta beslut, inte av koden.
5. De nuvarande apparna sparar en kopia i webbläsaren (`ak_`, `tt_`). Den rensas vid utloggning. Använd en egen dator och logga ut efter arbetet.
6. Rensningen av granskningsloggen efter 3 år (`app.rensa_granskningslogg`) är inte schemalagd än. Den görs i 2f.

**Ägarens svar på följderna (2026-10-13):**
1. Molnprojektet `flodia` är driftprojektet. Miljön ändras från `test` till `drift` (`FLODIA_MILJO` i Supabase och `VITE_FLODIA_MILJO` i Cloudflare Pages). En separat testmiljö skapas när den behövs. CI kör mot en lokal Supabase och påverkas inte.
2. Ägaren uppgraderar till Supabase Pro med dagliga säkerhetskopior innan riktiga uppgifter läggs in.
3. Ingen import från claude.ai nu.
4. Noterat: egen dator och utloggning efter arbetet.

## Beslut 2026-10-14: övergång tills bolaget som ska äga Flödia finns (ändrar beslutet 2026-10-13)

**Beslut (ägaren):**
1. Supabase Pro betalas tills vidare privat av ägaren. Ägaren är också privat avtalspart hos Supabase, Brevo och Cloudflare. Namnet står i ägarens anteckningar, inte i repot.
2. Övergångsavtal enligt GDPR art. 28 (personuppgiftsbiträdesavtal) tecknas mellan ägaren privat, som biträde, och vart och ett av de fyra interna bolagen, som personuppgiftsansvariga.
3. Inga externa kunder ansluts förrän det nya bolaget som ska äga Flödia har bildats och tagit över kontona hos Supabase, Brevo och Cloudflare.
4. Riktiga uppgifter får läggas in i huvudkunden och underkunden med Åkarkassan först när deras biträdesavtal med ägaren är underskrivna. Det ersätter villkoret om Supabase Pro i beslutet 2026-10-13. Pro är aktivt med dagliga säkerhetskopior sedan 2026-10-14.
5. Underkunden med Tripkassan och direktkunden med Verkstad har bara exempeldata tills vidare.

Övriga villkor i beslutet 2026-10-13 gäller (bara ägaren har åtkomst, inga delningar till andra konton).

**Säkerhetskopior och filer (kontrollerat 2026-10-14):** Flödia använder inte Supabase Storage. Inga buckets skapas av migrationerna, och lagringen är avstängd i `config.toml`. Uppladdade filer läses i webbläsaren. Det som sparas är den tolkade datan och i vissa fall filens text, i tabellen `documents` i databasen: Åkarkassan och Tripkassan sparar till exempel LDL-texten och passagerna i månadsdokumentet, och Avräkningen sparar filnamn och tolkade rader. Allt sådant ingår i databasens dagliga säkerhetskopior. `file_runs` innehåller bara uppgifter om filen (typ, namn och kontrollsumma), inte filen.

## Beslut 2026-10-15: undantag för två åkerier som ägs av ägarens närstående

**Beslut (ägaren):** två nya underkunder under huvudkunden, för två åkerier som ägs av ägarens närstående, får använda Flödia nu. De markeras som interna, så att de får bryggan till de nuvarande apparna (Tripkassan), på samma sätt som ägarens egna underkunder. Kontonas namn, kortnamn och användare står i ägarens anteckningar, inte i repot.

**Det beslutet avviker från:**
- **Beslut 8 och `docs/faser/fas-2b-moln.md`, steg 8:** bara ägarens egna bolag får vara interna. Bryggan lämnar ut legacy-koden med motorerna till webbläsaren (undantaget från beslut 26). Användarna i de två kontona kan alltså läsa beräkningskoden. Ägaren godtar det för de här två bolagen.
- **Beslutet 2026-10-14, punkt 3:** inga externa kunder förrän det nya bolaget har tagit över kontona. De två åkerierna är egna bolag, inte ägarens, och ansluts ändå.

**Villkor:**
- **Varje användare i sitt eget konto.** Ingen användare från de två åkerierna läggs till i ett annat konto. Isoleringen gäller per konto: radsäkerheten släpper bara igenom kontots egna dokument till kontots medlemmar, också via bryggan.
- **Riktiga uppgifter först efter biträdesavtal.** Ett övergångsavtal enligt GDPR art. 28 tecknas med vart och ett av de två bolagen, som för ägarens egna bolag (beslutet 2026-10-14, punkt 2). Fram till dess har kontona bara exempeldata.
- **Inga delningar** mellan kontona (`shares`).
- **Undantaget upphör** om något villkor bryts.

**Ägarens svar 2026-10-15:**
1. **Inloggningen:** användarna i de två kontona loggar in med engångskoden i mejlet, inte med länken. Mejlet går via Brevo och innehåller fortfarande både länk och kod. Länken ska inte användas, eftersom Brevos klickspårning skriver om den och då ser länkens token. Inga andra riktiga användare får inloggningsmejl förrän ärendet hos Brevo om klickspårningen är löst.
2. **Säkerhetsgranskningen:** de två kontona får använda tjänsten före den externa säkerhetsgranskningen (beslut 15). De har bara exempeldata tills biträdesavtalen med deras bolag är underskrivna. Undantaget gäller bara dessa två konton, inte andra kunder.

## Produktpaket och bolagsinställningar (ägarens beslut 2026-10-13 och 2026-10-14)

Ingen kod ändras i och med detta avsnitt. Besluten styr fas 3 och senare.

1. **Åkeripaket.** Underleverantörerna (de två åkerierna) får exakt samma struktur, flikar och regler. Allt utöver kärnan blir tillval, byggt en gång och lika för alla som slår på det. Centralen (Taxi Malmö) och verkstaden (foliering) är egna lösningar med pris per kund.
2. **Kärna och tillval i åkeripaketet.** Kärna: Bolt och Uber. Tillval: Worldline. Kvittning av förra månadens kontanter i månadslönen är ett val per bolag, **av som standard**.
3. **Momsinställning per bolag.** Period (månad, kvartal eller år) och metod (faktureringsmetod eller kontantmetod). Kontantmetoden är bara tillåten när nettoomsättningen normalt uppgår till högst 3 miljoner kronor (bokföringslagen 5 kap. 2 §). Plattformen varnar när kontantmetoden väljs.
4. **Ny avstämningskontroll**, som komplement till "utdelning mot fritt eget kapital och stämmoprotokoll" (SPEC-v3.1 avsnitt 18.3): varning när eget kapital närmar sig eller understiger hälften av det registrerade aktiekapitalet (kontrollbalansräkning, aktiebolagslagen 25 kap. 13 §).
5. **Fliken Kläder i centralens Avräkning.** Växelns försäljning av taxikläder läggs på åkeriets avräkning. Byggs när underlaget har kommit.
6. **Parkerat:**
   - Schema för centralen.
   - Schema för förare och bilar som tillval i åkeripaketet.
   - Marknadsföring, bara för centralen och verkstaden.
7. **Hemsidan flodia.se** är en separat marknadsföringssida.
   - Den publiceras först när allt är klart.
   - Bolt och Uber nämns inte, inga logotyper visas och ordet "partner" används aldrig.
   - Allmänna villkor och integritetspolicy tas fram sist.

**Att stämma av när besluten byggs** (Claude Code, 2026-10-14):
- Punkt 2 avviker från dagens kod. I `packages/core/lon` har Åkarkassan `kontEfterFran: '2026-10'` som standard, alltså kvittning av förra månadens kontanter påslagen från oktober 2026, som i legacy (Åkarkassan v33). Enligt beslutet ska standarden vara av och valet göras per bolag. Det ändras i fas 3 med test och en rapporterad diff, inte nu. Legacy rörs inte.
- Punkt 3 och 4 hör till momsrutorna och avstämningspanelen, som SPEC-v3.1 avsnitt 18 lägger i version 2. Momsinställningen per bolag kan byggas tidigare, som en inställning.
- Punkt 7 kompletterar SPEC-v3.1 avsnitt 12 (ingen prislista på hemsidan).
