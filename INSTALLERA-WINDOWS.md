# Installera Claude Code på Windows

Tid: cirka 30 minuter. Kräver Windows 10 (version 1809 eller senare) eller Windows 11, och ett betalt Claude-konto (Pro, Max, Team eller Enterprise).

Alla kommandon körs i **PowerShell**. Öppna den så här: Start, skriv `PowerShell`, välj **Windows PowerShell**. Raden börjar med `PS C:\Users\...>`. Du behöver inte köra som administratör.

---

## 1. Git (versionshantering)

```powershell
winget install --id Git.Git -e
```

Stäng PowerShell, öppna en ny och kontrollera:

```powershell
git --version
```

Ställ in ditt namn och e-post (syns i historiken):

```powershell
git config --global user.name "Ditt Namn"
git config --global user.email "din@epost.se"
```

## 2. Node.js (behövs för projektet och testerna)

```powershell
winget install OpenJS.NodeJS.LTS
```

Ny PowerShell, kontrollera:

```powershell
node -v
npm -v
```

## 3. VS Code (för att se filerna)

```powershell
winget install Microsoft.VisualStudioCode
```

## 4. Claude Code

```powershell
irm https://claude.ai/install.ps1 | iex
```

Kommandot visar inga framsteg medan det laddar ner. Öppna en ny PowerShell när det är klart och kontrollera:

```powershell
claude --version
claude doctor
```

Säger PowerShell att `claude` inte känns igen: starta om datorn och försök igen.

## 5. GitHub (säkerhetskopia av koden)

1. Skapa ett konto på github.com om du inte har ett.
2. Installera GitHubs verktyg och logga in:

```powershell
winget install GitHub.cli
gh auth login
```

Välj GitHub.com, HTTPS och logga in med webbläsaren.

## 6. Projektmappen

Lägg projektet **utanför OneDrive**. OneDrive försöker synka tusentals små filer och gör allt långsamt.

```powershell
mkdir C:\Projekt
cd C:\Projekt
```

Packa upp `affarsappar.zip` här och döp om mappen till `flodia`. Lägg PDF:en `Bolagsappar-bygg-och-designspec-v3.pdf` i samma mapp.

```powershell
cd C:\Projekt\flodia
```

Skapa filen `.gitignore` så att fel saker aldrig hamnar på GitHub:

```powershell
@"
node_modules/
dist/
.env
.env.*
*.local
riktiga-filer/
"@ | Out-File -Encoding utf8 .gitignore
```

Första sparpunkten och ett privat repo på GitHub:

```powershell
git init
git add .
git commit -m "Start: kod från claude.ai och spec v3.1"
gh repo create flodia --private --source . --push
```

## 7. Starta Claude Code

```powershell
cd C:\Projekt\flodia
claude
```

Första gången öppnas webbläsaren för inloggning. Logga in med samma konto som du använder i Claude.

Tryck **Shift+Tab** tills det står plan mode längst ner. Då planerar Claude Code utan att ändra filer. Klistra in startprompten:

```
Läs CLAUDE.md, SPEC-v3.1-tillagg.md och Bolagsappar-bygg-och-designspec-v3.pdf.
Vi bygger fas 0 och 1 enligt SPEC-v3.1 avsnitt 2, inget annat.
Fas 0: monorepo, legacy/ med zip-apparna orörda, tokens.css och CI.
Fas 1: flytta motorerna till packages/core med Vitest och
jämförelsetester mot legacy på syntetisk testdata.
Slå ihop Åkarkassan och Tripkassan med konfiguration.
Visa mig planen först. Förklara varje steg kort så att jag lär mig.
Visa testresultaten och en lista på avvikelser innan du går vidare.
```

Godkänn planen när den ser rimlig ut, så börjar den bygga.

---

## Varje gång du jobbar

1. `cd C:\Projekt\flodia` och `claude`.
2. Ett mål per session.
3. När något fungerar: be Claude Code göra en commit, eller skriv själv:

```powershell
git add .
git commit -m "Vad som ändrades, en mening"
git push
```

4. Gick något fel: `git status` visar vad som ändrats, och Claude Code kan återställa till senaste commit.

## Tre regler

- Riktiga kundfiler (TaxiCaller, Bambora, Megtax, löner) läggs **aldrig** i projektmappen.
- API-nycklar och lösenord skrivs aldrig i koden eller i chatten. De läggs i `.env`, som inte följer med till GitHub.
- Godkänn inte en fas förrän testerna är gröna. Klistra in testresultatet hos Claude (Cowork) för en andra granskning.
