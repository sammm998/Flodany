# Designsystemet: regler

Regler för plattformens gränssnitt (`packages/ui`). Färger, typsnitt och mått kommer bara från `packages/ui/tokens.css` (spec v3 s. 14). Legacy-apparna omfattas inte, eftersom de är frysta.

## Fält i samma rad (ägarens regel 2026-10-14)

1. **Fält i samma rad står alltid på samma linje**, även när en etikett bryts på två rader.
2. **Etiketten trycks uppåt och rutan ligger i botten.** Varje fält är en kolumn där etiketten fyller utrymmet ovanför rutan, så att alla rutor i raden har samma underkant.
3. **Textfält, datumfält och listor har samma höjd** (minst 44 punkter, som i dag).
4. **Hjälptext och felmeddelanden** under rutan påverkar inte linjen. De ligger under raden av rutor.

### Hur det byggs (förslag)

- En komponent för en rad med fält. Varje fält är en kolumn i ett rutnät med tre rader: etikett, ruta, hjälptext eller fel. Etikettraden justeras mot botten (`align-self: end`), så att rutorna hamnar på samma linje.
- `input`, `select` och datumfält får samma höjd, utfyllnad och ram i `stil.css`.
- På smal skärm får varje fält en egen rad, och regeln gäller då inom varje rad.

### Test (Playwright)

Testet skrivs när komponenten byggs. Det går igenom alla vyer i plattformen i **1280 och 390 punkters bredd**. Det misslyckas om två fält i samma rad har olika underkant eller olika höjd.

- **Vilka vyer:** alla adresser i plattformen (inloggning, kontoväljaren, Hem, varje modulsida, dialoger och sidopaneler som går att öppna), med exempeldata så att formulären har innehåll. Bryggans ram med de nuvarande apparna ingår inte.
- **Vad som räknas som en rad:** fält vars celler (etikett och ruta, `.fl-falt` eller `label`) överlappar vertikalt, inom samma formulär eller behållare. Cellerna används i stället för rutorna, eftersom en etikett som bryts kan trycka ner rutan så långt att rutorna inte längre överlappar.
- **Testet finns** i `tests/e2e/falt.spec.ts` och `tests/e2e/falt.ts`, med ett självtest som visar att kontrollen slår larm.
- **Tolerans:** högst 1 punkts skillnad, för avrundning.
- **Utskrift vid fel:** vyn, bredden och vilka fält som skiljer sig, med underkant och höjd.
