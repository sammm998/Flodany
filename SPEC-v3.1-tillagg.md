# Flödia · Tillägg v3.1 till bygg- och designspecifikationen

Version 3.1 · 2026-10-11 · Gäller tillsammans med `Bolagsappar-bygg-och-designspec-v3.pdf`

**Till Claude Code.** Tillägget ändrar byggordningen i v3 och lägger till tre saker som saknas där: ett modulkit som gör att nya branscher kan byggas på 14 dagar, leveransprocessen från arbetsdag till app i drift, och modulen Inkorg (mejlautomation med AI-utkast) som är en kärnprodukt för alla branscher. Där tillägget och v3 säger olika saker gäller tillägget. Allt annat i v3 gäller oförändrat.

---

## 1. Vad som ändras mot v3

| Område | v3 | v3.1 |
|---|---|---|
| Första version | Fas 0 till 8 | **Version 1** = fas 0 till 3 plus en minimal fas 4 (se avsnitt 2). Resten byggs när kunder betalar. |
| Inloggning | BankID från start | Inloggningslänk via e-post i version 1. BankID i version 2. Gränssnittet ska vara byggt så att BankID kan läggas till utan att ändra kontomodellen. |
| Mobil | Expo-app | Version 1 är en webbapp som fungerar bra i mobilen (PWA, installerbar). Expo i version 2. |
| Betalning | Stripe och Fortnox | Version 1: manuell faktura. Plattformen loggar licenser och användning så att fakturaunderlaget kan tas fram som Excel. |
| Appbutik | Ingår i fas 4 | Version 2. I version 1 slår Flödia på moduler i admin. |
| Nya branscher | Nämns som branschsidor | **Modulkit och leveransprocess**, avsnitt 3 till 6. |
| Datamodell | `documents` som JSON | Behålls i version 1. Efter version 1 får avräkning, lön och ärenden egna tabeller (avsnitt 8). |
| Lön | Beräkning | Även AGI-export, lönefil till bank och ansvarsgräns (avsnitt 9). |
| Prissättning | Fast pris "från [PRIS] kr" på hemsidan | Pris sätts per kund efter arbetsdagen, utifrån sparad tid och kvalitet. Hemsidan visar ingen prislista (avsnitt 12). `licenses.price` sätts per konto. |
| Mejlautomation | Finns inte (görs i Make utanför plattformen) | **Modulen Inkorg** byggs i version 1 som fas K (avsnitt 11). Make används inte för kunder. |
| Sociala medier | Finns inte | **Modulen Sociala medier** planeras för version 2 (avsnitt 13). Förberedelser görs redan i version 1. |
| Var motorerna körs | Filer läses i webbläsaren | Filer **läses** i webbläsaren, men parsrar och motorer **körs bara på servern** (avsnitt 16). |
| Kundens varumärke | Varumärke per kund | Nivåer för kundens varumärke, egen adress och egen domän (avsnitt 15). |
| AI-assistent i plattformen | Guidetexter och hjälp per vy | **Assistenten** (avsnitt 14): hjälpassistent i version 1 (fas A), dataassistent i version 2. |

---

## 2. Ny byggordning

### Version 1: det som säljs till de första kunderna

| Fas | Innehåll | Klart när |
|---|---|---|
| 0 Grund | Enligt v3 | Enligt v3 |
| 1 Motorer | Enligt v3, plus `packages/kit` med kontrakten i avsnitt 3 | Jämförelsetester mot legacy är gröna. Varje motor följer motorkontraktet. |
| 2 Kärnan | Enligt v3 men e-postlänk i stället för BankID | Testet "konto A kan aldrig läsa konto B" är grönt. |
| 3 Avräkning | Enligt v3 | En hel månad på syntetisk data, från filer till åkarens vy. |
| 4a Nätverk, minimal | Bjud in åkare via e-post, Min avräkning, Förarlista och Mina förare. Moduler slås på i admin. | En åkare kan bjudas in, logga in och läsa sin avräkning i mobilen. |
| K Inkorg | Bygg modulen Inkorg (avsnitt 11) med kitet. Den är både bevis för kitet och en säljbar produkt. | Enligt avsnitt 7 och 11.9. |
| A Hjälpassistent | Assistenten steg 1 (avsnitt 14), byggd på `AI-utkast` från fas K och guidetexterna | Enligt avsnitt 14.6. |

Fas K är beviset för att affärsidén håller. Ändras plattformen för att få modulen att fungera ska kitet förbättras och fasen göras om.

### Version 2: när minst [ANTAL] externa kunder betalar

BankID, Expo-appen, appbutiken med tillval, Stripe och Fortnox, Åkarkassan för underkund (fas 5), Verkstad och Skadeflöde på plattformen, modulen Sociala medier (avsnitt 13), dataassistenten (avsnitt 14 steg 2).

---

## 3. Modulkit (`packages/kit`)

En ny modul ska byggas av färdiga byggblock och konfiguration, inte av ny plattformskod. Kitet är det som gör att löftet om 14 dagar går att hålla.

### 3.1 Byggblocken

| Block | Vad det gör | Konfigureras med |
|---|---|---|
| `Register` | Lista, sök, skapa, ändra och arkivera poster (kunder, objekt, anställda, bilar) | Fältschema (zod), kolumner, sökfält, behörighet per roll |
| `Formulär` | Inmatning med validering och svenska felmeddelanden | Samma fältschema |
| `Filimport` | Dra-in-ytan från v3 sid 11 | Lista med parsrar enligt parserkontraktet |
| `Period` | Månad eller annan period med status öppen, godkänd, publicerad | Periodtyp (månad, vecka, uppdrag) |
| `Beräkning` | Kör en motor och visar resultatet i tabell och nyckeltal | Motor enligt motorkontraktet |
| `Kontroll` | Avvikelser med förklaring i klartext och "Markera som kontrollerad" | Regler (avsnitt 3.4) |
| `Godkänn` | Låser perioden, versionering vid rättelse med orsak | Vilka roller som får godkänna |
| `Publicera` | Delar data nedåt till underkunder (`shares`) | Vad som delas, matchning mot underkund |
| `Ärendeflöde` | Status från ny till klar, med nästa steg per status och påminnelser | Statuslista, övergångar, påminnelseregler |
| `Export` | PDF, Excel, CSV och SIE | Mall per dokument |
| `Notis` | Notis i appen och e-post | Händelse och text |
| `AI-utkast` | Utkast som en människa granskar och skickar, aldrig automatiskt | Promptmall, vilka fält som får skickas till AI |
| `Guide` | Välkomstguide, kom-igång, hjälppanel och filhjälp enligt v3 | Guidefil per variant |

