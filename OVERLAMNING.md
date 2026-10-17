# Flödia · överlämning 2026-10-10

Läs den här filen först i ett nytt samtal om projektet.

## Vad Flödia är

Skräddarsydda verksamhetsappar för företag i alla branscher, på fast månadspris. Löftet: "Vi lär oss hur ni jobbar på en dag. Appen är klar inom två veckor." Byggs av ägaren själv i Claude Code, med Claude (Cowork) som rådgivare och granskare.

## Filer i projektmappen

| Fil | Innehåll |
|---|---|
| `Bolagsappar-bygg-och-designspec-v3.pdf` | Bygg- och designspecifikation, 51 sidor |
| `SPEC-v3.1-tillagg.md` | Tillägg: version 1 först, modulkit, leveransprocess 14 dagar, fas K, lön, ägarens beslut. Gäller före v3. |
| `CLAUDE.md` | Instruktioner till Claude Code |
| `INSTALLERA-WINDOWS.md` | Installationsguide Windows |
| `apps/`, `docs/`, `referens/`, `shared/` | Koden från claude.ai med demodata |

## Beslut

- Domän: flodia.se, registrerad, DNS hos Cloudflare. Även taxiavrakning.se och akaravrakning.se.
- Alla branscher, ett varumärke, en undersida per bransch.
- Version 1 = fas 0 till 3 plus minimal fas 4 och fas K. Version 2 vid 3 betalande externa kunder.
- Mål: 5 till 10 kunder inom 6 månader.
- Ägaren godkänner varje fas. Claude granskar. Extern säkerhetsgranskning före första kund med riktiga personuppgifter.
- Jour: ägaren och två kollegor, med Claudes stöd. Rollen support, sekretessavtal och genomgång av drift.md innan första kund. Supporttider ej bestämda.
- Lönefil: ISO 20022 pain.001, kunden godkänner i sin bank.
- En plattform för alla kunder, varumärke per kund. Ingen separat kod eller hemsida per kund.
- Mejlautomation är en kärnprodukt: modulen Inkorg byggs som fas K i version 1 (SPEC-v3.1 avsnitt 11). Make används inte för kunder. Pilot: Taxi Malmö (e-post hos one.com, därför IMAP först).
- Pris sätts per kund efter arbetsdagen, utifrån sparad tid och kvalitet. Ingen prislista på hemsidan (SPEC-v3.1 avsnitt 12, mall i docs/forslag-mall.md).
- Inkorg sparar mejl 12 månader som standard (3 till 36 valbart). Flödia registrerar egen app hos Microsoft.

## Status

- [x] Kod exporterad och anonymiserad
- [x] Spec v3 och tillägg v3.1
- [x] Installationsguide
- [x] flodia.se registrerad, DNS hos Cloudflare
- [ ] taxiavrakning.se och akaravrakning.se
- [ ] Skriftligt avtal om att koden förs över från Taxi Malmö AB
- [ ] Installera och köra fas 0 (planerat 2026-10-11)
- [ ] Fas 1: motorer och jämförelsetester

## Nästa steg

Efter fas 0: klistra in Claude Codes sammanfattning och testresultat i samtalet med Claude för granskning innan fas 1.
