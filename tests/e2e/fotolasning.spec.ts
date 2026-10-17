// Fotoläsningen av klädlistan i Avräkning: knappen syns bara när funktionen är påslagen för kontot, och bara för
// admin och ekonomi. CI har ingen nyckel till Anthropic, så läsningen svarar "inte konfigurerad" hela vägen från servern.
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { beskriv, faltAvvikelser } from './falt';
import { loggaInSom, skapaE2eVarld, type E2eVarld } from './varld';

const FOTO = join(import.meta.dirname, '..', '..', 'packages', 'server', 'fixtures', 'kladlista-ny.png');
const baraBred = () => test.skip(test.info().project.name !== 'bred', 'en gång räcker, bredderna sätts i testet');

let v: E2eVarld;
test.beforeAll(async () => {
  if (test.info().project.name !== 'bred') return;
  v = await skapaE2eVarld('foto-' + test.info().project.name);
});
test.afterAll(async () => { await v?.stang(); });

async function avrakning(page: Page) {
  await page.goto(`/${v.A.slug}/avrakning`);
  const guide = page.getByRole('dialog');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (await guide.isVisible()) await guide.getByRole('button', { name: 'Hoppa över' }).click();
  await expect(page.getByRole('status').filter({ hasText: /^Laddar/ })).toHaveCount(0);
}

test('fotoläsningen: av från början, knappen syns bara när den är påslagen', async ({ page }) => {
  baraBred();
  await loggaInSom(page, v.multi.email);
  await avrakning(page);
  await expect(page.getByRole('button', { name: 'Läs klädlista från foto' })).toHaveCount(0);

  await v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel) values ($1, 'avrakning.fotolasning')`, [v.A.id]);
  await avrakning(page);
  const knapp = page.getByRole('button', { name: 'Läs klädlista från foto' });
  await expect(knapp).toBeVisible();

  // Fältet och knappen följer regeln om fält i samma rad, i båda bredderna.
  const fel: string[] = [];
  for (const bredd of [1280, 390]) {
    await page.setViewportSize({ width: bredd, height: 900 });
    fel.push(...beskriv('Avräkning, klädlista från foto', bredd, await faltAvvikelser(page)));
  }
  expect(fel, fel.join('\n')).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Hela vägen till servern: fotot förminskas, skickas och svaret visas. Utan nyckel i CI: inte konfigurerad.
  await page.locator('input[type=file]').setInputFiles(FOTO);
  await expect(page.getByRole('alert')).toHaveText('Fotoläsningen är inte konfigurerad på servern.');
  const { rows } = await v.db.query(`select detalj from public.audit_log where tenant_id = $1 and action = 'fotolasning.last'`, [v.A.id]);
  expect(rows.map(r => r.detalj)).toEqual([{ rader: 0, fel: 'ej_konfigurerad' }]);
});

test('fotoläsningen: läs-rollen ser aldrig knappen', async ({ page }) => {
  baraBred();
  await v.db.query(`insert into public.konto_funktioner (tenant_id, nyckel) values ($1, 'avrakning.fotolasning') on conflict do nothing`, [v.A.id]);
  await loggaInSom(page, v.las.email);
  await avrakning(page);
  await expect(page.getByRole('button', { name: 'Läs klädlista från foto' })).toHaveCount(0);
});
