# Fas 2: Kärnan, plan (godkänd 2026-10-11 med besluten i fas-2-beslut.md)

## Context

Fas 0, 1 och 1b2 är klara: motorerna ligger i `packages/core` (avrakning, lon, foliering) med kontrakten i `packages/kit`, låsta av jämförelsetester mot legacy. Nu ska plattformen få databas, inloggning, konton och ett documents-API, så att apparna kan köras som tjänst. Uppdraget står i `docs/faser/fas-2-uppdrag.md`, med spec v3 s. 5, 8 till 11, 16, 25 till 49 och SPEC-v3.1 (avsnitt 1, 2, 10, 15, 16) som underlag. Fasen är klar när automatiska tester visar att konto A aldrig kan läsa, ändra eller ta bort konto B:s data, för alla tabeller och alla roller.

Teknik enligt spec v3 s. 8: Supabase (Postgres, Auth, Edge Functions) i EU, plattformen i React, Vite, TypeScript, TanStack Router och Query. Felloggning med Sentry (EU-region) enligt v3.1 avsnitt 10.

Arbetssätt: en commit per fungerande steg, paus och avstämning efter varje delsteg (2.0 till 2f), rapport i `docs/faser/fas-2.md`. Första commit: de två ospårade filerna `docs/faser/fas-2-uppdrag.md` och `docs/faser/ci-uppdatering.md`.

**Viktigt för tidsplanen:** 2.0, 2a och 2c kan byggas helt lokalt (Supabase CLI i Docker), utan molnkonton. Ägarens åtgärder i avsnitt C behövs först när vi driftsätter till en testmiljö i slutet av 2b.

---

## A. Delsteg

### 2.0 Motorkrav från tidigare faser (inga konton behövs)

Ändringar i `packages/core`. Varje ändring börjar med ett test som låser nuvarande beteende.

1. **Europe/Stockholm uttryckligen.** Ny modul `packages/core/tid.ts` som räknar med `Intl.DateTimeFormat` och `timeZone: 'Europe/Stockholm'`: `stockholmDelar(ms)`, `franStockholm(å,m,d,h,mi,s)`, `isoVecka`. Den används i stället för lokal tid i:
   - `lon/hjalp.ts:7-10` (`toDate`, `dstr`, `tstr`, `isoWeek`)
   - `lon/compute.ts:63, 74-75, 154, 162`
   - `lon/parsers.ts:60` (Sturup)
   - `foliering/motor.ts:119` (månadsnamn)
   - Test: hela core-sviten körs även med `TZ=UTC` och `TZ=America/New_York` (nytt skript `test:tz`, i CI). Nya tester för pass över sommartid (2026-03-29) och vintertid (2026-10-25). Alla befintliga jämförelsetester ska vara gröna utan ändring.
2. **WeakMap bort** (`lon/compute.ts:67`). `markPeriods` returnerar en lokal `Map<Pass, Period>` som skickas vidare till `shiftPeriod` och `matchBro`. Test: samma `Pass`-objekt beräknas med två olika konfigurationer, både omväxlande och via `Promise.all`, och ger samma resultat som med nya objekt.
3. **Fynd f: varje åtgärd kontrollerar läget.** En tabell med förkrav per åtgärd i `foliering` (till exempel `betald` kräver faktura, `momsBetald` kräver momsfaktura, `godkand` kräver status offert). Den kontrolleras i `atgard()` innan åtgärden körs. Fel kastas som `AtgardsFel { kod, text }` med svensk text.
   - Först kommer ett test som visar att de 202 av 12 900 slumpade åtgärderna i dag ger TypeError.
   - Efter ändringen ska de ge `AtgardsFel`. Övriga 12 698 ska vara oförändrade mot legacy.
   - Åtgärder som i dag tyst gör något ogiltigt får också förkrav. Det ändrar beteendet, så **tabellen med förkrav och diffen visas för ägaren innan den commitas**.
   - Fynden a, b, c, e och g rörs inte. De ligger kvar i fas 3.

