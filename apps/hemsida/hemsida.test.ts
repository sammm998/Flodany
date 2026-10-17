// Hemsidan flodia.se: kraven från ägarens uppdrag 2026-10-15 prövas på det byggda resultatet.
// Lighthouse körs i CI-jobbet hemsida (scripts/lighthouse.mjs).
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SIDOR, TYPSNITT, bygg } from './scripts/bygg.mjs';
import { huvudFor, lasHeaders } from './scripts/server.mjs';
import { startaChrome } from './scripts/chrome.mjs';

let ut: string;
let sidor: Record<string, string>;
let css: string;
beforeAll(() => {
  ut = mkdtempSync(join(tmpdir(), 'hemsida-'));
  bygg(ut);
  sidor = Object.fromEntries(SIDOR.map(s => [s, readFileSync(join(ut, s), 'utf8')]));
  const cssFil = readdirSync(join(ut, 'assets')).find(f => f.endsWith('.css'))!;
  css = readFileSync(join(ut, 'assets', cssFil), 'utf8');
});
afterAll(() => { rmSync(ut, { recursive: true, force: true }); });

const alla = (re: RegExp, text: string) => [...text.matchAll(re)].map(m => m[1]!);
const filer = (d: string): string[] => readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? filer(join(d, f)).map(x => `${f}/${x}`) : [f]));

describe('hemsidan: sidorna', () => {
  it('fyra sidor, alla med noindex, svenska, titel och beskrivning', () => {
    expect(Object.keys(sidor)).toHaveLength(4);
    for (const [s, html] of Object.entries(sidor)) {
      expect(html, s).toContain('<html lang="sv">');
      expect(html, s).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html, s).toMatch(/<title>[^<]+<\/title>/);
      expect(html, s).toMatch(/<meta name="description" content="[^"]{20,}">/);
    }
  });

  it('en gemensam stilmall, ingen stil i sidorna och inget JavaScript', () => {
    const stilmallar = new Set(Object.values(sidor).flatMap(h => alla(/<link rel="stylesheet" href="([^"]+)"/g, h)));
    expect([...stilmallar]).toEqual([expect.stringMatching(/^\/assets\/hemsida\.[0-9a-f]{10}\.css$/)]);
    for (const [s, html] of Object.entries(sidor)) {
      expect(html, s).not.toMatch(/<style|\sstyle="|<script|\son[a-z]+="/i);
    }
  });

  it('inga anrop till andra adresser än app.flodia.se, och inget från Google', () => {
    for (const [s, html] of Object.entries(sidor)) {
      const externa = alla(/(?:href|src|action)="(https?:[^"]*)"/g, html).filter(u => u !== 'https://app.flodia.se');
      expect(externa, s).toEqual([]);
      expect(html, s).not.toMatch(/googleapis|gstatic/);
    }
    expect(css).not.toMatch(/https?:/);
  });

  it('alla interna länkar och ankare finns', () => {
    const fel: string[] = [];
    for (const [s, html] of Object.entries(sidor)) {
      const id = new Set(alla(/\sid="([^"]+)"/g, html));
      for (const h of alla(/href="([^"]+)"/g, html)) {
        if (h.startsWith('#')) { if (!id.has(h.slice(1))) fel.push(`${s}: ${h}`); continue; }
        if (!h.startsWith('/')) continue;
        const [vag, ankare] = h.split('#') as [string, string | undefined];
        const fil = join(ut, vag.endsWith('/') ? vag + 'index.html' : vag);
        if (!existsSync(fil)) { fel.push(`${s}: ${h}`); continue; }
        if (ankare && !readFileSync(fil, 'utf8').includes(`id="${ankare}"`)) fel.push(`${s}: ${h}`);
      }
    }
    expect(fel).toEqual([]);
  });

  it('Logga in leder till app.flodia.se på varje sida', () => {
    for (const [s, html] of Object.entries(sidor)) {
      const lankar = alla(/<a href="([^"]+)"[^>]*>Logga in<\/a>/g, html);
      expect(lankar.length, s).toBeGreaterThan(0);
      expect(new Set(lankar), s).toEqual(new Set(['https://app.flodia.se']));
    }
  });

  it('sidfoten har bolagsuppgifterna som platshållare', () => {
    for (const [s, html] of Object.entries(sidor)) expect(html, s).toMatch(/\[BOLAGSNAMN AB\], org\.nr \[ORG\.NR\]/);
  });

  it('bokningsformuläret syns men är avstängt, med text om att bokningen öppnar senare', () => {
    const html = sidor['index.html']!;
    const form = html.match(/<form[\s\S]*?<\/form>/)![0];
    const falt = form.match(/<(input|select|textarea|button)\b[^>]*>/g)!;
    expect(falt.length).toBeGreaterThan(5);
    for (const f of falt) expect(f).toMatch(/\sdisabled[\s>]/);
    expect(form).toContain('Bokningen öppnar senare.');
    expect(form).not.toMatch(/\saction=/);
  });

  it('bilder: AVIF eller WebP, med storlek och lazy loading (i dag inga rasterbilder)', () => {
    expect(filer(ut).filter(f => /\.(png|jpe?g|gif)$/i.test(f))).toEqual([]);
    for (const [s, html] of Object.entries(sidor)) {
      for (const img of html.match(/<img\b[^>]*>/g) ?? []) {
        expect(img, s).toMatch(/\swidth="\d+"/);
        expect(img, s).toMatch(/\sheight="\d+"/);
        expect(img, s).toMatch(/\sloading="lazy"/);
        expect(img, s).toMatch(/\ssrc="[^"]+\.(avif|webp)"/);
      }
    }
  });
});

