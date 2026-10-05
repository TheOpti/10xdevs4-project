<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Proposal Review and Save

- **Plan**: context/changes/proposal-review-and-save/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Editing after an uncertain save can silently lose the edit

- **Severity**: WARNING
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/NewFlashcardsForm.tsx:116
- **Detail**: The form correctly retains one request ID for retries, but it also tells the user they may edit and retry after a failed save. If the server persisted the first batch but its response was lost, retrying after an edit replays the original batch. Any OK response clears the draft without comparing the returned cards, so the later edit is silently discarded.
- **Fix A Recommended**: Preserve the originally submitted card snapshot; when a retry returns a batch that differs from the current draft, show that the original batch was saved and keep the edited draft visible rather than treating it as saved.
  - Strength: Preserves idempotency without silently claiming that unsaved edits persisted.
  - Tradeoff: Adds a small client-side reconciliation state and a regression test.
  - Confidence: HIGH — the save endpoint already returns the original cards on replay.
  - Blind spot: The desired product flow for subsequently saving those changed cards needs an explicit follow-up decision.
- **Decision**: FIXED — preserved the submitted batch, compared it with replayed cards and the current draft, and added regression coverage in `src/lib/flashcard-save-reconciliation.test.ts`.

### F2 — Completion link targets a route that does not exist

- **Severity**: WARNING
- **Impact**: MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/components/flashcards/NewFlashcardsForm.tsx:271
- **Detail**: The in-place completion view links to `/flashcards/new`, but the form is served by `src/pages/dashboard/new.astro`, whose route is `/dashboard/new`. The link therefore returns 404 and does not meet the intended new-set flow.
- **Fix**: Change the link to `/dashboard/new` and add a narrow route/UI assertion.
- **Decision**: FIXED — changed the completion link to the existing `/dashboard/new` route.

### F3 — Save-operation cards are not constrained to the operation's set

- **Severity**: WARNING
- **Impact**: HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004000001_save_reviewed_flashcards.sql:10
- **Detail**: `flashcards.save_operation_id` references only the operation ID. Existing owner policies permit an owner to attach one of their operations to a card in a different owned set. A replay then selects by operation ID alone and can return cards outside the operation's original set, weakening the durable operation-to-cards invariant.
- **Fix A Recommended**: Add a forward migration that enforces matching operation and card set IDs with a composite foreign key or equivalent trigger; add SQL coverage for the invariant and for same-owner request-ID reuse against a different set.
  - Strength: Makes replay integrity a database guarantee rather than an RPC convention.
  - Tradeoff: Requires a carefully ordered forward migration and regression tests.
  - Confidence: HIGH — the operation already stores `set_id`, so the required relation is explicit.
  - Blind spot: Existing production data needs a brief audit before adding a strict constraint.
- **Decision**: FIXED — added a forward migration with a composite operation/set foreign key and SQL regression coverage for both mismatched operation links and same-owner request-key reuse across sets.

## Verification Evidence

- `npx supabase db reset --local` and `npx supabase test db`: PASS — 29 pgTAP tests after triage fixes.
- `npm run verify`: PASS — lint, Astro/type checks, 20 Vitest tests, and production build after triage fixes.
- Manual Progress entries for phases 1–3 are marked complete. Browser-flow confirmation was provided during implementation.
