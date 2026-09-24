---
project: Memoro
version: 1
status: draft
created: 2026-09-22
updated: 2026-09-24
prd_version: 1
main_goal: low-complexity
top_blocker: capacity
milestone_id: first-private-flashcard-flow
milestone_seq: 1
milestone_status: open
---

# Roadmap: Memoro

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Pierwszy prywatny przepływ fiszek** — Status: open

- **Intent:** Udostępnić zalogowanej osobie pełną ścieżkę od wklejenia tekstu, przez zaakceptowanie propozycji, po rozpoczęcie nauki zapisanych fiszek. Potwierdza to, że generowanie z materiału użytkownika oraz przechowywanie wyników są dla niego użyteczne i prywatne.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-005, FR-007; US-01.

## Vision recap

Samodzielnie ucząca się osoba potrzebuje szybko zamieniać własne materiały w dobre fiszki i zachowywać je w jednym miejscu. Ręczne tworzenie fiszek zabiera czas, a obecne narzędzia nie zapewniają wystarczająco prostego katalogowania ani przeglądania.

## North star

**S-01: Użytkownik może wkleić tekst i otrzymać propozycje fiszek do decyzji** — najwcześniej sprawdza podstawową wartość generowania z własnego materiału.

> Pierwszy kluczowy przepływ oznacza tu najmniejszą funkcję od początku do końca, której dostarczenie potwierdza główną hipotezę produktu; jest realizowany tak wcześnie, jak pozwalają warunki wstępne.

## At a glance

| ID | Change ID | Outcome (user can …) | Prerequisites | PRD refs | Status |
| --- | --- | --- | --- | --- | --- |
| F-01 | private-flashcard-data-access | (foundation) trwały dostęp do danych fiszek jest ograniczony do właściciela | — | FR-001, FR-002 | in-progress |
| S-01 | pasted-text-proposals | wkleić tekst i otrzymać oznaczone propozycje fiszek do decyzji | F-01 | US-01, FR-001, FR-002 | blocked |
| S-02 | proposal-review-and-save | zaakceptować komplet propozycji albo edytować i usunąć propozycje przed zapisem zestawu | S-01 | US-01, FR-003 | proposed |
| S-03 | saved-card-editing | edytować i usuwać wygenerowane fiszki w zapisanym zestawie | S-02 | FR-004 | proposed |
| S-04 | tagged-set-catalog | przeglądać zapisane zestawy i filtrować je według tagów | S-02 | FR-005 | proposed |
| S-05 | fixed-interval-review | rozpocząć sesję nauki zapisanego zestawu ze stałymi odstępami | S-02 | US-01, FR-007 | proposed |

## Streams

Navigation aid — groups items that share a prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme | Chain | Note |
| --- | --- | --- | --- |
| A | Tworzenie i zatwierdzanie | `F-01` → `S-01` → `S-02` | Najkrótsza ścieżka do potwierdzenia podstawowej wartości produktu. |
| B | Zarządzanie zapisanymi kartami | `S-03` | Rozgałęzia się po `S-02`; pozostaje prostą funkcją obsługi zapisanych kart. |
| C | Katalog zestawów | `S-04` | Rozgałęzia się po `S-02`; wspiera porządkowanie małej kolekcji. |
| D | Nauka | `S-05` | Rozgałęzia się po `S-02`; domyka obiecaną ścieżkę nauki. |

## Baseline

What's already in place in the codebase as of `2026-09-22` (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React pages and shared UI components are present in `src/pages/` and `src/components/`.
- **Backend / API:** partial — server endpoints currently cover authentication under `src/pages/api/auth/`; no flashcard workflow exists.
- **Data:** partial — Supabase is configured in `src/lib/supabase.ts` and `supabase/config.toml`; no flashcard-domain schema or migrations are present.
- **Auth:** present — Supabase auth endpoints and route middleware exist in `src/pages/api/auth/` and `src/middleware.ts`.
- **Deploy / infra:** partial — Cloudflare Worker configuration and validation CI exist in `wrangler.jsonc` and `.github/workflows/`; environment configuration remains a release prerequisite.
- **Observability:** absent — there is no application logging, error tracking, metrics, or telemetry integration.

