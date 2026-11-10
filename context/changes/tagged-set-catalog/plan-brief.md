# Tagged Set Catalog — Plan Brief

> Full plan: [plan.md](plan.md)

## What & Why

Allow users to organize their private flashcard sets with tags and find them through a simple catalog filter. This delivers FR-005 and roadmap slice S-04.

## Starting Point

The dashboard already lists real sets, and detail pages support card editing. Owner-level access control exists; tags do not.

## Desired End State

Users add or remove tags on a set's page, save them explicitly, and filter the catalog by one tag or “Untagged.” Refresh and return navigation preserve the filter.

## Key Decisions Made

| Decision           | Choice                                  | Rationale                                    |
| ------------------ | --------------------------------------- | -------------------------------------------- |
| Editing location   | Set-detail page                         | Keeps generation unchanged.                  |
| Tag identity       | Lowercase; trim and collapse whitespace | Avoids accidental duplicates.                |
| Limits             | 10 tags per set; 30 code points per tag | Keeps the catalog readable.                  |
| Filtering          | One tag at a time                       | Matches the small-collection MVP.            |
| Untagged sets      | Dedicated filter                        | Makes unorganized material discoverable.     |
| Tag lifecycle      | Assignment/removal only                 | Avoids global management features.           |
| Navigation         | Filter stored in URL                    | Supports refresh, history, and return links. |
| Storage            | Bounded array on the set                | Reuses owner RLS and atomic updates.         |
| Concurrent editing | Last successful write wins              | Follows the existing editing convention.     |

## Scope

**In scope:** persistence, private update API, tag editor, catalog filters, URL navigation, and verification.

**Out of scope:** global tag management, multi-tag filtering, search, pagination, creation-form changes, and set renaming/deletion.

## Architecture / Approach

An additive database migration extends sets. The existing repository reads and updates tags through the user's Supabase session. Astro renders filtered catalogs; a separate React editor saves tag changes without disturbing card drafts.

## Phases at a Glance

| Phase                    | Deliverable                                | Main risk                          |
| ------------------------ | ------------------------------------------ | ---------------------------------- |
| 1. Data and API          | Validated private tag persistence          | Invalid data or cross-owner access |
| 2. Editing and filtering | Complete catalog workflow                  | Lost drafts or filter context      |
| 3. Verification          | Database, browser, and regression evidence | Integration regressions            |

**Prerequisites:** existing set workflow, local Supabase, and configured E2E authentication.

**Estimated effort:** approximately 2–3 implementation sessions; an estimate rather than a commitment.

## Open Risks & Assumptions

- Small collections continue to load without pagination.
- Concurrent updates can overwrite another tab's tag changes.
- Existing empty sets remain visible.
- Rolling back the application preserves stored tag data.

## Success Criteria (Summary)

- Tags persist, normalize consistently, and remain owner-private.
- Filtering and return navigation work, including untagged and no-results states.
- Required automated checks pass; keyboard, responsive, and concurrent-edit behavior is verified.