describe('hemsidan: filmerna', () => {
  const FILMER: Record<string, string> = { 'akerier/index.html': 'akerier', 'transportcentraler/index.html': 'transportcentraler', 'verkstad/index.html': 'verkstad' };

  it('en film direkt efter hjältesektionen på Åkerier, Transportcentraler och Verkstad, ingen på startsidan', () => {
    for (const [s, html] of Object.entries(sidor)) {
      const filmer = html.match(/<video\b[^>]*>/g) ?? [];
      if (!FILMER[s]) { expect(filmer, s).toEqual([]); continue; }
      expect(filmer, s).toHaveLength(1);
      // Sektionen med filmen kommer direkt efter hjältesektionen.
      const sektioner = [...html.matchAll(/<section class="([^"]+)"/g)].map(m => m[1]);
      expect(sektioner.slice(0, 2), s).toEqual(['hjalte-sida', 'film-yta']);
      expect(html, s).toMatch(/<section class="film-yta" aria-labelledby="film">\r?\n<h2 id="film" class="h2-640">[^<]+<\/h2>/);
    }
  });

  it('kontroller, ingen autoplay, hämtas först vid uppspelning, affisch och storlek 1280 x 720', () => {
    for (const [s, namn] of Object.entries(FILMER)) {
      const video = sidor[s]!.match(/<video\b[^>]*>/)![0];
      for (const krav of [' controls', ' playsinline', ' preload="none"', ' width="1280"', ' height="720"']) expect(video, s).toContain(krav);
      expect(video, s).toMatch(new RegExp(` poster="/video/${namn}\\.[0-9a-f]{10}\\.avif"`));
      expect(video, s).not.toMatch(/autoplay|muted|loop/);
      expect(sidor[s], s).toMatch(new RegExp(`<source src="/video/${namn}\\.[0-9a-f]{10}\\.mp4" type="video/mp4">`));
    }
  });

  it('filmerna och affischerna kopieras till dist/video med kontrollsumma i namnet, affischerna som AVIF', () => {
    const ut2 = filer(join(ut, 'video')).sort();
    expect(ut2.map(f => f.replace(/\.[0-9a-f]{10}\./, '.')).sort()).toEqual(['akerier.avif', 'akerier.mp4', 'transportcentraler.avif', 'transportcentraler.mp4', 'verkstad.avif', 'verkstad.mp4']);
    // Kontrollsumman är innehållets: en ny film med samma namn i src får ett nytt namn i dist.
    for (const f of ut2) expect(f, f).toContain('.' + createHash('sha256').update(readFileSync(join(ut, 'video', f))).digest('hex').slice(0, 10) + '.');
    // Varje hänvisning till /video/ i sidorna finns i dist, och ingen pekar på ett namn utan kontrollsumma.
    for (const [s, html] of Object.entries(sidor)) {
      for (const h of alla(/"(\/video\/[^"]+)"/g, html)) {
        expect(h, s).toMatch(/\.[0-9a-f]{10}\.(mp4|avif)$/);
        expect(existsSync(join(ut, h)), `${s}: ${h}`).toBe(true);
      }
    }
  });

  it('16:9 i stilmallen, så att sidan inte hoppar', () => {
    expect(css).toMatch(/\.film \{[^}]*width: 100%;[^}]*height: auto;[^}]*aspect-ratio: 16 \/ 9;/);
  });

  it('ett års cache för /video/* som för /assets/*, och CSP täcker film och affisch från samma ursprung utan att luckras upp', () => {
    const regler = lasHeaders(readFileSync(join(ut, '_headers'), 'utf8'));
    for (const vag of ['/video/akerier.mp4', '/video/transportcentraler.avif']) {
      expect(huvudFor(regler, vag)['Cache-Control'], vag).toBe('public, max-age=31536000, immutable');
      expect(huvudFor(regler, vag)['X-Robots-Tag'], vag).toBe('noindex, nofollow');
    }
    const csp = huvudFor(regler, '/akerier/')['Content-Security-Policy']!;
    // Ingen media-src: filmen faller tillbaka på default-src 'self'. Affischen är en bild: img-src 'self'.
    expect(csp).toMatch(/(^|; )default-src 'self'(;|$)/);
    expect(csp).not.toMatch(/media-src/);
    expect(csp).toMatch(/img-src 'self' data:/);
    expect(csp).not.toMatch(/\*|https?:|blob:/);
  });
});