Kräv att varje block har exempeldata-läge, tomt läge, laddning och felläge, och fungerar i 375 och 1280 punkters bredd.

### 3.2 Parserkontrakt

```ts
export interface FileParser<T> {
  key: string;                       // 'tc', 'bamb', 'ldl' ...
  label: string;                     // visas för användaren
  accepts: ('pdf' | 'csv' | 'xlsx' | 'txt')[];
  detect(input: FileInput): number;  // 0 till 1, hur säker parsern är på att filen är dess
  parse(input: FileInput): ParseResult<T>;
  fixtures: string[];                // påhittade testfiler i packages/core/<modul>/fixtures
}
export interface ParseResult<T> {
  data: T;
  period?: string;                   // 'ÅÅÅÅ-MM' om filen avslöjar perioden
  summary: string;                   // "1 284 körningar, 61 bilar, oktober 2026"
  warnings: string[];                // svenska, skrivna som hjälp
}
```

Filigenkänningen i `packages/core/filetypes` frågar alla parsrar i modulen och väljer den med högst `detect`. Under 0,6 visas frågan "Vilken fil skulle det vara?".

### 3.3 Motorkontrakt

```ts
export interface Engine<Input, Config, Output> {
  key: string;
  version: string;                   // höjs vid varje ändring av resultatet
  compute(input: Input, config: Config): Output;  // ren funktion, inga sidoeffekter, ingen klocka, inget nätverk
}
```

Regler: samma indata ger alltid samma utdata. Konstanter som ändras över tid (skattesatser, avgifter, priser) kommer in via `config` med giltighetsdatum. Varje motor har gyllene tester: indatafil, förväntat resultat. Ett ändrat resultat kräver att ägaren godkänner diffen.

### 3.4 Kontrollregler

```ts
export interface Rule<Output> {
  key: string;
  level: 'fel' | 'varning' | 'info';
  check(current: Output, previous?: Output): Finding[];  // Finding = { title, detail, rows, amount? }
}
```

Standardregler i kitet som varje modul kan slå på: förändring mot förra perioden över X procent, rad som saknar koppling, summa som skiljer mot facit, dubblett.

---

## 4. Modulspecifikation (`module.spec.yaml`)

Arbetsdagen hos kunden ska resultera i en ifylld modulspecifikation. Claude Code bygger modulen från den. Mallen ligger i `packages/kit/templates/module.spec.yaml`.

```yaml
kund: "[Kundens namn AB]"
bransch: stadfirma
modul:
  key: tidrapport
  namn: Tidrapport och fakturaunderlag
  kontotyp: direct            # direct, main eller main+sub
roller:
  - { roll: Admin,   gor: "Ställer in kunder, priser och personal" }
  - { roll: Ekonomi, gor: "Läser in tidrapporter, kontrollerar, skapar fakturaunderlag" }
  - { roll: Personal, gor: "Ser sina egna pass i mobilen" }
register:
  - kunder: [namn, orgnr, adress, timpris, fakturaperiod]
  - personal: [namn, anstallningsform, timlon]
filer:
  - { key: tidappen, namn: "Export från tidappen", format: csv, kravs: true,
      exempel: fixtures/tid-exempel.csv, var: "[Var i tidappen]" }
berakning:
  beskrivning: "Timmar per kund och månad gånger timpris, plus material"
  regler:
    - "Helgtimmar debiteras med 50 % påslag"
    - "Avrunda varje pass till närmaste kvart"
kontroller:
  - "Kund utan timpris"
  - "Fler än 12 timmar på ett pass"
utdata:
  - { typ: excel, namn: "Fakturaunderlag per kund" }
  - { typ: pdf,   namn: "Specifikation till kund" }
period: manad
personuppgifter: [namn, arbetstid]     # styr GDPR-kontrollen i avsnitt 6
volymer: { kunder: 40, personal: 12, rader_per_manad: 900 }
utanfor_scope:
  - "Lön till personalen"
  - "Koppling till Fortnox (tillval senare)"
```

Exemplet är påhittat och visar formatet. Modulspecifikationen för Inkorg finns i avsnitt 11.8.

---

## 5. Leveransprocess: arbetsdag till app i drift på 14 dagar

| Dag | Vem | Vad | Resultat |
|---|---|---|---|
| 0 | Kund | Bokar via /boka | Bekräftelse inom en arbetsdag |
| 1 | Flödia på plats | Arbetsdagen enligt kartläggningsmallen (avsnitt 5.1). Samlar exempelfiler. | Anteckningar och exempelfiler |
| 2 | Flödia | Fyller i `module.spec.yaml`, skapar påhittade testfiler med samma struktur som kundens | Modulspecifikation och förslag med fast månadspris |
| 3 | Kund | Godkänner modulspecifikationen och avtalet, inklusive biträdesavtal | Signerat avtal. **Bygget startar inte utan det.** |
| 3 till 7 | Claude Code, granskat av Flödia | Bygger modulen med kitet. Tester på påhittad data. | Modul i testmiljö |
| 8 | Kund och Flödia | Demo i testmiljön med exempeldata | Lista med justeringar |
| 9 till 11 | Claude Code | Justeringsrunda 1 | Uppdaterad modul |
| 12 | Kund | Testar med sina riktiga filer i sitt eget konto i produktion | Godkännande eller justeringsrunda 2 |
| 13 | Flödia | Utbildning, 60 minuter, inspelad. Guidetexter och filhjälp ifyllda. | Användarna kan själva |
| 14 | Alla | Drift | Första månadsfakturan |

