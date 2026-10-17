# Fas 2.0 punkt 3: förkrav per åtgärd i foliering (fynd f)

Godkänd av ägaren 2026-10-11, med besluten under Frågor till ägaren.

## Vad som är gjort

- I legacy skyddades åtgärderna bara av att knappen inte visades. Servern tar emot anrop direkt, så nu kontrollerar varje åtgärd läget först.
- Kontrollen sker i `packages/core/foliering/forkrav.ts`.
- Ett anrop i fel läge kastar `AtgardsFel` med en kod och en svensk text. Ingenting ändras eller sparas då.
- Koderna är:
  - `saknas`: ärendet, raden, priset eller försäkringsbolaget finns inte.
  - `fel_lage`: åtgärden går inte i ärendets läge.
  - `ogiltigt`: fel fält eller fel format.
- **Grundregel:** en åtgärd är tillåten när legacy visar knappen eller fältet för den. Källan är `viewArende` och `viewBokforing` i `legacy/apps/foliering/index.html`.
- Själva beräkningarna är inte ändrade. Motorn utan förkrav ger fortfarande exakt samma resultat som legacy i alla 12 900 slumpade åtgärder och i alla gyllene facit.

## Tabellen

| Åtgärd | Förkrav | Legacy visar knappen när |
|---|---|---|
| nyttArende | Inga. | Alltid. |
| egenRad | Offerten är inte fakturerad. | Ingen faktura (raderna är annars låsta). |
| taBortRad | Offerten är inte fakturerad. Raden finns. | Ingen faktura, en knapp per rad. |
| laggTillPris | Offerten är inte fakturerad. Priset finns i prislistan. | Ingen faktura, val ur prislistan. |
| radFalt | Offerten är inte fakturerad. Raden finns. Fältet är text, antal eller à-pris. | Ingen faktura, ett fält per rad. |
| offertSkickad | Status utkast. Offerten har minst en rad. | Status utkast och minst en rad. |
| godkand | Status utkast eller skickad. | Samma. |
| avslag | Status skickad eller godkänd. | Samma. |
| ateroppna | Status avslag. | Samma. |
| offertPaminnelse | Status är inte utkast. Offerten har minst en rad. | Mejlknappen för offerten när status inte är utkast. Den är avstängd utan rader. |
| skapaFaktura | Ingen faktura. Status utkast, skickad eller godkänd. Minst en rad. | Samma. |
| fakturaSkickad | Fakturan finns. | Mejlknappen för fakturan. |
| paminnelseNoterad | Fakturan finns och är inte betald. | Påminnelseknappen när fakturan inte är betald. |
| betald | Fakturan finns och är inte betald. Betaldatum är ett giltigt datum, om det anges. | Samma. |
| angraBetalning | Fakturan finns och är betald. | Samma. |
| makulera | Fakturan finns och är inte betald. | Samma. |
| skapaMoms | Fakturan är betald. Ingen momsfaktura. Fordonsägaren är ifylld. | Samma. Knappen är avstängd utan fordonsägare. |
| momsSkickad | Momsfakturan finns och väntar inte på försäkringsbolagets betalning. | Mejlknappen är avstängd medan momsfakturan väntar. |
| momsBetald | Momsfakturan finns, är skickad och är inte betald. Datumet är giltigt. | Skickad och inte betald. |
| angraMomsBetalning | Momsfakturan finns och är betald. | Se fråga 2. |
| anteckning | Texten är inte tom. | Legacy gjorde ingenting med tom text. |
| valtFalt | Fältet är storlek, försäkringsbolag, skadedatum, offertdatum, giltig till, fakturadatum, förfallodatum eller utfört. Offertens fält kräver att offerten inte är fakturerad, och fakturans fält att fakturan finns. Storleken är vanlig eller större, försäkringsbolaget finns och datumen är giltiga eller tomma. | Samma fält som i legacy. Offertens fält är avstängda när offerten är fakturerad. |
| textFalt | Fältet är reg nr, skadenummer, fordonsägare, bilnummer eller notering. | Samma fält som i legacy. |
| spara, regAndrat | Ärendet finns. | Alltid. |
| manuellVerifikation | Perioden (ÅÅÅÅ-MM) är inte låst. Texten, datumet och balansen ger meddelanden som förut. | Formuläret visas bara för en öppen period. |
| exporteraPeriod | Perioden är den första öppna, månaden är slut och det finns inga röda punkter under Kontroll. En tom eller obalanserad period ger meddelanden som förut. | Knappen är avstängd om månaden inte är slut, om det finns röda punkter, om perioden är tom eller om den inte balanserar. |

**Säkerhet:** `valtFalt` och `textFalt` skrev förut till vilket fält som helst, till exempel `status` eller `faktura.nr`. Nu går bara de fält som legacy visar att ändra.

## Vad som ändras i beteende

Underlaget är de 300 slumpade scenarierna från fas 1c, 12 900 åtgärder i samma ordning som förut. För varje steg prövas förkraven, och kolumnen "Förut" visar vad steget gjorde i legacy.

