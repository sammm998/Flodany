# Incidentnotering: den äldre service_role-nyckeln visades i klartext

2026-10-14 · Flödia, molnprojektet `flodia`

## Sammanfattning

- **Vad:** den äldre JWT-nyckeln `service_role` för molnprojektet visades i klartext i ett PowerShell-fönster och på skärmdumpar. Nyckeln går förbi radsäkerheten och ger full åtkomst till databasen.
- **Åtgärdad:** samma dag, 2026-10-14. Nyckeln är ogiltig.
- **Åtkomst:** inte kontrollerat. Supabase-loggarna (API och Postgres) för tidsfönstret är ännu inte genomgångna efter anrop med `service_role`. Se "Att göra".
- **Personuppgifter:** om personuppgifter har berörts är inte utrett, eftersom loggarna inte är kontrollerade. Noteringen sparas som dokumentation enligt GDPR art. 33.5 och kompletteras när loggarna är kontrollerade.

## Tidsfönster

Alla tider är svensk tid, 2026-10-14. Klockslagen är uppskattade utifrån commits och loggar. De exakta tiderna för avstängning och återkallelse finns i Supabase Audit Logs och är inte kontrollerade.

| Händelse | Tid |
|---|---|
| Nyckeln visades | Troligen omkring 19:50 till 20:20, i samband med kontrollen efter publiceringen av motor v13 (commit `c4ee66d` 19:53). Exakt tid okänd. |
| Serverfunktionerna använder de nya nycklarna | Från 20:43, enligt funktionernas logg. |
| De äldre API-nycklarna avstängda | Mellan 20:43 och 21:39 (commit `edd0924`). |
| Legacy HS256 återkallad, nyckeln ogiltig även som Bearer-token | I samma intervall, efter avstängningen. Före 21:39. |

Nyckeln kan alltså ha gått att använda i högst cirka 1 timme och 50 minuter, från omkring 19:50 till senast 21:39.

## Exponering

- **Var:** i ett PowerShell-fönster på ägarens dator, och på skärmdumpar som klistrades in i en Claude-chatt. Chatten fördes i Claude-appen (Cowork) på datorn, i organisationen Taxi Malmö AB.
- **Delning:** skärmdumparna delades inte någon annanstans än i chatten (ägarens uppgift).
- **Kvar:** skärmdumparna finns kvar på datorn och raderas av ägaren. Chatten finns kvar i Claude-appen.

## Åtgärder 2026-10-14

1. **Utredning:** var de äldre nycklarna användes. Bara serverfunktionerna motor och legacy använde dem. Appen, bryggan, Cloudflare (Production och Preview), GitHub, databasen (inga webhooks, inga schemalagda jobb, inget i Vault) och Brevo gjorde det inte.
2. **Serverfunktionerna** läser nu egna secret keys (`motor`, `legacy`) och publishable-nyckeln `default` (PR #10, motor v17 och legacy v15).
3. **De äldre API-nycklarna** `anon` och `service_role` är avstängda.
4. **JWT signing keys:** ECC (P-256) används, och Legacy HS256 är återkallad (revoked). Den läckta nyckeln provades efteråt som Bearer-token och avvisades med HTTP 401.
5. **Secret keys** `default` och den tillfälliga `konto_skript` är raderade.
6. **Lovables auktorisering** är borttagen från organisationen.
7. **Kontroll efter varje steg:** `scripts/kontrollera-motor.mjs` gav "Allt stämmer" med samma resultat (sha256 `829ca469f54a9ed6`) före ändringarna, efter avstängningen och efter återkallelsen. Bryggan och inloggningen fungerade efter varje steg.

## Att göra

- [ ] **Loggarna:** kontrollera Supabase-loggarna (API och Postgres) för tidsfönstret efter anrop med `service_role` som inte kommer från våra egna serverfunktioner eller skript. Fyll sedan i "Åtkomst" och "Personuppgifter" ovan.
- [ ] **Audit Logs:** läs de exakta tiderna för avstängningen och återkallelsen i Supabase Audit Logs och fyll i tidsfönstret.
- [ ] **Skärmdumparna:** radera dem på datorn, och i papperskorgen och urklippshistoriken.
- [ ] **Chatten:** ta ställning till om chatten med skärmdumparna ska raderas i Claude-appen.

## Versionshoppen i serverfunktionerna (utrett och stängt 2026-10-15)

Versionsnumren för motor och legacy hoppade över nummer mellan publiceringarna (motor 18 till 23 och 25 till 27, legacy 16 till 21 och 23 till 25), och det kontrollerades om någon annan hade publicerat.

- **Senaste publiceringen** som Supabase visar ägde rum i vår egen publiceringssession. Efter den finns 2 anrop, alla utan fel.
- **Supabases versionsnummer** räknar varje försök under "Deployments", också omtag. Ett hopp betyder alltså inte en publicering från någon annan.
- **Den enda access token** för Supabase är CLI-token på ägarens dator.
- **Slutsats:** ingen publicering utanför våra egna. Punkten är stängd.

## Lärdomar och regler

- **Tillfällig secret key:** skripten kräver en secret key som skapas och raderas vid varje körning (`docs/publicera-motor.md`).
- **Inklistring:** nycklar klistras bara in med `Read-Host -AsSecureString`, och `cls` körs före varje skärmdump.
- **En nyckel per del:** varje serverfunktion har en egen secret key, så att en läcka bara kräver ett byte.
