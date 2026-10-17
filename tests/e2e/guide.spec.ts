// Guidesystemet: välkomstguiden per användare, hjälppanelen, exempelläget och kom igång live.
import { expect, test } from '@playwright/test';
import { loggaInSom, oppnaMeny, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => { v = await skapaE2eVarld('gu-' + test.info().project.name); });
test.afterAll(async () => { await v?.stang(); });

test('välkomstguiden visas första gången, sparas per användare och kan öppnas igen', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}/avrakning`);
  const guide = page.getByRole('dialog');
  await expect(guide).toHaveAccessibleName('Välkommen till Avräkning');
  await expect(guide).toContainText('1 av 4');
  await tillganglig(page);
  for (let i = 0; i < 3; i++) await guide.getByRole('button', { name: 'Nästa' }).click();
  await expect(guide).toContainText('4 av 4');
  await guide.getByRole('button', { name: 'Klar' }).click();
  await expect(guide).toHaveCount(0);
  await expect.poll(async () => (await v.db.query(`select count(*)::int c from public.guide_progress where user_id = $1 and step_key = 'valkommen'`, [v.ekonomi.id])).rows[0].c).toBe(1);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Avräkning' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Hjälpen för vyn man står i, och välkomstguiden igen därifrån.
  await page.getByRole('button', { name: 'Så funkar det' }).click();
  const hjalp = page.getByRole('dialog', { name: 'Så funkar filer' });
  await expect(hjalp).toContainText('Dra in allt på en gång.');
  await tillganglig(page);
  await page.keyboard.press('Escape');
  await expect(hjalp).toHaveCount(0);
  await page.getByRole('button', { name: 'Kontroll' }).click();
  await page.getByRole('button', { name: 'Så funkar det' }).click();
  await expect(page.getByRole('dialog', { name: 'Så funkar kontroll' })).toContainText('Röda rader behöver en titt.');
  await page.getByRole('button', { name: 'Visa välkomstguiden igen' }).click();
  await expect(page.getByRole('dialog', { name: 'Välkommen till Avräkning' })).toBeVisible();
});

test('en annan användare i samma konto får sin egen välkomstguide, och exempelläget visar en banderoll', async ({ page }) => {
  await loggaInSom(page, v.multi.email);
  await page.goto(`/${v.A.slug}/avrakning`);
  const guide = page.getByRole('dialog', { name: 'Välkommen till Avräkning' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Prova med exempeldata' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Exempeldata.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Filer', exact: true })).toContainText('Exempelläge');
  await tillganglig(page);
  await page.getByRole('button', { name: 'Avsluta exempelläget' }).click();
  await expect(page.getByText('Inget du gör här sparas.')).toHaveCount(0);
  // Filhjälpen
  await page.getByText('Var hittar jag filen?').first().click();
  await expect(page.getByText(/Var: /).first()).toBeVisible();
});

test('kom igång på Hem bockas av live när någon i kontot gör steget', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}`);
  const lista = page.getByRole('region', { name: /Kom igång/ });
  await expect(lista).toHaveAccessibleName('Kom igång 0 av 6');
  await tillganglig(page);
  await v.db.query(`insert into public.documents (tenant_id, module_key, path, data) values ($1, 'avrakning', 'settings/bolag', $2)`, [v.A.id, { list: [{ namn: 'Testbolag AB' }] }]);
  await expect(lista).toHaveAccessibleName('Kom igång 1 av 6');
  await expect(lista.locator('[data-steg="bolag"]')).toHaveAttribute('data-klar', 'true');
  await oppnaMeny(page);
  await page.getByRole('navigation', { name: 'Huvudmeny' }).getByRole('link', { name: 'Avräkning' }).click();
  await expect(page).toHaveURL(new RegExp(`/${v.A.slug}/avrakning$`));
});

test('välkomstguiden visas för en ny användare i varje app, och inte igen efter omladdning', async ({ page }) => {
  // Kontot A får också tripkassan, så att alla tre nya guider prövas (Lön och kassa, Lön och bokföring och Verkstad i B).
  await v.db.query(`insert into public.licenses (tenant_id, module_key) values ($1, 'tripkassan') on conflict do nothing`, [v.A.id]);
  await loggaInSom(page, v.multi.email);
  for (const [konto, modul, rubrik] of [[v.A.slug, 'akarkassan', 'Välkommen till Lön och kassa'], [v.A.slug, 'tripkassan', 'Välkommen till Lön och bokföring'], [v.B.slug, 'foliering', 'Välkommen till Verkstad']] as const) {
    await page.goto(`/${konto}/${modul}`);
    const guide = page.getByRole('dialog', { name: rubrik });
    await expect(guide, rubrik).toBeVisible();
    await expect(guide.getByRole('button', { name: 'Prova med exempeldata' })).toBeVisible();
    await guide.getByRole('button', { name: 'Hoppa över' }).click();
    await expect(guide).toHaveCount(0);
    // Dialogen stängs direkt och steget sparas i bakgrunden. Vänta tills det finns i databasen, annars kan
    // omladdningen avbryta sparningen (föll så i CI 38563064729).
    const kontoId = konto === v.A.slug ? v.A.id : v.B.id;
    await expect.poll(async () => (await v.db.query(`select count(*)::int c from public.guide_progress where user_id = $1 and tenant_id = $2 and module_key = $3 and step_key = 'valkommen'`, [v.multi.id, kontoId, modul])).rows[0].c, rubrik + ' sparad').toBe(1);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('dialog'), rubrik + ' efter omladdning').toHaveCount(0);
  }
});
