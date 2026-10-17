# Fas 1c: tillägg till planen (ägarens granskning 2026-10-11)

Planen är godkänd med dessa fem tillägg:

1. I legacy-sandboxen ersätts även Date.now, new Date() och Math.random med samma fasta värden som den nya koden får, så att id och tidsstämplar blir lika. Jämförelsen får inte hoppa över id-fält.
2. Kör alla foliering-tester med TZ=Europe/Stockholm satt i testet, inte i datorn. Lägg till gyllene facit för 31 dec till 1 jan, sista mars (sommartid) och sista oktober (vintertid), med förfallodag och påminnelse över skiftet.
3. Gyllene facit för fakturanumrering: makulera den högsta fakturan och skapa en ny, serie.nasta lägre än högsta nr, och momsfakturans M-nummer efter makulering.
4. BOK_START = '2026-08' och kontoplanen tas med i avvikelselistan.
5. Testdata för bank, kontoutdrag och leverantörsfakturor behövs inte i 1c. Ta bara med det som 1c använder.

Övrigt enligt planen.
