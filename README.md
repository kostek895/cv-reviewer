# CV Reviewer

Lokalny panel do dopasowywania CV do konkretnych ofert pracy. Wrzucasz swoje CV w PDF, wklejasz link do ogłoszenia, a Claude analizuje ofertę, pisze pod nią CV i list motywacyjny, ocenia dopasowanie i generuje PDF.

- Działa tylko lokalnie (`127.0.0.1`), bez logowania. Panel odrzuca połączenia spoza Twojego komputera.
- Analizę i pisanie robi **Claude Code na Twoim abonamencie** (`claude -p`). Nie potrzeba klucza API, zużywasz limity swojego konta.
- Wszystkie Twoje dane (baza CV, oferty, PDF-y, zdjęcie) zostają w folderze `data/`, który jest poza gitem.

## Wymagania

- **Node.js 20+**
- **Claude Code** zainstalowany, w `PATH` i zalogowany na Twoje konto (Pro/Max):
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude            # przy pierwszym uruchomieniu zaloguj się, potem wyjdź
  claude --version  # sprawdzenie
  ```
- **Google Chrome**, używany do generowania PDF i pobierania ogłoszeń ze stron renderowanych w JS. Bez Chrome zainstaluj Chromium z Playwright:
  ```bash
  npx playwright install chromium
  ```

## Uruchomienie

```bash
git clone https://github.com/kostek895/cv-reviewer.git
cd cv-reviewer
npm install
npm run dev
```

Panel: **http://127.0.0.1:3210**

Wersja produkcyjna jest lżejsza i szybsza, jeśli nie zmieniasz kodu:

```bash
npm run build
npm start
```

## Pierwsze kroki

1. **Baza CV**: wgraj swoje CV w PDF (możesz kilka wersji, Claude je scali) i kliknij import. Potem przejrzyj sekcje i dopisz przy stanowiskach liczby i efekty w „Twoje notatki”. Claude pisze CV **wyłącznie** z faktów w bazie, więc im więcej konkretów, tym lepsze CV. Dodaj też zdjęcie, jeśli chcesz je mieć w CV.
2. **Oferty**: wklej link do ogłoszenia (pracuj.pl, justjoin.it, rocketjobs.pl, nofluffjobs.com i inne). Możesz dodać kilka naraz, oddzielone spacją, i analizować je później. Gdy strona wymaga logowania (np. LinkedIn), wklej treść ogłoszenia.
3. **Analiza**: kogo szukają, wymagania kontra Twoje doświadczenie, słowa kluczowe ATS, czerwone flagi, rekomendacje, pytania do Ciebie i lista umiejętności do potwierdzenia („mam / nie mam”). Rekomendacje możesz edytować. To polecenia dla następnego kroku.
4. **CV i list**: każdą sekcję edytujesz ręcznie albo poprawiasz przyciskiem „✦ Popraw z Claude”. Obok widzisz podgląd na żywo i wybór koloru szablonu. „Sprawdź dopasowanie” pokazuje wynik przed i po oraz listę braków. „Popraw do celu” (90/96/100%) puszcza pętlę: Claude stosuje sugestie z oceny, ocenia CV ponownie i powtarza, aż osiągnie cel albo zabraknie faktów. Każdą zmianę widzisz jako „było → jest” i możesz ją zostawić, cofnąć albo poprawić własną uwagą. Gdy do celu brakuje faktów, dostajesz listę, czego Claude potrzebuje. Na końcu generujesz PDF (z automatycznym testem odczytu ATS) i kopiujesz list.

Typowe czasy: analiza 1–3 min, pisanie CV 2–4 min, ocena 1–2 min. Zadania idą w tle, więc możesz w tym czasie przełączać zakładki.

## Ustawienia (zmienne środowiskowe)

| Zmienna | Co robi |
|---|---|
| `CLAUDE_MODEL` | model dla `claude -p`, np. `opus` albo `sonnet` (domyślnie model ustawiony w Twoim Claude Code) |
| `CLAUDE_BIN` | pełna ścieżka do `claude`, jeśli nie ma go w `PATH` |

Przykład: `CLAUDE_MODEL=sonnet npm run dev` (PowerShell: `$env:CLAUDE_MODEL="sonnet"; npm run dev`).

## Problemy

- **„claude: command not found” albo błąd zadania zaraz po starcie**: Claude Code nie jest w `PATH` albo nie jest zalogowany. Uruchom `claude` w terminalu i się zaloguj, albo ustaw `CLAUDE_BIN`.
- **`EADDRINUSE 127.0.0.1:3210`**: działa już inna instancja. Zamknij ją albo zabij proces `node` trzymający port.
- **PDF się nie generuje**: brak Chrome. Uruchom `npx playwright install chromium`.
- **Ogłoszenie się nie pobrało**: strona blokuje boty albo wymaga logowania. Wklej treść ręcznie w zakładce ogłoszenia.

## Gdzie co jest

| Ścieżka | Co |
|---|---|
| `.claude/skills/*/SKILL.md` | skille: `cv-import`, `job-analysis`, `cv-tailor`, `cv-rewrite`, `cv-score`, `cv-improve` |
| `.claude/skills/_shared/00-cel.md` | cel nadrzędny dołączany do każdego skilla: profil kandydata, zasady CV, ATS, wymogi ogłoszenia |
| `.claude/skills/_shared/hr-best-practices.md` | wiedza o ATS, rekruterach, RODO i liście, dołączana do każdego skilla |
| `src/lib/claude.ts` | wywołanie `claude -p` z JSON Schema |
| `src/lib/tasks.ts` | zadania w tle (pobranie, analiza, pisanie, ocena, PDF) |
| `src/components/CvTemplate.tsx`, `src/app/print/cv.css` | szablon CV (HTML/CSS → PDF przez Playwright) |
| `data/` | Twoje dane (poza gitem) |

Claude jest wywoływany z wyłączonymi serwerami MCP i globalnymi wtyczkami (`--strict-mcp-config --disable-slash-commands`). Dzięki temu jedno wywołanie ładuje ok. 5 tys. tokenów kontekstu zamiast setek tysięcy i nie zjada limitów.
