// Fält i samma rad står på samma linje (docs/designsystem.md). Alla vyer i plattformen, i 1280 och 390
// punkters bredd. Legacy-apparna ingår inte: bryggans adresser besöks inte och ramar mäts aldrig.
import { expect, test, type Page } from '@playwright/test';
import { beskriv, faltAvvikelser } from './falt';
import { loggaInSom, skapaE2eVarld, type E2eVarld } from './varld';

const BREDDER = [1280, 390];

/** Testet byter själv bredd, så det körs bara i projektet "bred". */
const baraBred = () => test.skip(test.info().project.name !== 'bred', 'bredderna sätts i testet');

let v: E2eVarld;
test.beforeAll(async () => {
  if (test.info().project.name !== 'bred') return;
  v = await skapaE2eVarld('fa-' + test.info().project.name);
  await v.db.query(`insert into public.licenses (tenant_id, module_key) values ($1, 'tripkassan') on conflict do nothing`, [v.A.id]);
});
test.afterAll(async () => { await v?.stang(); });

/** Väntar tills sidan har ritats klart (ingen laddning kvar). */
async function klar(page: Page) {
  await expect(page.locator('#innehall, main').first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /^Laddar/ })).toHaveCount(0);
}

async function mat(page: Page, vy: string, fel: string[]) {
  for (const bredd of BREDDER) {
    await page.setViewportSize({ width: bredd, height: 900 });
    await klar(page);
    fel.push(...beskriv(vy, bredd, await faltAvvikelser(page)));
  }
  // Tillbaka till bred skärm, så att menyn och kontoblocket går att klicka på.
  await page.setViewportSize({ width: BREDDER[0]!, height: 900 });
}

test('kontrollen hittar fält i samma rad med olika underkant eller höjd', async ({ page }) => {
  baraBred();
  // Visar att testet slår larm: två fält i en rad, det ena med en etikett på två rader och ett högre fält.
  await page.setContent(`<main><form style="display:flex;gap:12px;align-items:flex-start">
    <label>Kort<input style="display:block;height:40px"></label>
    <label style="width:90px">En lång etikett som bryts på två rader<select style="display:block;height:30px"></select></label>
  </form></main>`);
  const a = await faltAvvikelser(page);
  expect(a).toHaveLength(1);
  expect(beskriv('testsida', 1280, a)[0]).toMatch(/testsida vid 1280 punkter: "Kort" underkant .* höjd 40, "En lång etikett/);
  // Inom toleransen godtas.
  await page.setContent(`<main><form style="display:flex;align-items:flex-end"><input style="height:40px"><input style="height:40.6px"></form></main>`);
  expect(await faltAvvikelser(page)).toEqual([]);
});

test('fält i samma rad: vyer utan inloggning', async ({ page }) => {
  baraBred();
  const fel: string[] = [];
  await page.goto('/logga-in');
  await mat(page, 'Inloggning', fel);
  await page.getByLabel('E-post').fill(`falt-${Date.now()}@example.se`);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByLabel('Eller skriv koden från mejlet')).toBeVisible();
  await mat(page, 'Inloggning, koden', fel);
  await page.goto('/logga-in/bekrafta');
  await mat(page, 'Bekräfta inloggning', fel);
  expect(fel, fel.join('\n')).toEqual([]);
});

test('fält i samma rad: alla vyer i kontot', async ({ page }) => {
  baraBred();
  const fel: string[] = [];
  await loggaInSom(page, v.multi.email);
  await page.goto('/valj-konto');
  await mat(page, 'Välj bolag', fel);

  for (const [konto, namn] of [[v.A, 'A'], [v.B, 'B']] as const) {
    await page.goto(`/${konto.slug}`);
    await mat(page, `Hem ${namn}`, fel);
    await page.getByRole('button', { name: 'Så funkar det' }).click();
    await mat(page, `Hem ${namn}, hjälppanelen`, fel);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Konto: / }).click();
    await mat(page, `Hem ${namn}, byt bolag`, fel);
    await page.keyboard.press('Escape');
  }

  for (const [konto, modul] of [[v.A, 'avrakning'], [v.A, 'akarkassan'], [v.A, 'tripkassan'], [v.B, 'foliering']] as const) {
    await page.goto(`/${konto.slug}/${modul}`);
    await mat(page, `${modul}, välkomstguiden`, fel);
    const guide = page.getByRole('dialog');
    if (await guide.count()) await guide.getByRole('button', { name: 'Prova med exempeldata' }).click();
    await mat(page, `${modul}, exempelläge`, fel);
    const avsluta = page.getByRole('button', { name: 'Avsluta exempelläget' });
    if (await avsluta.isVisible()) await avsluta.click();
    for (const vy of await page.getByRole('group', { name: 'Vyer' }).getByRole('button').all()) {
      await vy.click();
      await mat(page, `${modul}, vyn ${(await vy.textContent())?.trim()}`, fel);
    }
  }

  await page.goto(`/${v.B.slug}/finns-inte`);
  await mat(page, 'Ingen åtkomst', fel);
  expect(fel, fel.join('\n')).toEqual([]);
});
