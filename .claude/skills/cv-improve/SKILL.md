---
name: cv-improve
description: Wprowadza do gotowego CV konkretne poprawki na podstawie ostatniej oceny dopasowania (cv-score), żeby podnieść wynik – bez wymyślania faktów. Używaj w pętli „popraw → oceń”.
---

# cv-improve – jedna runda poprawek CV pod ocenę

Dostajesz CV dopasowane do oferty, jego ostatnią ocenę (wynik, wymagania niewidoczne w CV, brakujące słowa kluczowe, sugestie), ogłoszenie, analizę i bazę kandydata. Twoje zadanie: zaproponować zmiany, które **realnie podniosą wynik oceny** przy następnym sprawdzeniu.

## Co zmieniać
Możesz zmieniać tylko te pola (`path`):
- `headline` – tytuł pod nazwiskiem,
- `summary` – O mnie,
- `skills` – lista umiejętności (cała lista),
- `experience.N.intro` – jednozdaniowy opis firmy przy stanowisku N (liczone od 0, w kolejności z CV),
- `experience.N.bullets` – punkty przy stanowisku N (cała lista).

Każda zmiana podaje **pełną nową wartość** pola: tekst w `text` (dla `headline`, `summary`, `intro`; wtedy `list` = []) albo pełną listę w `list` (dla `skills`, `bullets`; wtedy `text` = ""). `reason` – 1 zdanie po polsku: którą sugestię/wymaganie/słowo kluczowe to załatwia.

## Zasady
1. **Najpierw to, co daje najwięcej punktów:** wymagania obowiązkowe, których rekruter nie widzi w CV, potem brakujące słowa kluczowe (w dokładnej formie z ogłoszenia), potem sugestie z oceny.
2. **Nie wymyślaj.** Każdy fakt, liczba, narzędzie i doświadczenie musi wynikać z bazy kandydata, jego odpowiedzi na pytania, umiejętności oznaczonych „mam”, jego uwag albo z obecnego CV. Wolno przeformułować, użyć słownictwa z ogłoszenia dla tego, co kandydat faktycznie robił, przenieść punkt wyżej, połączyć, skrócić. Nie wolno dopisać doświadczenia z branży, której kandydat nie ma, ani liczb, których nie podał.
3. Jeśli sugestia z oceny wymaga faktu, którego nie ma – **nie rób tej zmiany**, tylko zapytaj kandydata w `questions`:
   - `kind: "pytanie"` – konkretne pytanie o fakt, który podniesie wynik (liczba, skala, efekt, potwierdzenie zakresu odpowiedzialności), np. „Ilu marek / serwisów używa koszyka w Acme? Wystarczy przybliżona liczba.” Maks. 5, od najważniejszego. Pytaj tak, żeby dało się odpowiedzieć jednym zdaniem.
   - `kind: "brak"` – realny brak doświadczenia, którego nie da się uczciwie uzupełnić (np. „Brak doświadczenia w sektorze bankowym – wymaganie mile widziane”). Maks. 3. To informacja dla kandydata, nie zarzut.
   Nie pytaj o nic, na co odpowiedź jest już w bazie, w `zapamietane_odpowiedzi` albo w odpowiedziach na pytania z analizy.
4. **Nie wracaj do odrzuconych zmian.** Lista `odrzucone` zawiera fragmenty, które kandydat cofnął (czasem z komentarzem) – nie proponuj ich ponownie ani w podobnej formie; uwzględnij komentarz.
5. Trzymaj limity miejsca (CV ma się zmieścić na 1 stronie): `summary` do ~60 słów, `skills` maks. 12 krótkich pozycji, `headline` do ~35 znaków, 3–6 punktów przy kluczowych rolach, łącznie ok. 14–17 punktów. Jeśli coś dodajesz – skróć lub usuń coś mniej istotnego.
6. Nie zmieniaj nazw firm, historycznych nazw stanowisk ani dat. Zachowaj język CV (`lang`).
7. 1–8 zmian w rundzie, każda w innym polu. Jeśli nic sensownego nie da się już poprawić bez nowych faktów – zwróć pustą listę `changes` i wypełnij `questions`.
