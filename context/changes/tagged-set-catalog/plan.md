# Tagged Set Catalog — Implementation Plan

## Overview

Extend the existing dashboard with private set tags and single-tag filtering. Implement roadmap slice S-04 / FR-005 without changing the generation workflow.

## Current State Analysis

The dashboard already lists the owner's sets, including empty sets, ordered by creation date descending and ID ascending. Set-detail pages provide interactive card editing. Supabase row-level security restricts sets to their owners.

Tags, tag editing, and filtering are missing. There is no separate “saved” lifecycle state: sets created before card acceptance also appear in the catalog. Preserve this behavior.

### Key Discoveries

- `src/lib/flashcards.ts:157` implements the existing list and ordering.
- `src/lib/flashcard-views.ts:22` distinguishes an empty catalog from a failed read.
- The previous saved-card-editing plan explicitly retains empty sets and assumes small collections without pagination.

## Desired End State

Users edit tags on a set's detail page and filter their dashboard by one tag or “Untagged.” Filters survive refresh and navigation back from a set.

Tags are private, normalized to lowercase, and limited to 10 per set and 30 Unicode code points per tag. Leading and trailing whitespace is removed; consecutive whitespace becomes one space. Polish characters remain intact.

## What We're NOT Doing

- Tagging during generation or directly on catalog cards.
- Global tag renaming/deletion, multiple-tag filters, text search, or pagination.
- Set renaming/deletion, study mode, or changes to card-save semantics.

## Implementation Approach

Store tags directly on each set as a bounded text array. This fits the agreed assignment-only lifecycle and reuses existing owner-level RLS without introducing a shared tag registry.

Keep catalog rendering server-side. Load the owner's set summaries once, derive available tags from the complete collection, and apply the selected filter before rendering. Use an isolated React tag editor on the existing detail page.

## Phase 1: Data and API

### Changes Required

**Files:** new Supabase migration; existing flashcard repository and middleware; new tag validation helper and set-tags endpoint.

**Intent:** Persist bounded tag assignments and expose an owner-protected update operation.

**Contract:**

- Add `flashcard_sets.tags` as a non-null text array defaulting to an empty array. Existing sets become untagged.
- Enforce database bounds: at most 10 entries, no null/blank entries, no duplicates, and 1–30 code points per entry.
- Extend set summaries and detail results with `tags: string[]`.
- Normalize incoming labels, deduplicate after normalization, then validate the resulting limits. Reject blank labels rather than silently discarding them; an empty array explicitly clears all tags.
- Add `PATCH /api/flashcards/sets/[setId]/tags`, accepting `{ tags: string[] }` and returning `200 { tags: string[] }` with confirmed normalized values.
- Replace only the tags field atomically. Repeated identical requests have the same result; the last successful write wins.
- Protect the endpoint prefix in middleware. Reuse the bounded JSON reader and request-scoped Supabase client.
- Return `400` for invalid input, `401` for missing authentication, identical `404` responses for missing and inaccessible sets, `503` for missing configuration, and `500` for operational failure. Never expose database details.

### Success Criteria

#### Automated Verification

- Migration and SQL tests verify defaults, bounds, owner updates, and isolation from other users and anonymous callers.
- Unit and API tests verify normalization, deduplication, limits, replacement semantics, response shapes, and error handling.

## Phase 2: Tag Editing and Catalog Filtering

### Changes Required

**Files:** existing dashboard and set-detail routes/components; catalog view loader; new isolated tag-editor component.

**Intent:** Let users organize an existing set and reliably return to a filtered catalog.

**Contract:**

- Display tags on catalog cards and the set-detail page.
- Provide a labeled tag input with an explicit “Add tag” action and removable draft tags. Treat the entire input as one label; spaces and punctuation are permitted.
- Use explicit “Save tags” and “Cancel” actions. Cancel restores the last confirmed values.
- Disable affected controls while saving. Update confirmed values only after validating a successful response. Preserve the draft after failed or uncertain requests and offer retry.
- On `404`, preserve the draft for copying and explain that the set is unavailable.
- Keep tag editing independent of unsaved card edits; saving tags must not reload the page or discard card drafts.
- Provide one filter control with “All sets,” “Untagged,” and alphabetically ordered distinct tags from all of the owner's sets.
- Use `/dashboard?tag=<encoded-label>` for a tag and `/dashboard?untagged=1` for untagged sets. No filter parameters means all sets.
- Parse filters through one shared helper. Conflicting, repeated, or malformed filter parameters reset to “All sets.” A valid but unused tag remains selected and produces “No matching sets” with a clear-filter action.
- Carry only validated filter parameters into set links and back-to-catalog navigation. Do not accept arbitrary return URLs.
- Preserve existing set ordering and include empty sets. Distinguish no sets, no matches, and read failure.
- Tags disappear from available choices once no owned set uses them. “Untagged” remains available.
- Keep interface copy in English and reuse existing UI primitives, keyboard patterns, and live status messages.

