# Fas 1b2: ägarens beslut om avvikelserna (2026-10-11)

1, 2, 3, 8 och 9: godkänns enligt förslaget.

4: Godkänns som löst för Tripkassan. Lägg till ett test som låser att Åkarkassans gamla regel och den nya ger samma hittills i år med Åkarkassans utbetalningsdag, även för december. Skriv i rapporten varför felet inte kan uppstå i Åkarkassan.

5: Behålls exakt som i legacy och låses av ett test. Rättas i lönefasen med ett test som först visar felet. Kontroll 2026-10-11: ingen förare i Åkarkassans riktiga data har lönemodell "ingen" eller slutdatum, så det påverkar inte lönerna i dag. Rutin tills det är rättat: sätt inte lönemodell "ingen" eller slutdatum på en förare i Åkarkassan som har lönearter samma månad. Skriv rutinen i rapporten.

6: Behålls, tas upp i lönefasen. Lås beteendet med ett test.

7: Oförändrat, rättas i lönefasen.

Commit 8f26535 som är röd ensam är godkänd eftersom den pushas tillsammans med nästa commit. Pusha aldrig en röd commit ensam.

Skriv sedan docs/faser/fas-1b2.md, kör npm run ci, committa (den här filen följer med) och pusha. Visa CI-resultatet från GitHub.
