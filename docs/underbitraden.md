# Flödias underbiträden

Flödia är personuppgiftsbiträde åt sina kunder. Listan är bilaga till biträdesavtalet med kunden (SPEC-v3.1 avsnitt 11 och 16) och ska stämma med kundens integritetspolicy (avsnitt 15). Kunden informeras innan ett nytt underbiträde läggs till.

Avtalen sparas som PDF hos ägaren, inte i repot.

**Övergång (fas-2-beslut.md, 2026-10-14):** tills bolaget som ska äga Flödia har bildats är ägaren privat avtalspart hos underbiträdena nedan, och biträde åt de fyra interna bolagen enligt övergångsavtal (GDPR art. 28). Inga externa kunder ansluts under övergången.

| Underbiträde | Vad | Var | Avtal | Sedan |
|---|---|---|---|---|
| Supabase | Databas, inloggning, serverfunktioner (motor och legacy) | EU, Stockholm (eu-north-1) | DPA i villkoren, version 1 (2026-08-01), SCC enligt punkt 12.2 | 2026-10-13 |
| Brevo | E-post för inloggning (SMTP) | EU, viss behandling utanför EES enligt Brevos DPA (underbiträden i Annex 2) | DPA i villkoren (Appendix 3), version 2025-10-01, SCC vid överföring utanför EES. Incidentmeddelanden går till Brevo-kontots e-post. | 2026-10-13 |
| Cloudflare | DNS för flodia.se och värd för plattformen (Pages, statiska filer). Ser besökarnas IP-adresser och anrop till app.flodia.se. | Globalt nät [region och överföring fylls i av ägaren enligt Cloudflares DPA] | [Cloudflares DPA, version fylls i av ägaren] | DNS 2026-10, Pages 2026-10-13 |
| Sentry | Felloggning, utan personuppgifter i händelserna | EU, Frankfurt | [när felloggningen slås på] | Ej i bruk |
| Anthropic | Fotoläsning av klädlistan i Avräkning (byggd, avstängd i alla konton, se docs/fotolasning.md). Senare AI i Inkorg och assistenten. | [region fylls i av ägaren: USA med standardavtalsklausuler enligt Anthropics DPA, fråga 11 i fas-3-moduler-plan.md] | [Anthropics DPA, version och datum, och enligt standardvillkoren för API:t: att data inte används för träning, hur länge data lagras och var den behandlas, fylls i av ägaren. Nollagring är önskvärd men inget krav] | Ej i bruk |

## Vad som delas med underbiträdena

- **Supabase:** all kunddata i plattformen, lagrad i Stockholm.
- **Brevo:** användarens e-postadress och inloggningsmejlet (länk och kod). **Öppet:** Brevo skriver i dag om inloggningslänken via sin klickspårning och ser därmed länkens token. Ärende hos Brevo om att stänga av spårningen. Tills det är löst får inga riktiga användare inloggningsmejl (docs/faser/fas-2b-moln.md, steg 5.3).
- **Anthropic (när fotoläsningen slås på):** fotot av klädlistan, som skickas från servern och inte sparas hos Flödia. Den nya blanketten (2026-10-14) saknar namnkolumner, men gamla blanketter kan förekomma. Svaret tvättas på servern så att inga namn kommer tillbaka, oavsett blankett. Nollagring är önskvärd men inget krav.
- **Sentry:** bara tekniska felhändelser. E-post, personnummer, telefonnummer, bankkonton, regnummer och token tvättas bort innan något skickas (packages/api/fellogg.ts).

## När listan ändras

1. Ett nytt underbiträde läggs till här med avtal och region.
2. Kunderna informeras enligt biträdesavtalet.
3. Ägaren för in det i registerförteckningen (utanför repot).

**Fotoläsningen** går inte att slå på med `scripts/konto.mjs` så länge Anthropic-raden ovan har platshållare (hakparenteser) eller säger "Ej i bruk". Raden fylls i när avtalet är klart.
