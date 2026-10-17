# Incidentrapport: personuppgifter skickade utan behov (MALL)

[Datum] · [Författare]

> Mall byggd på en verklig incidentbedömning. Alla namn, bolag och datum är påhittade. Fyll i fälten inom hakparentes.

## Sammanfattning

Den [datum] skickade kundservice fullständiga personnummer för två förare till en beställare, trots att beställaren bara bad om födelsedatum. De fyra sista siffrorna lämnades alltså ut utan behov.

- **Klassning:** personuppgiftsincident (obehörigt röjande, art. 4.12 GDPR), i liten omfattning.
- **Risk:** låg. Mottagaren är ett känt taxiföretag, uppgifterna gick till en mottagare och syftet var en legitim säkerhetskontroll.
- **Anmälan till IMY:** krävs inte, eftersom incidenten sannolikt inte medför risk för de registrerade (art. 33.1). Incidenten dokumenteras enligt art. 33.5.
- **Information till förarna:** krävs inte enligt art. 34, men förarna bör få veta av hänsyn.

## Vad hände

| Tid | Händelse |
| --- | --- |
| [datum kl.] | [Beställare AB] beställer transport och ber av säkerhetsskäl om förarnas namn, födelsedatum, nationalitet och registreringsnummer. |
| [datum kl.] | Kundservice svarar med namn, fullständigt personnummer, mobilnummer och nationalitet. Mailet skickas okrypterat. |
| [datum] | Körningen genomförs. |
| [datum] | Mailet upptäcks vid genomgång av kundmail. |
| [datum] | Incidenten bedöms och dokumenteras. |

## Berörda uppgifter och registrerade

| Uppgift | Begärd av beställaren | Skickad |
| --- | --- | --- |
| Hela namnet | Ja | Ja |
| Födelsedatum | Ja | Ja, som del av personnumret |
| Personnumrets fyra sista siffror | Nej | Ja |
| Nationalitet | Ja | Ja |
| Mobilnummer | Nej | Ja |
| Bilarnas registreringsnummer | Ja | Ja |

## Rättslig bedömning och risk

- **Laglig grund för utlämnandet:** berättigat intresse (art. 6.1 f).
- **Uppgiftsminimering (art. 5.1 c):** åsidosatt. Födelsedatum räckte.
- **Personnummer (3 kap. 10 § dataskyddslagen):** får behandlas utan samtycke bara när det är klart motiverat.
- **Säkerhet (art. 32):** personnummer skickades i okrypterat mail.

**Riskbedömning: låg.**

## Åtgärder

- [ ] Be mottagaren radera mailet och bekräfta skriftligt.
- [ ] Informera förarna muntligt.
- [ ] Radera personnumren ur mailet i Skickat.
- [ ] Gå igenom rutinen nedan med kundservice.
- [ ] Spara rapporten med behandlingsförteckningen.

## Rutin framåt: föraruppgifter till beställare

1. Skicka bara exakt det beställaren ber om.
2. Födelsedatum skrivs som ÅÅÅÅ-MM-DD, utan de fyra sista siffrorna.
3. Kräver beställaren fullständigt personnummer: fråga föraren först och lämna det per telefon.
4. Fråga alltid föraren innan uppgifter lämnas ut.
5. Är du osäker, fråga VD innan du skickar.

## Källor

- [Art. 4, 5, 32, 33 och 34 GDPR](https://www.privacy-regulation.eu/sv/33.htm)
- [Dataskyddslagen (2018:218) 3 kap. 10 §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2018218-med-kompletterande-bestammelser_sfs-2018-218/)
- [IMY: Personuppgiftsincidenter](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/personuppgiftsincidenter/)