Klart när `npm run ci` och `test:tz` är gröna och ägaren har godkänt förkravstabellen.

### 2a Databas och radsäkerhet

- `supabase/` i repot: `config.toml`, `migrations/*.sql`, `seed.sql` (bara påhittad data). Supabase CLI som devDependency med låst version.
- Tabeller, RLS och hjälpfunktioner enligt avsnitt B.
- RLS-testsviten (avsnitt D) byggs **i samma delsteg**, eftersom den är klar-kravet.
- Nytt CI-jobb `databas` (avsnitt D).

Klart när CI-jobbet `databas` är grönt och metatestet bevisar att varje tabell i `public` har RLS påslagen och tvingad, och har radfabrik och testfall.

### 2b Inloggning, konton och roller

- Supabase Auth med e-postlänk (PKCE). Självregistrering är avstängd (`shouldCreateUser: false`, signup av).
- Lösenordsinloggning är avstängd i alla miljöer. Testerna loggar in via `auth.admin.generateLink` och `verifyOtp`.
- Egen SMTP via ägarens e-posttjänst och avsändardomän. Mejlmallar på svenska, utan tankstreck.
- Roller: `admin`, `ekonomi`, `las` (se beslut C.7).
- `profiles.bankid_subject` finns redan nu, så att BankID kan läggas till i version 2 utan att kontomodellen ändras.
- Konton och användare skapas av `scripts/skapa-konto.mjs` som kör med service-nyckel lokalt. Inbjudningar i gränssnittet kommer i 4a.
- Kontoväljare:
  - Det aktiva kontot ligger i URL:en (`/:konto/...`).
  - En användare med ett konto hoppar över väljaren.
  - Senast valda konto sparas i localStorage. Det är en bekvämlighet och styr ingen behörighet.
- Spärr: den sista admin i ett konto kan inte tas bort (trigger).
- Ändringar i medlemskap och roller loggas i `audit_log`.

Klart när:
- RLS-sviten är grön för alla tre roller.
- E2E-test: inloggningslänken fångas i lokal Mailpit, användaren väljer konto, byter konto och ser bara rätt kontos data.
- Testmiljön i molnet skickar riktiga mejl som passerar SPF, DKIM och DMARC (kontrolleras med mail-tester eller Gmail "Visa original").

### 2c Documents-API

Nytt paket `packages/api` (spec v3 s. 8: "typad klient, doc/collection som i shim"). Det har samma gränssnitt som `legacy/shared/claude-shim.js`.

**Struktur och läsning**
- `skapaDb({ supabase, konto, modul })` returnerar `doc(path)` och `collection(path)` med `get`, `set(v, {merge})`, `update`, `delete`, `add`, `onSnapshot`, samma snapshotform (`exists`, `data()`, `docs`, `size`, `empty`, `forEach`, `id`, `ref`), och `docs` sorterade med `localeCompare` precis som shimmen.
- `get` returnerar djupfryst data, precis som claude.ai (apparna klonar redan).
- `collection(path).get()` hämtar bara direkta barn via de genererade kolumnerna `parent` och `doc_id`.

**Skrivning**
- `set` ersätter hela dokumentet.
- `set(merge)` och `update` gör en ytlig sammanfogning på toppnivå i Postgres i ett enda anrop (RPC `app.dok_skriv`, `security invoker`, så RLS gäller), utan läs-och-skriv-race.
- `update` på ett dokument som saknas skapar det, precis som shimmen.

**Felkoder** (avrakning:1903/1938 läser dem):
- `not_granted` vid RLS-fel och saknad roll eller licens
- `invalid_argument` vid ogiltig sökväg eller för stort dokument
- `conflict`

**Livevisning**
- `onSnapshot` byggs på **Realtime Broadcast med privata kanaler per konto** (`konto:<id>:dok`), som en databastrigger matar. Behörigheten styrs av RLS på `realtime.messages`.
- `postgres_changes` väljs bort. Där filtreras DELETE-händelser inte av RLS, så primärnyckeln kan läcka mellan konton.

