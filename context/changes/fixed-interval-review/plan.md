# Fixed-Interval Review Implementation Plan

## Overview

Implement S-05: let an authenticated owner study a saved set, reveal answers, and rate cards to schedule the next review. The user approved the decisions and three phases below. This plan authorizes planning artifacts; implementation, deployment, and commits are separate actions.

## Current State Analysis

Private sets and cards, proposal saving, content editing, deletion, and tag-aware navigation exist. The repository has no review state or rating methods. The review design mock has incompatible rating semantics and no persistence. Use `research.md` as the evidence baseline; do not repeat broad discovery.

The existing card API and Supabase client supply request-scoped authentication, bounded JSON parsing, sanitized errors, and owner RLS. Existing table-wide card write grants require narrowing before adding database-controlled scheduling fields. Vitest, SQL tests, and authenticated Playwright fixtures are available, but SQL/browser tests are separate from `npm run verify`.

## Desired End State

- A saved set offers a focused study screen with question, answer reveal, three ratings, progress, and exit back to that set. Preserve the catalog filter through entry and exit.
- “Don't know”, “Hard”, and “Know” schedule exactly 24, 72, and 168 elapsed hours after the database-recorded rating time. At 23:00 UTC, a 24-hour rating becomes due at 23:00 UTC the following day, not at midnight. Local daylight-saving changes do not alter elapsed duration.
- Existing cards become immediately due at migration; newly saved cards are immediately due on insertion. Sessions include cards with `due_at <= database time`, ordered by `due_at`, then ID ascending. There is no early-practice mode.
- Persist each rating immediately. Keep session queue, reveal state, and counters in memory; reload or re-entry rebuilds the currently due queue with fresh counters.
- Content edits preserve due dates but invalidate previously loaded content revisions. The first valid rating against a revision wins. Exact request retries do not apply another rating; stale ratings are rejected. Missing cards are skipped with an explanation.

### Key Discoveries:

- `context/foundation/shape-notes.md:23` establishes the rating mapping; the planning interview resolves “days” to exact elapsed hours.
- `src/lib/flashcards.ts:177` retrieves a saved set without a due filter; `:246` updates question and answer.
- `supabase/migrations/20260924000000_create_private_flashcard_data.sql:38` grants table-wide writes; `:86` provides owner-scoped card policies.
- `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:77` supplies an existing replay-safe proposal-save pattern, distinct from learning reviews.
- `src/middleware.ts:4` already protects the chosen page/API prefixes; `src/lib/flashcard-views.ts:69` supplies safe filter-aware navigation.

## What We're NOT Doing

- Adaptive scheduling, calendar-day/timezone preferences, early practice, notifications, analytics, streaks, or a review-history UI.
- Persisted sessions, exact session resumption, offline writes, automatic background retries, or realtime subscriptions.
- Manual card creation, changes to generation, resetting schedules after edits, or repairing unrelated roadmap statuses.
- Importing the mock's four ratings, minute-based intervals, fake progress, or unimplemented shortcut hints.

## Implementation Approach

Extend cards with database-owned schedule and revision fields. Add an atomic rating RPC and private immutable retry receipts. Keep ordinary content edits compatible through column-level privileges and a content-change trigger. A separate review repository exposes typed read/write contracts without expanding the existing management `Flashcard` response.

Use an Astro route to load a due-queue snapshot and a React island for the focused session. Place the rating endpoint under the existing protected card API prefix. Treat uncertain outcomes differently from confirmed failures; allow explicit retry of the exact operation or reload from persisted state.

## Critical Implementation Details

### Transaction ordering

Serialize identical owner/request keys before receipt lookup, then lock the owned card before checking revision and due time. Capture the rating timestamp after acquiring the card lock. Replay lookup precedes stale-revision checks so a committed request remains retryable after a later edit or rating, while the card still exists.

### Authorization boundary

