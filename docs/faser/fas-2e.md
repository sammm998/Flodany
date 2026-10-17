# Fas 2e: skal och guidesystem (rapport)

Klar 2026-10-12 på grenen `fas-2e` från main. Planen finns i `fas-2e-plan.md`, med ägarens svar och tillägg sist i den filen.

## Undantag från beslut 26 (ägarens tillägg 2026-10-12)

Legacy-apparna (`legacy/apps/*/index.html`) innehåller motorerna i klartext.

**Var de lämnas ut**
- De lämnas ut på ett enda ställe: Edge Function `legacy` (`supabase/functions/legacy`, logiken i `packages/server/legacy.ts`).
- Funktionen lämnar bara ut appen efter inloggning (annars 401), till ett konto med `tenants.intern = true` (annars 403), med aktiv licens, och för kassorna bara till admin eller ekonomi (annars 403).
- Svaret är legacy-filen byte för byte, utom skripttaggen för `claude-shim.js`, som byts mot bryggan. Filerna i `legacy/` ändras inte.

**Var de aldrig finns**
- Filerna ligger aldrig som publika statiska filer, varken i klientbygget eller på någon öppen adress.
- Plattformens bygge innehåller bara `index.html` och paketerade tillgångar.
- `npm run legacy` från fas 0 lyssnar bara på `127.0.0.1`, så filerna kan inte nås från nätverket.

**Granskningen av klientpaketet**
- Granskningen enligt beslut 26 gäller för allt utom bryggans svar.
- Undantaget står uttryckligen i `packages/server/legacy.ts`, `scripts/klientpaket.mjs`, `scripts/bygg-klient.mjs` och `supabase/functions/legacy/index.ts`.
- Granskningen letar nu också uttryckligen efter legacy-apparna med 3576 rader som fingeravtryck.

## Vad som är byggt

**Steg 0: namnbytet** (egen commit, grön CI)
- Bolagsappar blir Flödia och bolagsappar blir flodia i paket (`@flodia/*`), texter, tester och dokumentation.
- `flodia.se` är registrerad och DNS ligger hos Cloudflare.
- Undantag: `legacy/`, spec-PDF:ens filnamn och GitHub-repot, som ägaren döper om efter 2e.
- Testet `tests/namn.test.ts` stoppar det gamla namnet utanför undantagen.
- En mening i SPEC-v3.1 om att det gamla namnet var för beskrivande för att registreras som ordmärke är omskriven, eftersom den inte gäller Flödia.

**Plattformen `apps/platform`**
- Tekniken är Vite, React 19, TanStack Router och Query. Typsnitten ligger lokalt via `@fontsource`, så inga besökare skickas till Google.
- Sidorna:

  | Adress | Innehåll |
  |---|---|
  | `/logga-in` | E-postlänk eller kod, med samma svar oavsett om adressen finns. |
  | `/logga-in/bekrafta` | Verifiering av länken från mejlet. |
  | `/valj-konto` | Kontoväljaren. Den hoppas över för en användare med ett konto. |
  | `/:konto` | Hem: det viktigaste just nu och kom igång live. |
  | `/:konto/:modul` | Modulens sida. |
  | `/:konto/:modul/legacy` | Bryggan. |

- **Skalet:**
  - En sidomeny från manifesten, med kontoblocket som kontoväljare och "Hjälp och guider" och "Drivs av Flödia" i foten.
  - Ett toppfält med brödsmulor, en plats för sök, "Så funkar det", avatar med utloggning och en ledig plats för "Fråga".
  - På smal skärm ligger menyn bakom knappen Meny.
- **Menyn:** bara moduler med aktiv licens. Läs-rollen ser inte kassorna.
- **Varumärke nivå 1:** kontots huvudfärg används bara om den klarar WCAG AA mot vit text, annars används standardfärgen och skälet anges.
- **Utloggning:** legacy-apparnas kopior i webbläsaren (`ak_`, `tt_`, `shim:`) rensas.

**`packages/ui`**
- Grundkomponenterna: Knapp, Fält, Tomt läge, Laddning, Felläge, Brytare med förklaring, Exempelbanderoll, och Dialog och sidopanel med fokus och Esc.
- Skalet, stilen (bara färger från `tokens.css`) och kontrastkontrollen.

**`packages/modules`**
- Manifest för Avräkning, Åkarkassan, Tripkassan och Verkstad.
- Uppladdningarna pekar på parsrarna med nyckel, aldrig med import. Ett test kontrollerar att nycklarna och etiketterna finns i serverfunktionen.

**`packages/guides`: guiden för Avräkning, huvudvariant, med texterna från spec v3 s. 46**
- Fyra välkomstkort.
- Kom igång med sex steg som bockas av automatiskt utifrån kontots data, live, och som delas av kontot.
- Hjälp för vyerna filer, kontroll, godkänn och utskick.
- Filhjälp per uppladdning. Var och när fylls i av ägaren.
- Välkomstguiden sparas per användare i `guide_progress`.
- Exempelläget visar en gul banderoll, och inget sparas.

