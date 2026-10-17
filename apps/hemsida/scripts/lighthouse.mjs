// Lighthouse i mobilläge mot den byggda hemsidan (CI-jobbet hemsida). Kravet är minst 95 för Performance,
// Accessibility och Best Practices på varje sida. SEO räknas inte: noindex sänker den med avsikt.
// Varje sida mäts tre gånger och medianen redovisas, eftersom prestandan varierar något mellan körningar.
import { appendFileSync } from 'node:fs';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { SIDOR } from './bygg.mjs';
import { startaChrome } from './chrome.mjs';
import { starta } from './server.mjs';

const KRAV = 0.95;
const KORNINGAR = 3;
const KATEGORIER = ['performance', 'accessibility', 'best-practices', 'seo'];
const RAKNAS = ['performance', 'accessibility', 'best-practices'];

const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

const server = await starta();
const bas = `http://127.0.0.1:${server.address().port}`;
const chrome = await startaChrome(() => chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] }));
const rader = [], fel = [];
try {
  for (const sida of SIDOR) {
    const sokvag = '/' + sida.replace(/index\.html$/, '');
    const korningar = [];
    for (let i = 0; i < KORNINGAR; i++) korningar.push((await lighthouse(bas + sokvag, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: KATEGORIER })).lhr);
    // Körningen med medianprestanda redovisas, med alla kategorier från samma körning.
    const lhr = korningar.find(l => l.categories.performance.score === median(korningar.map(l => l.categories.performance.score)));
    const p = Object.fromEntries(KATEGORIER.map(k => [k, lhr.categories[k].score]));
    const perf = korningar.map(l => Math.round(l.categories.performance.score * 100)).join('/');
    const cls = lhr.audits['cumulative-layout-shift'].numericValue, lcp = lhr.audits['largest-contentful-paint'].numericValue;
    const lcpEl = lhr.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
    if (lcpEl) console.log(`${sokvag}: LCP-elementet är ${lcpEl.nodeLabel ?? ''} (${(lcpEl.snippet ?? '').slice(0, 80)})`);
    const affisch = lhr.audits['network-requests']?.details?.items?.filter(r => r.url.includes('/video/')).map(r => `${r.url.replace(bas, '')} ${r.transferSize} byte, prioritet ${r.priority}`);
    if (affisch?.length) console.log(`${sokvag}: hämtat under laddningen: ${affisch.join('; ')}`);
    rader.push(`| ${sokvag} | ${KATEGORIER.map(k => Math.round(p[k] * 100)).join(' | ')} | ${perf} | ${cls.toFixed(3)} | ${(lcp / 1000).toFixed(2)} s |`);
    for (const k of RAKNAS) {
      if (p[k] >= KRAV) continue;
      const ids = new Set(lhr.categories[k].auditRefs.filter(x => x.weight > 0).map(x => x.id));
      const brister = Object.values(lhr.audits).filter(a => ids.has(a.id) && a.score !== null && a.score < 1).map(a => `${a.id} ${a.displayValue ?? ''}`.trim());
      fel.push(`${sokvag}: ${k} ${Math.round(p[k] * 100)} (${brister.join(', ')})`);
    }
    // Det som drar ner Accessibility, även när kravet nås, så att det går att rätta.
    const brist = Object.values(lhr.audits).filter(a => lhr.categories.accessibility.auditRefs.some(x => x.id === a.id && x.weight > 0) && a.score !== null && a.score < 1).map(a => a.id);
    if (brist.length) console.log(`${sokvag}: Accessibility under 100: ${brist.join(', ')}`);
  }
} finally {
  await chrome.kill();
  server.close();
}
const tabell = ['| Sida | Performance | Accessibility | Best Practices | SEO (räknas inte) | Performance i varje körning | CLS | LCP |', '|---|---|---|---|---|---|---|---|', ...rader].join('\n');
console.log(tabell);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Lighthouse, mobil (median av ${KORNINGAR})\n\n${tabell}\n`);
if (fel.length) { console.error(`Under ${KRAV * 100}:\n${fel.join('\n')}`); process.exit(1); }
console.log(`Alla sidor når minst ${KRAV * 100} i Performance, Accessibility och Best Practices.`);