Riktiga kundfiler hanteras bara i kundens eget konto i produktion. De laddas aldrig upp i repot, i testmiljön eller i en chatt med en AI-assistent.

### 5.1 Kartläggningsmall för arbetsdagen

1. Vilka roller finns och vem gör vad i dag?
2. Visa en vanlig månad från början till slut. Vilka program, Excel-filer, mejl och pärmar används?
3. Vilka filer kommer in, varifrån och när? Ta en exempelfil av varje.
4. Vilka beräkningar görs för hand? Skriv ner reglerna med kundens ord och ett räknat exempel.
5. Vad går oftast fel, och hur upptäcks det i dag?
6. Vad ska komma ut: fakturor, underlag, rapporter, besked till någon?
7. Vem godkänner, och vad händer om något måste rättas i efterhand?
8. Vilka personuppgifter finns i flödet?
9. Volymer per månad.
10. Hur mycket tid tar det i dag? (Blir kundcaset.)

### 5.2 Vad som ingår i månadspriset

| Ingår | Ny modul eller tillägg [PRIS] |
|---|---|
| Två justeringsrundor under leveransen | Ny datakälla eller ny filtyp efter driftstart |
| Rättelse av fel i det som står i modulspecifikationen | Ny beräkning eller regel som inte fanns i modulspecifikationen |
| Ändrade texter, kolumner, rapportlayout | Ny roll eller ny kontotyp (till exempel att kunden får underkunder) |
| Uppdatering när en känd filkälla ändrar format | Integration med ett nytt system via API |
| Lagändringar i skatter och avgifter som modulen redan räknar | |

Modulspecifikationen är avtalsbilaga. Det som inte står i den ingår inte.

---

## 6. Krav innan en ny modul får gå i drift

- [ ] Alla block har tomt läge, laddning, felläge och exempeldata-läge.
- [ ] Parsrar har påhittade testfiler och träffsäker `detect`.
- [ ] Motorn har gyllene tester, version satt.
- [ ] Guide: välkomstguide, kom-igång, hjälp per vy och filhjälp ifyllda.
- [ ] Testet "konto A kan inte läsa konto B" körs även för modulens tabeller och delningar.
- [ ] Personuppgifter enligt `personuppgifter` i modulspecifikationen är listade i registerförteckningen, och biträdesavtal finns.
- [ ] Inga riktiga personuppgifter eller kundfiler i repot.
- [ ] End-to-end-test (Playwright) för modulens huvudflöde.
- [ ] Alla texter på svenska, inga tankstreck, belopp i sv-SE.

---

## 7. Fas K: Inkorg, och bevis att kitet räcker

Bygg modulen Inkorg enligt avsnitt 11. Inkorg kräver ett nytt byggblock, `Inkorgskoppling` (avsnitt 11.3), som läggs i `packages/kit` så att andra moduler kan använda det. Allt annat ska byggas med befintliga block. Mät och rapportera till ägaren:

1. Antal rader ny kod i `packages/modules/inkorg` jämfört med ändringar i `packages/kit` och plattformen. Målet: inga ändringar i plattformen, bara det nya blocket i kitet.
2. Vad som i övrigt saknades i kitet och lades till.
3. Hur lång tid bygget tog.

---

## 8. Datamodell efter version 1

`documents` (JSON) behålls för inställningar och modulspecifik data. Följande får egna tabeller med `tenant_id` och radsäkerhet efter version 1, så att rapporter och sökning över perioder går att göra i databasen:

- `settlements` och `settlement_lines` (avräkning per underkund och rad)
- `payroll_runs` och `payroll_lines` (lön per förare och period)
- `cases` och `case_events` (ärenden i verkstad och skadeflöde)

Migreringen görs med jämförelsetest: samma summor före och efter.

---

## 9. Lön: krav som saknas i v3

1. **AGI-export.** Arbetsgivardeklaration på individnivå som fil för uppladdning hos Skatteverket. Tripkassan i legacy har delar av detta, utgå därifrån. Format verifierat, se avsnitt 18.2.
2. **Lönefil till bank.** ISO 20022 pain.001 (kreditöverföring, betalningstyp lön). Innehåller avsändarkonto, mottagarens kontonummer, belopp och utbetalningsdag. Plattformen skapar filen, kunden godkänner betalningen i sin bank. Förarnas kontonummer krypteras i databasen och visas maskerat.
3. **Ansvarsgräns i gränssnittet.** Innan lönekörningen godkänns visas: "Kontrollera lönen innan utbetalning. Du som arbetsgivare ansvarar för lön, skatt och avgifter." Godkännandet loggas i `audit_log`.
4. **Avtal.** Kundavtalet ska innehålla ansvarsbegränsning för beräkningsfel. [Jurist tar fram text.]

---

## 10. Ägarens beslut och kvarvarande frågor

### Beslutat 2026-10-10

