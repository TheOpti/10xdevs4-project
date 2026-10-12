---
type: observability-audit
date: 2026-10-12 12:43
mode: audit
commit: 62dbb58
branch: main
dirty_tree: true
areas: [auth, generation, save]
area_source: foundation
runtime_proof: not-run
error_tracker: "SDK w kodzie nie znaleziono; konfiguracja produkcyjna nieznana"
previous_report: null
findings: { critical: 2, high: 3, medium: 1, low: 0 }
---

# Audyt obserwowalności — logowanie, generowanie i zapis fiszek

## 1. Najważniejsze ustalenia

- Wynikowe błędy Supabase Auth są ignorowane albo zamieniane na przekierowania. Awaria usługi może wyglądać jak brak sesji lub zwykłe niepowodzenie logowania.
- Repozytorium fiszek usuwa szczegóły błędów RPC, zanim API zwróci ogólne 500. Status sygnalizuje niepowodzenie, ale aplikacja nie zachowuje jego przyczyny.
- Formularz przechwytuje błędy sieci, parsowania i kontraktu odpowiedzi wyłącznie do komunikatu UI. Nawet 201 z serwera może zakończyć się niepowodzeniem widocznym tylko użytkownikowi.
- Łącznie: **2 critical, 3 high, 1 medium**. Wszystkie ustalenia są **static-only**, a nie obserwacjami incydentu produkcyjnego.
- Pierwsza poprawka: rozróżnić brak sesji od awarii Supabase Auth i raportować nieoczekiwane błędy przed ich konwersją na odpowiedź.

## 2. Model przechwytywania

### W repozytorium