**Kassan och nedladdning**
- Kassan: adaptern tar bort prefixet `data/users/<uid>/`. Kontot är nyckeln (spec v3 s. 9).
- `downloads.save` har samma implementation som shimmen.
- `use(name)` ger `db`, `downloads` och `user`, så att ett legacy-anrop `window.claude.use` kan kopplas direkt.

**Tester**
- **Kontraktstest:** samma testsvit körs mot shimmen (i jsdom) och mot `packages/api` (lokal Supabase), så att beteendena bevisligen är lika.
- Läsning och skrivning från fel konto ger `not_granted`.
- En prenumeration i konto A får inga händelser när konto B skriver, inte heller vid delete.

Klart när kontraktstestet är grönt mot båda implementationerna och läcktesterna för Realtime är gröna.

### 2d Serverfunktioner (beslut 26)

Nytt paket `packages/server`, som är vanlig TypeScript och testas i Vitest utan Deno.

**Edge Function `motor`**
- `supabase/functions/motor/index.ts` är ett tunt Deno-skal.
- `packages/server` paketeras med esbuild (`npm run bygg:funktioner`). Paketeringen läggs i `.gitignore` och byggs i CI och vid driftsättning.

**Anropet:** `POST { konto, modul, operation, data }`. Stegen i ordning:
1. Verifierar JWT.
2. Kontrollerar medlemskap och roll med användarens egen klient, så att RLS gäller.
3. Kontrollerar licens för modulen.
4. Kontrollerar tak per användare och konto (räknas i `usage`).
5. Kör operationen:
   - `tolka`: `valjParser` och `parse` på text och rader som webbläsaren läst upp.
   - `berakna`: `Engine.compute`. Satser hämtas från `satser` på servern.
   - `atgard`: foliering-åtgärder. `Utfall.spara` skrivs med användarens klient.
6. Skriver `usage`, och `audit_log` för viktiga händelser.
7. Svarar med `{ resultat }` eller `{ fel: { kod, text } }`.

**Tid, slump och region**
- Servern ger `Tid` (idag och nu i Stockholmstid, slump) till foliering och `idag` till lön. Klienten skickar aldrig tid.
- Funktionen pinnas till regionen `eu-north-1` med `x-region` vid anrop.

**CI-kontroll av klientpaketet (kravet i 16.1.1, tre lager)**
1. ESLint i `apps/platform`: import från `@flodia/core` och `@flodia/kit` är förbjuden. `import type` är tillåtet.
2. Vite-plugin `forbjudKarna` stoppar bygget om någon modul under `packages/core` eller `packages/kit` hamnar i grafen.
3. `scripts/kontrollera-klientpaket.mjs` körs efter `vite build`. Det stoppar CI om:
   - det finns `.map`-filer, eller
   - något "fingeravtryck" finns i `dist`. Fingeravtrycken är unika strängliteraler, minst 12 tecken, som samlas automatiskt från core och kit.
   - Det stoppar också om något som liknar en service-nyckel eller ett JWT finns i paketet.

Ett självtest bygger ett litet testprojekt som importerar core och visar att kontrollen faktiskt slår larm.

Klart när:
- Enhetstester av handlern är gröna med falska klienter.
- Ett integrationstest via `supabase functions serve` visar att en beräkning ger samma resultat som när motorn anropas direkt i Vitest.
- Anrop med fel konto, fel roll, utan licens och över taket ger rätt felkod.
- Klientpaketkontrollen är grön, och självtestet bevisar att den fungerar.

### 2e Skal och guidesystem

`apps/platform` (Vite, React, TanStack Router och Query). `packages/ui` får komponenter som bygger på `tokens.css`.

**Skalet**
- Sidomeny från modulmanifest. Kontoblocket med initialer, namn och typ är kontoväljaren. Grupperna är Hem, Mina appar och Konto. "Hjälp och guider" och "Drivs av flodia" ligger i foten.
- Toppfält med brödsmulor, sök (en plats för den, funktionen kommer senare), "Så funkar det", avatar och en ledig plats för "Fråga" (fas A).
- Hem med "Det viktigaste just nu" och kom-igång-listan.
- Sidor: `/logga-in` och `/valj-konto`.
- Varumärke nivå 1: kontots huvudfärg (`tenants.brand.accent`) skrivs som CSS-variabel, med kontroll av kontrast enligt WCAG AA. Nivå 2 och 3 skjuts upp (se E).