The rating write needs a narrowly scoped `SECURITY DEFINER` RPC because authenticated callers must not write schedule fields or receipts directly. This is an explicit exception to existing invoker RPCs: require `auth.uid()`, verify live card ownership, use an empty search path and fully qualified names, and grant execution only to authenticated users. Do not introduce a service-role key into application code.

## Phase 1: Scheduling and atomic ratings

### Overview

Establish persisted scheduling, concurrency, and retry guarantees before exposing the feature.

### Changes Required:

#### 1. Scheduling schema and content revisions

**Files**: new `supabase/migrations/<timestamp>_add_fixed_interval_review.sql`; existing migration files remain unchanged.

**Intent**: Make new and existing cards immediately available and prevent ratings against obsolete content without changing schedules when text is edited.

**Contract**: Add `due_at timestamptz NOT NULL DEFAULT now()` and `revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0)` to `flashcards`, plus `(set_id, due_at, id)` index. Backfill existing cards at migration time. A BEFORE UPDATE trigger increments revision when question or answer actually changes, preserving due time; no-op text saves do not increment. Change-then-revert still invalidates the original revision.

Revoke table-wide INSERT/UPDATE from authenticated users and grant INSERT on `id, set_id, save_operation_id, question, answer` and UPDATE on `question, answer`. Retain owner-protected SELECT/DELETE. Scheduling values and revision cannot be supplied directly by ordinary clients. Preserve proposal-save RPC execution and existing editing behavior; adjust test fixtures that explicitly insert protected/default timestamp columns to use privileged setup or defaults, without weakening grants.

#### 2. Immutable receipts and transactional rating

**Files**: the new migration; new `supabase/tests/fixed_interval_review.test.sql`.

**Intent**: Ensure one committed rating per expected revision and safe replay after a lost HTTP response.

**Contract**: Create `flashcard_review_operations` with owner ID, request UUID, card ID, expected revision, rating, resulting revision, `rated_at`, and `due_at`. Primary key is `(owner_id, request_id)`; rating is constrained to `dont_know`, `hard`, or `know`. Owner and card foreign keys cascade deletion. Enable RLS and deny direct authenticated/anonymous table access; receipts are written/read through the rating RPC and contain no question/answer text. Keep receipts while the card exists; deleting the card removes its receipts, so subsequent retries return not-found rather than restoring anything.

Add `rate_flashcard(card_id uuid, expected_revision integer, rating text, request_id uuid)`, returning the stored receipt outcome. Reject null/invalid inputs. Acquire a transaction-scoped advisory lock derived consistently from the authenticated owner/request key. Verify the card is still owned and lock it; look up a matching receipt before checking current revision/due eligibility. An exact payload match returns the original outcome; reuse of the key with another card, revision, or rating is a conflict. Ownership remains checked even on replay.

For a new operation, capture `clock_timestamp()` after locking, require matching revision and `due_at <= rated_at`, increment revision, calculate the new due time using 24/72/168 hours, and insert the receipt in the same transaction. A receipt failure rolls back the schedule update. Different request IDs racing against one revision yield one success and one conflict. Content edits serialize on the same card row. Missing/foreign cards share a not-found result. Use SQLSTATE `22023` for invalid input, `P0002` for not-found, `P0001` for conflict, and `42501` for missing authentication, mapped explicitly by Phase 2; do not inspect error message text.

#### 3. Database-clock queue read and verification

**Files**: the new migration and SQL test; new `scripts/test-review-concurrency.mjs`.

**Intent**: Use the database clock for queue membership and prove real concurrent requests rather than relying on mocked ordering.

**Contract**: Add a `SECURITY INVOKER` read RPC `get_flashcard_review_queue(set_id uuid)` returning one owner-visible set envelope: set ID/title, total card count, and a due-card array containing ID, question, answer, due time, revision. Use one statement snapshot and one database timestamp for selection, with stable due-time/ID ordering. A visible set with no due cards returns an empty array; a hidden/missing set returns not-found. Do not return stored source text. Use the existing request-scoped Supabase client.