- Astro działa w trybie SSR przez adapter Cloudflare (`astro.config.mjs:11`, `astro.config.mjs:16`). Worker wskazuje punkt wejścia adaptera (`wrangler.jsonc:4`); zbieranie obserwowalności jest zadeklarowane jako włączone (`wrangler.jsonc:12–13`). Nie potwierdza to aktualnych ustawień wdrożenia ani sposobu alarmowania.
- Middleware sprawdza użytkownika przed `next()` dla żądań przechodzących przez aplikację (`src/middleware.ts:6–24`). Nie raportuje wyniku `error` z `getUser()`.
- Nieprzechwycone wyjątki endpointów/stron Astro loguje jako stos lub wiadomość i konwertuje na 500 (`node_modules/astro/dist/core/pages/handler.js:75–82`); analogiczna granica obejmuje middleware (`node_modules/astro/dist/core/middleware/astro-middleware.js:60–70`). Zwykła zwrócona odpowiedź nie przechodzi przez ten catch. To ustalenie dotyczy lokalnego Astro 7.3.3 i adaptera Cloudflare 14.3.1; sposób przekazania logu do alertu pozostaje nieznany.
- Przeszukanie źródeł i manifestu nie znalazło SDK trackera, aplikacyjnego loggera, wywołań `console`, hooków czyszczenia ani próbkowania zdarzeń. Nie jest to dowód braku monitoringu poza repozytorium. Layout i integracje nie ustanawiają własnej granicy raportowania (`src/layouts/Layout.astro:13–38`, `astro.config.mjs:12–16`).
- Supabase zwraca wiele błędów jako wartości. W lokalnym `@supabase/auth-js` 2.116.0 odpowiedzi infrastrukturalne są klasyfikowane jako błędy ponawialne (`node_modules/@supabase/auth-js/src/lib/fetch.ts:74–97`); przechwycony błąd transportu nie jest tam logowany (`:230–235`). `getUser()` zwraca `{ user: null, error }` (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3272–3281`). Sam globalny handler wyjątków nie zobaczy później odrzuconego wyniku.
- Lokalny `@supabase/postgrest-js` 2.116.0 zamienia odrzucenie fetch na wynik błędu i zachowuje informacje o przyczynie (`node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:292–317`). Aplikacja następnie redukuje ten wynik do etykiety (`src/lib/flashcards.ts:83`, `:119–120`, `:143–144`).
- React działa w wyspach `client:load` (`src/pages/dashboard/new.astro:11`). Błędy przechwycone przez formularz nie docierają do globalnego handlera przeglądarki (`src/components/flashcards/NewFlashcardsForm.tsx:112–115`, `:183–184`). Astro obsługuje błędy importu/hydratacji lokalnie w przeglądarce; nie należy utożsamiać sukcesu SSR z sukcesem wyspy (`node_modules/astro/dist/runtime/server/astro-island.js:75–88`, `:125–135`).
- Nie znaleziono aplikacyjnych kolejek, cronów, zadań po odpowiedzi ani własnych streamów odpowiedzi. `src/lib/request-body.ts:16–35` czyta strumień wejściowy. Nie znaleziono inicjalizacji SDK wymagającej tagów release/environment; konfiguracja symboli i wersjonowania po stronie platformy pozostaje nieznana.

### Założenia poza repozytorium

Użytkownik nie wie, jakie informacje widzi na produkcji. Zakładamy działające zbieranie logów platformy; reguły alertów, eksport do trackera, retencja, próbkowanie, identyfikacja wdrożeń i logi Supabase są **niepotwierdzone**. Nie są ustaleniami ani przyczynami źródłowymi. Oddzielne logi dostawcy mogą zawierać dodatkowe dowody; audyt wskazuje, co zachowuje aplikacja.

## 3. Co pozostaje po awarii — wyłącznie analiza statyczna

| Kształt awarii | Odpowiedź / efekt | Sygnał z kodu aplikacji | Ocena |
| --- | --- | --- | --- |
| Supabase `/user` zwraca 503 dla istniejącej sesji | Przekierowanie z dashboardu; przy błędzie w kontroli API — 401 | Brak raportu przyczyny; wynik wygląda jak brak użytkownika | Błędna klasyfikacja, A1 |
| Supabase signin/signup zwraca 503 | Przekierowanie z `error.message` w query | Brak strukturalnego raportu; komunikat UI nie zastępuje statusu/kodu/stosu | Awaria ukryta za 3xx, A2 |
| Zdalne wylogowanie zwraca błąd | Przekierowanie na `/` | Wynik porzucony | Brak potwierdzenia globalnego unieważnienia, A3 |
| RPC tworzenia/zapisu odrzuca żądanie | Ogólne 500 JSON | Status pozostaje, szczegóły błędu usunięte | Niepowodzenie widoczne, diagnoza utrudniona, F1 |
| UI nie akceptuje poprawnej składniowo odpowiedzi 201 | Komunikat błędu przy zachowaniu szkicu | Tylko stan React; brak sygnału klienta | Monitoring statusów nie wystarczy, F2 |
| RPC odrzuca nieistniejący zestaw lub konflikt klucza | Także 500 | Ten sam wynik co awaria infrastruktury | Potencjalny szum, F3 |

Kolumna sygnału opisuje kod, nie faktyczny ekran trackera. Nie przeprowadzono ingest ani prób HTTP. Nie twierdzimy, że nieprzechwycone wyjątki SSR są niewidoczne — to inna ścieżka niż opisane tu błędy wynikowe i obsłużone.

## 4. Systemowe przyczyny źródłowe

1. **Obsługa auth nie rozróżnia awarii od zwykłego wyniku.** Destrukturyzacja usuwa `error` (`src/middleware.ts:10–13`), endpointy formularzy konwertują każdy błąd na przekierowanie (`src/pages/api/auth/signin.ts:15–16`, `signup.ts:15–16`), a wylogowanie ignoruje wynik (`signout.ts:7`). To upraszcza obsługę formularzy, ale usuwa operacyjny sygnał. Wyjaśnia A1–A3.
2. **Warstwa danych redukuje różne przyczyny do jednej etykiety.** `requestFailed()` nie przyjmuje przyczyny (`src/lib/flashcards.ts:83`); miejsca wywołania porzucają obiekt RPC (`:119–120`, `:143–144`). Bezpieczny publiczny komunikat jest właściwy, lecz diagnostyka serwerowa nie powinna znikać. Wyjaśnia F1 i F3.
3. **Łagodna obsługa błędów klienta kończy się wyłącznie na UI.** Parsowanie do `null`, szerokie `catch` i kontrola odpowiedzi prowadzą tylko do `setError` (`src/components/flashcards/NewFlashcardsForm.tsx:97–115`, `:160–184`). Zachowanie szkicu jest korzystne, ale nie daje operatorowi sygnału. Wyjaśnia F2.

## 5. Ustalenia według obszaru

### Logowanie i dostęp

| ID | Lokalizacja | Kategoria | Waga | Skutek produkcyjny przy opisanej awarii | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| A1 | `src/middleware.ts:10–20`; `src/pages/api/flashcards/generate.ts:35–39`; `src/pages/api/flashcards/save.ts:79–83` | missing-throw | critical | Błąd infrastruktury auth zwracający null użytkownika staje się przekierowaniem lub 401. Użytkownik traci dostęp, operator nie otrzymuje z aplikacji przyczyny niedostępności. | Klasyfikować `error`; oddzielić zwykły brak sesji od awarii zależności i raportować tę drugą. |
| A2 | `src/pages/api/auth/signin.ts:13–16`; `src/pages/api/auth/signup.ts:13–16` | flattened-response | critical | Awaria logowania/rejestracji dostawcy wygląda jak normalne przekierowanie formularza. Użytkownik widzi wiadomość; aplikacja nie zachowuje strukturalnego błędu dla operatora. | Zachować kontrakt redirect + query, lecz raportować nieoczekiwane awarie przed przekierowaniem. |
| A3 | `src/pages/api/auth/signout.ts:7–9` | missing-throw | high | Zdalne unieważnienie sesji może się nie udać, ale użytkownik trafia na stronę główną bez sygnału częściowego niepowodzenia. Operator nie dostaje błędu. | Sprawdzać wynik `signOut`, raportować nieoczekiwane niepowodzenie operacji zdalnej. |

A3 nie oznacza pozostawienia lokalnej sesji: lokalny SDK usuwa ją także przy takim błędzie (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:4093–4107`). Oczekiwany brak sesji i błędne hasło nie powinny wywoływać alarmów awarii.