**Moduler och guider**
- `packages/modules/<x>/manifest.ts` med `defineModule` (spec s. 10). Uppladdningar refererar parsrar **med nyckel som sträng**, aldrig med import. Menyn visar bara moduler med aktiv licens.
- Guider i `packages/guides`, med typen `GuideManifest { welcome, checklist, help, fileHelp }`:
  - välkomstguide (3 till 5 kort, kan öppnas igen)
  - kom-igång-lista som bockas av automatiskt via predikat, och som delas av kontot
  - hjälppanel per vy
  - filhjälp ("Var hittar jag filen?")
  - exempelläge med gul banderoll, där inget sparas
- Framstegen sparas i `guide_progress`.
- Innehåll i fas 2: guiden för Avräkning, huvudvariant, från spec s. 46, som bevis på att systemet fungerar. Appens skärmar byggs i fas 3.

**Komponenter i fas 2:** Knapp, Fält, Tomt läge, Laddning, Felläge, Brytare med förklaring och skalkomponenterna. Övriga (Stegvisare, Filrad, Nyckeltal, Avvikelse) när fas 3 behöver dem.

**Legacy-brygga** (bara om ägaren säger ja, se C.8): legacy-HTML körs i en iframe med `packages/api` i stället för `claude-shim.js`, men bara för interna konton (flaggan `tenants.intern`). Syftet är att bevisa att skärmkoden inte behöver ändras. Legacy-filerna rörs inte.

Klart när:
- Playwright-test i 1280 och 375 punkters bredd: logga in, välja konto, se rätt meny, öppna och stänga välkomstguiden, och se att framsteget finns kvar efter omladdning.
- Inga allvarliga fynd i axe-core.
- Varje vy har tomt läge, laddning och felläge.
- Ingen text har tankstreck (`texter.test.ts` utökas till `apps/` och `packages/`).

### 2f Felloggning, larm och driftdokument

**Sentry i EU-regionen**
- `@sentry/react` i plattformen och `@sentry/deno` i `motor`.
- Personuppgifter skickas inte:
  - `sendDefaultPii: false`
  - inga request-kroppar eller dokumentdata
  - ingen Session Replay
  - `beforeSend` tvättar e-post, personnummer, regnummer och telefonnummer med mönster. Ett test med påhittade strängar bevisar att tvätten fungerar.
- Taggar: konto-id (uuid), modul, operation och motorversion.
- Källkartor laddas upp privat till Sentry och raderas sedan ur `dist`. Kontrollen i 2d kräver att inga `.map`-filer finns kvar.

**Larm till ägaren**
- vid nytt fel
- vid felfrekvens över en gräns
- när taket för anrop slår till (enkel version av 16.1.5; mönsteranalys i fas 3)

**Driftdokument:** `docs/drift.md`, första versionen. Den beskriver hur man återställer en säkerhetskopia, spärrar en användare och var loggarna finns.

**Rapport:** `docs/faser/fas-2.md`.

Klart när:
- Ett avsiktligt fel i testmiljön syns i Sentry utan personuppgifter.
- Larmet når ägarens e-post.
- Tvättestet är grönt.

---

## B. Datamodell (migrations i `supabase/migrations`)

Alla tabeller har `enable` och `force row level security`. `anon` får ingenting (`revoke all`). `authenticated` får bara de rättigheter som anges nedan.

### Hjälpfunktioner

Funktionerna ligger i schemat `app`, är `security definer`, `stable` och har `search_path = ''`.
- `app.mina_konton()` returnerar de konto-id som `(select auth.uid())` är medlem i.
- `app.har_roll(konto, roller[])`
- `app.har_licens(konto, modul)`

