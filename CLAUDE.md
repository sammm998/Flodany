# CLAUDE.md

Instruktioner till Claude Code för det här repot. Läs hela filen innan du ändrar något.

## Bakgrund

Repot innehåller affärsappar som byggts som enfils-artifacts på claude.ai för egna bolag (taxicentral, åkerier, foliering/skadeverkstad). Målet nu är att göra dem till säljbara SaaS-produkter: varje kundföretag får egen inloggning och egen data, och betalar per månad.

Ägare: VD för en taxicentral i Malmö, hög teknisk nivå. Svara på svenska, kort och tydligt.

## Struktur

```
legacy/apps/<app>/index.html   En app = en HTML-fil med inline CSS och JS (originalet från claude.ai). Ändras inte.
legacy/shared/claude-shim.js   Lokal ersättning för claude.ai:s runtime (window.claude.use)
packages/core, packages/kit    Motorer, parsrar och kontrakt. Bara på servern (beslut 26)
packages/server                Serverfunktionerna motor, assistent och legacy (Edge Functions)
packages/api                   Documents-API som claude-shim.js, och anropaMotor
packages/ui                    Designsystemet: tokens.css (spec v3 sid 14), stil och komponenter
packages/modules, guides       Modulernas manifest och guidetexter
apps/platform                  Plattformen (Vite, React): inloggning, kontoväljare, chatten med assistenten, skal och guider
supabase/                      Konfiguration, migrationer, mejlmall och Edge Functions
tests/                         Tester för hela repot, bl.a. att legacy/ är orörd
scripts/                       Hjälpskript (lokal server, kontrollsummor)
docs/*.md                      Dokumentmallar med [platshållare]
docs/faser/fas-N.md            Rapport efter varje fas
referens/*.html                Statiska referenssidor
```

`legacy/apps/` innehåller fyra appar: avrakning, akarkassan, tripkassan och foliering. Skadeflöde, förarlista och inköpskollen ligger i `C:\Users\Abbes\Desktop\AB\AB\Arkiv-appar` (eget git-repo). Aktievärde och fastighetsstrategi ligger i `C:\Users\Abbes\Desktop\AB\AB\Privat` (eget git-repo) och hör inte till produkten.

`legacy/` är skyddad: `tests/legacy.test.ts` jämför varje fil mot `tests/legacy.sha256`. ESLint och typkontrollen hoppar över `legacy/`.

Externa bibliotek laddas från cdnjs: pdf.js 3.11.174, SheetJS (xlsx) 0.18.5, jsPDF 2.5.1, jspdf-autotable 3.8.2.

## Runtime-beroendet (det viktigaste att förstå)

Apparna anropar `await window.claude.use(name)`. På claude.ai ger det riktiga tjänster. Lokalt fångas anropen av `legacy/shared/claude-shim.js`.

| Capability | API som används | Används av |
|---|---|---|
| `db` | `db.doc(path).get/set/update/delete/onSnapshot`, `db.collection(path).get/doc(id)/onSnapshot`. Snapshot: `.exists`, `.data()`, `.docs[]`, `.id`. Data från `get` är fryst, appen klonar innan ändring. | avrakning, foliering, akarkassan, tripkassan |
| `downloads` | `dl.save({ filename, data })` där data är string, Uint8Array eller Blob | avrakning, foliering, akarkassan, tripkassan |
| `user` | `user.id()` | akarkassan, tripkassan |

### Datamodell per app

- **avrakning**: `settings/params`, `settings/bilar`, `settings/bolag`, `settings/terminaler`, `settings/forskottMap`, samlingarna `months` och `utskick`.
- **foliering**: samlingarna `arenden`, `fordon`, `forsakring`, `kostnader`, `lonespec`, `bokforing`, `installningar` (live via onSnapshot).
- **akarkassan / tripkassan**: per användare under `data/users/<uid>/`: `settings`, `skatt`, `ekonomi-2026`, `m-ÅÅÅÅ-MM` (månader), `bok-*`, `bank-*`. Fallback `seed/demo` och localStorage.

## Beräkningsmotorerna (skydda dessa)

Affärslogiken är värdet i produkten. Den är redan skriven som ren JS utan DOM-beroenden:

