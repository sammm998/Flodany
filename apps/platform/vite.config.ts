// Plattformen (fas 2e). forbjudKarnaVite stoppar bygget om motorkod hamnar i grafen (beslut 26, lager 2).
// Ingen källkodskarta i drift. Legacy-filerna ingår aldrig: de lämnas bara ut av Edge Function legacy.
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';
import { forbjudKarnaVite } from '../../scripts/klientpaket.mjs';

export default defineConfig({
  plugins: [forbjudKarnaVite() as PluginOption, react()],
  publicDir: false,
  build: { outDir: 'dist', sourcemap: false, emptyOutDir: true },
});
