# Intresseavvägning [Bolaget AB]

Sep 28, 2026 · [Författare]

## Slutsats

[Bolaget AB] får stödja sig på berättigat intresse (art. 6.1 f GDPR) både för AI-stöd i kundservicen och för inspelning av samtal, under förutsättning att skyddsåtgärderna i avsnitt 5 följs.

| Behandling | Berättigat intresse väger tyngre? | Avgörande villkor |
| --- | --- | --- |
| AI-stöd i kundservice via e-post | Ja | Människa granskar varje svar, ingen träning, radering inom 30 dagar, information i integritetspolicyn |
| Inspelning av samtal till växeln | Ja | Meddelande i början av samtalet, lagring högst 24 månader, behörighet bara för VD och kundservice |
| Hälsouppgifter som kunder lämnar | Art. 6.1 f räcker inte | Kräver också undantag i art. 9.2, se avsnitt 4 |

## 1. AI-stöd i kundservice via e-post

AI tar fram svarsutkast på kundmail till [info@bolaget.se] via Make och Anthropic. Kundservice granskar och skickar varje svar manuellt.

**Steg 1: Berättigat intresse**

- Snabbare och mer enhetliga svar till kunderna.
- Minskad arbetstid: kundservice lägger i dag cirka 50 timmar i månaden på mail.
- Färre felaktiga priser, eftersom utkasten bygger på prislistan.

**Steg 2: Nödvändighet**

- AI:n får bara det mail som kunden själv har skickat, inga andra register.
- Målet kan inte nås lika effektivt utan att mailet läses av AI:n.
- Mindre ingripande alternativ, till exempel färdiga svarsmallar, ger sämre precision men finns kvar som reserv.

**Steg 3: Avvägning mot kundens intressen**

| Faktor | Bedömning |
| --- | --- |
| Kundens förväntan | Kunden förväntar sig att mailet läses och besvaras. Att ett verktyg hjälper till är rimligt om det framgår av policyn. |
| Typ av uppgifter | Vanliga kontakt- och reseuppgifter. Hälsouppgifter kan förekomma oombett, se avsnitt 4. |
| Automatiska beslut | Nej. Varje svar granskas av en människa (art. 22 gäller inte). |
| Tredjeland | USA via standardavtalsklausuler. Risk för myndighetsåtkomst finns men är begränsad, eftersom uppgifterna raderas inom 30 dagar. |
| Träning | Anthropic tränar inte på uppgifterna. |
| Kundens möjligheter | Kan invända (art. 21) eller ringa i stället för att maila. |

**Resultat:** intresset väger tyngre. Intrånget i kundens integritet är litet, och skyddsåtgärderna är starka.

## 2. Inspelning av samtal till växeln

Samtal till [växelnummer] spelas in i Telavox och sparas i 24 månader.

**Steg 1: Berättigat intresse**

- Kunna visa vad som avtalades vid en bokning, till exempel tid, adress och pris.
- Reda ut reklamationer och tvister, även de som går vidare till ARN.
- Följa upp och förbättra servicen i växeln.

**Steg 2: Nödvändighet**

- Muntliga bokningar lämnar annars inget säkert underlag.
- Anteckningar i TaxiCaller är ett mindre ingripande alternativ, men visar inte vad som faktiskt sades.
- Lagringstiden 24 månader täcker ARN:s frist på ett år från första klagomålet plus handläggningstid. Kortare lagring övervägs vid omprövning.

**Steg 3: Avvägning mot den som ringer**

| Faktor | Bedömning |
| --- | --- |
| Förväntan | Inspelning av kundsamtal är vanligt, men bara rimligt att förvänta sig om den som ringer informeras i början av samtalet. |
| Typ av uppgifter | Röst, telefonnummer och samtalets innehåll. Hälsouppgifter kan förekomma, till exempel behov av rullstol. |
| Åtkomst | Bara VD och kundservice. Inspelningar lyssnas bara på vid ett konkret ärende. |
| Kundens möjligheter | Kan boka via appen eller mail i stället, och kan invända (art. 21). |

**Resultat:** intresset väger tyngre, men bara om meddelandet om inspelning spelas upp i växeln. Utan det meddelandet håller inte avvägningen.

## 4. Hälsouppgifter som kunder själva lämnar

När en kund berättar att hen behöver rullstol, rullator, ledsagning eller hjälp in i bilen är det en uppgift om hälsa. Då krävs både en grund i art. 6 och ett undantag i art. 9.2.

- **Grund i art. 6:** avtal (art. 6.1 b). Uppgiften behövs för att skicka rätt bil.
- **Undantag i art. 9.2:** uttryckligt samtycke (art. 9.2 a). Kunden lämnar uppgiften själv, i syfte att få en anpassad resa. Samtycket blir uttryckligt när kunden själv skriver eller säger behovet och ber oss ta hänsyn till det.
- **Begränsning:** uppgiften används bara för den aktuella bokningen, förs vidare till föraren bara så långt den behövs (t.ex. "rullstol, behöver ramp") och sparas inte i något kundregister.
- **Kundservice frågar aldrig** efter diagnos eller orsak, bara efter vilket hjälpmedel eller vilken hjälp som behövs.
- **Återkallelse:** kunden kan när som helst be oss radera uppgiften.

Detta är den mest osäkra delen av bedömningen. Stäm gärna av den med en jurist eller revisor, särskilt om ni börjar köra färdtjänst eller sjukresor, då regionen eller kommunen normalt är ansvarig.

## 5. Skyddsåtgärder och omprövning

Bedömningarna ovan gäller bara så länge dessa skyddsåtgärder finns.

- [ ] Integritetspolicyn är publicerad på [bolaget.se] och nämner AI-stöd, inspelning och överföring till USA.
- [ ] Meddelandet om inspelning spelas upp i Telavox-växeln.
- [x] Inga AI-svar skickas automatiskt, kundservice granskar alla.
- [x] Anthropic raderar inom 30 dagar och tränar inte på uppgifterna.
- [x] Gallring: kundmail och inspelningar 24 månader.
- [ ] Tvåstegsinloggning på Make, one.com och Telavox.

**Omprövning:** varje år i september, och direkt om något av följande händer: automatiskt utskick av svar införs, fler inkorgar kopplas på, ny AI-leverantör eller ny växel.

## Källor

- [Art. 6, 9, 21 och 22 GDPR (svensk text)](https://www.privacy-regulation.eu/sv/6.htm)
- EDPB:s riktlinjer 1/2024 om behandling på grundval av berättigat intresse (edpb.europa.eu)
- [IMY: Intresseavvägning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/rattslig-grund/intresseavvagning/)
- [ARN: anmälan inom ett år](https://www.arn.se/Konsument/Innan-du-anmaler/)
- [Telavox: lagring av inspelade samtal](https://support.telavox.com/sv_SE/installningar/samtalsinspelning)
