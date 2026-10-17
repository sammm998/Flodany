# Fas 2e: skal och guidesystem, plan

Grenen är `fas-2e`, från main (`f17acb9`). Planen bygger på `fas-2-plan.md` avsnitt 2e, besluten i `fas-2-beslut.md`, och ägarens uppdrag 2026-10-12: namnbytet till Flödia, legacy orörd, bryggan bara för interna konton och testerna i CI.

## Steg 0: namnbytet (egen commit, grön CI innan bygget börjar)

Bolagsappar blir Flödia och bolagsappar blir flodia, i paketnamn, texter och dokumentation.

| Vad | Före | Efter |
|---|---|---|
| Paketen | `@bolagsappar/api`, `core`, `kit`, `server`, `ui` | `@flodia/api`, `core`, `kit`, `server`, `ui` |
| Rotpaketet | `bolagsappar` | `flodia` |
| Texter i kod och test | "Bolagsappar", "Bolagsappars" | "Flödia", "Flödias" |
| Supabase lokalt | `project_id = "bolagsappar"` | `flodia` |
| Dokumentation | CLAUDE.md, SPEC-v3.1-tillagg.md, OVERLAMNING.md, INSTALLERA-WINDOWS.md, docs/ | Flödia |
| Testmiljön i molnet (planen) | `bolagsappar-test` | `flodia-test` |

Rörs inte:
- `legacy/`
- GitHub-repot `Mommerff11/bolagsappar` (det är en extern adress; ett nytt namn på repot är ägarens beslut)
- PDF:en `Bolagsappar-bygg-och-designspec-v3.pdf` med filnamn (originalspecifikationen)
- commit-meddelanden som redan finns

Se fråga 1 och 2 nedan.

Test: ett nytt test hittar "bolagsappar" i allt som spåras utanför `legacy/`, utom de undantag som listas ovan.

## Steg 1: plattformen `apps/platform`

- **Teknik:** Vite 8, React 19, TanStack Router och Query, Lucide-ikoner. Typsnitten (Geist, Geist Mono, Instrument Serif) ligger lokalt via `@fontsource`, inte från Google, så att inga besökare skickas till tredje part. Versionerna låses.
- **Sidor:**

  | Adress | Innehåll |
  |---|---|
  | `/logga-in` | E-postlänk och kod. Samma svar oavsett om adressen finns, så att ingen kan pröva fram konton. |
  | `/logga-in/bekrafta` | `token_hash` från mejlet. |
  | `/valj-konto` | Kontoväljaren. Den hoppas över för en användare med ett konto. Senast valda konto sparas lokalt, men det är bara en bekvämlighet. |
  | `/:konto` | Hem: det viktigaste just nu och kom-igång. |
  | `/:konto/:modul` | Modulens sida med guiden. Skärmarna byggs i fas 3. |
  | `/:konto/:modul/legacy` | Bryggan, se steg 4. |

- **Skalet enligt spec v3 s. 25 till 44:**
  - Sidomeny från modulernas manifest. Kontoblocket med initialer, namn och typ är kontoväljaren. Grupperna är Hem, Mina appar och Konto. I foten finns "Hjälp och guider" och "Drivs av Flödia".
  - Toppfält med brödsmulor, en plats för sök, "Så funkar det", avatar och en ledig plats för "Fråga".
  - Menyn visar bara moduler med aktiv licens. Läs-rollen ser inte kassorna i menyn, enligt beslutet efter 2d.
- **Varumärke nivå 1:** kontots huvudfärg (`tenants.brand.accent`) blir en CSS-variabel. Kontrasten kontrolleras enligt WCAG AA, och en färg som inte klarar det ersätts med standardfärgen. Testet finns i `packages/ui`.
- **`packages/ui`:**
  - Knapp, Fält, Tomt läge, Laddning, Felläge och Brytare med förklaring.
  - Skalets delar: Sidomeny, Toppfält, Kontoväljare, Hjälppanel och Exempelbanderoll.
  - Bara `tokens.css` som färgkälla.
- **`packages/modules/<modul>/manifest.ts`** med `defineModule` för avräkning, Åkarkassan, Tripkassan och Verkstad. Varje manifest har namn, rutter och uppladdningar, där uppladdningarna pekar på parsrar med nyckel, aldrig med import. Manifestet anger också om modulen är känslig.

## Steg 2: guidesystemet (`packages/guides`)

- Typen `GuideManifest { welcome, checklist, help, fileHelp }`.
- **Välkomstguide:** 3 till 5 kort, och den kan öppnas igen. Framsteget sparas per användare i `guide_progress`.
- **Kom igång:** listan bockas av automatiskt med predikat på kontots data, så den delas av alla användare i kontot. Den syns på Hem tills allt är klart.
- **Hjälppanel per vy** ("Så funkar det").
- **Filhjälp** ("Var hittar jag filen?").
- **Exempelläge:** en gul banderoll, och inget sparas.
- **Innehåll i fas 2:** guiden för Avräkning, huvudvariant, med texterna från spec s. 46, utan tankstreck. Övriga guider kommer i fas 3.