| Nr | Fråga | Beslut |
|---|---|---|
| 13 | När byggs version 2? | Mål: 5 till 10 kunder inom 6 månader. Version 2 påbörjas vid **3 betalande externa kunder**. |
| 14, 20 | Priser? | Inga prislistor. Pris sätts per kund efter arbetsdagen, utifrån sparad tid och tillförd kvalitet (avsnitt 12). |
| 15 | Vem granskar Claude Codes arbete? | Ägaren godkänner varje fas. Claude (Cowork) granskar planer, diffar och testresultat som andra par ögon. **Extern säkerhetsgranskning** av radsäkerhet, inloggning och delning innan första kund laddar upp riktiga personuppgifter. |
| 16, 19 | Vem har jour? | Ägaren och två kollegor, med Claude som stöd för felsökning. Supporttider i kundavtalet: [vardagar 08 till 17]. Alla tre får rollen `support` i admin, sekretessavtal och genomgång av `docs/drift.md` innan första kund. |
| 17 | Lönefil till bank? | ISO 20022 pain.001 med betalningstyp lön. Fungerar mot de stora svenska bankerna, så kunden kan ha vilken bank som helst. Plattformen skapar bara filen. Kunden laddar upp och godkänner utbetalningen i sin internetbank med BankID. Format och testfil verifieras mot Taxi Malmös bank i fas 5. |
| 18 | Vad byggs i fas K? | **Modulen Inkorg** (mejlautomation). Pilotkund: Taxi Malmö, som ersätter sitt Make-flöde. |
| 21 | Lagringstid i Inkorg? | 12 månader efter senaste aktivitet i tråden som standard, valbart 3 till 36 månader per kund (avsnitt 11.5). |
| 22 | Egen app hos Microsoft? | Ja. Flödia skapar en egen Microsoft Entra-tenant, registrerar en app för flera organisationer och genomför utgivarverifiering innan första kunden kopplar Microsoft 365. |
| 23 | Sociala medier? | Modul i version 2 (avsnitt 13). Ägaren lär sig flödet manuellt på Taxi Malmös egna kanaler först. Ansökan hos Meta och LinkedIn görs när första kunden är i drift. |
| 24 | AI-assistent i plattformen? | Ja, i två steg (avsnitt 14). Steg 1 hjälpassistent i version 1 som fas A. Steg 2 dataassistent i version 2. Assistenten läser, gör aldrig. |
| 25 | Kundens varumärke i portalen? | Nivå 1 till 3 i version 1, nivå 4 när en kund ber om det, nivå 5 byggs inte (avsnitt 15). Egen domän kan prissättas som tillval. |
| 26 | Hur skyddas koden mot kopiering? | Motorer, parsrar och regler körs bara på servern och skickas aldrig till webbläsaren. Kundavtalet ger licens, inte ägande, och förbjuder kopiering och bakåtkonstruktion (avsnitt 16). |
| 27 | Hur byggs nya projekt? | Artifact bara som skiss i högst två veckor, med ren logik, påhittad data och satser i inställningar. Flyttas till plattformen innan första riktiga lön, faktura eller utbetalning, eller när en andra användare eller kund ska in. När plattformen finns byggs nya kundappar direkt där med modulkitet (avsnitt 17). |
| 28 | Bokföring och deklarationer? | Flödia räknar och stämmer av, kunden lämnar in själv med BankID. Inga avtal eller integrationer med Skatteverket, Fortnox eller banker. AGI-fil byggs i version 1 som del av lönen (fas 3). Momsrutor och avstämningspanel byggs i version 2 (avsnitt 18). |

Krav som följer av beslut 15 och 16:

- Claude Code skriver efter varje fas en kort rapport i `docs/faser/fas-N.md`: vad som byggts, testresultat, kända brister, vad ägaren ska kontrollera.
- Felloggning och larm (till exempel Sentry) ingår i fas 2, så att fel syns innan kunden ringer.
- En runbook i `docs/drift.md`: hur man återställer en säkerhetskopia, spärrar en användare, rättar en publicerad månad och ger supportåtkomst med kundens godkännande.

### Kvarvarande frågor

Inga just nu.

---

## 11. Modulen Inkorg: mejlautomation med AI-utkast

### 11.1 Vad den gör

Kundens inkorg (till exempel info@ eller kundservice@) kopplas till plattformen. Varje nytt mejl sorteras, och plattformen skriver ett svarsutkast utifrån kundens egna priser, rutiner och tidigare svar. En medarbetare granskar, ändrar vid behov och skickar. Svaret går från kundens egen adress, i rätt tråd. Modulen fungerar i alla branscher och är en kärnprodukt i affärsidén.

Kunden ser bara Flödia. Underbiträden som anges i biträdesavtalet: driftleverantören (Supabase, EU) och AI-leverantören (Anthropic). Make används inte.

### 11.2 Flödet

| Steg | Vad som händer | Byggblock |
|---|---|---|
| 1 Hämta | Nya mejl hämtas från den kopplade inkorgen | `Inkorgskoppling` (nytt) |
| 2 Filtrera | Skräppost, nyhetsbrev, autosvar och studsar sorteras bort utan AI | Regler |
| 3 Sortera | AI sätter en kategori ur kundens egen lista, till exempel bokning, pris, kvitto, reklamation, hittegods, faktura, övrigt | `AI-utkast` |
| 4 Underlag | Plattformen hämtar relevanta delar ur kundens svarsunderlag (avsnitt 11.4) | `Register` |
| 5 Utkast | AI skriver ett svar och visar vilka källor i underlaget som användes | `AI-utkast` |
| 6 Granska | Utkastet hamnar i granskningskön. Medarbetaren ändrar, godkänner eller avfärdar. | `Ärendeflöde` |
| 7 Skicka | Svaret skickas från kundens adress som svar i samma tråd | `Inkorgskoppling` |
| 8 Logga | Vem som skickade vad och när sparas i `audit_log` | Kärnan |

**Inget skickas automatiskt i version 1.** Automatiska svar kan i version 2 slås på av kundens admin för enskilda kategorier (till exempel öppettider), och då bara med fasta mallar som kunden själv skrivit.

### 11.3 Nytt byggblock: `Inkorgskoppling`

Läggs i `packages/kit` så att Skadeflöde och framtida moduler kan använda samma koppling.

| Koppling | Version | Hur | Kommentar |
|---|---|---|---|
| IMAP och SMTP | 1 | Kundens admin anger server, adress och ett applösenord. Lösenordet krypteras (Supabase Vault) och visas aldrig igen. | Vanligast hos svenska småföretag (one.com, Loopia, Binero). **Pilotkunden Taxi Malmö har sin e-post hos one.com.** |
| Microsoft 365 | 1 | OAuth via Microsoft Graph med delegerad behörighet till den valda brevlådan (läsa, flytta, skicka). Kundens admin godkänner. Inga behörigheter till hela organisationens brevlådor. | Flödia registrerar en egen app för flera organisationer i en egen Microsoft Entra-tenant och genomför utgivarverifiering, så att kunden inte ser varningen "overifierad utgivare". |
| Gmail och Google Workspace | 2 | OAuth via Gmail API | Google kräver säkerhetsgranskning för appar som läser mejl. Byggs när kunder efterfrågar det. |
| Vidarebefordran | 1, reserv | Kunden vidarebefordrar till en adress hos Flödia. Bara läsning, svaret kopieras till kundens mejlprogram. | För kunder som inte vill ge skrivbehörighet. |

