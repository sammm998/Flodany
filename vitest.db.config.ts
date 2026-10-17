import { defineConfig } from 'vitest/config';

// Databastesterna (fas 2a): kräver en lokal Supabase ("npx supabase start"). Körs i CI-jobbet databas.
// Filerna körs en i taget, var och en med sin egen värld av påhittade konton och användare.
export default defineConfig({
  test: {
    include: ['tests/db/**/*.test.ts'],
    fileParallelism: false,
    // Inga omkörningar: ett test som bara går igenom ibland är ett fel (krav från granskningen av 2c).
    retry: 0,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