## Steg 3: kontrollen av klientpaketet och texterna

- Vite-bygget använder `forbjudKarnaVite`, och `granska` körs på `apps/platform/dist`. Ingen källkodskarta byggs i drift.
- `npm run kontroll:klient` bygger plattformen och granskar paketet.
- `texter.test.ts` utökas till `apps/` och alla `packages/`, så att inga tankstreck slinker in.

## Steg 4: legacy-bryggan, bara för interna konton (beslut 8)

Legacy-HTML:en har motorerna i klartext, så den får aldrig ligga i klientpaketet eller som en öppen fil på webben (beslut 26).

Förslag:
- **Edge Function `legacy`:** levererar appens HTML efter kontroll av inloggning, medlemskap, `tenants.intern = true`, licens och roll. För kassorna krävs ekonomi eller admin.
- **Bryggan i HTML:en:** funktionen byter skripttaggen för `claude-shim.js` mot en rad som hämtar `window.claude` från plattformen (`skapaClaude`, documents-API:t). Filen i `legacy/` ändras inte. Ett test visar att svaret är exakt filen med bara den taggen utbytt.
- **Laddning i plattformen:** plattformen hämtar HTML:en med användarens token och visar den i en iframe (`srcdoc`). Ett externt konto får 403 och ser aldrig koden.
- **Kopior i webbläsaren** (fråga 2 i `fas-2c.md`): vid utloggning rensas de lokala kopior som legacy sparar (`ak_`, `tt_`, `shim:`).

## Tester i CI

- **Enhetstester** (jobbet ci):
  - kontrast och varumärke
  - manifest och meny per licens och roll
  - kom-igång med predikat
  - guidernas texter utan tankstreck
  - namnbytet
  - granskningen av plattformens paket
- **Databas och funktioner** (jobbet databas):
  - `legacy`-funktionen: 401 utan inloggning, 403 för konto som inte är internt, 403 för läs-rollen i kassan, 200 med bryggan
  - svaret är legacy-filen byte för byte utom skripttaggen
- **Playwright** (jobbet databas, Chromium, i 1280 och 375 punkters bredd):
  1. Logga in med länken från Mailpit.
  2. Välj konto, se rätt meny och byt konto. Under konto B:s adress syns aldrig A:s data.
  3. Öppna och stäng välkomstguiden. Framsteget finns kvar efter omladdning.
  4. Hjälppanelen, exempelläget, tomt läge, laddning och felläge.
  5. Bryggan: avräkningen öppnas i ett internt konto och sparar via API:t, och ett externt konto nekas.
  6. axe-core utan allvarliga fynd på varje sida.
  7. En lång session där token förnyas medan livevisningen är öppen (krav från 2c).

## Klart när

- CI är grönt vid första försöket, med `retry: 0`.
- Granskningen av klientpaketet omfattar plattformen.
- Rapporten `docs/faser/fas-2e.md` är skriven.

## Frågor till ägaren innan bygget

1. **Domänerna i dokumentationen.** Ska `bolagsappar.se`, `app.bolagsappar.se`, `post.bolagsappar.se` och `kundnamn.bolagsappar.se` bli `flodia.se` och så vidare? Förslag: ja i planerna och specen, med en notering att domänen ska registreras (öppen fråga 12).
2. **Spec-PDF:en och repot.** Behålls `Bolagsappar-bygg-och-designspec-v3.pdf` med sitt namn, och repot `Mommerff11/bolagsappar` tills vidare? Förslag: ja. Ett nytt namn på repot görs av ägaren på GitHub.
3. **Bryggan.** Ska den levereras via en Edge Function med kontroll av internt konto, som i steg 4? Förslag: ja. Alternativet är bara lokalt i utvecklingsläget, men då kan ägarens eget bolag inte använda den på plattformen.

## Ägarens svar och tillägg (2026-10-12)

Planen är godkänd med ja på alla tre frågorna, och följande tillägg:
1. `flodia.se` är redan registrerad och DNS ligger hos Cloudflare. Dokumentationen säger det, i stället för att domänen ska registreras.
2. Ägaren döper om repot efter 2e.
3. Legacy-filerna innehåller motorerna. De får aldrig ligga som publika statiska filer i bygget eller på någon öppen adress. De lämnas bara ut av serverfunktionen efter inloggning och kontroll av internt konto. Tester:
   - ett externt konto får 403
   - en utloggad får 401
   - legacy-HTML finns inte i klientbygget

   Granskningen av klientpaketet enligt beslut 26 gäller fortsatt för allt utom bryggans svar. Undantaget står uttryckligen i koden och i `fas-2e.md`.
