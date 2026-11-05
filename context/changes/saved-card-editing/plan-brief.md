# Saved Card Editing — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Users can open their own saved sets, edit an individual flashcard's question or answer, and permanently delete a card after confirmation. This change implements FR-004 and S-03, giving users control over cards after the initial save.

## Starting Point

Read, update, and delete operations and RLS policies already exist. There is no saved-set interface; the dashboard shows example data, and the save-completion screen does not link to a specific set.

## Desired End State

A user opens a set from the actual dashboard list or a link after saving. They edit and save each card separately, cancel changes, or confirm deletion. Changes survive refresh, and an empty set remains accessible.

## Key Decisions Made

| Decision | Choice | Rationale |
| --- | --- | --- |
| Navigation | Actual set list and a link after saving | Users can return to older sets. |
| Editing | Individual save and cancel actions per card | Reuses existing single-card operations. |
| Deletion | Permanent, after confirmation | Protects against accidental clicks. |
| Last card | Preserve the set and source | Deleting a card does not remove additional data. |
| Concurrent edits | Last successful write wins | Keeps the MVP simple without versioning. |
| Quality | Nonempty fields, 1000-code-point limit; no quality warnings | Preserves existing constraints and FR-004 scope. |
| Uncertain proposal save | Preserve the draft and link to inspect saved cards | Allows manual correction without generating a new set. |

## Scope

**In scope:** edit/delete API, private set page, actual set list, removal of fictional statistics, links from proposal saving, and privacy and flow tests.

**Out of scope:** tags, search, manual card creation, study mode, set renaming or deletion, edit history, undoing deletion, and persistent drafts across visits.

## Architecture / Approach

A protected Astro page reads the owner's data, a React component handles editing, and PATCH/DELETE endpoints use the existing Supabase repository and RLS. Validation is shared with the initial-save flow. No migration or privileged data access is required.

## Phases at a Glance

| Phase | Deliverable | Main risk |
| --- | --- | --- |
| 1. Edit and Delete API | Verified operations and privacy | Access to another user's cards |
| 2. Editor and Navigation | Set interface accessible from the dashboard | Losing unsaved content on failure |
| 3. Integration and Verification | Consistent flow from initial saving to later editing | Uncertain responses and retries |

**Prerequisites:** existing proposal-save implementation, local Supabase, and E2E user configuration.

**Estimated effort:** approximately 2–3 implementation sessions; this is an estimate.

## Open Risks & Assumptions

- The last write can overwrite a change from another browser tab — an accepted tradeoff.
- Retrying the initial save reads current cards; after editing or deletion, the result may differ from the draft. Do not restore deleted data or falsely confirm a match.
- The interface remains in English. Refreshing or leaving the view discards an unsaved draft; a request failure preserves it in the editor.
- Small collections without pagination are assumed. Rolling back the application does not reverse completed edits or deletions.

## Success Criteria (Summary)

- Changes survive refresh; cancellation and deletion confirmation work, and an empty set remains visible.
- Other accounts cannot read or change the owner's data; retrying an old save does not restore deleted cards.
- API, SQL, and Playwright tests and `npm run verify` pass; manual verification covers keyboard use, small screens, and uncertain request outcomes.
