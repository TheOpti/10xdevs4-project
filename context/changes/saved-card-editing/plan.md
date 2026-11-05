# Saved Card Editing — Implementation Plan

## Overview

Users can open their own saved sets, edit an individual flashcard's question or answer, and permanently delete a card after confirmation. This change implements FR-004 and roadmap slice S-03.

## Current State Analysis

- `src/lib/flashcards.ts:57` exposes card updates and deletion; reading a set does not expose its source text.
- `src/components/Dashboard.tsx:13` contains example collections instead of user data.
- `src/components/flashcards/NewFlashcardsForm.tsx:222` clears the set ID after a confirmed save.
- Existing migrations provide RLS, a 1000-character limit per field, and links between cards and save operations. A set-detail page and edit/delete endpoints are missing.
- Proposal saving is implemented and approved in the S-02 implementation review, although the roadmap still lists it as in-progress.

## Desired End State

The dashboard shows the owner's actual sets and links to `/dashboard/sets/[setId]`. Each card supports individual editing, saving, cancellation, and confirmed deletion. Changes survive refresh; deleting the last card preserves the empty set and its source text.

The last successful write wins for concurrent edits. Fields must be nonempty and stay within the existing limit of 1000 Unicode code points; no quality warnings are added. An uncertain proposal-save outcome preserves the draft and offers a link to inspect saved cards.

### Key Discoveries

- The repository and RLS policies already support the required mutations; no migration is needed.
- `src/pages/api/flashcards/save.ts` provides the pattern for UUID validation, field trimming, and safe JSON responses; `src/lib/request-body.ts` limits requests to 48 KiB.
- Retrying the initial save reads the current cards linked to that operation. Results may differ after editing or be empty after all cards are deleted. Deleted data must not be restored, and the UI must not falsely confirm that an old draft matches the saved data.

## What We're NOT Doing

- Tags, search, manual card creation, study mode, set renaming, or whole-set deletion.
- Edit history, undoing deletion, version-conflict resolution, or persistent drafts across visits.
- Automatically transferring a proposal draft into the saved-card editor.
- Changing the initial-save contract, adding migrations, or using privileged access that bypasses RLS.

## Implementation Approach

First expose private operations through the API, then add a protected Astro page with a React editor and a real set list, and finally integrate the initial-save flow and verify the result. Reuse the existing Supabase repository, UI components, and tokens.

The interface remains in English. Saving requires an explicit action; refreshing or leaving the view discards an unsaved draft. A failed request preserves the draft in the open editor. UI changes follow server confirmation.

## Phase 1: Edit and Delete API

### Overview

Expose existing repository operations through a safe API and share validation with the initial-save flow.

### Changes Required

#### 1. Endpoint and validation

**Files:** `src/pages/api/flashcards/cards/[cardId].ts`, `src/pages/api/flashcards/save.ts`, `src/lib/flashcard-validation.ts`, `src/lib/flashcards.ts`, and corresponding Vitest tests.

**Intent:** Allow editing and deleting one card without duplicating validation rules.

**Contract:**

- `PATCH /api/flashcards/cards/[cardId]` accepts `{ question, answer }` and returns `200 { card }`; `DELETE` returns `204` after deletion.
- A shared validator checks UUIDs and both fields: trimmed text containing 1–1000 Unicode code points. Preserve the existing save endpoint's behavior.
- Reuse the existing bounded JSON reader with its 48 KiB limit.
- Invalid input: `400`; missing session: `401`; missing or another user's card: identical `404`; missing configuration: `503`; operation failure: `500`. Do not expose database details.
- Update only the question and answer. Do not accept an owner, set ID, or save-operation ID from the request body.
- Preserve existing repository methods and RLS; do not use a privileged client that bypasses permissions.

#### 2. Route protection and privacy evidence

**Files:** `src/middleware.ts`, middleware and API tests, `supabase/tests/private_flashcard_data_rls.test.sql`.

**Intent:** Enforce owner access and verify it against the actual database.

**Contract:** Protect the new `/api/flashcards/cards/` prefix in middleware with JSON responses. Preserve redirects for protected pages and the behavior of other endpoints. SQL tests verify successful owner operations and the inability to update or delete another user's card, including when its ID is known.

### Success Criteria

#### Automated Verification

- Vitest tests verify validation, normalization, API responses, and update/delete results.
- SQL tests verify owner operations and prevent updates or deletion of another user's card.

## Phase 2: Editor and Navigation

### Overview

Allow users to reopen saved sets and manage individual cards through a clear interface.

### Changes Required

#### 1. Set page and editor

**Files:** `src/pages/dashboard/sets/[setId].astro`, `src/components/flashcards/SavedFlashcardSet.tsx`, `src/lib/flashcards.ts`, and read/view-state tests.

**Intent:** Display private cards and allow independent editing and deletion.

**Contract:**

- The page reads the set on the server through the existing repository. The existing `/dashboard` middleware prefix provides protection.
- An invalid ID, another user's set, or a missing set produces a `404` page. Read failures display a separate unavailable state rather than an empty set.
- The React component receives the title and cards without source text or credentials.
- Each card has a preview and its own edit mode. “Save” persists both fields; “Cancel” restores the last confirmed values.
- Disable editing and actions for the affected card while its request is pending. Update the UI only after server confirmation.
- Deletion requires confirmation beside the selected card, with a cancel option. Deleting the last card displays the empty-set state.
- For uncertain outcomes, preserve the content and offer retry and refresh. A `404` during editing preserves the draft for copying; during deletion, it reports that the card is unavailable and allows removing the stale row from the view.
- Keep card ordering stable: `createdAt`, then `id`; editing does not change position.
- Reuse existing UI components and tokens; provide labels, screen-reader-accessible messages, and keyboard support.