### Generowanie, przegląd i zapis

| ID | Lokalizacja | Kategoria | Waga | Skutek produkcyjny przy opisanej awarii | Kierunek poprawki |
| --- | --- | --- | --- | --- | --- |
| F1 | `src/lib/flashcards.ts:119–120`, `:143–144`; `src/pages/api/flashcards/generate.ts:51–53`; `src/pages/api/flashcards/save.ts:91–93` | identity-lost | high | Tworzenie/zapis kończy się ogólnym 500. Operator może zobaczyć niepowodzenie, lecz aplikacja gubi kod, szczegóły i przyczynę RPC. | Zachować wewnętrzną przyczynę i raportować raz z operacją oraz bezpiecznymi identyfikatorami; utrzymać ogólną odpowiedź publiczną. |
| F2 | `src/components/flashcards/NewFlashcardsForm.tsx:97–115`, `:160–169`, `:183–184` | swallowed | high | Błąd sieci, JSON lub kontraktu odpowiedzi daje wyłącznie komunikat UI. Przy 2xx operator widzi sukces serwera mimo niepowodzenia odczuwanego przez użytkownika. | Raportować nieoczekiwane błędy i niezgodności z etapem, statusem oraz identyfikatorem operacji; ograniczać szum od anulowań i walidacji. |
| F3 | `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:68–90`; `src/lib/flashcards.ts:143–144`; `src/pages/api/flashcards/save.ts:91–93` | noise | medium | Brak dostępnego zestawu (`P0002`) lub klucz przypisany do innego zestawu (`22023`) trafia do tej samej odpowiedzi 500 co awaria DB. Użytkownik dostaje zachętę ponowienia, monitoring 5xx miesza różne klasy zdarzeń. | Mapować rozpoznane przypadki domenowe na bezpieczne 4xx; zachować 5xx dla awarii i błędów implementacji. |

**Konkretny scenariusz F2:** API przycina białe znaki (`save.ts:25–26`), a UI porównuje zwrócone fiszki z nieprzyciętym szkicem (`NewFlashcardsForm.tsx:144–145`, `:167`; `src/lib/flashcard-save-reconciliation.ts:9`). Pytanie `" pytanie "` może zostać zapisane jako `"pytanie"` i zwrócone z 201, ale UI pokaże brak potwierdzenia zapisu. To prześledzona ścieżka kodu, nie wykonana reprodukcja. Oczekiwany konflikt późniejszych edycji (`NewFlashcardsForm.tsx:172–177`) sam w sobie nie jest awarią wymagającą alarmu.

### Infrastruktura wspólna

Nie dodano duplikatów powyższych ustaleń. Brak SDK, reguł alertów lub konfiguracji panelu nie został oceniony jako luka. Nie zgłoszono warunkowego braku sekretów jako istniejącej awarii: `createClient()` ma jawny fallback, a interfejs zawiera komunikat konfiguracji (`src/lib/supabase.ts:6–7`, `src/lib/config-status.ts:14–15`).