Hjälpfunktionerna gör att policyer på `memberships` inte blir rekursiva.

### Tabeller och regler

| Tabell | Kolumner (urval) | Index | RLS |
|---|---|---|---|
| `tenants` | id, parent_id, type (platform, main, sub, direct), name, slug unik, org_nr, brand jsonb, domain unik null, intern bool, created_at. Check: sub kräver parent. | slug, parent_id | select: medlem. update (name, brand, org_nr): admin. insert och delete: bara service. |
| `profiles` | id = auth.users.id, name, phone, bankid_subject (hash) | | select: själv och användare i samma konto. update: själv. |
| `memberships` | user_id, tenant_id, role (admin, ekonomi, las), created_at. PK (user_id, tenant_id). | tenant_id | select: medlem i kontot. insert, update och delete: admin i kontot. Trigger skyddar sista admin. |
| `modules` | key, name, version, manifest jsonb | | select: alla inloggade. Skriv: bara service. |
| `licenses` | tenant_id, module_key, variant, status, paid_by, price, started_at, ended_at. Unik (tenant, modul). | tenant_id | select: medlem. Skriv: bara service (admin-gränssnittet kommer senare). |
| `documents` | id uuid, tenant_id, module_key, path, parent (genererad), doc_id (genererad), data jsonb, version, updated_by, updated_at. Unik (tenant, modul, path). Check: giltig sökväg och storlek (gräns, se C.9). | (tenant, modul, parent) | select: medlem och licens. Skriv: ekonomi eller admin, och licens. `with check` hindrar att rader flyttas till ett annat konto. |
| `periods` | tenant_id, module_key, period (ÅÅÅÅ-MM), status (oppen, godkand, publicerad), version, andrad_av, andrad_at | PK (tenant, modul, period) | select: medlem. Skriv: ekonomi eller admin. |
| `file_runs` | tenant_id, module_key, period, kind, filename, sha256, summary jsonb, created_by, created_at. Unik (tenant, modul, sha256). | (tenant, modul, period) | Som `documents`. |
| `shares` | from_tenant, to_tenant, module_key, period, kind, payload jsonb, version, opened_at | to_tenant, from_tenant | select: medlem i from eller to. insert: ekonomi eller admin i from. `opened_at` sätts via funktion av to. Används från 4a. |
| `offers`, `invites` | enligt spec s. 9. invites får token_hash. | parent_id | Bara admin i parent. Används från 4a. |
| `guide_progress` | user_id, tenant_id, module_key, step_key, done_at | PK alla fyra | Bara egna rader i egna konton. |
| `audit_log` | id, tenant_id, actor, action, target, at, via_support, detalj jsonb | (tenant, at) | select: admin i kontot. insert: bara via `app.logga()`. Ingen får update eller delete. |
| `usage` | tenant_id, user_id, module_key, kind (motor, ai, export), units, at | (tenant, at), (user, at) | select: admin. insert: bara service (serverfunktionen). Ger fakturaunderlag och tak. |
| `satser` | key, value jsonb, valid_from, valid_to, source | (key, valid_from) | Ingen klientåtkomst (16.1.3). Läses av servern. Fylls i fas 3. |
| `platform_staff` | user_id, role (superadmin, support) | | Ingen klientåtkomst. Ger **ingen** åtkomst till kunddata i fas 2. Supportinloggning med kundens godkännande kommer senare. |

Kommentarer:
- Huvudkunden ser inte underkundens data. Trädet styr försäljning, inte åtkomst (s. 5). Det som huvudkunden får se om underkunden (namn, org.nr, senaste inloggning) byggs som en vy i 4a.
- Tabellerna `settlements`, `payroll_runs` och `cases` kommer efter version 1 (v3.1 avsnitt 8), inte nu.

---

## C. Det ägaren måste göra eller besluta innan driftsättning

