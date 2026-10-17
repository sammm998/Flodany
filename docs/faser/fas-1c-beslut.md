# Fas 1c: ägarens beslut om fynden (2026-10-11)

Regeln för fas 1 gäller: inga logikändringar. Alla fynd a till g behålls exakt som i legacy och låses av testerna. De rättas på plattformen i fas 3, med ett test per fynd som först visar felet.

Prioritet i rapporten (lägg dem under rubriken "Kända fel att rätta"):

1. a. Fakturanummer kan återanvändas. Lagkrav: en faktura ska ha ett löpnummer som unikt identifierar den (mervärdesskattelagen 2023:200, 17 kap). Makulerade nummer får aldrig delas ut igen. Hög prioritet.
2. f. Felaktiga åtgärder kraschar. På plattformen tar servern emot anrop direkt, så varje åtgärd ska kontrollera läget och ge ett tydligt fel. Måste vara klart i fas 2, innan API:t öppnas.
3. c. Momsfakturan ligger kvar när betalningen ångras. Ej skickad: ta bort. Skickad: kreditfaktura. Hög prioritet.
4. b. En tom månad blockerar bokföringen. En månad utan verifikationer ska kunna låsas, och meddelandet ska säga vad som är fel. Medel.
5. g. SIE ändrar text tyst. Behåll CP437, men visa en varning med vilka tecken som byttes. Låg.
6. e. Betalningsvillkor 0 blir 10 dagar. Låg.
7. d. Momsfakturan dateras vid registreringen. Behålls, det är fakturans utfärdandedatum. Ingen åtgärd, men nämn det.

Övrigt:
- Byt `as unknown as Periodsumma` i motor.ts rad 210 mot ett typat objekt, utan att ändra beräkningen. Testerna ska vara gröna efteråt.
- Nämn i rapporten att planens filer faktura.ts, atgarder.ts, bokforing.ts och sie.ts blev en motor.ts, och att uppdelningen görs i fas 3.
- docs/faser/fas-1c-tillagg.md och den här filen följer med i rapportens commit.

Skriv sedan docs/faser/fas-1c.md, kör npm run ci, committa och pusha. Visa CI-resultatet från GitHub när det är klart.
