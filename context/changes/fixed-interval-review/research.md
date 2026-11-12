---
date: 2026-11-12T22:30:17+01:00
researcher: Codex
git_commit: 3cad70e264c870690b49cf023b1a724ab88d96cb
branch: main
repository: 10xdevs4-project
topic: "Readiness for S-05: fixed-interval flashcard review"
tags: [research, codebase, flashcards, review, supabase]
status: complete
last_updated: 2026-11-12
last_updated_by: Codex
last_updated_note: Saved the previously completed research in English after leaving Plan Mode
---

# Research: Fixed-interval review readiness

## Research Question

What requirements, data model, UI/API contracts, authorization patterns, and testing infrastructure already support S-05, and what gaps or decisions must implementation planning address?

The user selected readiness for S-05 as the research scope. This document records codebase findings and unresolved choices; it does not approve an implementation plan.

## Summary

The application has persisted, owner-scoped flashcards and a working saved-set entry point. The inspected production routes, repository, and migrations do not yet implement study sessions, rating persistence, or review scheduling. The existing review screen is a static design mock whose rating semantics conflict with the agreed requirements. Sources: `src/pages/dashboard/sets/[setId].astro:22`, `src/lib/flashcards.ts:54`, `supabase/migrations/20260924000000_create_private_flashcard_data.sql:16`, `src/design/ReviewFlashcards.jsx:11`.

The product decisions already specify immediate availability after acceptance and subsequent intervals of 1, 3, or 7 days. The rating mapping is settled: “don't know” means tomorrow, “hard” means three days, and “know” means seven days. Sources: `context/foundation/prd.md:73`, `context/foundation/shape-notes.md:23`.

Planning can build on the existing persistence and authentication boundaries. It still needs decisions about calendar semantics, session membership and lifecycle, existing-card initialization, content edits, and concurrent or retried ratings.

## Detailed Findings

### Requirements and dependencies

- S-05 concerns starting a learning session for a saved set and scheduling the next review according to the user's rating. Its declared prerequisite is S-02, proposal review and saving. Source: `context/foundation/roadmap.md:139`.
- Accepted cards are available immediately; subsequent scheduling follows the fixed rating mapping above. Adaptive scheduling and offline guarantees are outside the MVP. Sources: `context/foundation/prd.md:73`, `context/foundation/prd.md:86`, `context/foundation/shape-notes.md:23`.
- The roadmap still labels S-02 `in-progress`, whereas its change metadata says `impl_reviewed`. Current code provides the save operation and links to the saved set. This is a lifecycle-documentation discrepancy, not evidence that saving is absent. Sources: `context/foundation/roadmap.md:46`, `context/changes/proposal-review-and-save/change.md:4`, `src/lib/flashcards.ts:141`, `src/components/flashcards/NewFlashcardsForm.tsx:378`.

### Data and persistence

- The original `flashcards` schema contains an ID, set reference, question, answer, and creation timestamp. A later migration adds the save-operation reference and text constraints. Across the inspected migration directory, there is no due timestamp, rating, or review-history schema. Sources: `supabase/migrations/20260924000000_create_private_flashcard_data.sql:16`, `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:10`.
- The application `Flashcard` type exposes `id`, `question`, `answer`, and `createdAt`. The repository interface offers set/card reads and mutations but no review-session or rating operation. Source: `src/lib/flashcards.ts:13`, `src/lib/flashcards.ts:54`.
- `getSetWithCards` loads the cards associated with the addressed visible set and sorts them by creation time, then ID. This path does not filter by review eligibility. Source: `src/lib/flashcards.ts:177`.
- Despite its name, `save_reviewed_flashcards` saves accepted generation proposals, not learning outcomes. For a valid new request, the RPC inserts a batch containing 1–15 cards. Reusing the owner's request key returns the currently existing cards linked to that operation rather than inserting another batch. Sources: `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:40`, `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:77`.
- A repeated proposal-save request does not restore deleted cards or overwrite later content edits on the inspected replay path. Scheduling initialization must preserve that behavior rather than treating replay as fresh acceptance. Sources: `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:94`, `supabase/tests/private_flashcard_data_rls.test.sql:245`.
- `updateCard` changes question and answer. `deleteCard` removes the addressed record, and the schema cascades set deletion to its cards. No review-reset policy is implemented on these paths. A separate review-state table would need an explicit deletion relationship. Sources: `src/lib/flashcards.ts:246`, `src/lib/flashcards.ts:269`, `supabase/migrations/20260924000000_create_private_flashcard_data.sql:18`.

