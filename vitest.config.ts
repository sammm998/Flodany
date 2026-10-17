import { defineConfig } from 'vitest/config';

// Legacy tolkar tider i lokal tid. Jämförelsetesterna mot legacy körs därför i svensk tid,
// både lokalt och på GitHub (där datorn annars går i UTC). De nya motorerna räknar i svensk tid
// oavsett datorns tidszon, vilket packages/core/tidszon.test.ts visar.
process.env.TZ = 'Europe/Stockholm';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    // Databastesterna kräver en lokal Supabase och körs med npm run test:db (vitest.db.config.ts).
    exclude: ['legacy/**', '**/node_modules/**', 'tests/db/**', 'tests/e2e/**'],
  },
});
