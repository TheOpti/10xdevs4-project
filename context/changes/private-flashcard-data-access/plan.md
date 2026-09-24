# Private Flashcard Data Access Implementation Plan

## Overview

Establish the first persistent, owner-private flashcard data foundation for Memoro. This change adds the core Supabase schema, database-enforced Row Level Security (RLS), a server-only repository, and automated proof that one authenticated user cannot access another user's source text, sets, or cards.

## Current State Analysis

Supabase authentication is already available through a request-bound server client in `src/lib/supabase.ts`, and middleware establishes the authenticated user in `context.locals` (`src/middleware.ts:4`). The repository has no flashcard-domain tables, migrations, data-access layer, or RLS tests; `supabase/` currently contains configuration only.

The product requires persistent source text, flashcard sets, and cards to be visible only to their owner, while source text is explicitly not viewable in the MVP. The roadmap identifies this foundation as F-01, which unblocks all first-flow slices (`context/foundation/roadmap.md:75`).

## Desired End State

The database holds a user-owned set, its one-to-one private source record, and its cards. Every exposed table has explicit grants and per-operation RLS policies, and an authenticated caller can access only rows belonging to that caller. Server-side feature code has one reusable repository boundary and never supplies ownership from client input.

### Key Discoveries:

- `createClient()` uses the server-only Supabase URL/key with request cookies, so normal application queries carry the user's JWT and are governed by RLS (`src/lib/supabase.ts:5`).
- `SUPABASE_KEY` is populated from the local anon key in CI, not a service-role key (`.github/workflows/ci.yml:39`).
- The existing smoke test proves the cookie-backed auth flow but has no domain-data coverage (`scripts/smoke.mjs:7`).
- Supabase recommends explicit grants, one policy per operation, and database-level RLS tests for every protected table. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## What We're NOT Doing

- No public flashcard API, protected UI route, proposal-generation flow, or dashboard is introduced.
- No tags, generated-proposal state, manual-card UX, review scheduling, sharing, workspaces, or administrative access is added.
- No service-role client, client-side Supabase credentials, or bypass of RLS is introduced.
- No production database migration is applied by this change; applying it remains a human-approved release operation.

## Implementation Approach

Create an additive first migration that models ownership at the source and set levels, with cards authorized through their owning set. The source-to-set relation is one-to-one and cascades when a set is deleted so private source material does not remain after its set disappears. Enforce the same contract in RLS and in a request-bound, server-only repository. Test RLS at the database level using two authenticated identities, then run it in the existing local-Supabase CI job.

## Critical Implementation Details

RLS is the authorization boundary, not repository filtering. Policies must target `authenticated`, revoke access from `anon`, and use both `USING` and `WITH CHECK` for updates so a caller cannot reassign an existing record to another owner. The repository must never accept an `ownerId` argument or switch to a privileged Supabase key.

## Phase 1: Private Schema and RLS

### Overview

Add the smallest durable data model required by the privacy guardrail and make direct database/API access owner-scoped before feature work begins.

### Changes Required:

#### 1. Core schema migration

**File**: `supabase/migrations/<timestamp>_create_private_flashcard_data.sql`

**Intent**: Create the foundational records for a set, its source text, and its cards without prematurely encoding later product features. Ensure removal of a set also removes derived cards and the private source material.

**Contract**: Add `flashcard_sets` (`id`, `owner_id`, non-empty `title`, `created_at`), `flashcard_sources` (`id`, `set_id`, `owner_id`, non-empty `source_text`, `created_at`), and `flashcards` (`id`, `set_id`, non-empty `question`, non-empty `answer`, `created_at`). Owner IDs default to `auth.uid()` and reference `auth.users(id)` with cascading deletion. `flashcard_sources.set_id` is unique and references its set with cascading deletion; cards reference their set with cascading deletion. Add indexes beginning with every ownership or relation column inspected by a policy.

#### 2. Grants and RLS policies

**File**: `supabase/migrations/<timestamp>_create_private_flashcard_data.sql`

**Intent**: Make private access enforceable from the database regardless of the application endpoint or caller tooling.

**Contract**: Enable RLS on all three tables and revoke all table privileges from `anon` and `authenticated`. Grant `authenticated` CRUD on sets and cards, but only `SELECT`, `INSERT`, and `UPDATE` on sources: a source is removed only when its parent set is deleted through the foreign-key cascade. Add separate named policies for every granted operation. Sources and sets authorize against their own `owner_id = auth.uid()`; source insert/update also requires that `set_id` belongs to the same user. Cards authorize through an `EXISTS` check on their parent set's ownership. Update policies include both existing-row and resulting-row checks.

#### 3. Atomic set-and-source creation function

**File**: `supabase/migrations/<timestamp>_create_private_flashcard_data.sql`

**Intent**: Preserve the required one-to-one source/set invariant when a future generation flow creates both records, including when either database write fails.

**Contract**: Add a `security invoker` SQL function callable only by `authenticated` that accepts a non-empty set title and source text, derives ownership from `auth.uid()`, inserts the set and its source in one transaction, and returns the created set identity. It must not accept an owner identifier, bypass RLS, or be callable by `anon`.

### Success Criteria:

#### Automated Verification:

- A clean local `supabase db reset` applies the migration without errors.
- The migration creates the three tables, foreign keys, indexes, explicit grants, and the exact per-operation RLS policies required by each table.
- The atomic creation function creates a set and its source together, or creates neither record on a rejected source insert.

#### Manual Verification:

- In local Supabase Studio, all three tables show RLS enabled and no policy grants anonymous access.
- Deleting a test set removes its cards and source record.

---

## Phase 2: Server-Only Flashcard Repository

### Overview

Create one reusable server-side boundary for later flashcard features, retaining RLS as the final access control layer and exposing no public HTTP surface yet.