The concurrency script uses the installed Supabase client and local E2E account setup, refuses non-loopback Supabase URLs, creates isolated fixtures, and cleans them up. Exercise simultaneous distinct requests for one revision, simultaneous identical requests, and reuse of a key across different cards. SQL tests cover defaults/backfill on representative pre-migration fixtures, grants, owner isolation, exact elapsed durations including DST, due boundaries, content revisions, replay after later changes, deletion, and transactional rollback. Keep test-only clock manipulation or privileged fixture writes outside production RPCs.

### Success Criteria:

#### Automated Verification:

- The additive migration applies on local Supabase and `npx supabase test db` passes scheduling, grants, RLS, replay, and existing persistence regressions.
- `node scripts/test-review-concurrency.mjs` passes the local concurrent-rating and request-key collision scenarios.
- `npm run verify` passes after the database contract changes.

## Phase 2: Review API and data loading

### Overview

Expose typed review reads and writes through the existing server-side authentication boundary.

### Changes Required:

#### 1. Repository, validation, and view contracts

**Files**: new `src/lib/flashcard-reviews.ts`, `src/lib/flashcard-reviews.test.ts`, `src/lib/review-views.ts`, and `src/lib/review-views.test.ts`; extend `src/lib/flashcard-views.ts` and its tests for review-link formatting.

**Intent**: Isolate learning contracts from proposal saving and management responses while reusing request-scoped Supabase access.

**Contract**: Define `ReviewRating = "dont_know" | "hard" | "know"`, `ReviewCard` with ID/question/answer/dueAt/revision, and a queue envelope with set ID/title, totalCards, and cards. Define a receipt result with requestId/cardId/rating/expectedRevision/revision/ratedAt/dueAt. The repository exposes `getQueue(setId)` and `rateCard(cardId, { requestId, expectedRevision, rating })`, calling the Phase 1 RPCs and mapping invalid-input/not-found/conflict/request-failed explicitly. Validate UUIDs, nonnegative integer revisions, enum values, and response shapes. Never accept owner ID or client-provided dates.

The view loader returns ready/not-found/unavailable without turning errors into an empty queue. Add `formatReviewHref(setId, filter)` using the current catalog query formatter; parse raw URL search with the existing strict parser. No arbitrary return URL is accepted.

#### 2. Rating endpoint and route protection

**Files**: new `src/pages/api/flashcards/cards/[cardId]/review.ts` and its test; extend `src/middleware.test.ts`.

**Intent**: Persist a rating immediately and report conflicts without exposing database internals.

**Contract**: POST JSON `{ requestId, expectedRevision, rating }` to `/api/flashcards/cards/:cardId/review`. Use the shared bounded JSON parser and middleware authentication; do not duplicate page/handler auth checks. Success, including replay, is HTTP 200 with `{ review: <receipt result> }`. Invalid input is 400, unauthenticated is 401, hidden/missing card is 404, stale/not-due/reused-key conflict is 409, unavailable configuration is 503, and unexpected database/transport failure is sanitized 500. Error bodies use `{ error: string }`. Return `Cache-Control: no-store` on review responses. Existing protected prefixes already cover the new endpoint and review page.

### Success Criteria:

#### Automated Verification:

- Review repository and view tests pass for RPC mapping, response validation, due ordering, empty versus unavailable states, and preserved catalog filters.
- Rating endpoint and middleware tests pass for valid ratings/replays, invalid payloads, protected paths, 404/409 mapping, and sanitized failures.
- `npm run verify` passes after the review API and loader changes.

## Phase 3: Study screen and verification

### Overview

Connect saved sets to a focused review flow and verify its behavior against the real local persistence layer.

### Changes Required:

#### 1. Entry and focused study page

**Files**: `src/pages/dashboard/sets/[setId].astro`; new `src/pages/dashboard/sets/[setId]/review.astro`; new `src/components/flashcards/ReviewSession.tsx`.

**Intent**: Let users study without the management sidebar and return to their original set/filter context.

