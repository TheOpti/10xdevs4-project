---
project: Memoro
version: 1
status: draft
created: 2026-09-16
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Samodzielny dorosły uczący się online potrzebuje szybko zamieniać materiały w dobre fiszki i przechowywać je w jednym miejscu. Ręczne tworzenie fiszek kosztuje czas, a materiały do nauki są rozproszone.

Istniejące narzędzia nie zapewniają wystarczająco szybkiego i intuicyjnego katalogowania oraz przeglądania fiszek.

## User & Persona

Primary persona: samodzielny dorosły uczący się online, który zaczyna naukę nowego materiału i chce szybko utworzyć, skatalogować oraz później przeglądać fiszki.

## Success Criteria

### Primary

- An authenticated user can create a flashcard set from pasted text, review generated proposals, edit or accept them, save the set, and begin reviewing it.

### Secondary

- A user can catalog flashcard sets with tags.

### Guardrails

- A user's source text and flashcards remain private to that user.
- A user can optionally edit every generated flashcard proposal before saving it.

## User Stories

### US-01: Generowanie i nauka fiszek z wklejonego tekstu

- **Given** zalogowany użytkownik znajduje się na ekranie tworzenia fiszek i ma tekst, z którego chce się uczyć.
- **When** wkleja tekst i uruchamia generowanie, a następnie akceptuje wybrane propozycje fiszek.
- **Then** zaakceptowane fiszki zostają zapisane w jego talii i są dostępne w trybie nauki, gdzie może rozpocząć sesję powtórek.

## Functional Requirements

- FR-001: User can paste text and start flashcard generation; a flashcard set is created automatically. Priority: must-have
  > Socrates: Counter-argument considered: a separate set-creation step adds friction without business value. Resolution: the set is created automatically and can be renamed later.
- FR-002: User can generate flashcard proposals from pasted text. Priority: must-have
  > Socrates: Counter-argument considered: undefined proposal quality could undermine trust. Resolution: retain generation and define minimum quality criteria.
- FR-003: User can accept an entire proposal set or optionally edit and delete individual generated flashcards before saving. Priority: must-have
  > Socrates: Counter-argument considered: requiring edits to every proposal slows the core flow. Resolution: bulk acceptance is the default; per-card edit or deletion is optional.
- FR-004: User can edit and delete generated flashcards in a set. Priority: must-have
  > Socrates: Counter-argument considered: manually adding a flashcard from scratch expands scope beyond the text-generation flow. Resolution: defer manual creation; retain edit and deletion of generated flashcards.
- FR-005: User can browse a list of flashcard sets and filter it by tags. Priority: must-have
  > Socrates: Counter-argument considered: name search is unnecessary for a small initial collection. Resolution: retain list and tag filters; defer text search.
- FR-007: User can start review sessions for a saved flashcard set. Priority: must-have
  > Socrates: Counter-argument considered: review without defined rules would reduce the product to simple browsing. Resolution: retain review with three fixed intervals — tomorrow, three days, and seven days.

## Non-Functional Requirements

- Source text is stored persistently and is accessible only to the owner of its flashcard set; viewing that text is not in the MVP.
- A user's flashcards and flashcard sets are accessible only to that user.

## Business Logic

System oznacza do decyzji użytkownika propozycje, których znormalizowane pytanie lub odpowiedź są identyczne z fiszką już w zestawie, oznacza jako niespełniające jakości odpowiedzi dłuższe niż 300 znaków albo niemal identyczne z pytaniem, ogranicza generowanie do 15 propozycji na sesję oraz planuje powtórki zaakceptowanych fiszek: od razu, a potem po 1, 3 lub 7 dniach zależnie od oceny użytkownika.

Reguła wykorzystuje wklejony tekst, propozycje w bieżącym zestawie i ocenę fiszki w nauce. Jej wynik użytkownik widzi na ekranie akceptacji oraz w trybie nauki.

## Access Control

Users register an account and sign in with an email address and password. The MVP has one flat user role; every authenticated user has the same permissions.

## Non-Goals

- Manual creation of flashcards from scratch is out of scope; the MVP focuses on generating cards from pasted text.
- Generation from a topic/form is out of scope; the MVP ships only the pasted-text flow.
- Shared decks, team workspaces, administrative features, and other collaboration features are out of scope; the MVP serves individual users.
- An adaptive or personalized spaced-repetition algorithm is out of scope; reviews use the three fixed intervals already defined.
- Offline use is out of scope; the MVP makes no offline availability guarantee.

## Open Questions

No open questions captured.
