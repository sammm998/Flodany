// Bolagets namn som rubrik i de nuvarande apparna (apps/platform/src/rubrik.ts). Legacy-filerna ändras inte.
// Del 1: de riktiga apparna via bryggan i ett internt underkonto. Del 2: rubrikfunktionen på påhittade sidhuvuden,
// för fallen som inte går att få fram via bryggan (inget namn). Körs i 1280 och 375 punkters bredd.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { fliktitel, visaBolagsnamn } from '../../apps/platform/src/rubrik';
import { loggaInSom, skapaE2eVarld, type E2eKonto, type E2eVarld } from './varld';

let v: E2eVarld;
let sub: E2eKonto;
test.beforeAll(async () => {
  v = await skapaE2eVarld('ru-' + test.info().project.name);
  // Ett internt underkonto under A med alla fyra apparna. multi är admin.
  const namn = `Testbolag underkonto ${v.A.slug.slice(4)}`, slug = `${v.A.slug}-sub`;
  const { rows } = await v.db.query(`insert into public.tenants (type, name, slug, parent_id, intern) values ('sub', $1, $2, $3, true) returning id`, [namn, slug, v.A.id]);
  sub = { id: rows[0].id, slug, namn };
  for (const m of ['avrakning', 'akarkassan', 'tripkassan', 'foliering']) await v.db.query(`insert into public.licenses (tenant_id, module_key, variant) values ($1, $2, 'sub')`, [sub.id, m]);
  await v.db.query(`insert into public.memberships (user_id, tenant_id, role) values ($1, $2, 'admin')`, [v.multi.id, sub.id]);
});
test.afterAll(async () => {
  if (sub) await v.db.query('delete from public.tenants where id = $1', [sub.id]);
  await v?.stang();
});

async function oppna(page: Page, app: string): Promise<Frame> {
  await page.goto(`/${sub.slug}/${app}/legacy`);
  const ram = page.locator('iframe[title="Nuvarande app"]');
  await expect(ram).toBeVisible();
  const frame = (await (await ram.elementHandle())!.contentFrame())!;
  await frame.waitForFunction(() => !!(window as unknown as { claude?: unknown }).claude, undefined, { timeout: 15_000 });
  return frame;
}

