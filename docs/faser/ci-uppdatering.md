# CI: uppdatera GitHub Actions (2026-10-11)

GitHub varnar för att Node.js 20 i actions/checkout@v4 och actions/setup-node@v4 är föråldrat, och ubuntu-latest byter till Ubuntu 26 från 2026-10-19.

1. Uppdatera `.github/workflows/ci.yml`: actions/checkout och actions/setup-node till senaste huvudversion som kör på Node 24.
2. Byt `runs-on: ubuntu-latest` mot `runs-on: ubuntu-24.04`, så att CI inte ändras utan att någon har ändrat något.
3. Ändra inget annat. Kör `npm run ci` lokalt.
4. Committa med meddelandet "CI: uppdaterade actions" (den här filen följer med) och pusha.
5. Visa resultatet från GitHub och att varningarna är borta.
