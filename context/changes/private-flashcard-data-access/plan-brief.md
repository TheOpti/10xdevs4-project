# Private Flashcard Data Access — Plan Brief

> Full plan: `context/changes/private-flashcard-data-access/plan.md`

## What & Why

Memoro needs a private, durable place for source text, flashcard sets, and cards before the first generated-flashcard flow can be built. This plan establishes that privacy in Supabase itself, so an authenticated user can never access another user's data through a future endpoint or direct API call.

## Starting Point

The project already has cookie-backed Supabase authentication and centrally protected UI routes, but no flashcard tables, migrations, data-access layer, or RLS coverage. The roadmap marks this as F-01, the prerequisite for every first private-flashcard slice.

## Desired End State

The database contains owner-scoped sets, one private source record per set, and cards. A server-only repository uses the current user's Supabase session; database RLS independently permits only that user's records. Automated tests prove the contract with two accounts.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Foundation scope | Schema, RLS, and internal repository; no public API/UI | Keeps F-01 reusable while leaving the generation flow to S-01. |
| Migration scope | Sources, sets, and cards only | Meets the current privacy guardrail without locking tags, proposals, or review state early. |
| Source representation | Separate source record, one-to-one with a set | Separates sensitive material from set metadata and retains provenance. |
| Source deletion | Cascade when its set is deleted | Avoids retaining private text that no MVP feature can display or reuse. |
| Set/source creation | Authenticated transactional SQL function | Prevents a failed second write from leaving a source-less set. |
| Authorization | RLS based on `auth.uid()` with request-bound anon/publishable client | Database policy remains effective even outside an application endpoint. |
| Verification | pgTAP with two local authenticated users in CI | Tests real allow and deny behavior without creating an endpoint solely for testing. |

## Scope

**In scope:**

- Additive Supabase migration, explicit grants, indexes, and per-operation RLS policies.
- Server-only owner-scoped repository and typed domain contracts.
- Local-Supabase RLS test suite and CI integration.

**Out of scope:**

- Flashcard UI, public endpoints, proposal generation, tags, reviews, sharing, and administrative access.
- Production migration execution or service-role access.

## Architecture / Approach

`authenticated request → existing request-bound Supabase client → flashcard repository → transactional creation RPC / public tables protected by RLS`.

Sets and sources store their owner directly. Cards inherit authorization through their parent set. The schema owns the privacy guarantee; the repository is a reusable server-side interface, not a replacement for RLS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Private schema and RLS | Core tables, lifecycle constraints, grants, and policies | Cross-table policy checks must not allow reassignment. |
| 2. Server-only repository | Reusable, request-bound access contract | Source text must never reach read models. |
| 3. RLS proof and CI | Two-user policy tests and required CI execution | Tests must cover every allow and deny path. |

**Prerequisites:** local Supabase CLI and Docker for database tests; existing auth configuration.

**Estimated effort:** ~2–3 focused implementation sessions across three phases.

## Open Risks & Assumptions

- RLS does not constrain a service-role key; normal feature code must continue to use the request-bound client.
- The initial migration is additive, but production rollback requires a forward database repair if a change is needed.
- Source text is intentionally unavailable for retrieval in the MVP.

## Success Criteria (Summary)

- A clean local database receives the private data schema and policies without error.
- An owner can access its own data while another authenticated user and anonymous callers are denied.
- CI resets a local database, then linting, type checks, production build, database tests, and existing auth smoke coverage pass.
