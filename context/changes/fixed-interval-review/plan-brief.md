# Fixed-Interval Review — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Complete the saved-flashcard workflow with focused learning sessions. Users reveal an answer and rate recall; the application persists the next review date immediately.

## Starting Point

Private sets, saved cards, editing/deletion, and tag-aware navigation already work. Scheduling and learning sessions are missing; the static review mock uses incompatible rating rules.

## Desired End State

A saved set opens a focused due-card session with answer reveal, three ratings, progress, and a return link. Saved ratings survive leaving or reloading; stale tabs and retries cannot silently overwrite a newer review.

## Key Decisions Made

| Decision           | Choice                                                           | Why                                                              | Source               |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------- |
| Ratings            | Don't know / Hard / Know                                         | Preserve the established mapping.                                | Research             |
| Time               | Exactly 24 / 72 / 168 elapsed hours from database rating time    | Avoid calendar and timezone ambiguity.                           | Plan: user           |
| Queue              | New and due cards; oldest due first, then ID                     | Keep the schedule meaningful with stable ordering.               | Plan: user           |
| Reload/exit        | Persist ratings individually; rebuild queue and reset counters   | Preserve completed work without session storage.                 | Plan: user           |
| Existing cards     | Immediately due at migration                                     | Existing users can start learning.                               | Plan: user           |
| Content edits      | Preserve due date; invalidate old revisions                      | Corrections retain progress while stale answers cannot be rated. | Plan: user           |
| Concurrent ratings | First valid rating wins; reject stale requests                   | Prevent an old tab from overwriting newer state.                 | Plan: user           |
| Layout             | Focused page; return to set with filter preserved                | Reduce distractions without losing navigation context.           | Plan: user           |
| Retries            | Same UUID and payload return the stored result while card exists | Lost responses do not apply another rating.                      | Plan: implementation |
| Deletion           | Cascade receipts; skip unavailable cards                         | Avoid retaining deleted-card state or restoring cards on retry.  | Plan: implementation |

## Scope

**In scope:** Scheduling migration, protected database operations, review repository/API, saved-set entry, focused UI, recovery states, and automated/manual verification.

**Out of scope:** Adaptive scheduling, early practice, persisted sessions, offline writes, notifications, history UI, custom keyboard shortcuts, and generation changes.

## Architecture / Approach

Cards gain a due timestamp and revision. An atomic rating RPC checks ownership, serializes competing writes, updates the schedule, and stores a private retry receipt. Astro loads a database-clock due queue; React holds the temporary session and sends ratings through the protected API. Content edits increment revision without changing the due date.

## Phases at a Glance

| Phase                            | What it delivers                                             | Key risk                                         |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ |
| 1. Scheduling and atomic ratings | Schema, grants, queue/rating RPCs, SQL and concurrency tests | Direct-write bypass or incorrect replay ordering |
| 2. Review API and data loading   | Typed repository, loader, rating endpoint, unit tests        | Confusing unavailable data with an empty queue   |
| 3. Study screen and verification | Focused UI, recovery, browser tests, completion gate         | Advancing after an unconfirmed write             |

**Prerequisites:** Existing saved-card flow; local Supabase/Docker, Node 24, project dependencies, and local E2E account configuration.

**Estimated effort:** Roughly 3–5 focused development sessions across the approved phases; environment recovery may add time.

## Open Risks & Assumptions

- The migration narrows card write privileges; proposal saving and editing need regression coverage.
- The privileged rating RPC must explicitly enforce ownership and reject client-supplied scheduling data.
- Local runtime availability was not verified during research. SQL/browser/concurrency checks must run before completion.
- Sessions are queue snapshots: a completed session does not promise that no other card has since become due.
- Deploy the migration before application changes. Roll back application code without deleting persisted scheduling data.

## Success Criteria (Summary)

- Owners can study due cards and schedule exact 24/72/168-hour reviews; reload retains saved work.
- Retries, stale content, concurrent ratings, and deleted cards behave according to the chosen contracts.
- SQL, real concurrency, browser regressions, the repository completion gate, and manual usability checks pass.

## References

- [Research](research.md) — evidence and current contracts.
- [Full plan](plan.md) — interfaces, phases, validation, and canonical Progress.
- `context/foundation/shape-notes.md:23` — rating mapping; planning interview — accepted behavior and phases.
