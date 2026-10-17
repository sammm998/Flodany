# Affärsappar: källkod för vidareutveckling

Källkoden till de appar och dokument som byggts som artifacts i Claude, exporterad 10 oktober 2026 för att utvecklas vidare i Claude Code och säljas som abonnemangstjänst.

**All riktig data är borttagen.** Personnamn, personnummer, telefonnummer, adresser, organisationsnummer och bankgiron är ersatta med påhittade värden eller platshållare. Det som finns i apparnas databaser på claude.ai (åkare, bilar, månader, ärenden) följer inte med, eftersom det aldrig låg i källkoden.

## Kom igång

```bash
npm install
npm run legacy
# öppna http://localhost:8000/legacy/apps/avrakning/
```

Apparna måste köras via en webbserver (inte genom att dubbelklicka på filen), annars laddas `legacy/shared/claude-shim.js` inte.

Ladda sedan upp mappen till Claude Code och börja med att be den läsa `CLAUDE.md`.

## Innehåll

### Appar (`legacy/apps/`)

| App | Vad den gör | Bransch | Säljbar som |
|---|---|---|---|
| `avrakning` | Månadsavräkning mellan beställningscentral, åkare och kunder. Läser TaxiCaller, Bambora, Øresundsbron, Swedavia, Visma och bankutdrag. Skapar fakturaunderlag, PDF och Excel. | Taxi, central | Kärnprodukt för taxicentraler |
| `akarkassan` | Lön, kassaredovisning och bro/Sturup per förare för ett åkeri. Läser Megtax LDL, skattetabeller, arbetsgivaravgifter. | Taxi, åkeri | Lönemodul för åkerier |
| `tripkassan` | Samma motor som Åkarkassan, variant för ett mindre åkeri med bokföring och bank. | Taxi, åkeri | Samma som ovan |
| `foliering` | Ärenden, offert, faktura, momsfaktura, betalningar, ekonomi och SIE-export för en folierings- och skadefirma mot försäkringsbolag. | Verkstad | Ärendesystem för verkstäder |

### Dokumentmallar (`docs/`)

Exporterade från Claude Docs och gjorda till mallar med `[platshållare]`: integritetspolicy, intresseavvägning (GDPR), incidentrapport och arbetsgivarintyg.

### Referens (`referens/`)

`taxicaller-api.html` (TaxiCaller API v1, alla endpoints).

### Flyttat ur repot

Skadeflöde, förarlista och inköpskollen ligger i `Arkiv-appar` bredvid projektmappen. Aktievärde och fastighetsstrategi ligger i `Privat`. Båda är egna git-repon.

## Viktigt innan försäljning

1. **Apparna är prototyper.** De är en HTML-fil vardera och sparar data via claude.ai:s runtime. Lokalt ersätts den av `legacy/shared/claude-shim.js`, som sparar i webbläsarens localStorage. Det duger för demo, inte för kunder. Se migreringsplanen i `CLAUDE.md`.
2. **Varumärke.** Taxi Malmö-logga och kontaktuppgifter finns kvar i `avrakning`. Byt till kundens varumärke eller ett neutralt produktnamn.
3. **Personuppgifter i produktion.** Avräkning och lön behandlar förares och åkares uppgifter. Ni blir personuppgiftsbiträde åt varje kund och behöver ett biträdesavtal (art. 28 GDPR) per kund, plus egna underbiträdesavtal med hosting och eventuell AI-leverantör.
4. **Äganderätt.** Kod och idéer är skapade inom Taxi Malmö AB. Reglera skriftligt vem som äger koden innan den förs in i ett nytt bolag med kompanjonen.