## 6. Zalecana kolejność poprawek

1. **A1–A3:** wspólna klasyfikacja i raportowanie błędów auth, zastosowane przed odrzuceniem wyniku. Test regresji powinien odróżnić 503 dostawcy od braku sesji i złego hasła. Zachować obowiązujący kontrakt formularzy i centralną ochronę tras w middleware.
2. **F1, F3:** zachować diagnostykę na granicy repozytorium, raportować raz, rozdzielić przypadki domenowe od infrastrukturalnych. Testy powinny wykazać zachowanie przyczyny oraz brak jej wycieku w odpowiedzi HTTP.
3. **F2:** dodać sygnał nieoczekiwanych błędów klienta, następnie odtworzyć i naprawić rozbieżność normalizacji zapisu. Test przeglądarkowy powinien sprawdzić efekt widziany przez użytkownika mimo 201.

Diagnostyka może zawierać operację, bezpieczny kod/status, stos po oczyszczeniu i identyfikator korelacji. Nie wysyłać haseł, tokenów, cookies, emaili, źródłowego tekstu ani treści fiszek. Nie logować surowych obiektów RPC bez kontroli: szczegóły błędów bazy mogą zawierać dane wejściowe. `requestId` zapisu jest kluczem idempotencji; identyfikator pojedynczego żądania diagnostycznego powinien być od niego rozróżnialny.

## 7. Metoda i ograniczenia

- Pierwszy raport; brak wcześniejszych raportów do porównania. Stan początkowy: commit `62dbb58`, gałąź `main`, istniejąca modyfikacja `AGENTS.md`. Audyt nie zmieniał kodu aplikacji ani tego pliku.
- Dobór zakresu z PRD, shape-notes i roadmapy: tożsamość/dostęp oraz główna ścieżka wartości od tekstu po trwały zapis. Trzej audytorzy pracowali tylko do odczytu: auth, pełny przepływ fiszek, infrastruktura wspólna. Generowanie i zapis sprawdzono razem jako powiązany przepływ.
- Niezależnie sprawdzono najważniejsze twierdzenia: ignorowanie `getUser.error`, przekierowania signin/signup, utratę błędów RPC, porównanie przyciętych wartości w UI oraz zachowanie lokalnej sesji przy błędzie wylogowania. Zajrzenie do lokalnych źródeł SDK pozwoliło odrzucić założenie, że biblioteka zawsze sama loguje błędy.
- Przeszukanie 45 plików wykonywalnych/deklaracji w `src` (46 z CSS), bez testów i `src/design`: **0** pustych catch, **4** catch bez wiązania wyjątku, **2** promise catch-to-default, **0** aplikacyjnych wywołań console/logger error, **3** `throw new` bez cause. Te trzy rzuty są pierwotnymi błędami walidacji w `request-body.ts:8,13,30`, a nie utratą przyczyny. Same liczniki nie stanowią ustaleń.
- Szerokie catch przy parsowaniu body (`generate.ts:22`, `save.ts:65`) zwracają 400. Nie podniesiono ich do osobnego ustalenia bez konkretnego dowodu wewnętrznej awarii; niepoprawny JSON i przekroczony limit są oczekiwane.
- Generator jest jawnie demonstracyjny (`src/lib/flashcard-proposals.ts:43–63`, `NewFlashcardsForm.tsx:194`). Nie ma tu wywołania dostawcy AI do audytowania. Pozostałe metody repozytorium powielają redukcję błędów, ale nie mają obecnie wywołań w trasach; nie policzono ich jako dodatkowych awarii funkcji użytkownika.
- Nie uruchamiano aplikacji, testów, sond ani `npm run verify`: zmieniono wyłącznie dokumentację audytu. Nie oceniono rzeczywistych logów produkcyjnych, alertów ani renderowania stosów przez platformę. Nie utworzono worktree ani harnessu.
- Dalsze potwierdzenie: opcjonalna sonda w odizolowanej kopii z lokalnymi atrapami Supabase i odbiornika zdarzeń, bez kont produkcyjnych. Najpierw odtworzyć awarię auth 503 oraz sukces zapisu 201 z niepowodzeniem UI, potem użyć tych samych sond przed/po poprawce. Poprawki przeprowadzić osobno przez `/10x-new` i `/10x-plan`; ponowny audyt: `/10x-observability-audit --verify context/audits/observability/2026-10-12_auth-generation-save.md`.