### Changes Required:

#### 1. Owner-scoped repository

**File**: `src/lib/flashcards.ts`

**Intent**: Centralize normal application reads and writes for private flashcard data so future API routes reuse the existing request-bound Supabase session instead of hand-writing table queries.

**Contract**: Export a repository factory that receives the existing request headers and Astro cookies, uses `createClient()`, and returns no repository when Supabase is unconfigured. Its public internal operations are: create a titled set with its source text; list the current user's sets; fetch a set with cards but never source text; add, update, and delete cards by ID; and delete a set. Inputs contain no owner identifier, and every method returns a typed success-or-error result suitable for later server routes. The create operation calls the authenticated atomic database function and reports failure without exposing database internals to a future client.

#### 2. Repository type contracts

**File**: `src/lib/flashcards.ts`

**Intent**: Give subsequent slices stable domain shapes without claiming support for tags, proposal state, or review scheduling.

**Contract**: Define exported TypeScript types for set summaries, set-with-cards reads, card inputs, and creation input. Source text is accepted only by the create-set input and is absent from read result types.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with the new server-only module.
- `npx astro check` passes with the repository's exported types.

#### Manual Verification:

- Code review confirms no data-access method accepts `ownerId`, uses a browser client, or returns stored source text.

---

## Phase 3: RLS Proof and CI Coverage

### Overview

Prove the privacy contract with two identities at the database layer and run that proof alongside the existing local-Supabase validation workflow.

### Changes Required:

#### 1. Two-user RLS test suite

**File**: `supabase/tests/private_flashcard_data_rls.test.sql`

**Intent**: Detect any regression that exposes or mutates one user's data from another user's authenticated session.

**Contract**: Use Supabase pgTAP helpers to create two users. For every user-scoped assertion, run as the `authenticated` database role with that user's `request.jwt.claim.sub`; do not rely on the privileged test connection. Assert that the atomic creation function creates both records for its caller and cannot be executed by `anon`. Assert that the owner can create, read, and update its source and can create, read, update, and delete its sets and cards. Assert that direct source deletion is denied even to its owner, while deleting the parent set removes its source through the cascade. Assert that the second user cannot read, change, delete, or attach records to the owner's source or set. Include unauthenticated/`anon` denial coverage.

#### 2. CI database-test step

**File**: `.github/workflows/ci.yml`

**Intent**: Make RLS policy validation a required CI gate whenever the local Supabase stack is started.

**Contract**: Run `supabase db reset --local` after local Supabase starts, then run `supabase test db` before the production build/preview smoke validation. Keep the existing authentication smoke test and its cookie workflow unchanged.

### Success Criteria:

#### Automated Verification:

- `supabase test db` passes against a clean local Supabase instance with all owner-allow and cross-user-deny assertions.
- CI resets the local database before its RLS test suite runs.
- `npm run lint`, `npx astro check`, and `npm run build` pass.
- The CI-equivalent local preview continues to pass `npm run smoke`.

#### Manual Verification:

- A reviewer can identify an explicit denied operation for each of source text, sets, and cards in the RLS test output.
- A reviewer confirms no UI route or public flashcard API was added by F-01.

## Testing Strategy

### Database / Integration Tests:

- Apply the migration to an empty local instance.
- Create two test users and records owned by the first user.
- Verify owner allow paths and second-user/anonymous deny paths for every granted operation, including owner denial of direct source deletion.
- Verify a set deletion removes its one-to-one source and child cards.

### Application Validation:

- Run linting, Astro type checking, and production build.
- Run the existing auth smoke test against the local preview to confirm no regression in session handling.

## Performance Considerations

The MVP is low-volume, but policies execute for every candidate row. Keep indexes on `owner_id`, `set_id`, and all leading relation columns used by policy predicates. Do not add caching or pagination in this foundation.

## Migration Notes

The migration is additive because no flashcard-domain data exists. It must be applied through the normal Supabase migration flow in each environment. A Worker rollback does not roll back a database migration, so any production correction must be a forward migration rather than a schema reversal.

## References

- `context/foundation/prd.md`
- `context/foundation/roadmap.md`
- `src/lib/supabase.ts:5`
- `src/middleware.ts:4`
- `scripts/smoke.mjs:7`
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Private Schema and RLS

#### Automated

- [x] 1.1 Apply the private flashcard migration to a clean local Supabase database — 16018ac
- [x] 1.2 Verify the schema includes the required tables, constraints, indexes, grants, and per-table RLS policies — 16018ac

#### Manual

- [x] 1.3 Inspect local RLS configuration and anonymous-access denial — 16018ac
- [x] 1.4 Verify set deletion removes its cards and source record — 16018ac
- [x] 1.5 Verify atomic set-and-source creation cannot leave an orphaned set — 16018ac

### Phase 2: Server-Only Flashcard Repository

#### Automated

- [x] 2.1 Pass linting for the server-only repository — 357f563
- [x] 2.2 Pass Astro type checking for repository contracts — 357f563

#### Manual

- [x] 2.3 Review that repository methods derive ownership from the authenticated session and never expose source text — 357f563

### Phase 3: RLS Proof and CI Coverage

#### Automated

- [x] 3.1 Pass the two-user Supabase RLS test suite, including direct source-delete denial â€” c937fee
- [x] 3.2 Pass linting, Astro checking, and the production build â€” c937fee
- [x] 3.3 Pass the existing authentication smoke test through the local preview workflow â€” c937fee

#### Manual

- [x] 3.4 Review explicit deny assertions for source text, sets, and cards â€” c937fee
- [x] 3.5 Confirm F-01 adds neither a flashcard UI route nor a public API â€” c937fee
- [x] 3.6 Confirm CI resets the local database before RLS tests â€” c937fee
