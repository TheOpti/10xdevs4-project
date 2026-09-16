---
project: Memoro
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
created: 2026-09-16
updated: 2026-09-16
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: access model
      decision: Account registration and email/password login; one flat user role for the MVP.
    - topic: MVP scope and timeline
      decision: Text-to-flashcard flow through saving and review, with tag cataloging; three weeks of after-hours work.
    - topic: generation flow
      decision: Starting generation from pasted text creates a flashcard set automatically; the user can rename it later.
    - topic: proposal review
      decision: Bulk acceptance is available; individual generated cards can optionally be edited or deleted before saving.
    - topic: review intervals
      decision: Fixed intervals are tomorrow for “don't know”, three days for “hard”, and seven days for “know”.
    - topic: duplicate detection
      decision: Flag a proposal when its normalized question or answer is identical to a card already in the set; the user decides what to do with it.
    - topic: generation quality and limit
      decision: Flag responses longer than 300 characters or nearly identical to their questions; generate at most 15 proposals per session.
    - topic: product framing and non-goals
      decision: Web app for a small group, built after hours with no hard deadline; MVP excludes manual card creation, topic-form generation, collaboration/admin features, adaptive scheduling, and offline support.
  frs_drafted: 6
  quality_check_status: accepted
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Seed Idea

1. Aplikacja do fiszek z generowaniem z tekstu lub formularza zagadnienia, wspólną akceptacją i uproszczonymi powtórkami. Najpierw rdzeń i ścieżka z tekstu, potem tryb tematyczny. Preferowany stack: Astro, React i Supabase. Do ustalenia: kryteria jakości, definicja duplikatu, limity oraz reguły powtórek. Odłożenie trybu 2 pozostaje opcjonalną sugestią.

2. Aplikacja do fiszek z dwoma trybami generowania: wklejasz tekst i agent tworzy z niego propozycje fiszek, albo podajesz zagadnienie w prostym formularzu (temat, poziom, fokus) i agent generuje fiszki na podstawie własnej wiedzy — bez wieloturowego dialogu, żeby nie podnosić progu wejścia. Obie ścieżki prowadzą do wspólnego ekranu akceptacji, a zaakceptowane fiszki trafiają do trybu nauki z uproszczonym algorytmem powtórek (spaced repetition). Logika biznesowa wykracza poza samo generowanie AI dzięki regułom: walidacji jakości fiszek, wykrywaniu duplikatów i limitowi propozycji na sesję.

## Forward: tech-stack

- User-stated preference: Astro, React, and Supabase.

## Vision & Problem Statement

Samodzielny dorosły uczący się online potrzebuje szybko zamieniać materiały w dobre fiszki i przechowywać je w jednym miejscu. Ręczne tworzenie fiszek kosztuje czas, a materiały do nauki są rozproszone.

Istniejące narzędzia nie zapewniają wystarczająco szybkiego i intuicyjnego katalogowania oraz przeglądania fiszek.

## User & Persona

Primary persona: samodzielny dorosły uczący się online, który zaczyna naukę nowego materiału i chce szybko utworzyć, skatalogować oraz później przeglądać fiszki.

## Access Control

Users register an account and sign in with an email address and password. The MVP has one flat user role; every authenticated user has the same permissions.

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

## Business Logic

System oznacza do decyzji użytkownika propozycje, których znormalizowane pytanie lub odpowiedź są identyczne z fiszką już w zestawie, oznacza jako niespełniające jakości odpowiedzi dłuższe niż 300 znaków albo niemal identyczne z pytaniem, ogranicza generowanie do 15 propozycji na sesję oraz planuje powtórki zaakceptowanych fiszek: od razu, a potem po 1, 3 lub 7 dniach zależnie od oceny użytkownika.

Reguła wykorzystuje wklejony tekst, propozycje w bieżącym zestawie i ocenę fiszki w nauce. Jej wynik użytkownik widzi na ekranie akceptacji oraz w trybie nauki.

## Non-Functional Requirements

- Source text is stored persistently and is accessible only to the owner of its flashcard set; viewing that text is not in the MVP.
- A user's flashcards and flashcard sets are accessible only to that user.

## Non-Goals

- Manual creation of flashcards from scratch is out of scope; the MVP focuses on generating cards from pasted text.
- Generation from a topic/form is out of scope; the MVP ships only the pasted-text flow.
- Shared decks, team workspaces, administrative features, and other collaboration features are out of scope; the MVP serves individual users.
- An adaptive or personalized spaced-repetition algorithm is out of scope; reviews use the three fixed intervals already defined.
- Offline use is out of scope; the MVP makes no offline availability guarantee.

## Quality cross-check

- All required greenfield checks passed: access control, one-sentence business logic, project artifact, timeline-cost acknowledgement, and non-goals.
