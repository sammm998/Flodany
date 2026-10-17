import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/** Klientkod: allt som kan hamna i webbläsaren. Motorer, parsrar och regler får aldrig importeras där (beslut 26). */
export const KLIENTKOD = ['apps/**/*.{ts,tsx,js,jsx}', 'packages/api/**/*.ts', 'packages/ui/**/*.{ts,tsx}', 'packages/guides/**/*.ts', 'packages/modules/**/*.ts'];
export const FORBJUDNA = ['@flodia/core', '@flodia/core/*', '@flodia/kit', '@flodia/server', '@flodia/server/*', '**/packages/core/**', '**/packages/kit/**', '**/packages/server/**'];

export default tseslint.config(
  // legacy/ är originalapparna och ska inte röras, därför lintas de inte
  { ignores: ['legacy/', 'referens/', '**/node_modules/', '**/dist/', 'dist-klient/', 'supabase/functions/**/*.bundle.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Edge Functions körs i Deno.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
  {
    // Lager 1 av 3 i kontrollen av klientpaketet: inga importer av motorer i klientkod. Typer går bra.
    files: KLIENTKOD,
    ignores: ['**/*.test.ts', 'packages/api/kontrakt.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        patterns: [{ group: FORBJUDNA, allowTypeImports: true, message: 'Motorer, parsrar och regler körs bara på servern (beslut 26). Anropa serverfunktionen motor.' }],
      }],
    },
  },
);