**Contract**: Show “Start review” on nonempty saved sets. Load the queue server-side, mark the page `no-store`, and render a React island inside the existing `Layout` without `AppShell`. Use current shared UI primitives and theme tokens. Missing/hidden set is HTTP 404; loading failure is 503 with retry. Distinguish “No cards in this set” from “No cards due” using totalCards. Neither is a completed session. Both provide return navigation.

The ready screen shows set title, progress through the initial queue, a concealed answer, “Show answer”, and then “Don't know — 24 hours”, “Hard — 72 hours”, and “Know — 168 hours”. Do not enable rating before reveal. Exit and completion links return through `formatSetHref` with the parsed filter. Use standard keyboard-operable buttons, visible focus, live status, and focus transfer to the next question or recovery message; custom shortcut keys are outside this change.

#### 2. Session transitions and recovery

**Files**: new `src/lib/review-session-state.ts` and its test; `ReviewSession.tsx`.

**Intent**: Advance only on confirmed outcomes and preserve the user's selected operation when confirmation is lost.

**Contract**: Hold the queue snapshot, index, reveal state, pending operation, saved/skipped counters, and status message in memory. Generate one request UUID when a rating is selected. Lock controls synchronously against double submissions. Advance after a validated 200 receipt matching card, request, rating, and expected revision; conceal the next answer. Increment saved count once.

On network failure, 5xx, or malformed success, retain the exact request and current card, explain that the rating may have been saved, and offer “Retry rating” with the identical payload or “Reload reviews”. Do not allow choosing another rating while this outcome is unresolved. Reload discards session memory and retrieves the current due queue.

On 409, explain that the card changed or was already reviewed; do not count or advance, disable rating, and offer reload. On 404, skip the no-longer-available card with an accessible explanation and increment skipped count. On 401, stop and offer sign-in. Pending in-app navigation is disabled, but do not promise persistence for a browser close/back before a response arrives.

When the initial queue is consumed, show “Review finished” and separate saved/skipped counts. Do not claim the entire set is permanently clear or append newly due cards automatically. Re-entry/reload starts a fresh queue. A card edited during the session is rejected on rating and reloaded with its new revision; its due date is unchanged. Deleted cards are not restored by retries.

#### 3. End-to-end verification

**Files**: new `tests/e2e/fixed-interval-review.spec.ts`; extend `tests/e2e/flashcard-fixture.ts` without changing existing callers.

**Intent**: Verify visible behavior and persistence together, including uncertain outcomes and concurrent changes.

**Contract**: Use isolated local authenticated fixtures and real rating writes. Cover each rating, subsequent reload exclusion, due versus future cards, empty sets, filter-preserving entry/exit, interrupted sessions, another tab's rating/edit/deletion, and lost-response retry using the existing route-interception pattern. Assert replay preserves the original due timestamp. Inject an uncommitted failure separately and verify reload retains the card. Test keyboard focus, narrow viewport, and pending-state prevention in the browser; pure transitions stay in Vitest.

### Success Criteria:

#### Automated Verification:

- Session-state tests pass for reveal, pending locks, confirmed advance, exact retries, stale conflicts, missing-card skips, and completion counts.
- `npx playwright test tests/e2e/fixed-interval-review.spec.ts tests/e2e/saved-card-editing.spec.ts tests/e2e/tagged-set-catalog.spec.ts` passes against local Supabase and production preview.
- `npm run verify`, `npx supabase test db`, and `node scripts/test-review-concurrency.mjs` pass for the completed feature.

#### Manual Verification:

- Confirm the focused study flow is understandable and usable with keyboard and a narrow viewport, including error recovery, progress, completion, and return to the filtered set.

## Testing Strategy

### Unit Tests

Validate rating inputs, database-result mapping, safe link building, view states, and session transitions. Include malformed success responses and repeated clicks. Existing management types and save-reconciliation behavior must remain compatible.

### Integration Tests

SQL establishes ownership, grant restrictions, timing, revision invalidation, idempotency, and rollback. The local concurrency script proves actual simultaneous operations. Playwright verifies the real API/database flow and distinguishes committed-but-unacknowledged writes from failed writes. Do not substitute mocked repository tests for RLS or concurrency evidence.

