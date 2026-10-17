# Fas 1b2: nya versioner av Åkarkassan och Tripkassan

Ägarens uppdrag 2026-10-11. Starta i plan mode och visa planen innan något ändras.

## Bakgrund

Åkarkassan och Tripkassan används skarpt för löner. Sedan kopiorna i `legacy/` togs har apparna fått löneartsregister version 1 (33 arter, `LA_VER = 1`), Ekonomi som bara räknar pass som startar i månaden, Tripkassans hittills i år efter utbetalningsdatum, bokföringskonton för lönearter, lönemodell "ingen" utan extra lönearter och hjälptext för löneart 510. Motorn i `packages/core/lon` ligger därför en version efter apparna.

De aktuella versionerna ligger utanför repot:

- `..\inkommande-1b2\akarkassan-live-2026-10-11.html` (sha256 1b35696daedf7552aa4cbb95f603081643b9a2730ffb6380aadfa5658b29ce7a)
- `..\inkommande-1b2\tripkassan-live-2026-10-11.html` (sha256 cfda9f9b40a348b56b587371c09cefb0788d3fbdc65d223385799eb17dbaacd3)

Filerna innehåller riktiga uppgifter. De får aldrig committas som de är.

## Steg

1. **Anonymisera.** Jämför varje ny fil med nuvarande fil i `legacy/apps/`. Allt som är anonymiserat i den gamla filen ska vara anonymiserat på samma sätt i den nya. Granska dessutom all ny kod och text efter namn, regnummer, organisationsnummer, adresser, telefonnummer och mejladresser. Lista varje ersättning (bara rad och typ, inte det riktiga värdet) i rapporten. Skriv ingen riktig uppgift i chatten, i commits eller i dokument.
2. **Byt legacy-filerna** i en egen kontrollerad commit med nya kontrollsummor i `tests/legacy.sha256`. Commitmeddelandet ska säga att det är ett avsiktligt byte enligt fas 1b2.
3. **Uppdatera `packages/core/lon`** rad för rad, utan egna logikändringar: löneartsregistret, lönearter i beräkningen och lönebeskedet, Ekonomi-ändringen, hittills i år efter utbetalningsdatum, lönemodell "ingen". Där apparna skiljer sig åt (bland annat förvalt utbetalningsdatum, fast lön utan pass, kontant 0 för fast lön, lönemodell "ingen") blir skillnaden konfiguration per app, inte två motorer.
4. **Jämförelsetester.** Befintliga 300 scenarier per app ska fortfarande vara gröna mot de nya legacy-filerna. Lägg till lönearter i generatorn så att slumpade scenarier också använder registret (alla 33 arter ska förekomma). Ett test kontrollerar att registret i `packages/core/lon` är identiskt med registret i båda legacy-filerna. Motprov som i 1b.
5. **Paus:** visa testresultat och avvikelselista innan rapporten.
6. Rapport `docs/faser/fas-1b2.md`. Push först när ägaren godkänt.

## Regler

- Inga riktiga personuppgifter i repot. Sök igenom diffen före varje commit.
- Inga tankstreck i text.
- `npm run ci` grönt före push.
