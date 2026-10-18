# Railway

Plattformen publiceras på Railway från repots `main` med `Dockerfile` och `railway.json`. Webbservern är
`scripts/serva-plattform.mjs` (hälsokontroll på `/halsa`).

## Demoläge (utan Supabase)

Utan `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` körs demoläget. Servern spelar Supabase på `/_demo` med
påhittad data i minnet (`packages/server/demo-data.ts`): Demobolaget AB med Avräkning (augusti och september
räknade och låsta, oktober öppen), Lön och kassa (september inläst) och Verkstad (ärenden i alla lägen).
Exempelfiler för oktober att läsa in finns på `/_demo/exempelfiler`.
Man är inloggad direkt. Allt nollställs när tjänsten startas om eller publiceras igen.

Variabler under Variables i Railway (alla valfria):

| Variabel | Gör |
|---|---|
| `ANTHROPIC_API_KEY` | Riktiga svar från Claude i chatten. Utan den svarar en demoassistent med förinställda svar. |
| `ASSISTENT_MODELL` | Modellen, standard `claude-opus-5-5`. |
| `DEMO_LOSENORD` | Kräver lösenord för hela sidan (användarnamnet spelar ingen roll). |
| `DEMO_NUVARANDE_APPAR` | `nej` stänger av de nuvarande apparna i panelen (de är på i demon). De innehåller motorerna i klartext, så sätt `DEMO_LOSENORD` om länken sprids. |
| `DEMO` | `av` stänger av demoläget. |

## Med Supabase

Sätt `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` (den publika nyckeln) och bygg om. Då används Supabase och
demoläget används inte. Serverfunktionerna publiceras på Supabase (`docs/assistent.md`).