### Success Criteria

#### Automated Verification

- Catalog tests verify single-tag and untagged filtering, owner-derived choices, URL handling, stable ordering, and distinct empty/error states.
- Editor tests verify save, cancellation, pending controls, normalized server responses, and draft retention on failure.

#### Manual Verification

- Tag editing and filters work with a keyboard and on a narrow screen without disrupting card drafts.

## Phase 3: Integration and Verification

### Changes Required

**Files:** dedicated catalog E2E test and existing fixture helpers; repository, API, and database regression tests.

**Intent:** Verify the complete user flow and prevent privacy or navigation regressions.

**Contract:**

- Create isolated fixtures without AI calls: sets with overlapping tags, an untagged set, and an empty set.
- Verify persistent tag updates, filtering, refresh, detail navigation, return navigation, removal of the last tag assignment, and clearing filters.
- Simulate a failed save and verify that the tag draft remains available.
- Clean up only data created by the test.
- Run database tests, the new browser test, the existing saved-card-editing browser regression, and the repository completion gate.

### Success Criteria

#### Automated Verification

- Playwright verifies tag persistence, filtering, navigation, empty-set retention, and failed-save draft retention.
- `npx supabase test db`, catalog and saved-card-editing Playwright tests, and `npm run verify` pass.

#### Manual Verification

- Two tabs demonstrate last-successful-write-wins behavior; an obsolete tag URL shows a recoverable no-results state.

## Testing Strategy

Cover normalization with `React`, `react`, and `react` producing one `react` tag; whitespace collapse; preserved Polish characters; 30/31-code-point and 10/11-tag boundaries; clearing all tags; invalid bodies; and inaccessible sets.

Database tests exercise actual RLS with two accounts. Browser tests cover behavior that unit tests cannot establish: persistence, navigation, form interaction, and draft preservation.

Do not mark skipped or blocked checks as passed.

## Performance Considerations

Retain the existing small-collection model without pagination or polling. Read only set summaries and tags for the catalog; do not fetch cards or source text. Derive filter choices and results from the same owner-scoped read.

## Migration Notes

Apply the additive migration before deploying the application. Existing sets need no manual backfill. The old application can continue operating with the new column present.

For application rollback, retain the tags column and its data. No new credentials, service, or feature flag is required.

## References

- `context/foundation/prd.md` — FR-005, privacy, and deferred text search.
- `context/foundation/roadmap.md` — S-04.
- `context/archive/2026-11-05-saved-card-editing/plan.md` — existing catalog and editing conventions; read-only historical reference.
- Existing flashcard repository, card mutation endpoint, and Playwright setup — implementation patterns.

## Progress

### Phase 1: Data and API

#### Automated

- [x] 1.1 Migration and SQL tests verify defaults, bounds, owner updates, and isolation from other users and anonymous callers.
- [x] 1.2 Unit and API tests verify normalization, deduplication, limits, replacement semantics, response shapes, and error handling.

### Phase 2: Tag Editing and Catalog Filtering

#### Automated

- [x] 2.1 Catalog tests verify single-tag and untagged filtering, owner-derived choices, URL handling, stable ordering, and distinct empty/error states. — eb82ac5
- [x] 2.2 Editor tests verify save, cancellation, pending controls, normalized server responses, and draft retention on failure. — eb82ac5

#### Manual

- [x] 2.3 Tag editing and filters work with a keyboard and on a narrow screen without disrupting card drafts. — eb82ac5

### Phase 3: Integration and Verification

#### Automated

- [x] 3.1 Playwright verifies tag persistence, filtering, navigation, empty-set retention, and failed-save draft retention. — 8d1284e
- [x] 3.2 `npx supabase test db`, catalog and saved-card-editing Playwright tests, and `npm run verify` pass. — 8d1284e

#### Manual

- [x] 3.3 Two tabs demonstrate last-successful-write-wins behavior; an obsolete tag URL shows a recoverable no-results state. — 8d1284e