Kontraktet:

```ts
export interface MailConnector {
  kind: 'imap' | 'graph' | 'gmail' | 'forward';
  fetchNew(since: string): Promise<IncomingMail[]>;   // idempotent, dubbletter stoppas med Message-ID
  send(reply: OutgoingReply): Promise<{ messageId: string }>;  // sätter In-Reply-To och References
  markHandled(id: string, folder?: string): Promise<void>;
  health(): Promise<{ ok: boolean; detail: string }>;  // visas för kunden som "Kopplingen fungerar" eller felet i klartext
}
```

### 11.4 Svarsunderlag (kundens kunskap)

Ett register per konto som kunden själv fyller och ändrar: priser, öppettider, rutiner, vanliga frågor, tonläge och signatur. Godkända svar kan sparas som exempel med ett klick. Underlaget används bara för kundens egna utkast och används aldrig för att träna AI-modeller.

Under arbetsdagen (avsnitt 5) fyller Flödia i det första underlaget tillsammans med kunden. Det är den viktigaste delen av leveransen.

### 11.5 Dataskydd och säkerhet

- **Minimering:** bara ämne, brödtext och tråd skickas till AI. Bilagor skickas inte i version 1. Personnummer, kortnummer och bankkontonummer maskeras automatiskt innan texten skickas.
- **Lagring:** mejl och utkast raderas 12 månader efter senaste aktivitet i tråden. Kundens admin kan välja mellan 3 och 36 månader. Statistik sparas utan personuppgifter. Radering på begäran för en enskild avsändare. Inkorg är inget arkiv: kvitton och fakturor som är räkenskapsinformation ska sparas i kundens bokföring, och det ska stå i guiden.
- **AI-leverantören:** ingen träning på data, kort lagring enligt leverantörens villkor. Anges i biträdesavtalet.
- **Mejlinnehåll är data, inte instruktioner.** Text i ett inkommande mejl får aldrig styra vad plattformen gör. AI:n får bara skriva ett utkast, aldrig skicka, radera, vidarebefordra eller lägga till länkar och bilagor som inte finns i svarsunderlaget. Testa detta med påhittade mejl som försöker ge AI:n order.
- **Behörigheter:** Admin kopplar och kopplar bort inkorgen. Handläggare granskar och skickar. Varje skickat svar loggas med användare.
- **Kunden får mallar:** intresseavvägning och integritetspolicy i `docs/` anpassas per kund, med Flödia och Anthropic som biträden i stället för Make.

### 11.6 Skärmar

1. **Granskningskö:** lista med nya utkast, kategori, avsändare, ålder. Äldst först.
2. **Utkast:** mejlet till vänster, utkastet till höger, källor från underlaget under. Knappar: Skicka, Ändra, Skriv om kortare, Avfärda.
3. **Svarsunderlag:** registret i avsnitt 11.4.
4. **Koppling:** status för inkorgen i klartext, "Testa kopplingen".
5. **Statistik:** mejl per kategori och vecka, median för svarstid, andel utkast som skickades utan ändring, uppskattad sparad tid. Det sista blir kundcaset.

Samma designsystem och guidesystem som resten av plattformen (v3 del B).

### 11.7 Guidetexter (utkast)

| Välkomstguide | Kom igång | Hjälp per vy |
|---|---|---|
| 1. Nya mejl får ett svarsförslag direkt. 2. Du granskar och skickar, inget går iväg av sig självt. 3. Förslagen bygger på era egna priser och rutiner. 4. Ju fler svar du godkänner, desto bättre blir förslagen. | 1. Koppla inkorgen. 2. Fyll i priser och öppettider. 3. Lägg till fem vanliga frågor med svar. 4. Granska första utkastet. | Kö: äldst först, rött efter [4] timmar. Utkast: källorna visar varför svaret blev som det blev. Underlag: ändringar gäller från nästa mejl. |

### 11.8 Modulspecifikation

```yaml
kund: "[Kundens namn AB]"
bransch: alla
modul:
  key: inkorg
  namn: Inkorg
  kontotyp: direct            # fungerar även för main
roller:
  - { roll: Admin,       gor: "Kopplar inkorgen, ändrar svarsunderlag och kategorier" }
  - { roll: Handläggare, gor: "Granskar, ändrar och skickar utkast" }
register:
  - svarsunderlag: [rubrik, text, kategori, giltig_till]
  - kategorier: [namn, beskrivning]
kopplingar: [imap, graph, forward]
utdata:
  - { typ: mejl,  namn: "Svar från kundens adress" }
  - { typ: excel, namn: "Statistik per månad" }
personuppgifter: [namn, epost, telefon, mejlinnehåll]
volymer: { mejl_per_manad: "[fylls i]" }
utanfor_scope:
  - "Automatiska svar utan granskning (version 2)"
  - "Bilagor till AI (version 2)"
  - "Gmail (version 2)"
```

### 11.9 Klart när

1. Alla tester i avsnitt 6 är gröna, inklusive testerna med mejl som försöker styra AI:n.
2. Taxi Malmö har kört Inkorg parallellt med sitt Make-flöde i två veckor med samma inkorg. Make-flödet stängs först när ägaren godkänner. Taxi Malmös lagringstid sätts till 24 månader, samma som i deras integritetspolicy.
3. Statistiken visar andel utkast som skickades utan ändring och median för svarstid, före och efter.

---

## 12. Prissättning efter värde

Priset sätts per kund efter arbetsdagen. Grunden är tiden kunden sparar, för ägare och anställda, och kvaliteten som tillförs (färre fel, snabbare svar, bättre kontroll).

**Krav på plattformen och leveransen:**