### Manual Testing Steps

1. Open a tagged set, start study, reveal and rate a card, then exit and confirm the filter is retained.
2. Repeat with keyboard and narrow viewport; check focus, readable content, labels, and status feedback.
3. Observe the conflict/retry/completion states using the automated fixture scenarios, confirming that saved and skipped cards are not conflated.

## Performance Considerations

Use the set/due/ID index and one queue read per entry. MVP sets are small; return the due queue snapshot without pagination or background polling. Persist one transaction per rating. Advisory locking serializes the same owner/request key and row locking serializes ratings/content edits to the same card; unrelated cards remain independent. Do not add a scheduler worker or cron job: eligibility is computed at read time.

## Migration Notes

Apply the additive migration before deploying the feature code. Verify both fresh local setup and upgrade from existing saved cards; never reset a non-test database. Existing rows start due at migration time, and proposal-save replay must not reset later scheduling. Receipt deletion follows card/account deletion. Old application code continues reading its existing projections and editing text under narrowed grants.

If application rollout must be reverted, deploy the prior application while retaining the additive schema and saved review data. Do not drop scheduling fields or receipts as a routine rollback. Runtime availability of local Docker/Supabase and E2E credentials is a prerequisite for SQL/browser/concurrency evidence; report blocked checks explicitly rather than declaring completion.

## References

- Research: `context/changes/fixed-interval-review/research.md`.
- Requirements: `context/foundation/prd.md:63`, `context/foundation/shape-notes.md:23`, `context/foundation/roadmap.md:139`.
- Repository and auth: `src/lib/flashcards.ts`, `src/lib/supabase.ts`, `src/middleware.ts`.
- Retry precedent: `supabase/migrations/20261004000001_save_reviewed_flashcards.sql:77`.
- UI state and navigation: `src/lib/saved-card-state.ts`, `src/lib/flashcard-views.ts`.
- Browser failure fixture: `tests/e2e/saved-card-editing.spec.ts:68`.
- Planning interview: seven decisions accepted in this conversation; three-phase structure approved before persistence.

## Progress

> Convention: pending checkboxes become checked after verification. Append the closing commit SHA when a step lands. Do not rename step titles.

### Phase 1: Scheduling and atomic ratings

#### Automated

- [x] 1.1 The additive migration applies on local Supabase and `npx supabase test db` passes scheduling, grants, RLS, replay, and existing persistence regressions. — bb378f9
- [x] 1.2 `node scripts/test-review-concurrency.mjs` passes the local concurrent-rating and request-key collision scenarios. — bb378f9
- [x] 1.3 `npm run verify` passes after the database contract changes. — bb378f9

### Phase 2: Review API and data loading

#### Automated

- [x] 2.1 Review repository and view tests pass for RPC mapping, response validation, due ordering, empty versus unavailable states, and preserved catalog filters. — 708d83d
- [x] 2.2 Rating endpoint and middleware tests pass for valid ratings/replays, invalid payloads, protected paths, 404/409 mapping, and sanitized failures. — 708d83d
- [x] 2.3 `npm run verify` passes after the review API and loader changes. — 708d83d

### Phase 3: Study screen and verification

#### Automated

- [x] 3.1 Session-state tests pass for reveal, pending locks, confirmed advance, exact retries, stale conflicts, missing-card skips, and completion counts. — e65e3bf
- [x] 3.2 `npx playwright test tests/e2e/fixed-interval-review.spec.ts tests/e2e/saved-card-editing.spec.ts tests/e2e/tagged-set-catalog.spec.ts` passes against local Supabase and production preview. — e65e3bf
- [x] 3.3 `npm run verify`, `npx supabase test db`, and `node scripts/test-review-concurrency.mjs` pass for the completed feature. — e65e3bf

#### Manual

- [ ] 3.4 Confirm the focused study flow is understandable and usable with keyboard and a narrow viewport, including error recovery, progress, completion, and return to the filtered set.
