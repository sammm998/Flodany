# Legacy-bytet efter lönen 25 oktober 2026 (plan)

Ägarens uppdrag 2026-10-14. Bara plan, inget bytt. Bytet görs med avsiktliga commits, på samma sätt som i fas 1b2 (`docs/faser/fas-1b2-uppdrag.md`) och bytet 2026-10-13 (Åkarkassan v33 och Tripkassan v25).

## Regel fram till bytet

- **Legacy-koden för Avräkning och Foliering rörs inte före bytet.** Det gäller både `legacy/apps/avrakning/index.html` och `legacy/apps/foliering/index.html`, och motorerna i `packages/core/avrakning` och `packages/core/foliering`.
- **När lönen 25 oktober är klar** hämtar ägaren de aktuella artifacterna från claude.ai och lägger dem i en inkommande-mapp utanför repot, till exempel `..\inkommande-legacy-2026-10-25\`, med en `LASMIG.md` som för bytet 2026-10-13.

## Vad som ska föras in

### Avräkning (version 45 till 47, artifacterna 2026-10-14)

- **Fliken Kläder** med prislista per artikel: art 72 till 80 och 11.
- **Utbildning** (art 11) för 2 000 kr exkl. moms, där jacka, skjorta och tröja ingår.
- **Åkeriet hämtas från bilnumret**, och raderna läggs på åkeriets avräkning.
- **Fotoläsning av klädlistan** med `sample`. Bilden sparas inte.
- **Kläder på en okänd bil** ger en kontrollrad.
- **Sidfoten i avräkningen** (noterad 2026-10-14) ingår i samma byte.

### Foliering (version 25 till 27, artifacterna 2026-10-14)

- **Fliken Arbetsorder:**
  - nummer i formen AO-001
  - status I kö, Bilen inlämnad, Pågår och Klar
  - montören är densamma som Utförd av
  - skador vid inlämning och en checklista
  - PDF utan priser
- **Arbetsordern skapas** när offerten markeras godkänd.
- **"Ny bil i kön":**
  - reg nr ur fordonsregistret eller via bilnummer, och ett nytt reg nr sparas i registret
  - delarna ur prislistan som knappar, och en förifylld offert
- **Övrigt i fritext** visas på arbetsordern men får inget pris.

## Steg vid bytet

1. **Anonymisera och granska.** Allt som är anonymiserat i nuvarande legacy ska vara anonymiserat på samma sätt i de nya filerna. Ny kod granskas efter namn, personnummer, telefonnummer, regnummer, org.nr och adresser. Sökorden i ägarens `LASMIG.md` ska ge noll träffar.
2. **Byt filerna** i en egen commit, med nya kontrollsummor i `tests/legacy.sha256` och skript-taggen för `claude-shim.js` kvar exakt en gång, som bryggan kräver.
3. **Låt CI köra jämförelsetesterna.** Väntade skillnader listas i `LASMIG.md`. Ger något annat en skillnad stoppas arbetet och rapporteras, utan rättelser.
4. **För in ändringarna i motorerna** i `packages/core/avrakning` och `packages/core/foliering`, rad för rad, i en egen commit, och rapportera diffen i resultat. Det gäller till exempel klädraderna på åkeriets avräkning, kontrollraden för okänd bil och att arbetsordern skapas när offerten godkänns.
5. **Paus och rapport** till ägaren.

## Att stämma av före bytet

- **Fotoläsningen med `sample` fungerar inte på plattformen.** Bryggan ger bara `db`, `downloads` och `user`, och shimmen svarar `null` för `sample`. I de nuvarande apparna via plattformen fungerar fotoläsningen därför inte, och apparna ska då visa sitt vanliga läge utan AI. På plattformen byggs fotoläsningen på servern enligt `fas-3-moduler-plan.md`, först när Anthropic är underbiträde, nollagring är begärd och blanketten saknar personuppgifter.
- **Fotoläsningen på servern är byggd och avstängd** (`docs/fotolasning.md`). Vid bytet jämförs artifactens tolkning (instruktion, kolumner och regler för den gamla och den nya blanketten) med `packages/server/fotolasning.ts`, och skillnader rapporteras till ägaren innan något ändras.
- **Kläderna i legacy och i planen för fas 3:** artiklarna, priserna och utbildningsregeln i den nya Avräkningen blir referensen när fliken Kläder byggs på plattformen. Jämförelsetester mellan legacy och motorn gäller då även kläderna.
- **Arbetsordern i Foliering** ändrar Verkstadens åtgärder (`packages/core/foliering`). Förkraven för åtgärderna (`fas-2-forkrav.md`) behöver nya rader för arbetsordern, till exempel att en arbetsorder bara kan skapas från en godkänd offert.
