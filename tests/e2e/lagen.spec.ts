// Laddning, felläge och tomt läge (klar-krav i spec v3 s. 49), och en lång session där token förnyas
// medan livevisningen är öppen (krav från granskningen av 2c).
import { expect, test } from '@playwright/test';
import { anslutning } from '../db/miljo';
import { loggaInSom, skapaE2eVarld, tillganglig, type E2eVarld } from './varld';

let v: E2eVarld;
test.beforeAll(async () => { v = await skapaE2eVarld('la-' + test.info().project.name); });
test.afterAll(async () => { await v?.stang(); });

test('laddning och felläge när apparna inte går att hämta, och försök igen', async ({ page }) => {
  await loggaInSom(page, v.ekonomi.email);
  let fel = true;
  await page.route('**/rest/v1/licenses**', async r => {
    if (fel) { await new Promise(x => setTimeout(x, 400)); await r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"fel"}' }); }
    else await r.continue();
  });
  await page.goto(`/${v.A.slug}`);
  await expect(page.getByRole('status').filter({ hasText: 'Laddar' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Apparna kunde inte hämtas.');
  await tillganglig(page);
  fel = false;
  await page.getByRole('button', { name: 'Försök igen' }).click();
  await expect(page.getByRole('region', { name: 'Appar' })).toContainText('Avräkning');
});

test('tomt läge säger vad nästa steg är', async ({ page }) => {
  await loggaInSom(page, v.tom.email);
  await page.goto(`/${v.C.slug}`);
  await expect(page.getByRole('region', { name: 'Inga appar än' })).toContainText('Kontakta Flödia');
  await tillganglig(page);
});

test('lång session: token förnyas och livevisningen fortsätter', async ({ page }) => {
  await page.clock.install({ time: new Date() });
  const forsta = await loggaInSom(page, v.ekonomi.email);
  await page.goto(`/${v.A.slug}`);
  const lista = page.getByRole('region', { name: /Kom igång/ });
  await expect(lista).toHaveAccessibleName('Kom igång 0 av 6');

  // Två timmar framåt i webbläsaren: sessionen har gått ut där och förnyas av supabase-js (TOKEN_REFRESHED).
  const nyckel = `sb-${new URL(anslutning().url).hostname.split('.')[0]}-auth-token`;
  await page.clock.fastForward('02:00:00');
  await expect.poll(async () => JSON.parse((await page.evaluate(k => localStorage.getItem(k), nyckel)) ?? '{}').access_token).not.toBe(forsta.access_token);

  // En ändring i kontot syns fortfarande live, via Realtime med den nya token.
  await v.db.query(`insert into public.documents (tenant_id, module_key, path, data) values ($1, 'avrakning', 'settings/bilar', $2)`, [v.A.id, { list: [{ nr: 1 }] }]);
  await expect(lista).toHaveAccessibleName('Kom igång 1 av 6');
});