| Antal | Åtgärd | Förut | Nu |
|---:|---|---|---|
| 202 | betald, angraBetalning, makulera, fakturaSkickad, paminnelseNoterad, skapaMoms utan faktura. momsBetald, angraMomsBetalning, momsSkickad utan momsfaktura. | Kastade TypeError | Ärendet har ingen faktura (eller momsfaktura). |
| 1127 | skapaFaktura utan rader | Skapade en faktura på 0 kr | Offerten har inga rader. |
| 501 | offertSkickad utan rader | Markerade som skickad | Offerten har inga rader. |
| 25 | offertSkickad i annat läge än utkast | Ändrade status tillbaka till skickad | Bara en offert som är utkast kan markeras som skickad. |
| 25 | skapaFaktura när faktura finns | **Skrev över fakturan med ett nytt nummer.** Den gamla fakturan försvann ur ärendet. | Ärendet har redan en faktura. |
| 91 | makulera betald faktura | Makulerade en betald faktura | En betald faktura kan inte makuleras. Ångra betalningen först. |
| 182 | skapaMoms utan fordonsägare | Skapade momsfaktura till tom mottagare | Fyll i fordonsägare först. |
| 16 | skapaMoms innan försäkringsbolaget betalat | Skapade momsfaktura | Momsfakturan skapas när försäkringsbolaget har betalat. |
| 5 | skapaMoms när momsfaktura finns | Skrev över momsfakturan | Ärendet har redan en momsfaktura. |
| 174 | momsBetald på oskickad momsfaktura | Registrerade betalningen | Momsfakturan är inte skickad. (Se fråga 1.) |
| 2 + 4 + 7 | betald, momsBetald och paminnelseNoterad på redan betald faktura | Skrev över betaldatum och historik | Redan betald. |
| 15 + 6 | angraBetalning och angraMomsBetalning när inget var betalt | Skrev "Betalning ångrad" i historiken | Inte betald. |
| 184 | offertPaminnelse utan rader | Noterade påminnelse | Offerten har inga rader. |
| 149 + 149 + 27 | taBortRad och radFalt på rad som inte finns, laggTillPris med okänt pris | Sparade utan ändring, eller gjorde inget | Raden (priset) finns inte. |
| 4 | Ändringar av offertrader och storlek när offerten är fakturerad | Ändrade den låsta offerten | Offerten är låst eftersom den är fakturerad. |
| 59 | valtFalt försäkringsbolag som inte finns | Sparade ett okänt id | Försäkringsbolaget finns inte. |
| 32 | anteckning med tom text | Inget | Skriv en text. |
| 34 | manuellVerifikation i låst period | Lade till en verifikation i en låst period (19) eller gav meddelande (15) | Perioden är låst. |
| 76 | exporteraPeriod på annan än första öppna eller på låst period | Inget | Bara den första öppna perioden kan exporteras, eller: Perioden är redan låst. |
| 95 | exporteraPeriod innan månaden är slut | Exporterade och låste (37) eller gav meddelande (58) | Månaden är inte slut. |
| 12 | exporteraPeriod med röda punkter | Exporterade och låste (3) eller gav meddelande (9) | Rätta de röda punkterna under Kontroll först. |

Alla åtgärder som förkraven släpper igenom ger exakt samma resultat som legacy. Ingen av dem kraschar.

## Tester

- `packages/core/foliering/jamforelse.test.ts`:
  - Kör de 300 slumpade scenarierna som förut och jämför med legacy.
  - Visar att alla 202 steg som kastar i legacy nekas.
  - Visar att inget steg som släpps igenom kastar.
  - Skriver ut statistiken ovan.
- `packages/core/foliering/forkrav.test.ts`:
  - Varje åtgärd har ett förkrav.
  - Varje regel testas med ett fall som går igenom och ett som nekas. Ett nekat anrop lämnar tillståndet orört.
  - De 300 scenarierna körs med förkraven på, och motorn kastar aldrig något annat än `AtgardsFel`.
- Gyllene facit är oförändrade.
- `npm run ci`: 1377 tester gröna.

## Frågor till ägaren och beslut (2026-10-11)

1. **Momsbetalning före "skickad".** Legacy visar "Markera betald" för momsfakturan först när den är markerad som skickad. Om fordonsägaren betalar innan dess måste man först notera den som skickad. Förslag: behåll, som i legacy.
   **Beslut: nej, momsfakturan måste vara skickad först.**
2. **Ångra momsbetalning.** Legacy visar "Ångra betald" även på en momsfaktura som inte är skickad och inte betald, vilket bara skriver en felaktig rad i historiken. Förslag: kräv att den är betald.
   **Beslut: ja, den måste vara betald.**
3. **Påminnelse om offert** går i legacy även när ärendet är fakturerat eller har fått avslag (mejlknappen finns kvar). Förslag: behåll nu och ta upp det i fas 3 när skärmen byggs.
   **Beslut: behåll som legacy, tas upp i fas 3.**
4. **Ta bort ärende** (`delA` i legacy) finns inte i motorn och raderar direkt i databasen. På plattformen blir det en egen åtgärd med förkrav. Förslag: ett ärende med faktura kan inte tas bort. Byggs i 2d tillsammans med serverfunktionen.
   **Beslut: enligt förslaget.**

Fynden a, b, c, e och g är inte rörda. De rättas i fas 3.