**Legacy-bryggan:** se undantaget ovan. Plattformen hämtar HTML:en med användarens token och visar den i en iframe. Appen når databasen via `window.flodiaClaude`, det vill säga documents-API:t med användarens rättigheter.

## Tester

| Var | Vad |
|---|---|
| `packages/ui/kontrast.test.ts` | Kontrast enligt WCAG. Godkänd färg används, för ljus eller oläslig färg ger standardfärgen och ett skäl. |
| `packages/modules/moduler.test.ts` | Manifesten mot serverns parsrar, kassorna känsliga, menyn per licens och roll. |
| `packages/guides/guider.test.ts` | 3 till 5 kort, hjälp för varje vy, filhjälp för varje uppladdning, inga tankstreck, kom igång. |
| `packages/server/legacy.test.ts` | Bryggan byte för byte, 401, 403 för externt konto och läs i kassan, 400 för okänd app. |
| `apps/platform/src/lagring.test.ts` | Utloggning rensar legacy-kopiorna och inget annat. |
| `tests/klientpaket.test.ts` | Legacy-HTML hittas om den hamnar i ett paket, plattformens bygge har bara `index.html` och inga legacy-rader, anon-nyckeln godtas men andra JWT stoppas. |
| `tests/namn.test.ts` | Namnbytet. |
| `tests/db/legacy.test.ts` | Edge Function: utloggad 401, externt konto 403 (även dess admin), läs i kassan 403, internt konto får filen byte för byte, varje öppning loggas, ingen öppen adress till filerna. |
| `tests/e2e` (Playwright, 1280 och 375 punkter) | Se listan nedan. |

Playwright-testerna i `tests/e2e`:
- inloggning med länken från Mailpit, kontoväljaren, byte av konto där A:s namn aldrig syns under B
- okänd adress
- inloggning med koden
- "Ingen åtkomst" för ett annat konto
- utloggning som rensar legacy-kopiorna
- välkomstguiden: steg för steg, sparad och öppnad igen
- hjälppanelen med Esc
- egen guide per användare
- exempelläget
- filhjälpen
- kom igång live
- bryggan i ett internt konto: appen öppnas och sparar via API:t
- bryggan i ett externt konto: 403 och ingen iframe
- läs-rollen och kassorna
- laddning, felläge med Försök igen och tomt läge
- en lång session där token förnyas och livevisningen fortsätter
- axe-core utan allvarliga fynd på varje sida

| CI-jobb | Resultat |
|---|---|
| ci | 1428 tester gröna, klientpaketen (api och platform) granskade |
| databas | 114 databastester och 24 Playwright-tester (12 per bredd) gröna, körning 38265464222, grön vid första försöket för sin commit |

## Fynd och avvikelser

1. **Två Playwright-tester föll första gången på grund av själva testerna.** En väljare för "Filer" träffade också "Filer varje månad". Hjälpen för menyn tittade innan skalet var ritat. Båda är rättade.
2. **Bryggtestet gick igenom första gången men föll i nästa körning.** Orsaken: `page.frames()` kan ge en annan ram än bryggan, eftersom legacy-appen kan skapa egna ramar. Testet hämtar nu ramen från iframe-elementet. Det är ingen omkörning: rättelsen är en ny commit som gick igenom vid första försöket.
3. **Anon-nyckeln är en JWT.** Vite bakar in den i plattformen, och granskningen flaggade den. Den är publik med avsikt, så granskningen godtar en JWT med `role: anon` och stoppar alla andra. Det finns ett självtest för båda fallen.
4. **Fingeravtrycken jämförs nu mot klientens hela källtext**, inte bara mot hela strängar. En databasfråga i servern fanns också inuti en längre fråga i plattformen och gav en falsk träff.
5. **Vite 8.3.4 är fyra dagar gammal.** Det är samma version som Vitest redan installerat, för att undvika två versioner. Övriga nya beroenden är minst två veckor gamla.
6. **Plattformens skärmar för apparna byggs i fas 3**, som planerat. Modulsidan visar guiden, filhjälpen och vägen till den nuvarande appen för interna konton.

## Vad ägaren kan kontrollera

1. CI-körning 38265464222, jobbet databas, steget med Playwright.
2. Guidetexterna i `packages/guides/index.ts` och filhjälpen, där "Ägaren fyller i." väntar på texter om var och när filerna finns.
3. Att ditt eget bolag blir internt (`tenants.intern = true`) när det läggs in i molnet. Det görs med `scripts/konto.mjs` eller SQL och ska inte gå att ändra från klienten.
4. Repot kan döpas om nu.

## Kvar till senare

- **Molndelen av 2b:** Supabase-projektet, SMTP, domänens poster och hooken i molnet.
- **2f:** felloggning med Sentry (EU), larm och `docs/drift.md`.
- **Fas 3:** appens skärmar på plattformen, förhandsposter i avräkningen och övriga guider.
