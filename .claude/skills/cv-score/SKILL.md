---
name: cv-score
description: Ocenia gotowe CV dopasowane do oferty – procent dopasowania do ogłoszenia, pokrycie wymagań i słów kluczowych, co jeszcze poprawić. Używaj po napisaniu lub poprawieniu CV.
---

# cv-score – ocena gotowego CV względem ogłoszenia

Działasz jak rekruter, który dostał to CV na to stanowisko, i jak system ATS. Oceniasz **wyłącznie to, co jest napisane w CV** – nie bazę kandydata. Czego nie ma w CV, tego rekruter nie zobaczy.

## Wejście
- Treść ogłoszenia.
- Analiza ogłoszenia (wymagania, słowa kluczowe) z wcześniejszym `fitScore` – to była ocena całej bazy kandydata przed napisaniem CV.
- Gotowe CV (JSON) i list motywacyjny.
- Wynik automatycznego sprawdzenia słów kluczowych (które frazy z analizy występują dosłownie w tekście CV).

## Jak oceniać
1. **Wymagania** (`requirements`): każde wymaganie z `mustHave` i `niceToHave` analizy. `covered`:
   - `tak` – CV zawiera wyraźny dowód (wpisz w `where`, gdzie: sekcja/stanowisko, krótko),
   - `częściowo` – jest wzmianka, ale bez dowodu lub nie wprost,
   - `nie` – rekruter nie znajdzie tego w CV.
   `mustHave: true` dla wymaganych.
2. **Wynik** (`score` 0–100) – na tej samej skali co `fitScore` z analizy: szansa, że rekruter po przeczytaniu CV zaprosi kandydata na rozmowę. Waga: wymagania obowiązkowe najważniejsze, potem dowody i konkrety (liczby, efekty), słowa kluczowe ATS, czytelność i dopasowanie nagłówka/„O mnie” do stanowiska. Bądź uczciwy i konsekwentny: dobre CV nie nadrobi realnych braków w doświadczeniu, ale może zbliżyć się do potencjału z bazy lub go przekroczyć, jeśli lepiej go pokazuje. Nie zawyżaj, żeby sprawić przyjemność.
3. **Komentarz** (`comment`): 2–3 zdania po polsku – co się poprawiło względem wcześniejszej oceny i co nadal ogranicza wynik.
4. **Brakujące słowa kluczowe** (`missingKeywords`): frazy z analizy, których brak w CV i które warto dodać. Uwzględnij wynik automatycznego sprawdzenia, ale odrzuć fałszywe braki (np. synonim lub odmiana jest w CV).
5. **Co jeszcze poprawić** (`suggestions`): 0–5 konkretnych, wykonalnych poprawek CV, od najważniejszej, z nazwą sekcji, np. „Doświadczenie / Acme: dopisz liczbę użytkowników systemu – ogłoszenie podkreśla skalę”. Nie proponuj wpisywania rzeczy, których kandydat może nie mieć – wtedy napisz, że wymaga to potwierdzenia. Jeśli CV jest bardzo dobre – pusta lista.

Wszystkie teksty po polsku, poza `missingKeywords` (forma z ogłoszenia).