1. **Vilket bolag som äger kontona.** Beslut: ägaren privat tills ett eget aktiebolag är bildat, inga konton på Taxi Malmö AB (se fas-2-beslut.md).
2. **Supabase**
   - organisation med Pro-plan och MFA på
   - projektet `flodia-test` i regionen **Stockholm (eu-north-1)**. Regionen väljs när projektet skapas och kan inte ändras.
   - Signera Supabase DPA (dashboard, Legal).
   - Ett separat driftprojekt skapas först inför första riktiga data, efter den externa granskningen (beslut 15).
3. **Sentry**
   - organisation i **EU-regionen**. Den väljs när organisationen skapas och kan inte ändras.
   - Godkänn DPA i inställningarna.
   - Ange vilken e-postadress larmen ska gå till.
4. **Domän och avsändare**
   - `flodia.se` är registrerad och DNS ligger hos Cloudflare (öppen fråga 12 är löst).
   - Bestäm en avsändardomän, till exempel `post.flodia.se`.
   - Lägg in SPF, DKIM (värden från e-posttjänsten) och DMARC, först `p=none`, sedan `quarantine` efter två veckor utan fel.
5. **E-posttjänst för inloggningsmejl**, med DPA. Rekommendation: en tjänst med EU-lagring, till exempel Resend (EU-region) eller Brevo (fransk). Inloggningsmejl innehåller e-postadresser, alltså personuppgifter.
6. **Hosting av plattformens statiska filer**, med DPA. Rekommendation: Cloudflare Pages. Alternativ: Vercel Pro. Ingen persondata lagras där. Beslutet kan vänta till slutet av 2e.
7. **Roller.** Uppdraget anger admin, ekonomi och läs. Spec v3 s. 5 har också Ägare och Förare, och beslut 16 har support. Förslag: bara de tre nu. Enum-typen utökas när Förare (mobil) och Ägare behövs, och support ligger i `platform_staff`.
8. **Legacy-bryggan i 2e:** ja eller nej. Förslag: ja, men bara för interna konton. De gamla HTML-filerna har motorerna i klienten och får därför aldrig visas för externa kunder (beslut 26).
9. **Storleksgräns per dokument.** Förslag: 2 MB. Månadsdokument i kassan innehåller rå LDL-text.
10. **Lagringstid** för `audit_log` (beslut: 3 år) och Sentry (beslut: 90 dagar).
11. **Lokalt:** Docker Desktop med WSL2 på Windows-datorn, för `supabase start`.
12. **Hemligheter:** nycklar läggs in av ägaren själv, i `.env` lokalt och i GitHub Secrets och Supabase Secrets. Jag skriver `.env.example` med tomma värden. CI-jobbet `databas` behöver inga hemligheter, eftersom det kör en lokal Supabase.
13. **Registerförteckning och integritetspolicy:** lägg till Sentry, e-posttjänsten och hosting som underbiträden (`docs/integritetspolicy.md`).

**Kostnad per månad.** Ungefärliga listpriser som jag känner till. Kontrollera dem vid registreringen.

| Post | Fas 2 (test) | Vid lansering |
|---|---|---|
| Supabase Pro (25 USD, ett litet projekt ingår) | ca 270 kr | ca 380 kr med driftprojekt |
| Sentry (gratisnivån räcker i fas 2, Team 26 USD) | 0 kr | ca 280 kr |
| E-posttjänst (gratisnivå, sedan ca 20 USD) | 0 kr | 0 till 220 kr |
| Hosting (Cloudflare Pages) | 0 kr | 0 kr |
| Domän | ca 20 kr | ca 20 kr |
| **Summa** | **ca 300 kr** | **ca 700 till 900 kr** |

---

## D. Testet "konto A kan aldrig läsa konto B"

**Miljö**
- `supabase start` (Docker) med alla migrations.
- `tests/rls/setup.ts` skapar med service-nyckeln:
  - konton: A (main), A-sub (sub till A), B (direct)
  - i varje konto en användare per roll (admin, ekonomi, läs)
  - en användare med konton i både A och B
  - en inloggad användare utan konto
  - anon
- Sessioner skapas med `generateLink` och `verifyOtp`, så att samma väg som i drift används och ingen lösenordsinloggning behövs.