#### 2. Real list and navigation

**Files:** `src/pages/dashboard.astro`, `src/components/Dashboard.tsx`, `src/components/AppShell.tsx`, `src/lib/flashcards.ts`.

**Intent:** Allow users to return to saved sets without implementing the full tagged catalog.

**Contract:** The dashboard receives actual sets, including empty ones. Order by creation date descending, then ID. Each title links to its set page. Remove fictional study statistics and example collections; provide separate states for no sets and read failures. “Collections” navigation leads to the dashboard, and the inactive search control stays hidden until the catalog is implemented.

### Success Criteria

#### Automated Verification

- Read and view-state tests distinguish empty sets, unavailable sets, and service failures, and verify stable ordering.

#### Manual Verification

- A user opens a set from the dashboard, saves or cancels an edit, and deletes cards with confirmation; an empty set remains accessible.
- The view works on a small screen and with a keyboard, and a save failure preserves entered content.

## Phase 3: Integration and Verification

### Overview

Connect initial saving to later editing and verify persistence and privacy across the complete flow.

### Changes Required

#### 1. Transition from proposals to saved cards

**Files:** `src/components/flashcards/NewFlashcardsForm.tsx`, existing reconciliation and save tests, `supabase/tests/private_flashcard_data_rls.test.sql`.

**Intent:** Allow inspecting and manually correcting saved cards even after an uncertain initial-save outcome.

**Contract:** Retain the successfully saved set's ID and add “Open saved set” to the completion screen. For an unconfirmed save or a mismatch between saved cards and the draft, preserve the draft and add “Check saved set”. Remove the suggestion that correcting saved cards requires generating a new set. Do not automatically transfer the draft into the editor or issue another save. Retain the original retry key; retrying after editing or deletion neither creates new cards nor falsely confirms a draft match.

#### 2. Browser flow and full verification

**Files:** `tests/e2e/saved-card-editing.spec.ts` and a test-data helper under `tests/e2e/`; existing API, repository, and SQL tests.

**Intent:** Prove persistence and prevent regressions without making the test depend on AI generation.

**Contract:** Use the existing Playwright authentication setup. Create test data through a test Supabase client acting as the owner, without calling AI; clean up only sets created by the test. Verify navigation, editing and persistence after refresh, cancellation, deletion confirmation, and empty-set retention. Run SQL tests and the repository's full completion gate.

### Success Criteria

#### Automated Verification

- Regression tests verify that retrying the initial save after editing or deletion neither restores cards nor falsely confirms the draft.
- A Playwright test verifies navigation, persistent editing, cancellation, and deletion of the last card.
- `npx supabase test db` and `npm run verify` pass.

#### Manual Verification

- Two browser tabs demonstrate last-write-wins behavior, and an uncertain proposal save preserves the draft and links to the correct set.

## Testing Strategy

- Vitest: empty fields, whitespace, 1000/1001-code-point boundaries, invalid UUIDs and JSON, oversized requests, missing sessions, another user's or missing data, and repository failures.
- SQL: successful owner mutations, isolation from a second account, and retention of the set, source, and save operation after card deletion; retrying an old save does not restore data.
- Playwright: `npx playwright test tests/e2e/saved-card-editing.spec.ts --project=chromium`; persistence after refresh, cancellation, and the last card.
- Manual: responsive layout, keyboard use, network failures, two browser tabs, and the transition from an uncertain proposal save.
- Completion gate: `npx supabase test db` and `npm run verify`. Do not mark criteria complete when verification was skipped or blocked.

## Performance Considerations

The project assumes small collections: read all sets and the cards of one set, without pagination or polling. Mutations affect one card.

## Migration Notes

No migration, new secrets, or feature flag is needed. Release through the existing application process. Rolling back the application does not reverse completed edits or deletions. Preserve existing save-operation links; do not modify archived material.

## References

- `context/foundation/prd.md` — FR-004, privacy, and MVP constraints.
- `context/foundation/roadmap.md` — S-03 and its boundaries with S-04 and S-05.
- `context/changes/proposal-review-and-save/plan.md` and `reviews/impl-review.md` — initial saving and reconciliation of uncertain outcomes.
- `src/lib/flashcards.ts`, `src/pages/api/flashcards/save.ts`, `src/lib/request-body.ts` — data contracts and API patterns.
- `supabase/migrations/20260924000000_create_private_flashcard_data.sql`, `20261004000001_save_reviewed_flashcards.sql`, `20261005000000_enforce_flashcard_save_operation_set.sql` — RLS, limits, and durable save links.

## Progress

### Phase 1: Edit and Delete API

#### Automated

- [ ] 1.1 Vitest tests verify validation, normalization, API responses, and update/delete results.
- [ ] 1.2 SQL tests verify owner operations and prevent updates or deletion of another user's card.

### Phase 2: Editor and Navigation

#### Automated

- [ ] 2.1 Read and view-state tests distinguish empty sets, unavailable sets, and service failures, and verify stable ordering.

#### Manual

- [ ] 2.2 A user opens a set from the dashboard, saves or cancels an edit, and deletes cards with confirmation; an empty set remains accessible.
- [ ] 2.3 The view works on a small screen and with a keyboard, and a save failure preserves entered content.

### Phase 3: Integration and Verification

#### Automated

- [ ] 3.1 Regression tests verify that retrying the initial save after editing or deletion neither restores cards nor falsely confirms the draft.
- [ ] 3.2 A Playwright test verifies navigation, persistent editing, cancellation, and deletion of the last card.
- [ ] 3.3 `npx supabase test db` and `npm run verify` pass.

#### Manual

- [ ] 3.4 Two browser tabs demonstrate last-write-wins behavior, and an uncertain proposal save preserves the draft and links to the correct set.