### UI and session entry

- Successful proposal saving offers “Open saved set”; catalog entries also navigate to the saved-set detail page. The detail page mounts the tag editor and saved-card component. Sources: `src/components/flashcards/NewFlashcardsForm.tsx:378`, `src/components/Dashboard.tsx:111`, `src/pages/dashboard/sets/[setId].astro:22`.
- The saved-card component displays question and answer with editing/deletion controls and an explicit empty-set state. It is a management screen, without a study-session interaction in the inspected component. Source: `src/components/flashcards/SavedFlashcardSet.tsx:125`, `src/components/flashcards/SavedFlashcardSet.tsx:216`.
- The inspected `src/pages` inventory contains no study/review route. The corresponding design mock hard-codes a card and progress; rating clicks hide the answer. Its exit button and displayed keyboard shortcuts have no handlers implementing those behaviors in that file. Source: `src/design/ReviewFlashcards.jsx:6`, `src/design/ReviewFlashcards.jsx:21`, `src/design/ReviewFlashcards.jsx:28`, `src/design/ReviewFlashcards.jsx:78`.
- The mock offers Again (<1m), Hard (6m), Good (1d), and Easy (4d). Those four controls do not implement the agreed three fixed intervals and must not determine the production rating contract. Source: `src/design/ReviewFlashcards.jsx:11`; requirement: `context/foundation/shape-notes.md:23`.
- Existing view helpers retain catalog tag-filter context in set links and distinguish missing sets from unavailable data. These provide navigation and error-state patterns for a future study entry. Sources: `src/lib/flashcard-views.ts:69`, `src/lib/flashcard-views.ts:88`, `src/pages/dashboard/sets/[setId].astro:9`.

### Authorization and API contracts

- Flashcard SELECT, INSERT, UPDATE, and DELETE policies constrain access through the owning set. UPDATE checks both existing and resulting rows. A separate review-state table would require its own RLS policies; extending the card row would reuse its ownership boundary. Source: `supabase/migrations/20260924000000_create_private_flashcard_data.sql:86`.
- The Supabase client uses server environment values and request cookies. Existing domain RPCs use `security invoker` with an empty search path. These are established patterns for keeping operations tied to the authenticated owner. Sources: `src/lib/supabase.ts:1`, `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:43`.
- Middleware protects `/dashboard`, `/api/flashcards/cards/`, and `/api/flashcards/sets/`. Unauthenticated protected pages redirect to sign-in; protected API paths return JSON 401, or 503 if Supabase is unavailable. A different API prefix would need central registration. Source: `src/middleware.ts:4`.
- Existing card mutation endpoints validate identifiers and input, construct a request-scoped repository, and return sanitized errors. Their not-found response does not distinguish hidden cards from missing ones. Sources: `src/pages/api/flashcards/cards/[cardId].ts:8`, `src/pages/api/flashcards/cards/[cardId].test.ts:94`.
- The shared JSON parser bounds declared and streamed request bodies to 48 KiB. Saved-card UI already demonstrates pending-state handling, response validation, retained drafts after uncertain results, and accessible status feedback. These are reusable patterns, not implemented guarantees for future rating writes. Sources: `src/lib/request-body.ts:1`, `src/components/flashcards/SavedFlashcardSet.tsx:29`.

### Tests and validation infrastructure

