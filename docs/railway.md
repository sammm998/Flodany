# Railway

Plattformen publiceras på Railway från repots `main` med `Dockerfile` och `railway.json`. Webbservern är
`scripts/serva-plattform.mjs` (hälsokontroll på `/halsa`).

## Demoläge (utan Supabase)

Utan `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` körs demoläget. Servern spelar Supabase på `/_demo` med
påhittad data i minnet (`packages/server/demo.ts`): Demobolaget AB med Avräkning, Lön och kassa och Verkstad.
Man är inloggad direkt. Allt nollställs när tjänsten startas om eller publiceras igen.

Variabler under Variables i Railway (alla valfria):

| Variabel | Gör |
|---|---|
| `ANTHROPIC_API_KEY` | Riktiga svar från Claude i chatten. Utan den svarar en demoassistent med förinställda svar. |
| `ASSISTENT_MODELL` | Modellen, standard `claude-opus-5-5`. |
| `DEMO_LOSENORD` | Kräver lösenord för hela sidan (användarnamnet spelar ingen roll). |
| `DEMO_NUVARANDE_APPAR` | `ja` visar de nuvarande apparna i panelen. De innehåller motorerna i klartext, så sätt också `DEMO_LOSENORD`. |
| `DEMO` | `av` stänger av demoläget. |

## Med Supabase

Sätt `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY` (den publika nyckeln) och bygg om. Då används Supabase och
demoläget används inte. Serverfunktionerna publiceras på Supabase (`docs/assistent.md`).