- `avrakning`: `compute(S, D)`, `parseTaxiCaller`, `parseBambora`, `parseTcCsv`, `parseApp`, `countPassages`, `monthLabels`.
- `akarkassan`/`tripkassan`: objektet `ENG` (`parseLDL`, `parseBro`, `parseSturup`, `parseAvrakning`, `parseSkattetabell`, `tabellSkatt`, `agAvgift`, `compute`). Filen exporterar redan `module.exports = ENG`.
- `foliering`: prislistan `DEF_PRISER`, fakturanumrering, momsflödet (momsfaktura till fordonsägaren först när försäkringsbolaget betalat), påminnelseregler, SIE-export.

Regel: ändra aldrig en beräkning utan att först skriva ett test som låser nuvarande beteende, och visa diffen i resultat för ägaren.

## Assistenten (chatten)

Kundens startsida (`/:konto`) är en chatt som i Claude: agenten svarar, hämtar data och öppnar appar i en panel till höger. Agenten körs i serverfunktionen `assistent` med användarens token och föreslår åtgärder som användaren själv godkänner. Den ändrar aldrig något själv. Se `docs/assistent.md`. Översikten med kom igång ligger på `/:konto/hem`.

## Specifikationer

Bygguppdraget beskrivs i `Bolagsappar-bygg-och-designspec-v3.pdf` (läggs i repots rot) och `SPEC-v3.1-tillagg.md`. Där de säger olika saker gäller tillägget. Byggordningen i tillägget (version 1, fas K) ersätter migreringsplanen nedan.

## Migreringsplan (ursprunglig, ersatt av SPEC-v3.1)

Gör stegen i ordning och stäm av med ägaren efter varje steg.

1. **Bryt ut och testa.** Flytta motorerna till `packages/core/` som ES-moduler med Vitest-tester. Använd syntetiska testfiler (påhittade LDL-, TaxiCaller- och Bambora-exempel), aldrig riktiga kundfiler. `akarkassan` och `tripkassan` delar nästan all kod: slå ihop till en motor med konfiguration.
2. **Byt runtime mot ett riktigt API.** Behåll samma gränssnitt som `claude-shim.js` (`doc/collection/get/set/onSnapshot`) men implementera det mot en backend med multi-tenant (förslag: Postgres med row level security, t.ex. Supabase, EU-region). Varje dokument får `tenant_id`. Då behöver UI-koden knappt ändras.
3. **Inloggning och kunder.** Auth per användare, roller (admin, ekonomi, läs), en tenant per kundföretag. Ersätt `user.id()`.
4. **AI-funktioner.** Ersätt `sample` med ett serveranrop mot Anthropic API. API-nyckeln får aldrig ligga i klienten.
5. **White label.** Bolagsnamn, logga, färger, org.nr och kontaktuppgifter ska komma från tenant-inställningar, inte vara hårdkodade.
6. **Frontend.** Först när 1 till 5 fungerar: dela upp de stora HTML-filerna i komponenter (Vite). Behåll designen.

## Regler

- **Inga riktiga personuppgifter i repot.** Inga namn, personnummer, telefonnummer, regnummer eller kundfiler. Testdata ska vara påhittad. Kontrollera innan commit.
- Gränssnittet är på svenska. Belopp formateras `sv-SE`, datum `ÅÅÅÅ-MM-DD`.
- Använd aldrig tankstreck (— eller –) i texter i gränssnittet eller dokument. Använd komma, punkt eller parentes.
- Filer kunden laddar upp läses i webbläsaren (pdf.js, SheetJS), men parsrar, motorer och regler i `packages/core` och `packages/kit` körs bara på servern och får aldrig ingå i klientpaketet. Se SPEC-v3.1 avsnitt 16 (beslut 26).
- Nya projekt: artifact bara som skiss i högst två veckor, med ren logik, påhittad data och satser i inställningar. Flytta till plattformen innan första riktiga lön, faktura eller utbetalning, eller när en andra användare ska in. Se SPEC-v3.1 avsnitt 17 (beslut 27).
- Skattesatser och avgifter (arbetsgivaravgift 31,42 %, ungdomsnedsättning, momssatser) ändras årligen. Lägg dem i konfiguration med giltighetsdatum, inte i koden.

## Kör lokalt

```bash
npm install
npm run legacy      # http://localhost:8000/legacy/apps/<app>/
npm run ci          # lint, typkontroll och tester, samma som CI
```

Rensa lokal data: töm localStorage-nycklar som börjar med `shim:` i webbläsarens utvecklarverktyg.
