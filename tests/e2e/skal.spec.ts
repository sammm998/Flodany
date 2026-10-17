// Skalet: brödsmulan bryts aldrig, inte heller på smal skärm med ett långt bolagsnamn.
import { expect, test } from '@playwright/test';
import { loggaInSom, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => {
  v = await skapaE2eVarld('sk-' + test.info().project.name);
  await v.db.query('update public.tenants set name = $1 where id = $2', ['Testbolaget med ett mycket långt namn för att pröva brödsmulan AB', v.A.id]);
});
test.afterAll(async () => { await v?.stang(); });

test('brödsmulan är en rad och ryms i toppraden', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}/avrakning`);
  await page.getByRole('dialog').getByRole('button', { name: 'Hoppa över' }).click();
  const smulor = page.getByRole('navigation', { name: 'Du är här' });
  const sista = smulor.getByText('Avräkning', { exact: true });
  await expect(sista).toBeVisible();
  const lista = (await smulor.locator('ol').boundingBox())!, rad = (await sista.boundingBox())!;
  expect(lista.height, 'en rad').toBeLessThan(rad.height * 1.5);
  const topp = (await page.locator('.fl-toppfalt').boundingBox())!;
  expect(topp.height, 'toppraden växer inte').toBeLessThan(70);
  expect(lista.x + lista.width, 'inom fönstret').toBeLessThanOrEqual(page.viewportSize()!.width);
  const konto = smulor.getByRole('link', { name: /Testbolaget med ett mycket långt namn/ });
  // Hela vägen finns kvar för skärmläsare. Den syns på bred skärm men inte på smal.
  await expect(konto).toHaveCount(1);
  if (page.viewportSize()!.width >= 1000) await expect(konto).toBeVisible();
  // Smal skärm: smulans li är 1 punkt bred och klipper innehållet (länken själv rapporterar sin egen bredd).
  else expect((await konto.locator('xpath=ancestor::li[1]').boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  await tillganglig(page);
});
