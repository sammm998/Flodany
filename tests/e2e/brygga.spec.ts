// Legacy-bryggan: bara interna konton (beslut 8 och ägarens tillägg 2026-10-12). Kassorna inte för läs-rollen.
import { expect, test } from '@playwright/test';
import { loggaInSom, oppnaMeny, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => { v = await skapaE2eVarld('br-' + test.info().project.name); });
test.afterAll(async () => { await v?.stang(); });

test('internt konto: den nuvarande avräkningen öppnas och sparar via plattformens API', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}/avrakning`);
  await page.getByRole('dialog').getByRole('button', { name: 'Hoppa över' }).click();
  const svar = page.waitForResponse(r => r.url().includes('/functions/v1/legacy'));
  await page.getByRole('link', { name: 'Öppna nuvarande app' }).click();
  expect((await svar).status()).toBe(200);
  const ram = page.frameLocator('iframe[title="Nuvarande app"]');
  await expect(ram.locator('body')).toContainText(/Avräkning/);
  // Appen når databasen genom bryggan, med användarens rättigheter.
  // Ramen hämtas från elementet. Legacy-appen kan själv skapa dolda ramar, så page.frames() räcker inte.
  const frame = (await (await page.locator('iframe[title="Nuvarande app"]').elementHandle())!.contentFrame())!;
  // Ramen kan först vara en tom sida innan srcdoc har laddats. Vänta tills bryggan har satt window.claude.
  await frame.waitForFunction(() => !!(window as unknown as { claude?: unknown }).claude, undefined, { timeout: 15_000 });
  await frame.evaluate(async () => {
    const db = await (window as unknown as { claude: { use: (n: string) => Promise<{ doc: (p: string) => { set: (v: unknown) => Promise<void> } }> } }).claude.use('db');
    await db.doc('settings/params').set({ fran: 'bryggan' });
  });
  await expect.poll(async () => (await v.db.query(`select data from public.documents where tenant_id = $1 and module_key = 'avrakning' and path = 'settings/params'`, [v.A.id])).rows[0]?.data).toEqual({ fran: 'bryggan' });
  await tillganglig(page);
});

test('externt konto: servern svarar 403 och ingen legacy-kod når webbläsaren', async ({ page }) => {
  await loggaInSom(page, v.multi.email);
  await page.goto(`/${v.B.slug}/foliering`);
  await page.getByRole('dialog', { name: 'Välkommen till Verkstad' }).getByRole('button', { name: 'Hoppa över' }).click();
  await expect(page.getByRole('link', { name: 'Öppna nuvarande app' })).toHaveCount(0);
  const svar = page.waitForResponse(r => r.url().includes('/functions/v1/legacy'));
  await page.goto(`/${v.B.slug}/foliering/legacy`);
  const r = await svar;
  expect(r.status()).toBe(403);
  expect(await r.text()).not.toContain('<script');
  await expect(page.getByRole('alert')).toContainText('De nuvarande apparna finns bara för interna konton.');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('läs-rollen: kassorna syns inte i menyn, nås inte direkt och bryggan nekar', async ({ page }) => {
  await loggaInSom(page, v.las.email);
  await page.goto(`/${v.A.slug}`);
  await oppnaMeny(page);
  const meny = page.getByRole('navigation', { name: 'Huvudmeny' });
  await expect(meny.getByRole('link', { name: 'Avräkning' })).toBeVisible();
  await expect(meny.getByRole('link', { name: 'Lön och kassa' })).toHaveCount(0);
  await page.goto(`/${v.A.slug}/akarkassan`);
  await expect(page.getByRole('region', { name: 'Ingen åtkomst' })).toBeVisible();
  const svar = page.waitForResponse(r => r.url().includes('/functions/v1/legacy'));
  await page.goto(`/${v.A.slug}/akarkassan/legacy`);
  expect((await svar).status()).toBe(403);
});

test('ramen fyller ytan till höger om menyn, sidan rullar inte, och helskärm döljer menyn och toppraden', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}/akarkassan/legacy`);
  const ram = page.locator('iframe[title="Nuvarande app"]');
  await expect(ram).toBeVisible();
  const vp = page.viewportSize()!;
  const yta = async () => (await ram.boundingBox())!;
  const meny = page.getByRole('navigation', { name: 'Huvudmeny' });
  const menyBredd = (await meny.isVisible()) ? (await page.locator('.fl-sidomeny').boundingBox())!.width : 0;
  // Bredd: hela ytan till höger om menyn (minus en smal kant). Höjd: ner till fönstrets nederkant.
  await expect.poll(async () => (await yta()).width).toBeGreaterThan(vp.width - menyBredd - 40);
  await expect.poll(async () => { const b = await yta(); return b.y + b.height; }).toBeGreaterThan(vp.height - 20);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight + 1), 'sidan själv rullar inte').toBe(true);

  await page.getByRole('button', { name: 'Helskärm' }).click();
  await expect(page.locator('.fl-toppfalt')).toBeHidden();
  await expect(page.locator('.fl-sidomeny')).toBeHidden();
  await expect.poll(async () => (await yta()).width).toBeGreaterThan(vp.width - 4);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fl-toppfalt')).toBeVisible();

  // Esc fungerar även när fokus är inne i appen, och knappen går också tillbaka.
  await page.getByRole('button', { name: 'Helskärm' }).click();
  await page.frameLocator('iframe[title="Nuvarande app"]').locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Escape');
  await expect(page.locator('.fl-toppfalt')).toBeVisible();
  await page.getByRole('button', { name: 'Helskärm' }).click();
  await page.getByRole('button', { name: 'Avsluta helskärm (Esc)' }).click();
  await expect(page.locator('.fl-toppfalt')).toBeVisible();
  await tillganglig(page);
});