test.describe('rubriken i bryggan, internt underkonto', () => {
  test('kassorna i demoläge: bolagets namn som rubrik och "Lön och bokföring · Exempeldata" under', async ({ page }) => {
    await loggaInSom(page, v.multi.email);
    for (const [app, appnamn] of [['tripkassan', 'Lön och bokföring'], ['akarkassan', 'Lön och kassa']] as const) {
      const f = await oppna(page, app);
      await expect(f.locator('#coName')).toHaveText(`${appnamn} · Exempeldata`);
      await expect(f.locator('.co h1')).toHaveText(sub.namn);
      await expect(page).toHaveTitle(`${sub.namn} · ${appnamn}`);
    }
  });

  test('kassorna med inställningar: kontots namn som rubrik, inte appens inställda bolagsnamn, och appens namn under', async ({ page }) => {
    for (const app of ['tripkassan', 'akarkassan']) {
      await v.db.query(`insert into public.documents (tenant_id, module_key, path, data) values ($1, $2, 'settings', $3)`, [sub.id, app, { foretag: 'Inställt Namn AB', cfg: {}, forare: {}, bilar: {} }]);
    }
    await loggaInSom(page, v.multi.email);
    for (const [app, appnamn] of [['tripkassan', 'Lön och bokföring'], ['akarkassan', 'Lön och kassa']] as const) {
      const f = await oppna(page, app);
      await expect(f.locator('.co h1')).toHaveText(sub.namn);
      await expect(f.locator('#coName')).toHaveText(appnamn);
      await expect(f.locator('body')).not.toContainText('Inställt Namn AB');
      await expect(page).toHaveTitle(`${sub.namn} · ${appnamn}`);
    }
  });

  test('Avräkning och Verkstad: kontots namn som rubrik och appens namn under', async ({ page }) => {
    await loggaInSom(page, v.multi.email);
    const avr = await oppna(page, 'avrakning');
    await expect(avr.locator('#hMonth')).toHaveText(sub.namn);
    await expect(avr.locator('.titles small')).toHaveText(/^Avräkning/);
    await expect(page).toHaveTitle(`${sub.namn} · Avräkning`);
    const fol = await oppna(page, 'foliering');
    await expect(fol.locator('.wm b')).toHaveText(sub.namn);
    await expect(fol.locator('.wm small')).toHaveText('Verkstad');
    await expect(fol.locator('.brand')).toHaveAttribute('aria-label', sub.namn);
    await expect(page).toHaveTitle(`${sub.namn} · Verkstad`);
  });

  test('ett namn med HTML visas som text och körs aldrig', async ({ page }) => {
    const farligt = '<img src=x onerror=alert(1)>';
    const dialoger: string[] = [];
    page.on('dialog', d => { dialoger.push(d.message()); void d.dismiss(); });
    await v.db.query('update public.tenants set name = $1 where id = $2', [farligt, sub.id]);
    try {
      await loggaInSom(page, v.multi.email);
      for (const [app, rubrik, appnamn] of [['tripkassan', '.co h1', 'Lön och bokföring'], ['avrakning', '#hMonth', 'Avräkning'], ['foliering', '.wm b', 'Verkstad']] as const) {
        const f = await oppna(page, app);
        await expect(f.locator(rubrik)).toHaveText(farligt);
        expect(await f.locator('header img[src="x"]').count()).toBe(0);
        await expect.poll(() => page.title()).toBe(`${farligt} · ${appnamn}`);
      }
      expect(dialoger).toEqual([]);
    } finally {
      await v.db.query('update public.tenants set name = $1 where id = $2', [sub.namn, sub.id]);
    }
  });

  test('ett långt namn bryts utan att sidhuvudet går sönder', async ({ page }) => {
    // Påhittat namn i samma längd som ett riktigt långt bolagsnamn.
    const langt = 'Transportföretaget i Exempelstad AB';
    await v.db.query('update public.tenants set name = $1 where id = $2', [langt, sub.id]);
    try {
      await loggaInSom(page, v.multi.email);
      for (const [app, rubrik] of [['tripkassan', '.co h1'], ['akarkassan', '.co h1'], ['avrakning', '#hMonth'], ['foliering', '.wm b']] as const) {
        const f = await oppna(page, app);
        await expect(f.locator(rubrik)).toHaveText(langt);
        const matt = await f.evaluate((sel) => {
          const h = document.querySelector('header')!, r = document.querySelector(sel)!.getBoundingClientRect();
          // Sidhuvudet ska inte rulla i sidled, och rubriken ska rymmas i bredden. Resten av appens sida mäts inte här.
          return { sidhuvud: h.scrollWidth - h.clientWidth, hoger: r.right - innerWidth, synlig: r.width > 0 && r.height > 0 };
        }, rubrik);
        expect(matt, `${app} i ${test.info().project.name}`).toEqual({ sidhuvud: 0, hoger: expect.any(Number), synlig: true });
        expect(matt.hoger, app).toBeLessThanOrEqual(1);
      }
    } finally {
      await v.db.query('update public.tenants set name = $1 where id = $2', [sub.namn, sub.id]);
    }
  });

  test('flikens titel återställs när man lämnar appen', async ({ page }) => {
    await loggaInSom(page, v.multi.email);
    await oppna(page, 'avrakning');
    await page.getByRole('link', { name: 'Tillbaka' }).click();
    await expect(page).not.toHaveTitle(/ · Avräkning$/);
  });
});

// Påhittade sidhuvuden med samma struktur som i apparna. Funktionen körs i sidan.
const SIDHUVUD = {
  tripkassan: '<header class="top"><div class="co"><h1>Tripkassan</h1><small id="coName">Inställt Namn AB</small></div></header>',
  avrakning: '<header class="band"><div class="titles"><small>Avräkning åkare och kunder</small><h1 id="hMonth">Månadsavräkning</h1></div></header>',
  foliering: '<header class="top"><div class="brand" aria-label="Demo Foliering AB"><div class="wm"><b>Demo Foliering</b><small>Foliering och skadeåterställning</small></div></div></header>',
};
async function kor(page: Page, app: keyof typeof SIDHUVUD, bolag: string | null, appnamn: string) {
  await page.setContent(`<body>${SIDHUVUD[app]}</body>`);
  await page.evaluate(`window.__sluta = (${visaBolagsnamn.toString()})(document, ${JSON.stringify(app)}, ${JSON.stringify(bolag)}, ${JSON.stringify(appnamn)})`);
}

