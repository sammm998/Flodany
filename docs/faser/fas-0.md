# Fas 0: Grund

Datum: 2026-10-11 · Gren: `main` · Underlag: SPEC-v3.1 avsnitt 2 och spec v3 sid 49.

**Klart när (v3):** apparna går att köra från `legacy/` och CI är grönt.
**Status:** apparna går att köra från `legacy/`, och `npm run ci` är grönt lokalt. CI på GitHub är inte körd än (se Kända brister). Uppdatering 2026-10-11: CI är grönt på GitHub.

## Vad som byggts

Hela fasen ligger i en enda commit, "Fas 0: grund". Historiken rensades innan repot läggs på GitHub (se nedan). Arbetet gjordes i den här ordningen:

1. Grenen bytte namn från `master` till `main`.
2. Riktiga uppgifter plockades bort ur apparna (se nedan). Det gjordes innan kontrollsummorna skapades.
3. `apps/` och `shared/` flyttades till `legacy/apps/` och `legacy/shared/`. Innehållet ändrades inte.
4. Monorepo med npm workspaces (`apps/*`, `packages/*`), ESLint, TypeScript och Vitest. Lokal server `npm run legacy`. Tester som vaktar `legacy/`.
5. `packages/ui/tokens.css` med färger, statusfärger, radier, avstånd och typsnitt enligt sid 14.
6. `.github/workflows/ci.yml` kör `npm ci` och `npm run ci` vid push till `main` och vid pull request.
7. Fyra appar flyttades ut ur repot (se nedan).
8. `npm run legacy` visar en lista med länkar på http://localhost:8000/legacy/apps/ (och i alla mappar som saknar `index.html`).
9. Historiken rensades: en ny gren utan historik, en enda commit, den gamla grenen borttagen och gamla objekt rensade ur `.git`.

### Riktiga uppgifter som togs bort

- **Fråga 10 i v3 (två förnamn om nystartsjobb) är stängd.** Namnen fanns inte kvar. Texten i akarkassan säger "de anställda".
- `akarkassan`: tre regnummer samt leverantör och bilmärke i en förklarande text byttes mot påhittade regnummer (ABC44D, ABC55E, ABC66F) och "serviceavtal på två av bilarna".
- `avrakning`: fyra regnummer i en kodkommentar byttes mot påhittade (ABC11A till ABC44D).
- `skadeflode` (numera i Arkiv-appar): elva personnamn, åtta regnummer, åtta skadenummer och ett mobilnummer i demodatan byttes mot påhittade värden.
- Ingen beräkningslogik ändrades. JavaScript i de ändrade filerna kontrollerades så att det fortfarande går att tolka.

### Appar som flyttats ut ur repot

| Mapp | Innehåll | Git |
|---|---|---|
| `C:\Users\Abbes\Desktop\AB\AB\Arkiv-appar` | `apps/skadeflode`, `apps/forarlista`, `apps/inkopskollen`, `shared/claude-shim.js` | Eget repo, en commit |
| `C:\Users\Abbes\Desktop\AB\AB\Privat` | `apps/aktievarde`, `shared/claude-shim.js`, `fastighetsstrategi.html` | Eget repo, en commit |

Mapparna har samma struktur som `legacy/`, så att sökvägen `../../shared/claude-shim.js` fungerar. Filerna är byte för byte samma som de var i projektet. Kvar i `legacy/apps/` finns avrakning, akarkassan, tripkassan och foliering. Kontrollsummorna för de fyra är oförändrade.

### Verktyg

| Verktyg | Version | Gör |
|---|---|---|
| Node | 24 (`.nvmrc`) | Kör allt |
| TypeScript | 6.0.3 | Typkontroll (`npm run typecheck`). Version 7 finns, men typescript-eslint stöder den inte än. |
| ESLint | 10.12.0 med typescript-eslint 8.71.1 | Hittar slarvfel (`npm run lint`) |
| Vitest | 5.0.3 | Tester (`npm run test`) |

`legacy/` hoppas över av ESLint (`eslint.config.js`) och av typkontrollen (`tsconfig.json`). Radslut är LF i hela repot (`.gitattributes`).

## Testresultat

`npm run ci` (lint, typkontroll, tester), 2026-10-11:

```
> lint       eslint .              inga fel
> typecheck  tsc --noEmit          inga fel
> test       vitest run
 Test Files  3 passed (3)
      Tests  35 passed (35)
```

| Testfil | Antal | Kontrollerar |
|---|---|---|
| `tests/legacy.test.ts` | 6 | Varje fil i `legacy/` har samma SHA-256 som i `tests/legacy.sha256`. Exakt de fyra apparna finns. Varje app laddar `claude-shim.js` från en sökväg som finns. |
| `tests/texter.test.ts` | 1 | Inga tankstreck i `packages/` och `docs/faser/`. |
| `packages/ui/tokens.test.ts` | 28 | Varje token har specens värde, inga okontrollerade tokens, klar-status har samma ton som salvia. |

Motprov: en rad lades tillfälligt till i `claude-shim.js`. Testet "är orörd" blev rött, och filen återställdes.

Lokala servern: de fyra apparna och `claude-shim.js` svarar med HTTP 200. `/legacy/apps/` visar en lista med fyra länkar. En adress utan avslutande snedstreck skickas vidare till rätt adress, och servern lämnar inte ut filer utanför projektmappen.

Historiken: `git log --all` visar en commit. Ingen av de gamla regnumren eller namnen finns i något objekt i `.git`.

## Kända brister

1. **CI är inte körd på GitHub.** **Åtgärdad 2026-10-11:** repot ligger på GitHub och CI är grönt där. Ursprunglig text: Repot har ingen GitHub-koppling och `gh` är inte installerat. Filen är klar och kör samma kommandon som provats lokalt. Gör INSTALLERA-WINDOWS.md steg 5, sedan `gh repo create flodia --private --source . --push`.
2. **Komponenter byggs inte i fas 0** (ditt beslut). v3 sid 49 nämner "tokens och komponenter". De byggs när plattformen sätts upp.
3. **Statusfärgerna** står inte som text i specen. De är utlästa ur statusetiketterna på sid 14 (bakgrund och textfärg). Kontrollera att de stämmer med vad du tänkt.
4. **Typsnitten laddas inte än.** `tokens.css` anger namnen med reservtypsnitt. Själva typsnittsfilerna (Instrument Serif, Geist, Geist Mono) läggs till med plattformen.
5. **`apps/` är tom.** Den fylls från fas 2 (plattformen).
6. **Förarlista och Skadeflöde finns inte i `legacy/`.** Förarlista ingår i fas 4a och Skadeflöde i version 2. När de byggs hämtas originalen från Arkiv-appar.
7. **Python finns inte i datorn.** `python3 -m http.server` är ersatt av `npm run legacy`.

## Vad ägaren ska kontrollera

- [ ] Kör `npm install` och sedan `npm run ci`. Sista raden ska visa `Tests 35 passed (35)`.
- [ ] Kör `npm run legacy` och öppna http://localhost:8000/legacy/apps/. Klicka på var och en av de fyra apparna.
- [ ] Titta på statusfärgerna i `packages/ui/tokens.css`.
- [ ] Kör `git log --oneline` och se att bara "Fas 0: grund" finns.
- [ ] Klistra in den här rapporten hos Claude (Cowork) för granskning innan fas 1.
