# Assistenten: chatten med agenten

Kundens startsida är en chatt, som i Claude. Användaren skriver vad hon vill göra eller veta. Assistenten svarar,
hämtar data ur apparna och öppnar det den hämtar i en panel till höger. Apparna finns kvar och kan öppnas i
panelen eller som egen sida.

## Så fungerar det

```
Webbläsaren (apps/platform)             Edge Function assistent (packages/server)          Anthropic
  Chatt.tsx, ChattLage.tsx  -- fråga -->  assistera(): kontroll, tak, samtalet     -- ström -->  Messages API
  Panel.tsx (flikar)        <-- ström --  verktygsloop (högst 8 steg)              <-- ström --  (claude-opus-5-5)
                                          verktygen körs med användarens token:
                                          documents, motor (berakna), guiderna
                                          samtalet sparas i assistent_samtal
```

1. Klienten skickar `{ konto, samtal, text, vy }` till `functions/v1/assistent` med användarens token.
2. Servern kontrollerar inloggning, roll, licenser och tak, och läser samtalet (bara användarens egna).
3. Servern anropar Anthropic med strömning. Text skickas vidare till chatten medan den kommer.
4. När modellen vill använda ett verktyg körs det på servern med användarens token, så radsäkerheten och
   rollerna gäller precis som i apparna. Resultatet går tillbaka till modellen och det som ska synas går till
   panelen.
5. Samtalet sparas (historien till modellen, det chatten visar och panelerna).

Svaret är en ström av händelser (`text/event-stream`), en JSON per rad: `samtal`, `text`, `verktyg`, `panel`,
`klar` och `fel`. Typerna finns i `packages/api/assistent.ts`.

## Verktygen

| Verktyg | Gör | Panel |
|---|---|---|
| `oppna_app` | Öppnar en app så att användaren kan arbeta i den. Interna konton får den nuvarande appen (legacy-bryggan), andra kunder appens sida i plattformen. | App |
| `hamta_data` | Läser ett dokument eller en samling i en app, till exempel `months/2026-09` eller `arenden`. | Data, med CSV och JSON |
| `berakna` | Kör Verkstadens motor: nyckeltal, att göra, fakturor och periodens bokföring. | Beräkning |
| `foresla_andring` | Föreslår en ändring av data i vilken app som helst (till exempel en ny förare i Lön och kassa eller ett nytt åkeri). Panelen visar före och efter. Godkänn sparar med användarens rättigheter och laddar om appen i panelen. | Ändring med Godkänn och Avböj |
| `foresla_atgard` | Föreslår en åtgärd i Verkstad (till exempel markera en faktura som betald). Utförs inte av agenten. | Förslag med Godkänn och Avböj |
| `hjalp` | Läser välkomstguiden, hjälpen per vy och filhjälpen. | Hjälp |

Verktygen och systemtexten är desamma under hela samtalet (historien är append-only). Behörigheten kontrolleras
när verktyget körs, inte i listan.

## Regler (SPEC-v3.1 avsnitt 14.2)

1. **Agenten ändrar aldrig något själv.** En åtgärd blir ett förslag i panelen. Först när användaren klickar
   Godkänn anropar klienten serverfunktionen motor (operationen `atgard`) med sina egna rättigheter, och motorn
   kontrollerar förkraven. Beslutet sparas med panelen så att förslaget inte kan godkännas två gånger.
2. **Siffror kommer från motorn.** Agenten läser sparade resultat (till exempel `months/<period>.summary`, som
   motorn räknade när månaden gjordes) eller kör motorn. Systemtexten förbjuder egna beräkningar och kräver källa.
3. **Samma behörighet som användaren.** Varje verktyg körs med användarens token. Läs-rollen ser inte kassorna och
   kan inte få förslag på åtgärder.