describe('hemsidan: typsnitt', () => {
  it('högst fyra vikter i woff2, lokalt: IBM Plex Sans 400 och 600, Space Grotesk 600 och 700', () => {
    const woff2 = filer(join(ut, 'assets')).filter(f => f.endsWith('.woff2'));
    expect(woff2).toHaveLength(4);
    expect(Object.keys(TYPSNITT).sort()).toEqual(['ibm-plex-sans-400', 'ibm-plex-sans-600', 'space-grotesk-600', 'space-grotesk-700']);
    const ytor = [...css.matchAll(/@font-face \{ font-family: '([^']+)'; font-style: normal; font-weight: (\d+);[^}]*src: url\(([^)]+)\)/g)].map(m => `${m[1]} ${m[2]}`);
    expect(ytor.sort()).toEqual(['IBM Plex Sans 400', 'IBM Plex Sans 600', 'Space Grotesk 600', 'Space Grotesk 700']);
    for (const u of alla(/url\(([^)]+)\)/g, css)) expect(existsSync(join(ut, 'assets', u)), u).toBe(true);
    // Inga andra vikter används, så webbläsaren behöver aldrig hitta på en.
    expect(new Set(alla(/font-weight: (\d+)/g, css))).toEqual(new Set(['400', '600', '700']));
  });

  it('de två viktigaste typsnitten förladdas på varje sida', () => {
    for (const [s, html] of Object.entries(sidor)) {
      const forladdade = alla(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g, html);
      expect(forladdade, s).toEqual([expect.stringMatching(/ibm-plex-sans-400\.[0-9a-f]{10}\.woff2$/), expect.stringMatching(/space-grotesk-600\.[0-9a-f]{10}\.woff2$/)]);
      for (const f of forladdade) expect(existsSync(join(ut, f)), f).toBe(true);
    }
  });
});

describe('hemsidan: huvuden för Cloudflare Pages', () => {
  it('noindex på allt, lång cache för stilmall och typsnitt, ingen lång cache för sidorna', () => {
    const regler = lasHeaders(readFileSync(join(ut, '_headers'), 'utf8'));
    const stilmall = '/assets/' + readdirSync(join(ut, 'assets')).find(f => f.endsWith('.css'));
    for (const vag of ['/', '/akerier/', stilmall, '/assets/typsnitt/x.woff2']) expect(huvudFor(regler, vag)['X-Robots-Tag'], vag).toBe('noindex, nofollow');
    for (const vag of [stilmall, '/assets/typsnitt/x.woff2']) expect(huvudFor(regler, vag)['Cache-Control'], vag).toBe('public, max-age=31536000, immutable');
    expect(huvudFor(regler, '/')['Cache-Control']).toBeUndefined();
    expect(huvudFor(regler, '/')['Content-Security-Policy']).toMatch(/default-src 'self'/);
  });
});

describe('Lighthouse: starten av Chrome', () => {
  it('startar om en gång när starten misslyckas, och skriver varför', async () => {
    const logg: string[] = [];
    let forsok = 0;
    const chrome = await startaChrome(async () => { forsok++; if (forsok === 1) throw new Error('waiting for dynamic debugging port'); return 'chrome'; }, t => logg.push(t));
    expect(chrome).toBe('chrome');
    expect(forsok).toBe(2);
    expect(logg).toEqual(['Chrome startade inte (waiting for dynamic debugging port). Startar om en gång.']);
  });

  it('bara en omstart: misslyckas båda försöken fälls jobbet', async () => {
    let forsok = 0;
    await expect(startaChrome(async () => { forsok++; throw new Error('trasig'); }, () => {})).rejects.toThrow('trasig');
    expect(forsok).toBe(2);
  });

  it('ingen omstart när starten lyckas', async () => {
    let forsok = 0;
    expect(await startaChrome(async () => { forsok++; return 1; }, () => {})).toBe(1);
    expect(forsok).toBe(1);
  });
});