test.describe('rubrikfunktionen', () => {
  test('utan namn står appens egen rubrik kvar, aldrig en tom rubrik', async ({ page }) => {
    for (const bolag of [null, '', '  ']) {
      await kor(page, 'tripkassan', bolag, 'Lön och bokföring');
      await expect(page.locator('.co h1')).toHaveText('Lön och bokföring');
      await expect(page.locator('#coName')).toHaveText('Inställt Namn AB');
      await kor(page, 'avrakning', bolag, 'Avräkning');
      await expect(page.locator('#hMonth')).toHaveText('Månadsavräkning');
      await expect(page.locator('.titles small')).toHaveText('Avräkning åkare och kunder');
      await kor(page, 'foliering', bolag, 'Verkstad');
      await expect(page.locator('.wm b')).toHaveText('Demo Foliering');
    }
    expect(fliktitel(null, 'Lön och bokföring')).toBe('Lön och bokföring');
    expect(fliktitel('  ', 'Lön och bokföring')).toBe('Lön och bokföring');
    expect(fliktitel('Exempelbolag AB', 'Lön och bokföring')).toBe('Exempelbolag AB · Lön och bokföring');
  });

  test('kassan: rubriken står kvar när appen skriver om raden, och exempeldata visas på raden under', async ({ page }) => {
    await kor(page, 'tripkassan', 'Exempelbolag AB', 'Lön och bokföring');
    await expect(page.locator('.co h1')).toHaveText('Exempelbolag AB');
    await expect(page.locator('#coName')).toHaveText('Lön och bokföring');
    await page.evaluate(() => { document.querySelector('#coName')!.textContent = 'Annat Namn AB'; });
    await expect(page.locator('.co h1')).toHaveText('Exempelbolag AB');
    await expect(page.locator('#coName')).toHaveText('Lön och bokföring');
    await page.evaluate(() => { document.querySelector('#coName')!.textContent = 'Exempeldata'; });
    await expect(page.locator('.co h1')).toHaveText('Exempelbolag AB');
    await expect(page.locator('#coName')).toHaveText('Lön och bokföring · Exempeldata');
    // Appen lämnar demoläget och skriver bolaget ur sina inställningar.
    await page.evaluate(() => { document.querySelector('#coName')!.textContent = 'Annat Namn AB'; });
    await expect(page.locator('#coName')).toHaveText('Lön och bokföring');
  });

  test('namnet skrivs som text, aldrig som HTML', async ({ page }) => {
    const dialoger: string[] = [];
    page.on('dialog', d => { dialoger.push(d.message()); void d.dismiss(); });
    const farligt = '<img src=x onerror=alert(1)>';
    for (const [app, rubrik] of [['tripkassan', '.co h1'], ['avrakning', '#hMonth'], ['foliering', '.wm b']] as const) {
      await kor(page, app, farligt, 'App');
      await expect(page.locator(rubrik)).toHaveText(farligt);
      expect(await page.locator('img').count()).toBe(0);
    }
    expect(fliktitel(farligt, 'Lön och bokföring')).toBe(`${farligt} · Lön och bokföring`);
    expect(dialoger).toEqual([]);
  });

  test('Avräkning: månaden som appen skriver i rubriken flyttas till raden under', async ({ page }) => {
    await kor(page, 'avrakning', 'Exempelbolag AB', 'Avräkning');
    await expect(page.locator('#hMonth')).toHaveText('Exempelbolag AB');
    await expect(page.locator('.titles small')).toHaveText('Avräkning');
    await page.evaluate(() => { document.querySelector('#hMonth')!.textContent = 'Oktober 2026'; });
    await expect(page.locator('#hMonth')).toHaveText('Exempelbolag AB');
    await expect(page.locator('.titles small')).toHaveText('Avräkning · Oktober 2026');
  });

  test('bevakningen går att stänga av', async ({ page }) => {
    await kor(page, 'tripkassan', 'Exempelbolag AB', 'Lön och bokföring');
    await page.evaluate(() => { (window as unknown as { __sluta: () => void }).__sluta(); document.querySelector('#coName')!.textContent = 'Annat Namn AB'; });
    await expect(page.locator('#coName')).toHaveText('Annat Namn AB');
  });
});