4. **Vet den inte, säger den det.**
5. **Data är data.** Verktygssvar skickas som `tool_result`, aldrig som instruktioner. Systemtexten säger det.
6. **Inga skatteråd.**
7. **Personnummer och kontonummer maskeras** innan data skickas till modellen (`maskera` i
   `packages/server/assistent.ts`). Panelen visar datan som den är, för användaren har rätt att se den.

## Slå på assistenten

Assistenten är av tills nyckeln och modellen finns i Supabase Secrets. Utan dem svarar den 503 och chatten visar
"Assistenten är inte konfigurerad på servern".

1. Kör migrationen `supabase/migrations/20261019090000_assistent.sql` (tabellen `assistent_samtal`, modulen
   `assistent` för räkningen i `usage` och kolumnen `tak.assistent_per_dag`).
2. Skapa en secret key med namnet `assistent` under API Keys i Supabase (som för `motor` och `legacy`, se
   `packages/server/nycklar.ts`).
3. Lägg in Secrets för Edge Functions:
   - `ANTHROPIC_API_KEY`: samma nyckel som fotoläsningen.
   - `ASSISTENT_MODELL`: `claude-opus-5-5` (rekommenderas). `claude-sonnet-5-5` är billigare.
   - `ASSISTENT_INSATS` (valfri): `low`, `medium` (standard) eller `high`.
4. Bygg och publicera: `npm run bygg:funktioner` och `npx supabase functions deploy assistent`.

För Claude Opus 5.5, Claude Sonnet 5.5, Claude Opus 5 och Claude Fable 5.1 skickas `fallbacks: "default"`: om
modellens säkerhetsfilter avböjer en fråga körs den på en annan modell på Anthropics sida i stället för att
användaren får ett nej. Andra modeller får inte parametern.

## Tak och kostnad

- Samma tak som motor per användare och minut och per konto och timme (tabellen `tak`).
- Högst `tak.assistent_per_dag` frågor per konto och dygn (standard 200). Varje fråga registreras i `usage` med
  modulen `assistent` och typen `ai`.
- Högst 8 anrop till modellen per fråga och 30 000 tecken data per verktygssvar.
- Systemtexten och verktygen cachas (`cache_control`), så att varje steg i ett samtal blir billigare.
- Ett samtal med fler än 120 meddelanden avslutas: användaren börjar ett nytt. Historien kortas aldrig, eftersom
  tankeblocken bara gäller i en oförändrad historik.

## Dataskydd

- Samtalen sparas i 90 dagar (avsnitt 14.5). Användarens egna rensas när hon ställer en ny fråga, och
  `app.rensa_assistent_samtal()` rensar alla. Den ska schemaläggas i drift, som rensningen av granskningsloggen.
- Kunddata skickas till Anthropic, minimerat (bara det verktyget hämtar) och med personnummer maskerade. Det är
  steg 2 i avsnitt 14 (dataassistent), som ägaren beställde 2026-10-17. Anthropic finns redan som underbiträde.
- Lönedata (kassorna) innehåller namn och belopp per förare. De skickas till modellen när användaren frågar om dem.
  Ta ställning till om kassorna ska undantas från `hamta_data` innan första kund med riktiga löner.

## Filer

| Fil | Innehåll |
|---|---|
| `packages/api/assistent.ts` | Kontraktet: anrop, händelser, paneler, förslag |
| `packages/server/assistent.ts` | Agenten: kontroll, tak, verktygen, strömmen, loopen och HTTP |
| `packages/server/assistent-tjanster.ts` | Anthropic (strömning) och Supabase (samtal, räkning) |
| `supabase/functions/assistent/index.ts` | Edge Function |
| `apps/platform/src/sidor/Chatt.tsx` | Chattsidan: meny, samtal, skrivruta och panelens kant |
| `apps/platform/src/chatt/` | Tillståndet, panelen, datavisningen och formateringen av svaren |
| `packages/ui/chatt.css` | Stilen |
| `packages/server/assistent.test.ts`, `apps/platform/src/chatt/chatt.test.ts`, `tests/e2e/chatt.spec.ts` | Tester |