## Foundations

### F-01: Prywatny dostęp do danych fiszek

- **Outcome:** (foundation) trwały dostęp do danych fiszek jest ograniczony do właściciela.
- **Change ID:** private-flashcard-data-access
- **PRD refs:** FR-001, FR-002; Non-Functional Requirements (source text, flashcards, and sets are owner-only)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05; verification that private source text and cards are owner-only
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the smallest shared privacy contract needed before any user material is persisted; postponing it risks building a flow that violates the MVP guardrail.
- **Status:** in-progress

## Slices

### S-01: Propozycje fiszek z wklejonego tekstu

- **Outcome:** użytkownik może wkleić tekst, automatycznie utworzyć zestaw i otrzymać do 15 oznaczonych propozycji fiszek do decyzji.
- **Change ID:** pasted-text-proposals
- **PRD refs:** US-01, FR-001, FR-002
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Which AI generation provider and server-side credentials will be approved for the MVP? — Owner: user. Block: yes.
- **Risk:** The core flow is placed first after the privacy contract because provider fit and generated-output behaviour determine whether the product hypothesis can be validated.
- **Status:** blocked

### S-02: Przegląd propozycji i zapis zestawu

- **Outcome:** użytkownik może zaakceptować komplet propozycji albo edytować i usuwać pojedyncze propozycje przed zapisem zestawu.
- **Change ID:** proposal-review-and-save
- **PRD refs:** US-01, FR-003
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** It follows proposal generation because the review must operate on actual generated cards while keeping bulk acceptance as the low-complexity default.
- **Status:** proposed

### S-03: Edycja zapisanych fiszek

- **Outcome:** użytkownik może edytować i usuwać wygenerowane fiszki w zapisanym zestawie.
- **Change ID:** saved-card-editing
- **PRD refs:** FR-004
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** It is separated from proposal review so the first save path stays narrow, while users retain control over cards after saving.
- **Status:** proposed

### S-04: Katalog zestawów z tagami 

- **Outcome:** użytkownik może przeglądać zapisane zestawy fiszek i filtrować listę według tagów.
- **Change ID:** tagged-set-catalog
- **PRD refs:** FR-005
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cataloguing starts only after a saved set exists, avoiding an empty management feature before the core creation flow works.
- **Status:** proposed

### S-05: Nauka w stałych odstępach

- **Outcome:** użytkownik może rozpocząć sesję nauki zapisanego zestawu i zaplanować kolejną powtórkę po 1, 3 lub 7 dniach zależnie od oceny.
- **Change ID:** fixed-interval-review
- **PRD refs:** US-01, FR-007
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** It follows saving because review uses accepted cards, while fixed intervals keep the learning workflow bounded by the agreed MVP rule.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID | Suggested issue title | Ready for `/10x-plan` | Notes |
| --- | --- | --- | --- | --- |
| F-01 | private-flashcard-data-access | Constrain private flashcard data access | yes | Unblocks the first user-facing flow. |
| S-01 | pasted-text-proposals | Generate flashcard proposals from pasted text | no | Resolve the AI provider decision first. |
| S-02 | proposal-review-and-save | Review and save generated flashcard proposals | no | Requires S-01. |
| S-03 | saved-card-editing | Edit and delete saved flashcards | no | Requires S-02. |
| S-04 | tagged-set-catalog | Browse and filter flashcard sets by tags | no | Requires S-02. |
| S-05 | fixed-interval-review | Start fixed-interval flashcard reviews | no | Requires S-02. |

## Open Roadmap Questions

No cross-slice questions captured. The AI provider decision remains on S-01 because it blocks only that slice.

## Parked

- **Manual card creation** — Why parked: PRD §Non-Goals limits the MVP to generation from pasted text.
- **Topic or form generation** — Why parked: PRD §Non-Goals limits generation to pasted text.
- **Sharing, workspaces, and administration** — Why parked: PRD §Non-Goals targets individual learners only.
- **Adaptive review scheduling** — Why parked: PRD §Non-Goals fixes review intervals at 1, 3, and 7 days.
- **Offline availability** — Why parked: PRD §Non-Goals makes no offline guarantee.

## Milestone History

## Done