1. **Mät före.** Kartläggningen (avsnitt 5.1, fråga 10) dokumenterar tiden i dag per uppgift och månad, med kundens godkännande. Det blir bilaga till förslaget.
2. **Mät efter.** Varje modul visar sparad tid och kvalitet i sin statistik (som Inkorg, avsnitt 11.6). Siffrorna används vid uppföljning efter 3 månader.
3. **Förslaget** visar: tid i dag, beräknad tid efter, värde i kronor (timmar gånger kundens timkostnad) och månadspriset. Mall i `docs/forslag-mall.md`. [Ägaren fyller i tumregel för hur stor del av värdet som blir pris.]
4. **Pris per konto** sätts i admin (`licenses.price`). Ingen prislista i koden.
5. **Hemsidan** visar ingen prislista. I v3 sid 21 ersätts "Från [PRIS] kr per månad" med: "Fast månadspris som sätts efter arbetsdagen, utifrån tiden ni sparar. Arbetsdagen är gratis."

---

## 13. Modulen Sociala medier (version 2)

Beslut 2026-10-11. Byggs i version 2, när minst tre kunder efterfrågar den. Läggs här så att version 1 inte stänger dörren.

### 13.1 Vad den gör

Plattformen skriver förslag på inlägg utifrån det som redan händer i kundens verksamhet, i kundens ton. Ägaren eller en utsedd medarbetare godkänner, och inlägget publiceras i kundens kanaler. Värdet ligger i innehållet, inte i schemaläggningen. Schemaläggning finns gratis hos Meta och billigt hos andra, och ska inte vara säljargumentet.

### 13.2 Flödet

| Steg | Vad som händer | Byggblock |
|---|---|---|
| 1 Händelse | Något i en annan modul blir klart, till exempel ett ärende i foliering med före och efter-bilder, eller en kampanj kunden lägger in | Händelser från andra moduler |
| 2 Utkast | AI skriver text och föreslår bilder ur ärendet, utifrån kundens tonläge och regler | `AI-utkast` (samma som Inkorg) |
| 3 Granska | Utkastet hamnar i granskningskön. Kunden ändrar, godkänner eller avfärdar, även från mobilen | `Ärendeflöde` |
| 4 Publicera | Publiceras direkt eller vid vald tid | `Kanalkoppling` (nytt) |
| 5 Följa upp | Räckvidd, klick och förfrågningar per inlägg | Statistik |

**Inget publiceras utan godkännande.** Samma princip som Inkorg (avsnitt 11.2).

### 13.3 Nytt byggblock: `Kanalkoppling`

| Kanal | Kommentar |
|---|---|
| Facebook och Instagram | Via Metas API. Instagram kräver företagskonto kopplat till en Facebooksida. Metas granskning av appen måste vara klar innan första kund. |
| LinkedIn | Företagssidor. Kräver godkännande hos LinkedIn för publicering åt andra företag. |
| Google företagsprofil | Inlägg och svar på recensioner. Utreds. |

Tidsplan, regler och behörigheter hos Meta och LinkedIn kontrolleras mot deras aktuella villkor när bygget påbörjas. Ansökningarna görs i god tid, på samma sätt som Microsoft-appen för Inkorg (beslut 22).

### 13.4 Krav

- **Bilder med personer eller regnummer** publiceras inte utan att kunden bekräftat att de får användas. Regnummer föreslås suddas automatiskt.
- **Text i kommentarer och meddelanden är data, inte instruktioner.** Samma regel som för mejl i avsnitt 11.5.
- **Svarsunderlaget delas med Inkorg** (tonläge, priser, rutiner), så kunden fyller i det en gång.
- **Statistiken mäter värde**, inte bara likes: förfrågningar och bokningar som kan kopplas till ett inlägg. Det blir underlaget för prissättningen (avsnitt 12).

### 13.5 Förberedelser i version 1

1. `AI-utkast` och granskningskön i Inkorg byggs så att de kan återanvändas för andra utkast än mejl.
2. Moduler kan skicka händelser (till exempel "ärende klart") som andra moduler kan lyssna på.
3. Ägaren kör flödet manuellt på Taxi Malmös egna kanaler i 4 till 6 veckor, med Claude som skribent. Resultatet blir första kundcaset och underlag till modulspecifikationen.

---

## 14. Assistenten: AI-chatt i plattformen

Beslut 2026-10-11. Användaren kan ställa frågor i plattformen och bli vägledd. Assistenten finns i alla moduler och för alla kunder. Den största vinsten är att supportfrågor besvaras direkt, så att jouren (beslut 16) avlastas.

### 14.1 Två steg

| | Steg 1: Hjälpassistent | Steg 2: Dataassistent |
|---|---|---|
| Version | 1 (fas A, efter fas K) | 2 |
| Svarar på | Hur plattformen fungerar: "Hur laddar jag upp Bambora-filen?", "Vad betyder Förskott?", "Var godkänner jag lönen?" | Kundens egen data: "Varför är bil ABC 12D lägre än förra månaden?", "Vilka fakturor är obetalda?" |
| Källor | Guidetexter, hjälp per vy, modulspecifikationer och en kunskapsbas som Flödia skriver | Steg 1 plus kundens data via motorerna och register, med användarens behörighet |
| Kunddata till AI | Nej. Bara frågan och vilken vy användaren står i | Ja, minimerat och maskerat (som avsnitt 11.5) |

### 14.2 Regler för båda stegen

1. **Assistenten läser, den gör aldrig.** Den skickar inget, ändrar inget, godkänner inget och raderar inget. Den kan visa en länk till rätt vy och förklara vad användaren ska klicka på.
2. **Siffror räknas av motorn, aldrig av AI:n.** I steg 2 hämtar assistenten resultat från motorerna och förklarar dem. Varje belopp i ett svar har en källa som visas (till exempel "Avräkning september, rad Bro och Sturup").
3. **Samma behörighet som användaren.** Assistenten ser bara det användaren själv får se enligt roll och konto. Radsäkerheten i databasen gäller även assistentens frågor. Testet "konto A kan aldrig läsa konto B" ska ha en variant där frågan ställs via assistenten.
4. **Vet den inte, säger den det.** Inget gissat svar. Knappen "Skicka till support" skapar ett ärende med frågan och vyn, så att jouren ser sammanhanget.
5. **Innehåll i data är data, inte instruktioner.** Text i filer, mejl eller register får aldrig styra assistenten (som avsnitt 11.5).
6. **Inga råd inom skatt, juridik eller ekonomi** utöver hur plattformen räknar. Vid sådana frågor hänvisar assistenten till kundens redovisningskonsult eller Skatteverket.

