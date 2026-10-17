# Hemsidan flodia.se

Ägarens uppdrag och beslut 2026-10-15. Fyra sidor från de godkända skisserna: startsidan, Åkerier, Transportcentraler och Verkstad. Hemsidan ligger bakom Cloudflare Access och ska inte indexeras.

## I repot

| Vad | Var |
|---|---|
| Sidorna | `apps/hemsida/src/index.html`, `akerier/`, `transportcentraler/`, `verkstad/` |
| Stilmallen (en för alla sidor) | `apps/hemsida/src/hemsida.css` |
| Huvuden för Cloudflare Pages | `apps/hemsida/src/_headers` |
| Bygget | `npm run bygg -w @flodia/hemsida`, resultat i `apps/hemsida/dist` |
| Visa lokalt | `npm run visa -w @flodia/hemsida`, sedan http://127.0.0.1:4321/ |
| Tester | `apps/hemsida/hemsida.test.ts` (i `npm run ci`) |
| Lighthouse | CI-jobbet `hemsida`: mobil, minst 95 i Performance, Accessibility och Best Practices på varje sida. SEO räknas inte, eftersom noindex sänker den med avsikt. |

- **Typsnitt:** IBM Plex Sans 400 och 600, Space Grotesk 600 och 700, som woff2 med latin och åäö, från `@fontsource`. Plex 400 och Space Grotesk 600 förladdas. Skissernas Plex 500 (knappar, etiketter och märken) är 600, så att det blir fyra vikter. Inga anrop till Google.
- **Cache:** stilmallen och typsnitten har en kontrollsumma i namnet och cachas i ett år (`immutable`). Sidorna cachas inte länge.
- **noindex:** `<meta name="robots">` på varje sida och `X-Robots-Tag` på allt.
- **Bilder:** skisserna har inga rasterbilder. Nya bilder ska vara AVIF eller WebP, med `width`, `height` och `loading="lazy"`. Testet kräver det.
- **Logga in** leder till https://app.flodia.se.
- **Sidfoten** har bolagsuppgifterna som platshållare (`[BOLAGSNAMN AB]` med flera) tills det nya bolaget finns.
- **Bokningsformuläret** syns men är avstängt, med texten att bokningen öppnar senare (ägarens beslut). Det skickar ingenting.
- **Inget JavaScript** på sidorna.

## Cloudflare (ägaren klickar)

### Pages-projektet `flodia-hemsida`

1. dash.cloudflare.com, **Workers & Pages**, **Create**, **Pages**, **Connect to Git**, repot `flodia`.
2. Namn `flodia-hemsida`. Build command `npm run bygg -w @flodia/hemsida`. Build output directory `apps/hemsida/dist`. Root directory tom. Miljövariabeln `NODE_VERSION` = `24`.
3. **Settings**, **Builds**, **Branch control**: bara `main`, Preview branch: None.
4. Koppla ingen egen adress än (se steg 9).

### Access (Zero Trust)

5. **Zero Trust**. Första gången: välj ett teamnamn och planen Free.
6. **Settings**, **Authentication**, **Login methods**: One-time PIN ska finnas.
7. **Access**, **Applications**, **Add an application**, **Self-hosted**. Namn `Flödia hemsida`, session 24 timmar. Destinationer:
   - `flodia.se`
   - `www.flodia.se`
   - `flodia-hemsida.pages.dev`
   - `*.flodia-hemsida.pages.dev`, så att varje publicerings egen adress också är spärrad

   Identity providers: bara One-time PIN, med Instant Auth. **Använd aldrig `*.flodia.se`**, eftersom det skulle låsa appen.
8. Policy `Tillåtna`, Action **Allow**, Include **Emails** med de tillåtna adresserna. Listan finns bara i Cloudflare. Engångskoden skickas av Cloudflare, inte av Brevo.
9. Pages-projektet, **Custom domains**: lägg till `flodia.se` och `www.flodia.se`.
10. Prova i ett privat fönster:
    - `flodia.se` och `flodia-hemsida.pages.dev` ska visa Cloudflares inloggning.
    - En tillåten adress ska få en kod, och en annan adress ska nekas.
    - `app.flodia.se` ska fungera som förut, utan Access.

**app.flodia.se påverkas inte.** Access gäller bara de destinationer som står i applikationen, och `*.flodia-hemsida.pages.dev` matchar bara hemsidans egna adresser under `pages.dev`. Appen ligger på `app.flodia.se` i ett annat Pages-projekt.

DNS-posterna för e-post (SPF, DKIM och DMARC) påverkas inte av den egna adressen.
