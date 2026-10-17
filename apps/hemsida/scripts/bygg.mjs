// Bygger hemsidan till apps/hemsida/dist för Cloudflare Pages:
// - typsnitten kopieras från @fontsource (latin med åäö, woff2)
// - stilmallen, typsnitten, filmerna och affischerna får en kontrollsumma i namnet, så att de kan cachas i ett år
//   (_headers). En ny fil med samma namn i src får alltså ett nytt namn i dist, och HTML:en pekar på det automatiskt.
// - sidorna får de nya namnen. Inget annat ändras: sidorna är färdig HTML utan JavaScript.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HEMSIDA = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SIDOR = ['index.html', 'akerier/index.html', 'transportcentraler/index.html', 'verkstad/index.html'];
/** Typsnitten: namnet i stilmallen och filen i @fontsource. Högst fyra vikter. */
export const TYPSNITT = {
  'ibm-plex-sans-400': '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2',
  'ibm-plex-sans-600': '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2',
  'space-grotesk-600': '@fontsource/space-grotesk/files/space-grotesk-latin-600-normal.woff2',
  'space-grotesk-700': '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2',
};

const kort = (b) => createHash('sha256').update(b).digest('hex').slice(0, 10);

/** Bygger till katalogen ut och svarar med de nya namnen (/assets/...). */
export function bygg(ut = join(HEMSIDA, 'dist')) {
  const src = join(HEMSIDA, 'src'), krav = createRequire(join(HEMSIDA, 'package.json'));
  rmSync(ut, { recursive: true, force: true });
  mkdirSync(join(ut, 'assets', 'typsnitt'), { recursive: true });
  const namn = {};
  let css = readFileSync(join(src, 'hemsida.css'), 'utf8');
  for (const [t, fil] of Object.entries(TYPSNITT)) {
    const b = readFileSync(krav.resolve(fil));
    const nytt = `typsnitt/${t}.${kort(b)}.woff2`;
    writeFileSync(join(ut, 'assets', nytt), b);
    if (!css.includes(`url(typsnitt/${t}.woff2)`)) throw new Error(`Stilmallen använder inte ${t}`);
    css = css.replaceAll(`url(typsnitt/${t}.woff2)`, `url(${nytt})`);
    namn[`/assets/typsnitt/${t}.woff2`] = `/assets/${nytt}`;
  }
  const cssNamn = `hemsida.${kort(css)}.css`;
  writeFileSync(join(ut, 'assets', cssNamn), css);
  namn['/assets/hemsida.css'] = `/assets/${cssNamn}`;
  // Filmerna och affischerna i src/video: samma kontrollsumma i namnet som stilmallen och typsnitten.
  mkdirSync(join(ut, 'video'), { recursive: true });
  for (const fil of readdirSync(join(src, 'video')).sort()) {
    const innehall = readFileSync(join(src, 'video', fil)), ext = extname(fil);
    const nytt = `${fil.slice(0, -ext.length)}.${kort(innehall)}${ext}`;
    writeFileSync(join(ut, 'video', nytt), innehall);
    namn[`/video/${fil}`] = `/video/${nytt}`;
  }
  for (const sida of SIDOR) {
    let html = readFileSync(join(src, sida), 'utf8');
    for (const [fran, till] of Object.entries(namn)) html = html.replaceAll(`"${fran}"`, `"${till}"`);
    mkdirSync(dirname(join(ut, sida)), { recursive: true });
    writeFileSync(join(ut, sida), html);
  }
  for (const f of ['_headers', 'favicon.svg']) cpSync(join(src, f), join(ut, f));
  return namn;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const n = bygg();
  const filmfiler = Object.keys(n).filter(k => k.startsWith('/video/')).length;
  console.log(`Hemsidan är byggd: ${SIDOR.length} sidor, ${Object.keys(TYPSNITT).length} typsnitt, en stilmall och ${filmfiler} filer för filmerna i apps/hemsida/dist.`);
}