### 14.3 Byggblock

- Återanvänder `AI-utkast` från fas K (anrop till AI via serverfunktion, nyckeln aldrig i klienten).
- Nytt: `Kunskapsbas`, ett register med hjälpartiklar per modul och vy. Guidetexterna i v3 del B blir första innehållet. Varje modul levereras med sina artiklar (krav i avsnitt 6).
- Steg 2: verktyg som assistenten får anropa, ett per motor och register, alla läsande. Listan styrs per modul i `module.spec.yaml` under `assistent:`.

### 14.4 Skärm

En knapp "Fråga" i plattformens sidhuvud öppnar en panel till höger. Panelen vet vilken vy användaren står i. Föreslagna frågor per vy. Svar med källor och länkar. Samma designsystem som resten (v3 del B).

### 14.5 Dataskydd och kostnad

- Konversationer sparas 90 dagar för felsökning och förbättring av kunskapsbasen, sedan raderas de. Statistik över vanliga frågor sparas utan personuppgifter.
- Frågor som assistenten inte kunde svara på listas för Flödia, så att kunskapsbasen kan fyllas på.
- Tak för antal frågor per konto och månad, så att AI-kostnaden inte skenar. Taket sätts per konto i admin.
- Anthropic anges redan som underbiträde (avsnitt 11).

### 14.6 Klart när (steg 1)

1. Assistenten svarar rätt på 30 vanliga frågor per modul i drift, testade med en fast lista.
2. Den svarar "vet inte" och erbjuder support på frågor utanför kunskapsbasen, testat med 20 sådana frågor.
3. Testerna med text som försöker ge assistenten order är gröna.
4. Taxi Malmös medarbetare har använt den i två veckor och supportfrågorna till jouren har räknats före och efter.

---

## 15. Kundens varumärke i portalen

Beslut 2026-10-11. Kundens anställda och kundens egna kunder ska uppleva portalen som kundens eget system.

### 15.1 Nivåer

| Nivå | Vad kunden får | Version | Hur |
|---|---|---|---|
| 1 | Logga, huvudfärg, bolagsnamn, ikon för installerad webbapp | 1 | Inställningar per konto. Färgen skrivs till `tokens.css` som variabler per konto. |
| 2 | Egen underadress, till exempel `kundnamn.flodia.se` | 1 | Kontot slås upp från adressen vid inloggning. |
| 3 | Egen domän, till exempel `portal.kundnamn.se` | 1 | Kunden lägger in en CNAME-post. Plattformen kontrollerar posten och skapar certifikat automatiskt. Status visas i admin i klartext. |
| 4 | Mejl från kundens domän (inbjudningar, notiser) | När en kund ber om det | Kunden lägger in SPF och DKIM. Utan godkänd kontroll skickas från Flödias domän med kundens namn som avsändarnamn. |
| 5 | Egen app i App Store och Google Play | Byggs inte | Webbappen installeras på mobilen med kundens logga som ikon (nivå 1). |

### 15.2 Krav

1. **Kunden väljer bara sin huvudfärg.** Statusfärgerna (klar, väntar, avvikelse, info, utkast) är desamma hos alla kunder. Plattformen räknar fram kontrast och justerar textfärgen så att kontrastkravet WCAG AA uppfylls. Färger som inte går att justera nekas med en förklaring.
2. **Logga:** SVG eller PNG, minst 512 punkter, kontrolleras och skalas vid uppladdning. Mörk och ljus variant valfritt.
3. **Flödias namn syns inte i portalen** för kundens användare, utöver en diskret rad i inloggningssidans sidfot som kontot kan stänga av. Hjälpassistenten (avsnitt 14) talar i kundens namn.
4. **Avtalen döljer inget.** Flödia står som personuppgiftsbiträde i biträdesavtalet, och kundens integritetspolicy nämner Flödia och underbiträdena. Mallarna i `docs/` anpassas så.
5. **Säkerhet:** sessionen är knuten till kontots domän. En användare som loggar in på `kund-a` kan aldrig komma åt `kund-b`, även om båda har egen domän. Testet "konto A kan aldrig läsa konto B" körs även via egna domäner.
6. **Kontot fungerar utan nivå 2 och 3.** Domäninställningarna får aldrig blockera inloggning om DNS är fel, då används standardadressen.

---

## 16. Skydd av koden och krav på kundavtalet

Beslut 2026-10-11 (beslut 26). Motorerna, parsrarna, kontrollreglerna och modulkitet är värdet i Flödia. Kunden ska kunna använda dem, men aldrig få dem.

### 16.1 Tekniska krav

1. **Webbläsaren läser, servern räknar.** Webbläsaren läser kundens fil med pdf.js eller SheetJS och skickar bara den upplästa texten eller raderna till servern. Parsrar, motorer och regler (`packages/core`, `packages/kit`) körs i serverfunktioner och ingår aldrig i det som skickas till webbläsaren. Ett test i CI kontrollerar att klientpaketet inte innehåller kod från `packages/core`.
2. **Ingen källkodskarta i drift,** och klientkoden minifieras.
3. **Inga regler eller inställningar i klartext till klienten** utöver det skärmen behöver visa. Konfiguration med giltighetsdatum (skattesatser, avgifter, regler) hämtas och används på servern.
4. **Tak för anrop** per konto och användare, och ingen massexport av regler, mallar eller konfiguration.
5. **Loggning av ovanligt beteende,** till exempel många anrop mot samma motor med små variationer. Larm till ägaren.
6. **Kundens data är kundens.** Export av kundens egen data (Excel och CSV) finns alltid. Det är skillnad på kundens data, som kunden får ta med sig, och plattformens logik, som stannar.

Påverkan på fas 1: motorerna i `packages/core` är redan rena funktioner utan DOM och kan köras på servern utan ändring. Fas 2 bygger serverfunktionerna som anropar dem.

