// Excel-exporten i de nuvarande kassorna via bryggan: filnamnet "Lön och bokföring <bolag> <ÅÅÅÅ-MM>.xlsx" och
// "Lön och kassa …", med å, ä och ö (ägarens beslut 2026-10-15). Påhittad data: inställningar och mars 2026 ur
// packages/core/lon/fixtures/ldl.txt. Chromium, samma motor som Chrome och Edge.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loggaInSom, skapaE2eVarld, type E2eKonto, type E2eVarld } from './varld';

const LDL = readFileSync(join(import.meta.dirname, '..', '..', 'packages', 'core', 'lon', 'fixtures', 'ldl.txt'), 'utf8');
const BOLAG = 'Åäö Exempel AB';
const baraBred = () => test.skip(test.info().project.name !== 'bred', 'en gång räcker');

let v: E2eVarld;
let sub: E2eKonto;
test.beforeAll(async () => {
  if (test.info().project.name !== 'bred') return;
  v = await skapaE2eVarld('ex-' + test.info().project.name);
  const slug = `${v.A.slug}-ex`, namn = `Testbolag export ${v.A.slug.slice(4)}`;
  const { rows } = await v.db.query(`insert into public.tenants (type, name, slug, parent_id, intern) values ('sub', $1, $2, $3, true) returning id`, [namn, slug, v.A.id]);
  sub = { id: rows[0].id, slug, namn };
  for (const m of ['akarkassan', 'tripkassan']) {
    await v.db.query(`insert into public.licenses (tenant_id, module_key, variant) values ($1, $2, 'sub')`, [sub.id, m]);
    await v.db.query(`insert into public.documents (tenant_id, module_key, path, data) values ($1, $2, 'settings', $3)`, [sub.id, m, { foretag: BOLAG, cfg: {}, forare: {}, bilar: {} }]);
    await v.db.query(`insert into public.documents (tenant_id, module_key, path, data) values ($1, $2, 'm-2026-03', $3)`, [sub.id, m, { ldl: LDL, forare: {}, overrides: {} }]);
  }
  await v.db.query(`insert into public.memberships (user_id, tenant_id, role) values ($1, $2, 'admin')`, [v.multi.id, sub.id]);
});
test.afterAll(async () => {
  if (sub) await v.db.query('delete from public.tenants where id = $1', [sub.id]);
  await v?.stang();
});

for (const [app, prefix] of [['tripkassan', 'Lön och bokföring'], ['akarkassan', 'Lön och kassa']] as const) {
  test(`Excel från ${app}: filnamnet har å, ä och ö`, async ({ page }) => {
    baraBred();
    await loggaInSom(page, v.multi.email);
    await page.goto(`/${sub.slug}/${app}/legacy`);
    const ram = page.frameLocator('iframe[title="Nuvarande app"]');
    const knapp = ram.locator('#btnExport');
    await expect(knapp).toBeVisible({ timeout: 30_000 });
    const [nedladdning] = await Promise.all([page.waitForEvent('download'), knapp.click()]);
    expect(nedladdning.suggestedFilename()).toBe(`${prefix} ${BOLAG} 2026-03.xlsx`);
    const fil = readFileSync((await nedladdning.path())!);
    expect(fil.subarray(0, 2).toString('latin1')).toBe('PK');
  });
}