- Vitest covers repository reads/mutations and middleware/API behavior. Existing cases include save RPC invocation, stable card ordering, empty versus invisible sets, and sanitized mutation failures. Sources: `src/lib/flashcards.test.ts:61`, `src/lib/flashcards.test.ts:281`, `src/lib/flashcards.test.ts:303`, `src/middleware.test.ts:19`, `src/pages/api/flashcards/cards/[cardId].test.ts:32`.
- SQL tests exercise owner isolation, deletion cascades, and proposal-save replay after mutations. These provide a foundation for testing the future review-state boundary. Source: `supabase/tests/private_flashcard_data_rls.test.sql:104`, `supabase/tests/private_flashcard_data_rls.test.sql:217`, `supabase/tests/private_flashcard_data_rls.test.sql:233`.
- Playwright runs against a build/preview server with authenticated storage state. Its fixture helper creates private saved sets against local Supabase and supports cleanup. Sources: `playwright.config.ts:11`, `playwright.config.ts:32`, `tests/e2e/flashcard-fixture.ts:26`, `tests/e2e/flashcard-fixture.ts:68`.
- `npm run verify` runs lint, Astro/type checks, Vitest, and production build. The inspected CI workflow runs those categories too. Neither that script nor that workflow includes SQL tests, Playwright, or smoke execution; those require separate validation. Sources: `package.json:15`, `.github/workflows/ci.yml:19`.

## Architecture Insights

The existing separation is suitable for extension: Astro pages load private data, React islands own interaction state, API handlers validate requests, and the request-scoped repository accesses Supabase under RLS. The saved-set detail page is an available integration point; the research does not select a final study URL or layout.

Implementation will need a persisted scheduling model, a review-queue read, a rating-write contract, and session UI. These are inferred gaps from the inspected contracts, not a selected schema or endpoint design. Proposal acceptance and learning review must remain distinguishable operations despite the existing RPC's name.

## Historical Context

- **Still supported:** F-01 deliberately excluded review scheduling from its scope. The inspected current data model still lacks that mechanism. Sources: `context/changes/private-flashcard-data-access/plan.md:27`, `src/lib/flashcards.ts:54`.
- **Lifecycle discrepancy:** S-02's roadmap status differs from its implementation-reviewed change metadata; the save path exists in current code. This does not establish deployment or current runtime health. Sources: `context/foundation/roadmap.md:46`, `context/changes/proposal-review-and-save/change.md:4`, `src/lib/flashcards.ts:141`.
- **Design mismatch:** The review mock's intervals conflict with the retained product rules. Its presence does not imply a production session implementation. Sources: `src/design/ReviewFlashcards.jsx:11`, `context/foundation/shape-notes.md:23`.

## Related Research

The neighboring proposal-saving and saved-card-editing artifacts provide historical context, but no separate review-session research artifact was used as an authority. The findings above rely on current source and foundation requirements.

## Open Questions for Planning

1. Does “tomorrow” mean a calendar day in a defined time zone, or 24 hours after rating? Which clock determines eligibility?
2. Does a session include due cards exclusively, or can the user practice early? What determines queue order?
3. What happens when a session finishes, is abandoned, or reloads? Is session progress persisted independently of card scheduling?
4. How are existing saved cards initialized when scheduling is introduced?
5. Does editing a question or answer preserve or reset its learning state?
6. How are duplicate submissions, a lost success response, and simultaneous ratings from different tabs reconciled?
7. How should the session handle a card edited or deleted elsewhere while it is open?
8. Should study use a standalone layout or the current app shell, and preserve the catalog filter on exit?

The rating-to-interval mapping is settled and is not an open choice. These remaining decisions belong to planning; research has not silently selected defaults.

## Suggested Validation Coverage

For the eventual implementation, cover immediate eligibility, each required rating interval, the exact due-time boundary, empty and not-yet-due queues, owner isolation, invalid ratings, repeated or concurrent writes, interrupted sessions, and card edits/deletions during study. Include a browser flow from a saved set through answer reveal, rating, completion, and reload, plus a failed-write recovery case. Calendar and concurrency expectations must follow the decisions made during planning.

## Evidence Scope and Limitations

The research inspected foundation requirements, active-change metadata, relevant historical plans, the Supabase migration directory and RLS tests, the flashcard repository, saved-set UI, production route inventory, middleware and mutation patterns, review mock, and test configuration/fixtures. Parallel read-only investigations covered data/security and UI/API; their findings were checked during synthesis.

No application tests, browser sessions, builds, or live database checks were run for this research. Applied migration state, deployment behavior, and runtime readiness are unverified. `status: complete` describes completion of the agreed codebase investigation, not feature completion or release approval. Source references are repository-relative `file:line` anchors, not remote commit permalinks. The commit recorded above was unchanged when this document was saved.
