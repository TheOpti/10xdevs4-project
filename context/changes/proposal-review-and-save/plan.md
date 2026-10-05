# Proposal Review and Save — Implementation Plan

## Overview

Extend the generated-set flow so a signed-in user receives three deterministic demo proposals, reviews them locally, and saves all remaining cards in one private batch. Draft changes are intentionally ephemeral: refresh or navigation loses them. A durable request key makes a retried save return the original cards rather than duplicates.

## Current State Analysis

- `src/pages/api/flashcards/generate.ts` bounds the incoming byte stream, creates a set plus source, and returns one demo proposal.
- `src/components/flashcards/NewFlashcardsForm.tsx` displays that proposal read-only and does not retain the returned set ID for saving.
- `src/lib/flashcards.ts` exposes single-card persistence, while the existing Supabase migration supplies private set/source/card tables and owner-through-set RLS.
- The dashboard is static; no set-detail or saved-card editing route exists.

## Desired End State

Generation returns `{ setId, proposals }` with exactly three stable demo proposals. The form displays editable question/answer rows with per-row deletion. “Accept all & save” writes every remaining row; it is disabled when no rows remain or a save is pending. On success, an in-place message links to `/dashboard` and `/flashcards/new`.

`POST /api/flashcards/save` accepts a set UUID, browser-generated request UUID, and 1–15 sanitized cards. A database transaction stores a durable save-operation-to-cards relation. Reusing a request key for the same owner and set returns the first result; it never inserts duplicates.

### Key Discoveries

- The current 48 KiB stream guard must be shared with the new save route; browser character counts cannot protect server memory or network bytes.
- `NewFlashcardsForm.tsx` is the only generation consumer, so the response can change from `proposal` to `proposals` within this slice.
- `supabase/migrations/20260924000000_create_private_flashcard_data.sql` uses security-invoker functions and owner-through-set RLS; the batch save must derive identity from `auth.uid()`, not the request body.
- `context/foundation/prd.md` requires bulk accept plus pre-save edit/delete and a 15-card maximum, but not persisted drafts, manual creation, or saved-card editing.

## What We're NOT Doing

- AI integration, prompts, credentials, or source retrieval.
- Durable draft/recovery, selection state, or edit history.
- Empty-set cleanup when every local proposal is deleted.
- Set-detail/dashboard-catalog work, manual-card UI, or post-save card editing.

## Implementation Approach

Build the private idempotent persistence boundary first, then connect a local React review array to it, and finally run database, route, and project-level verification. The browser creates a UUID at the first save attempt and retains it for retries; the database is the authority for replay behavior.

## Phase 1: Private, Idempotent Batch-Save Contract

### Overview

Add a transaction-safe Supabase operation and a bounded authenticated Astro endpoint.

### Changes Required

#### 1. Database migration and RLS tests

**Files:** `supabase/migrations/<timestamp>_save_reviewed_flashcards.sql`, `supabase/tests/private_flashcard_data_rls.test.sql`

Create a private save-operation record unique on authenticated owner plus request UUID, and a durable relation from that operation to inserted flashcards. Add a security-invoker RPC accepting only `set_id`, `request_id`, and a JSON card array. It must use `auth.uid()`, preserve set ownership/RLS, validate a 1–15 batch, atomically insert operation and cards, and return the previously saved cards when the same owner/key/set is replayed. A reused key for another set must fail safely. Add owner-success/replay and cross-user isolation assertions.

#### 2. Repository, shared body reader, and API route

**Files:** `src/lib/flashcards.ts`, `src/pages/api/flashcards/save.ts`, plus a server-only helper extracted from `src/pages/api/flashcards/generate.ts`

Extract the existing 48 KiB bounded JSON stream reader and use it in generation and save. Add a repository batch-save method that calls the RPC and returns persisted IDs, question/answer values, and set ID. Implement `POST /api/flashcards/save` for:

```json
{ "setId": "uuid", "requestId": "uuid", "cards": [{ "question": "string", "answer": "string" }] }
```

Validate authentication, JSON shape, UUIDs, 1–15 trimmed non-empty fields, and conservative field limits. Keep the 300-character proposal quality threshold advisory. Return `{ setId, cards }` with `201` on first persistence and `200` on replay; use safe errors for invalid, oversized, unauthenticated, and unexpected failures without exposing another user's set.

#### 3. Contract tests

**Files:** `src/lib/flashcards.test.ts`, `src/pages/api/flashcards/save.test.ts`, and affected generation tests

Cover valid save, replay, bad count/UUID/fields, unauthenticated access, and malformed/oversized JSON. Keep ownership/atomicity assertions in SQL tests when route tests mock Supabase.

### Success Criteria

#### Automated Verification

- [ ] 1.1 Migration and Supabase SQL tests prove owner batch save/replay and reject another user’s set or operation.
- [ ] 1.2 Repository and endpoint tests cover first save, replay, authentication, and invalid or oversized requests.

#### Manual Verification

- [ ] 1.3 Repeating one authenticated API payload with the same request ID returns the same card IDs and does not increase card count.

### Pause Point

Confirm the migration applies locally and the endpoint contract is stable before attaching browser state.

## Phase 2: Ephemeral Review and In-Place Completion

### Overview

Return three demos and turn the read-only result into an editable local review flow.

### Changes Required

