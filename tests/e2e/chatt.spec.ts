// Chatten med assistenten (startsidan): frågan skickas, svaret strömmas och det agenten hämtar öppnas i panelen
// till höger. Serverfunktionen assistent spelas upp här (ingen riktig AI i testerna). Agentens logik testas i
// packages/server/assistent.test.ts.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { loggaInSom, oppnaChattmeny, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => { v = await skapaE2eVarld('ch-' + test.info().project.name); });
test.afterAll(async () => { await v?.stang(); });

const sse = (h: unknown[]) => h.map(x => `data: ${JSON.stringify(x)}\n\n`).join('');

/** Spelar upp serverfunktionen assistent. Svarar med det som står först i kön. */
async function spelaUpp(page: Page, ko: ((kropp: Record<string, unknown>) => unknown[])[]) {
  const anrop: Record<string, unknown>[] = [];
  await page.route('**/functions/v1/assistent', async r => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const kropp = r.request().postDataJSON() as Record<string, unknown>;
    anrop.push(kropp);
    const nasta = ko.shift();
    return r.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: sse(nasta ? nasta(kropp) : [{ typ: 'fel', kod: 'x', text: 'Slut.' }]) });
  });
  return anrop;
}

test('en fråga: svaret strömmas, datan öppnas i panelen och samtalet får en egen adress', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  const samtal = randomUUID();
  const anrop = await spelaUpp(page, [
    () => [
      { typ: 'samtal', id: samtal, titel: 'Vilka bilar finns?' },
      { typ: 'text', text: 'Jag hämtar bilregistret.' },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar settings/bilar från Avräkning', status: 'pagar' } },
      { typ: 'panel', verktyg: 'v1', panel: { id: 'p1', typ: 'data', rubrik: 'Avräkning: settings/bilar', app: 'avrakning', kalla: 'Avräkning, settings/bilar', data: { list: [{ bil: 101, akeri: 'Teståkeri 1' }, { bil: 102, akeri: 'Teståkeri 2' }] }, avkortad: false } },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar settings/bilar från Avräkning', status: 'klar' } },
      { typ: 'text', text: '\n\nDet finns **2 bilar** i registret.' },
      { typ: 'klar', meddelande: { id: 'm1', roll: 'assistent', delar: [{ typ: 'text', text: 'Jag hämtar bilregistret.' }, { typ: 'verktyg', verktyg: { id: 'v1', namn: 'hamta_data', etikett: 'Hämtar settings/bilar från Avräkning', status: 'klar' }, panel: 'p1' }, { typ: 'text', text: '\n\nDet finns **2 bilar** i registret.' }] } },
    ],
  ]);
  await page.goto(`/${v.A.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testperson');
  await tillganglig(page);

  await page.getByLabel('Skriv till assistenten').fill('Vilka bilar finns?');
  await page.getByLabel('Skriv till assistenten').press('Enter');
  await expect(page.getByText('Det finns')).toContainText('2 bilar');
  await expect(page).toHaveURL(new RegExp(`/${v.A.slug}/chatt/${samtal}$`));
  expect(anrop[0]).toMatchObject({ konto: v.A.id, text: 'Vilka bilar finns?' });

  const panel = page.getByRole('complementary', { name: 'Panelen' });
  await expect(panel.getByRole('tab', { name: /settings\/bilar/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('table')).toContainText('Teståkeri 2');
  await tillganglig(page);

  // Stäng panelen och öppna den igen från kortet i svaret.
  await panel.getByRole('button', { name: 'Stäng panelen' }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: /settings\/bilar\. Visa i panelen/ }).click();
  await expect(page.getByRole('complementary', { name: 'Panelen' })).toBeVisible();
});

test('ett förslag väntar på godkännande, och ett avböjt förslag berättas för assistenten', async ({ page }) => {
  // multi är ekonomi i B, som har Verkstad.
  await loggaInSom(page, v.multi.email);
  const samtal = randomUUID();
  const anrop = await spelaUpp(page, [
    () => [
      { typ: 'samtal', id: samtal, titel: 'Markera betald' },
      { typ: 'verktyg', verktyg: { id: 'v1', namn: 'foresla_atgard', etikett: 'Förbereder en åtgärd i Verkstad', status: 'klar' } },
      { typ: 'panel', verktyg: 'v1', panel: { id: 'p1', typ: 'atgard', rubrik: 'Markera fakturan som betald', app: 'foliering', atgard: { namn: 'betald', arende: 'a1', args: [], beskrivning: 'Faktura 1043 markeras som betald.', krav: 'Fakturan finns och är inte betald.' } } },
      { typ: 'text', text: 'Förslaget väntar på ditt godkännande.' },
      { typ: 'klar', meddelande: { id: 'm1', roll: 'assistent', delar: [{ typ: 'verktyg', verktyg: { id: 'v1', namn: 'foresla_atgard', etikett: 'Förbereder en åtgärd i Verkstad', status: 'klar' }, panel: 'p1' }, { typ: 'text', text: 'Förslaget väntar på ditt godkännande.' }] } },
    ],
    () => [{ typ: 'samtal', id: samtal, titel: 'Markera betald' }, { typ: 'text', text: 'Okej, jag gör inget.' }, { typ: 'klar', meddelande: { id: 'm2', roll: 'assistent', delar: [{ typ: 'text', text: 'Okej, jag gör inget.' }] } }],
  ]);
  await page.goto(`/${v.B.slug}`);
  await page.getByLabel('Skriv till assistenten').fill('Markera faktura 1043 som betald');
  await page.getByRole('button', { name: 'Skicka' }).click();
  const panel = page.getByRole('complementary', { name: 'Panelen' });
  await expect(panel).toContainText('Faktura 1043 markeras som betald.');
  await expect(panel.getByRole('button', { name: 'Godkänn och utför' })).toBeVisible();
  await tillganglig(page);
  await panel.getByRole('button', { name: 'Avböj' }).click();
  await expect(panel.getByRole('status')).toContainText('Avböjt');
  await expect(page.getByText('Okej, jag gör inget.')).toBeVisible();
  expect(anrop[1]).toMatchObject({ samtal, text: 'Jag avböjde förslaget.', beslut: { panel: 'p1', utfall: 'avbojd' } });
});

test('en app öppnas i panelen från menyn utan att fråga assistenten', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}`);
  const meny = await oppnaChattmeny(page);
  await meny.getByRole('button', { name: 'Avräkning', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Panelen' });
  await expect(panel.getByRole('tab', { name: /Avräkning/ })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('link', { name: 'Helsida' })).toBeVisible();
});