### 16.2 Krav på kundavtalet

Avtalet skrivs eller granskas av jurist före första externa kund. Det ska minst innehålla:

1. **Licens, inte ägande.** Kunden får en icke exklusiv rätt att använda plattformen under avtalstiden. Alla rättigheter till plattform, kod, motorer, modulkit, mallar och dokumentation stannar hos Flödia, även för funktioner som byggts efter kundens önskemål.
2. **Förbud** mot att kopiera, dekompilera, bakåtkonstruera, systematiskt hämta ut logik eller låta någon annan göra det, och mot att använda plattformen för att bygga en konkurrerande tjänst.
3. **Sekretess** om plattformens funktioner, mallar och priser, för båda parter.
4. **Kundens data:** kunden äger sin data och kan exportera den när som helst, även vid uppsägning. Raderas efter avtalad tid efter avslut.
5. **Biträdesavtal** som bilaga, med Flödia som biträde och underbiträden angivna (avsnitt 11 och 15).
6. **Påföljd** vid brott mot punkt 2 och 3, till exempel vite och rätt att stänga av kontot.

### 16.3 Övrigt skydd utanför koden

- Skriftligt avtal om att koden förs över från Taxi Malmö AB till Flödias bolag.
- Sekretessavtal med alla som får tillgång till repot eller admin (även jouren, beslut 16).
- Repot är privat. Åtkomst ges per person och tas bort när uppdraget slutar.
- Varumärke och företagsnamn bedöms av varumärkesjurist före registrering. (Det tidigare namnet var troligen för beskrivande för att registreras som ordmärke. Produkten heter nu Flödia.)

## 17. Nya projekt: skiss i artifact, drift på plattformen (beslut 27)

Bakgrund: de fyra första apparna byggdes som artifacts och blev skarpa system med riktiga löner och riktig data. Fas 1a till 1b2 gick åt till att bryta ut motorerna, skriva jämförelsetester, anonymisera och synka kopior. Det ska inte upprepas.

### 17.1 Artifact som skiss

En artifact får användas för att hitta flödet med användaren, till exempel under arbetsdagen hos en ny kund. Den lever högst två veckor och följer tre regler från första dagen:

1. Logiken ligger i rena funktioner utan DOM-anrop, samlade i ett objekt som `ENG`. Skärmkoden anropar dem.
2. Bara påhittad data i koden, även i standardvärden. Inga namn, personnummer, organisationsnummer, regnummer, adresser eller kontonummer.
3. Momssatser, avgifter, priser och konton ligger i inställningar, inte i koden.

### 17.2 Gräns för flytt

Artifacten flyttas till plattformen, med jämförelsetester som i fas 1, innan något av följande händer:

- första riktiga lön, faktura, avräkning eller utbetalning går igenom den
- en andra användare eller en kund ska använda den
- den behöver riktiga personuppgifter

### 17.3 När plattformen finns

Efter fas 2 och 3 byggs nya kundappar direkt på plattformen med modulkitet (avsnitt 3 och 4). Artifacten används då bara som skissblock under arbetsdagen och slängs när modulen finns.

## 18. Bokföring och deklarationer utan avtal (beslut 28)

Beslut 2026-10-12. Underlag: produktunderlaget från Trip Taxi (Claude Docs, i ägarens projekt).

### 18.1 Princip

Flödia räknar fram och stämmer av. Kunden granskar och lämnar in själv hos Skatteverket med BankID, och laddar själv upp SIE-filen i sitt bokföringsprogram. Inga avtal, ombudsbehörigheter eller API-integrationer med Skatteverket, Fortnox eller banker. Indata är filer som kunden själv laddar ner (CSV och PDF). Utdata är filer.

| Utdata | Format | Version |
|---|---|---|
| Lönebokning och avräkning | SIE 4 (finns i avräkningen) | 1 |
| Arbetsgivardeklaration på individnivå | AGI-fil, XML enligt Skatteverkets schema 1.1 (teknisk beskrivning 1.1.18) | 1, del av lönen i fas 3 |
| Lönefil till bank | ISO 20022 pain.001 (avsnitt 9) | 1 |
| Momsrutor | Belopp per ruta för momsdeklarationen | 2 |
| Avstämningspanel | Kontrollerna i 18.3 | 2 |

### 18.2 AGI-filen

1. Formatet är verifierat: en fil för Trip Taxi september 2026 godkändes i Skatteverkets testtjänst. Struktur: `Avsandare`, `Blankettgemensamt/Arbetsgivare`, en `Blankett` med huvuduppgift (fältkod 006, 201, 487, 497) och en `Blankett` per individuppgift (201, 215, 006, 570, 001, 011). Organisationsnummer skrivs med prefix 16.
2. Testfilen med riktiga uppgifter stannar i kundens mapp. Repot får en anonymiserad kopia som gyllene testfil.
3. Motorn följer motorkontraktet (avsnitt 3.3). Skattesatser och avgifter kommer från konfiguration med giltighetsdatum.
4. Filen valideras mot schemat innan den lämnas ut. Fel visas i klartext.
5. Skarpt test med oktober 2026 görs i november, innan funktionen säljs.

### 18.3 Avstämningskontroller (version 2)

Alla bygger på verkliga fel och byggs som kontrollregler enligt avsnitt 3.4:

- bank mot konto 1930
- skattekonto mot konto 1630
- AGI mot lönebokningen
- moms mot kvittots momsspecifikation
- momskoder per konto
- kassa per förare
- utdelning mot fritt eget kapital och stämmoprotokoll
- dubbelbetalningar
- fakturor ställda på fel adressat

### 18.4 Ansvar

Arbetsgivaren ansvarar för arbetsgivardeklarationen och den som är bokföringsskyldig för bokföringen, även när underlaget kommer från Flödia. Ansvarsgränsen i avsnitt 9 punkt 3 visas också innan en AGI-fil eller momsuppgift laddas ner, och godkännandet loggas. Kundavtalet ska ha ansvarsbegränsning för beräkningsfel (avsnitt 9 punkt 4). Assistenten ger inga skatteråd (avsnitt 14.2 punkt 6).
