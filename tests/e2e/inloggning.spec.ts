// Inloggning med länken från Mailpit, kontoväljaren, byte av konto och utloggning, i 1280 och 375 punkter.
import { expect, test } from '@playwright/test';
import { loggaInSom, mejl, oppnaMeny, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => { v = await skapaE2eVarld('in-' + test.info().project.name); });
test.afterAll(async () => { await v?.stang(); });

test('inloggning med länken i mejlet, välj konto, byt konto, och A syns aldrig under B', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/logga-in$/);
  await tillganglig(page);
  await page.getByLabel('E-post').fill(v.multi.email);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('status')).toContainText('Om adressen har ett konto har vi skickat en länk');

  const m = await mejl(v.multi.email);
  const lank = m!.HTML.match(/href="([^"]*\/logga-in\/bekrafta\?[^"]*)"/)![1]!.replace(/&amp;/g, '&');
  await page.goto(lank);
  await expect(page).toHaveURL(/\/valj-konto$/);
  await expect(page.getByRole('heading', { name: 'Välj bolag' })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(v.A.namn) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(v.B.namn) })).toBeVisible();
  await tillganglig(page);

  await page.getByRole('button', { name: new RegExp(v.A.namn) }).click();
  await expect(page).toHaveURL(new RegExp(`/${v.A.slug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Testperson');
  await oppnaMeny(page);
  const meny = page.getByRole('navigation', { name: 'Huvudmeny' });
  await expect(meny.getByRole('link', { name: 'Avräkning' })).toBeVisible();
  await expect(meny.getByRole('link', { name: 'Lön och kassa' })).toBeVisible();
  await expect(meny.getByRole('link', { name: 'Verkstad' })).toHaveCount(0);
  await tillganglig(page);

  // Byt konto i kontoblocket uppe till vänster.
  await page.getByRole('button', { name: new RegExp(`Konto: ${v.A.namn}`) }).click();
  await page.getByRole('dialog', { name: 'Byt bolag' }).getByRole('button', { name: new RegExp(v.B.namn) }).click();
  await expect(page).toHaveURL(new RegExp(`/${v.B.slug}$`));
  await oppnaMeny(page);
  await expect(meny.getByRole('link', { name: 'Verkstad' })).toBeVisible();
  await expect(meny.getByRole('link', { name: 'Avräkning' })).toHaveCount(0);
  await expect(page.getByText(v.A.namn)).toHaveCount(0);
});

test('okänd adress får samma svar och inget mejl, och koden i mejlet loggar in', async ({ page }) => {
  await page.goto('/logga-in');
  await page.getByLabel('E-post').fill(`okand-${Date.now()}@example.se`);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  await expect(page.getByRole('status')).toContainText('Om adressen har ett konto har vi skickat en länk');

  await page.goto('/logga-in');
  await page.getByLabel('E-post').fill(v.tom.email);
  await page.getByRole('button', { name: 'Skicka inloggningslänk' }).click();
  const kod = (await mejl(v.tom.email))!.HTML.match(/koden: <strong[^>]*>(\d{6})</)![1]!;
  await page.getByLabel('Eller skriv koden från mejlet').fill(kod);
  await page.getByRole('button', { name: 'Logga in med koden' }).click();
  // Ett konto: kontoväljaren hoppas över. Kontot har inga appar: tomt läge med nästa steg.
  await expect(page).toHaveURL(new RegExp(`/${v.C.slug}$`));
  await expect(page.getByRole('region', { name: 'Inga appar än' })).toBeVisible();
});

test('ett konto man inte är med i ger Ingen åtkomst, och utloggning rensar legacy-kopiorna', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.B.slug}`);
  await expect(page.getByRole('region', { name: 'Ingen åtkomst' })).toBeVisible();
  await page.goto(`/${v.A.slug}`);
  await page.evaluate(() => { localStorage.setItem('ak_settings', '{}'); localStorage.setItem('shim:months/2026-10', '{}'); });
  await page.getByLabel(/Inloggad som/).click();
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(page).toHaveURL(/\/logga-in$/);
  expect(await page.evaluate(() => [localStorage.getItem('ak_settings'), localStorage.getItem('shim:months/2026-10')])).toEqual([null, null]);
});