**Matris** (`tests/rls/matris.test.ts`)
- Tabellistan hämtas från `pg_catalog`, inte från en hårdkodad lista.
- För varje tabell kontrolleras att RLS är påslagen och tvingad, och att det finns en **radfabrik** i `tests/rls/rader.ts`. Saknas något stoppar metatestet CI, så att en ny tabell utan test aldrig kommer in.
- För varje tabell, roll och aktör i A, mot rader i B och i A-sub:
  - `select` ger 0 rader.
  - `insert` med B:s tenant_id ger fel 42501.
  - `update` och `delete` på B:s rader påverkar 0 rader. Med service-nyckeln kontrolleras sedan att raden är oförändrad.
  - En `update` som flyttar en egen rad till B ger fel.
  - `rpc`-funktionerna (`dok_skriv`, `logga`) med B:s id ger fel.
- Samma matris körs åt andra hållet (B mot A) och mellan huvudkund och underkund.
- **Inom eget konto:** läs kan inte skriva, ekonomi kan inte ändra medlemskap, och sista admin kan inte tas bort.

**Lager ovanför databasen**
- documents-API: fel konto ger `not_granted`.
- Realtime: A får inga händelser från B, inte heller vid delete.
- Serverfunktionen `motor`: fel konto ger 403.
- E2E: en användare med två konton ser aldrig A:s data under B:s URL.

**CI**
- Nytt jobb `databas` i `.github/workflows/ci.yml`, parallellt med det befintliga:
  1. `npm ci`
  2. `npx supabase start`
  3. `npm run bygg:funktioner`
  4. `npx supabase functions serve` i bakgrunden
  5. `npm run test:db`
  6. Playwright
- Båda jobben krävs för merge. Uppskattad tid: 5 till 8 minuter.
- `npm run ci` förblir snabb och kräver inte Docker. Ett nytt skript `npm run ci:allt` kör allt lokalt.

---

## E. Risker och vad som skjuts upp

**Risker**
- **Deno och workspace:** Edge Functions kör Deno, men core är skriven för Node och Vite. Lösningen är att paketera med esbuild. Intl med tidszoner i Edge-miljön testas i integrationstestet.
- **Läckor via Realtime:** `postgres_changes` väljs bort av skälet ovan. Broadcast-vägen täcks av läcktest.
- **RLS-fel som ger för mycket åtkomst:** matrisen och metatestet fångar dem. Beslut 15 kräver ändå extern granskning innan riktiga personuppgifter laddas upp.
- **Prestanda:** policyer med underfrågor per rad. Vi använder hjälpfunktioner och `(select auth.uid())`, med index på tenant_id.
- **Leverans av inloggningsmejl:** fel i SPF, DKIM eller DMARC stoppar all inloggning. Det testas innan fasen stängs.
- **Fynd f ändrar beteende** för åtgärder som i dag tyst gör fel. Diffen visas för ägaren först.
- **Stora dokument:** LDL-text i kassans månadsdokument. Storleksgränsen och sökvägskontrollen testas.
- **Windows-miljön:** Docker och WSL2 krävs lokalt. CI är huvudbeviset.
- **Leverantörspriser och villkor** kan ha ändrats sedan min kunskap uppdaterades. Ägaren kontrollerar vid registreringen.

**Skjuts till fas 3 eller senare**
- Appens skärmar (Avräkning med flera) på plattformen, och regeln "publicerad månad kan inte ändras" kopplad till dokumenten.
- Förhandsposter i avräkningen (legacy sedan 2026-10-12). Manuella poster per bolag kan skrivas in innan månadens filer är inlästa: rabatt, förskott, efterdebitering och övriga rader. Posterna sparas på avräkningsmånaden och följer med när filerna laddas upp. En låst månad kan inte ändras.
- AGI-filen som del av lönen (beslut 28, SPEC-v3.1 avsnitt 18.2). Arbetsgivardeklaration på individnivå som XML enligt Skatteverkets schema 1.1 (teknisk beskrivning 1.1.18), med huvuduppgift (fältkod 006, 201, 487, 497) och en individuppgift per anställd (201, 215, 006, 570, 001, 011), och organisationsnummer med prefix 16. Formatet är godkänt i Skatteverkets testtjänst.
  - Den riktiga testfilen stannar i kundens mapp. Repot får en anonymiserad kopia som gyllene testfil.
  - Motorn följer motorkontraktet (avsnitt 3.3), med skattesatser och avgifter från konfiguration med giltighetsdatum (`satser`).
  - Filen valideras mot schemat innan den lämnas ut, och fel visas i klartext.
  - Ansvarsgränsen (avsnitt 9 punkt 3 och 18.4) visas innan filen laddas ner, och godkännandet loggas.
  - Skarpt test med oktober 2026 görs i november, innan funktionen säljs.
