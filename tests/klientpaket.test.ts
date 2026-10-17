// Kontrollen av klientpaketet (beslut 26) ska bevisligen slå larm. Alla tre lager prövas med kod som bryter mot regeln.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { ESLint } from 'eslint';
import { build as viteBuild } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { ROT, arKarnkod, fingeravtryck, forbjudKarnaEsbuild, forbjudKarnaVite, granska, legacyAvtryck } from '../scripts/klientpaket.mjs';

const tillfalliga: string[] = [];
const tom = () => { const d = mkdtempSync(join(tmpdir(), 'klientpaket-')); tillfalliga.push(d); return d; };
afterAll(() => { for (const d of tillfalliga) rmSync(d, { recursive: true, force: true }); });
const bygg = (ut: string, plugins: never[] = []) => build({ entryPoints: [join(ROT, 'tests/fixtures/klient-med-motor.ts')], outdir: ut, bundle: true, format: 'esm', platform: 'browser', minify: true, logLevel: 'silent', plugins });

describe('kontrollen av klientpaketet slår larm (beslut 26)', () => {
  it('lager 1: ESLint förbjuder import av motorer i klientkod, men tillåter typer', async () => {
    const eslint = new ESLint({ cwd: ROT });
    const [fel] = await eslint.lintText("import { avrakningEngine } from '@flodia/core/avrakning';\nexport const x = avrakningEngine;\n", { filePath: join(ROT, 'packages/api/forbjuden.ts') });
    expect(fel!.messages.map(m => m.ruleId)).toContain('@typescript-eslint/no-restricted-imports');
    const [typ] = await eslint.lintText("import type { Engine } from '@flodia/kit';\nexport type X = Engine<unknown, unknown, unknown>;\n", { filePath: join(ROT, 'packages/api/typer.ts') });
    expect(typ!.messages.filter(m => m.ruleId === '@typescript-eslint/no-restricted-imports')).toEqual([]);
  }, 60_000);

  it('lager 2: bygget stoppas om en motor hamnar i grafen, både med esbuild och Vite', async () => {
    await expect(bygg(tom(), [forbjudKarnaEsbuild() as never])).rejects.toThrow(/Beslut 26/);
    expect(arKarnkod(join(ROT, 'packages/core/lon/compute.ts'))).toBe(true);
    expect(arKarnkod(join(ROT, 'packages/api/index.ts'))).toBe(false);
    expect(() => forbjudKarnaVite().load(join(ROT, 'packages/kit/index.ts') + '?import')).toThrow(/Beslut 26/);
    expect(forbjudKarnaVite().load(join(ROT, 'packages/api/index.ts'))).toBeNull();
  });

  it('lager 3: fingeravtryck, källkodskartor och nycklar hittas i ett färdigt paket', async () => {
    const ut = tom();
    await bygg(ut); // utan lager 2, som om någon kringgått det
    const avtryck = fingeravtryck();
    expect(avtryck.length).toBeGreaterThan(100);
    expect(granska(ut, avtryck).join('\n')).toMatch(/fingeravtryck från motorkoden/);
    const annan = tom();
    writeFileSync(join(annan, 'app.js.map'), '{}');
    writeFileSync(join(annan, 'app.js'), 'const k="eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop";\n//# sourceMappingURL=app.js.map');
    const fynd = granska(annan, avtryck).join('\n');
    expect(fynd).toMatch(/källkodskarta \(ska inte finnas/);
    expect(fynd).toMatch(/hänvisar till en källkodskarta/);
    expect(fynd).toMatch(/JWT/);
    // Anthropics nyckel (fotoläsningen) får aldrig finnas i klientpaketet.
    const ai = tom();
    writeFileSync(join(ai, 'app.js'), 'const k="sk-ant-api03-pahittadnyckel";');
    expect(granska(ai, avtryck).join('\n')).toMatch(/servernyckel/);
    // Anon-nyckeln (role anon) är publik med avsikt och godtas.
    const anon = tom(), b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    writeFileSync(join(anon, 'app.js'), `const k="${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role: 'anon', exp: 1983812996 })}.abcdefghijklmnopqrstuvwx";`);
    expect(granska(anon, avtryck)).toEqual([]);
  }, 60_000);

  it('legacy-apparna hittas om de hamnar i ett paket, även som en kopierad fil', () => {
    const ut = tom();
    writeFileSync(join(ut, 'avrakning.html'), readFileSync(join(ROT, 'legacy/apps/avrakning/index.html'), 'utf8'));
    expect(granska(ut).join('\n')).toMatch(/rader från legacy-apparna/);
    expect(legacyAvtryck().length).toBeGreaterThan(1000);
  });

  it('legacy-HTML finns inte i plattformens bygge, och bygget har bara index.html', async () => {
    const ut = tom();
    process.env.VITE_SUPABASE_URL ??= 'https://exempel.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY ??= 'platshallare';
    await viteBuild({ root: join(ROT, 'apps/platform'), configFile: join(ROT, 'apps/platform/vite.config.ts'), logLevel: 'silent', build: { outDir: ut, emptyOutDir: true } });
    const html = readdirSync(ut, { recursive: true }).map(String).filter(f => f.endsWith('.html'));
    expect(html).toEqual(['index.html']);
    expect(granska(ut)).toEqual([]);
  }, 120_000);

  it('det riktiga klientpaketet (packages/api) går igenom', async () => {
    const ut = tom();
    await build({ entryPoints: [join(ROT, 'packages/api/index.ts')], outdir: ut, bundle: true, format: 'esm', platform: 'browser', minify: true, logLevel: 'silent', plugins: [forbjudKarnaEsbuild() as never] });
    expect(granska(ut)).toEqual([]);
  }, 60_000);
});

describe('fotoläsningen: Anthropic anropas bara från servern', () => {
  it('klientkoden nämner aldrig nyckeln, hemligheten eller Anthropics adress', () => {
    const traffar: string[] = [];
    const MONSTER = /ANTHROPIC_API_KEY|FOTOLASNING_MODELL|sk-ant-|api\.anthropic\.com/;
    const gaIgenom = (d: string) => {
      for (const f of readdirSync(join(ROT, d), { withFileTypes: true })) {
        const full = join(d, f.name);
        if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== 'dist') gaIgenom(full); }
        else if (/\.(ts|tsx|js|mjs|html|css)$/.test(f.name) && MONSTER.test(readFileSync(join(ROT, full), 'utf8'))) traffar.push(full);
      }
    };
    for (const d of ['apps', 'packages/api', 'packages/ui', 'packages/modules', 'packages/guides']) gaIgenom(d);
    expect(traffar).toEqual([]);
  });
});