#### 1. Deterministic multi-proposal generation

**Files:** `src/lib/flashcard-proposals.ts`, `src/lib/flashcard-proposals.test.ts`, `src/pages/api/flashcards/generate.ts`, `src/pages/api/flashcards/generate.test.ts`

Return exactly three deterministic, individually valid proposals and update the contract to:

```json
{ "setId": "uuid", "proposals": [{ "question": "…", "answer": "…", "isDemo": true, "qualityFlags": [] }] }
```

#### 2. Local review and save UX

**File:** `src/components/flashcards/NewFlashcardsForm.tsx`

Store `setId` and an array of browser-only row IDs, editable values, and quality flags. Add accessible inputs and delete actions. Deletion affects only React state. Save all remaining rows, block an empty draft, and retain `crypto.randomUUID()` request ID for a retry. Keep inline errors editable. Successful save replaces review UI with confirmation plus dashboard/new-set links. A later successful generation replaces the draft; refresh deliberately loses it.

#### 3. UI boundary checks

**Files:** relevant existing component tests if available, `src/pages/api/flashcards/generate.test.ts`, `src/pages/api/flashcards/save.test.ts`

Update response expectations and assert the UI-facing generation and save payload contracts.

### Success Criteria

#### Automated Verification

- [ ] 2.1 Proposal tests prove exactly three deterministic, individually valid proposals.
- [ ] 2.2 Route tests match the proposals response and the `setId`/`requestId`/cards save payload.

#### Manual Verification

- [ ] 2.3 A signed-in user can edit/delete rows, cannot save after deleting all rows, and saves all remaining rows in one action.
- [ ] 2.4 Success is in-place with dashboard/new-set links; refresh before saving discards only the local draft.

### Pause Point

Check responsive layout, labels, errors, and retry behavior in a signed-in session.

## Phase 3: Regression, Security, and Delivery Validation

### Overview

Validate the migration and full private end-to-end flow before delivery.

### Changes Required

#### 1. Full verification

**Files:** no production files expected unless validation finds a scoped defect

Run the local Supabase reset/RLS suite and the required repository completion gate.

#### 2. Authenticated smoke test

**Files:** no production files expected

Generate, edit, delete, save, and replay a batch as the owner; verify private ownership and success state.

### Success Criteria

#### Automated Verification

- [ ] 3.1 `npx supabase db reset --local` and `npx supabase test db` apply the migration and pass RLS coverage.
- [ ] 3.2 `npm run verify` passes lint, Astro/type checks, Vitest, and production build.

#### Manual Verification

- [x] 3.3 A signed-in browser flow confirms three demos, edit/delete-before-save, replay-safe retry, private ownership, and in-place completion.

### Pause Point

Review validation output and Supabase migration notes before committing implementation work.

## Testing Strategy

- Unit/route: deterministic proposals, bounded parsing, validation, safe errors, and idempotent response semantics.
- Database: operation/card relation, atomic replay, and RLS isolation.
- Manual: editing/deletion, empty-state block, retry, refresh-loss of draft, success links, and keyboard access.
- Completion: run both local Supabase commands and `npm run verify` after production changes.

## Migration Notes

- Add a forward-only timestamped migration; never rewrite old migrations or archived context.
- Store operation-to-cards mapping durably so the RPC can return original cards on replay.
- Rely on `auth.uid()` and least-privilege RLS; never receive an owner ID from the client.
- The pre-created set/source remains if the user abandons or empties their local draft.

## References

- `context/changes/proposal-review-and-save/change.md`
- `context/foundation/roadmap.md` (S-02) and `context/foundation/prd.md` (US-01, FR-003)
- `src/pages/api/flashcards/generate.ts`, `src/components/flashcards/NewFlashcardsForm.tsx`
- `src/lib/flashcard-proposals.ts`, `src/lib/flashcards.ts`
- `supabase/migrations/20260924000000_create_private_flashcard_data.sql`

## Progress

### Phase 1: Private, Idempotent Batch-Save Contract

- [x] 1.1 Migration and Supabase SQL tests prove owner batch save/replay and reject another user’s set or operation. — 4f987ac
- [x] 1.2 Repository and endpoint tests cover first save, replay, authentication, and invalid or oversized requests. — 4f987ac
- [x] 1.3 Repeating one authenticated API payload with the same request ID returns the same card IDs and does not increase card count. — 4f987ac

### Phase 2: Ephemeral Review and In-Place Completion

- [x] 2.1 Proposal tests prove exactly three deterministic, individually valid proposals. — 9b06465
- [x] 2.2 Route tests match the proposals response and the `setId`/`requestId`/cards save payload. — 9b06465
- [x] 2.3 A signed-in user can edit/delete rows, cannot save after deleting all rows, and saves all remaining rows in one action. — 9b06465
- [x] 2.4 Success is in-place with dashboard/new-set links; refresh before saving discards only the local draft. — 9b06465

### Phase 3: Regression, Security, and Delivery Validation

- [x] 3.1 `npx supabase db reset --local` and `npx supabase test db` apply the migration and pass RLS coverage.
- [x] 3.2 `npm run verify` passes lint, Astro/type checks, Vitest, and production build.
- [ ] 3.3 A signed-in browser flow confirms three demos, edit/delete-before-save, replay-safe retry, private ownership, and in-place completion.