- Delning från centralen till åkerierna (spec v3 s. 5 till 7, SPEC-v3.1 Publicera). Centralen (main) fakturerar uppdrag, till exempel Sturup, Kastrup och debiteringar, och sorterar raderna per åkeri i avräkningen. Varje åkeris rader förs automatiskt, envägs, in i åkeriets eget konto (sub), till exempel i Tripkassan eller Åkarkassan. Åkeriet ser bara sina egna rader. Centralen ser inget i åkeriets konto, och åkerierna ser inget hos varandra. Databasen har redan delningen (`shares`, bara från huvudkund till egen underkund, testat i 2a). Publicera och mottagningen byggs. Öppna beslut (ägaren 2026-10-13):
  1. Vad centralen ser om åkeriet: inget alls, eller det spec v3 s. 5 anger (namn, org.nr, bilar, aktiva appar, senaste inloggning, om avräkningen är öppnad).
  2. Vilka rader som delas (Sturup, Kastrup, bro, debiteringskunder och annat), och per åkeri eller per bil.
  3. Hur ett åkeri i avräkningens bolagsregister kopplas till rätt konto i Flödia: kundnummer, org.nr eller ett manuellt val en gång.
  4. När raderna går över: när månaden godkänts och publicerats (spec), med rättelser som ny version.
  5. Vad som händer i åkeriets app: ersätter raderna uppladdningen av centralens avräknings-PDF, och går de direkt in i lönen och bokföringen (konto 1680) eller först till godkännande.
  6. När det byggs: fas 3 eller 4a, i stället för fas 5 (Åkarkassan för underkund) som i SPEC-v3.1.
- Fynden a, b, c, e och g, hårdkodade värden till `satser`, Rule-objekt och delningen av `motor.ts` (fas 3).
- Mönsteranalys av ovanligt beteende (16.1.5) utöver tak och enkla larm.
- Inbjudningar, delning nedåt, huvudkundens vy över underkunder och modulval i admin (4a).
- Egna domäner och sessioner knutna till domän (varumärke nivå 2 och 3, 15.2.5).
- Supportinloggning med kundens godkännande, rollen support och `docs/drift.md` komplett (före första kund).
- Lagring av originalfiler (Storage). Av som standard.
- BankID, Expo, Stripe och Fortnox (version 2). PWA-manifest (fas 3).
- Extern säkerhetsgranskning (beslut 15), före första riktiga personuppgifter.

---

## F. Verifiering, hela fasen

1. `npm run ci` grön (lint, typkontroll, enhetstester, legacy orörd, inga tankstreck).
2. `npm run test:tz` grön i UTC och New York.
3. CI-jobbet `databas` grönt: RLS-matris, metatest, documents-API mot shimmen, Realtime-läckor, serverfunktion, Playwright i 1280 och 375 med axe.
4. Klientpaketkontrollen grön, och självtestet bevisar att den slår larm.
5. Manuellt i testmiljön: ägaren loggar in med e-postlänk, byter mellan två påhittade konton, ser rätt meny och guide, och ser ett avsiktligt fel i Sentry utan personuppgifter.
6. `docs/faser/fas-2.md` med testresultat, avvikelser och vad ägaren ska kontrollera. Ägarens beslut från avsnitt C skrivs in där.
