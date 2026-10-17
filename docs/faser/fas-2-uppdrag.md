# Fas 2: Kärnan (uppdrag till planen)

Ägarens uppdrag 2026-10-11. Gör bara en plan i plan mode. Ingen kod förrän ägaren och Claude (Cowork) har godkänt planen.

## Mål

Plattformen får inloggning, konton och en riktig databas, så att apparna kan köras som tjänst. Fasen är klar när automatiska tester visar att konto A aldrig kan läsa, ändra eller ta bort konto B:s data, för alla tabeller och alla roller.

## Innehåll (spec v3 kapitel E, ändrat av SPEC-v3.1)

1. Databas i Supabase, region i EU (Stockholm om den finns, annars Frankfurt). Tabeller med `tenant_id` och radsäkerhet (RLS) på varje tabell.
2. Inloggning med e-postlänk (inte BankID i version 1). Konton och roller: admin, ekonomi, läs. Kontoväljare för användare med flera konton.
3. Documents-API med samma gränssnitt som `legacy/shared/claude-shim.js` (`doc`, `collection`, `get`, `set`, `update`, `delete`, `onSnapshot`), så att apparnas skärmkod knappt behöver ändras.
4. Serverfunktioner som kör motorerna i `packages/core` (beslut 26). Parsrar, motorer och regler får aldrig hamna i klientpaketet. Lägg till en kontroll i CI som bevisar det.
5. Skalet (menyer, layout, kontoväljare) och guidesystemet, enligt spec v3 och `packages/ui/tokens.css`.
6. Felloggning med EU-lagring.

## Krav som tidigare faser lämnat över

- Alla tider och datum uttryckligen i Europe/Stockholm (fas 1b).
- WeakMap bort (fas 1b).
- Varje åtgärd kontrollerar läget och ger ett tydligt fel (fas 1c fynd f), eftersom servern tar emot anrop direkt.

## Regler

- Inga nycklar eller lösenord i koden eller i chatten. Allt i `.env`, som aldrig committas. Lägg en `.env.example` med tomma värden.
- Bara påhittad testdata. Inga riktiga personuppgifter i repot, i databasen under utveckling eller i loggar.
- Inga tankstreck i text.

## Planen ska innehålla

1. Uppdelning i delsteg (till exempel 2a databas och RLS, 2b inloggning och roller, 2c documents-API, 2d serverfunktioner, 2e skal och guider, 2f felloggning) med klar-krav och tester per delsteg.
2. Datamodellen: tabeller, kolumner, index och RLS-regler.
3. Lista över **beslut och åtgärder som ägaren måste göra själv** innan bygget börjar: konton som ska skapas, region, personuppgiftsbiträdesavtal (DPA) med Supabase och felloggningstjänsten, avsändardomän för inloggningsmejl (SPF, DKIM, DMARC), kostnad per månad.
4. Hur testet "konto A kan aldrig läsa konto B" byggs och körs i CI.
5. Risker och vad som skjuts till fas 3.

Pausa efter planen.
