# Plan Brief: Proposal Review and Save

## Outcome

Allow an authenticated user to review three generated demo flashcards, edit or delete them locally, and save every remaining card as one private, replay-safe batch.

## Locked Decisions

- Generation returns exactly three deterministic demos, not AI output.
- Review data is browser-only and disappears after refresh or navigation.
- “Accept all & save” saves all non-deleted rows; no selection or partial-save state exists.
- Saving is blocked at zero rows; the automatically created empty set/source remains.
- A client UUID and durable database operation/card mapping prevent retry duplicates.
- Completion is in-place with dashboard and new-set links; no detail page is added.

## Boundaries

- Preserve owner-through-set RLS and derive identity from `auth.uid()`.
- Reuse the 48 KiB byte-stream limit for save; do not rely on character counts in the browser.
- Validate 1–15 trimmed question/answer pairs server-side; the 300-character quality threshold remains advisory.
- Exclude AI, persisted drafts, source retrieval, manual creation, dashboard catalogue, and saved-card editing.

## Phased Delivery

1. Add private idempotent batch save, operation/card relation, endpoint, and database/API tests.
2. Return three demos and build editable/deletable ephemeral review state with retry-safe save.
3. Run Supabase migration/RLS tests, `npm run verify`, and signed-in browser smoke tests.

## Key Risks and Mitigations

- Retry duplication: database uniqueness and one atomic RPC are authoritative.
- Cross-user access: `auth.uid()`, existing RLS, and SQL isolation tests.
- Oversized bodies: shared bounded stream parser.
- Scope growth: in-place completion; defer drafts, detail views, and post-save editing.

## Done When

The user can review three rows, edit/delete before saving, safely retry a non-empty batch, see in-place confirmation, and all Supabase plus repository verification checks pass.
