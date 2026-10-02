# Pasted Text Flashcard Proposals Implementation Plan

## Overview

Deliver the first authenticated creation journey for Memoro without selecting an AI provider yet. A user enters a set title and pasted text, the application atomically persists the private set and source, then returns one deterministic demo proposal for display on the current page.

## Current State Analysis

The F-01 foundation already supplies an owner-scoped `createSet` repository operation backed by the atomic `create_flashcard_set_with_source` RPC. It intentionally has no proposal storage or AI integration. The only protected UI surface is `/dashboard`; its "New set" control currently has no navigation behavior, and the design mock is non-production reference material.

## Desired End State

A signed-in user can navigate from the dashboard to `/dashboard/new`, enter a required title and up to 10,000 Unicode code points of text, and receive one clearly labelled demo card. The set and source are private and durable; the displayed proposal is not. Invalid or failed requests preserve the form values and show an accessible error.

### Key Discoveries:

- `createFlashcardRepository().createSet()` validates non-empty input and invokes the atomic, authenticated RPC without accepting an owner identifier (`src/lib/flashcards.ts:82`).
- The database migration keeps source text owner-private and never exposes it in repository read models (`supabase/migrations/20260924000000_create_private_flashcard_data.sql:8`, `src/lib/flashcards.ts:123`).
- `/dashboard` is centrally protected by middleware, so `/dashboard/new` inherits protection; API routes require their own session check (`src/middleware.ts:4`).
- The current dashboard's "New set" button is inert (`src/components/AppShell.tsx:13`), while `src/design/NewFlashcards.jsx` is only a visual reference and includes out-of-scope S-02 controls.

## What We're NOT Doing

- No external AI provider, AI SDK, AI credential, provider request, or provider-retention policy.
- No migration, proposal table, durable proposal state, browser storage, or change to the existing private-data schema.
- No editing, deletion, acceptance, saving, or persistence of proposed cards; those belong to S-02.
- No source-text retrieval endpoint, client-side Supabase credentials, or owner identifier supplied by the client.

## Implementation Approach

Keep the proposal generator as a small server-only deterministic module. A JSON API route authenticates the caller, validates the request, creates the owner-private set and source through the existing repository before producing the mock response, and returns only the set ID and demo proposal. A React island on a new protected dashboard subroute owns form, pending, success, and error state.

## Critical Implementation Details

The set/source write happens before mock generation to preserve FR-001's automatic set creation rule. The proposal is returned only in the response and deliberately disappears on refresh; S-02 will define its durable review-and-save model. Both browser and server count the same Unicode code points so an emoji-containing source cannot pass one limit and fail the other.

## Phase 1: Server-Side Mock Proposal Contract

### Overview

Create the safe, testable boundary that turns a valid authenticated request into a persisted private set plus one non-AI demo proposal.

### Changes Required:

#### 1. Proposal validation and deterministic generator

**File**: `src/lib/flashcard-proposals.ts`

**Intent**: Centralize request validation and demo output so the UI and route share a stable, replaceable proposal contract without implying that a real model is already selected.

**Contract**: Export a 10,000-Unicode-code-point source limit, a non-empty-title/non-empty-source validator, and a generator that always returns one proposal: `What is a flashcard?` / `A small prompt-and-answer study aid used for active recall.` The result includes `isDemo: true` and `qualityFlags: []`; it accepts no provider credentials and makes no network request.

#### 2. Authenticated generation endpoint

**File**: `src/pages/api/flashcards/generate.ts`

**Intent**: Provide the sole server boundary for the MVP creation journey while preserving F-01's request-bound Supabase and RLS guarantees.

**Contract**: Implement `POST /api/flashcards/generate` for JSON `{ title: string, sourceText: string }`. Verify the request-bound Supabase user before creating a repository; validate input; invoke `createSet({ title, sourceText })`; then return HTTP 201 `{ setId, proposal }`. Return safe JSON errors: 400 for invalid JSON or validation, 401 for no authenticated user, 503 for unavailable Supabase configuration, and 500 for a repository write failure. Responses never include source text, ownership data, database errors, or AI/provider details.

### Success Criteria:

#### Automated Verification:

- Unit tests prove the validator rejects blank fields and source text over 10,000 Unicode code points.
- Unit tests prove the generator always returns the fixed demo proposal with `isDemo: true` and no quality flags.
- Endpoint tests prove authenticated valid input creates the set before returning HTTP 201, and cover 400, 401, 503, and 500 responses.

#### Manual Verification:

- Code review confirms no AI secret, provider dependency, network call, owner ID input, or source-text output was introduced.

---

## Phase 2: Protected Creation Experience

### Overview

Expose the server contract through the existing dashboard shell and give the user a clear, recoverable creation flow.

### Changes Required:

#### 1. Dashboard navigation and protected route

**Files**: `src/components/AppShell.tsx`, `src/components/Dashboard.tsx`, `src/pages/dashboard/new.astro`

**Intent**: Make the existing primary action lead to a dedicated creation screen without expanding authentication logic beyond middleware.

**Contract**: Render the shell's "New set" action as a navigation link when given `/dashboard/new`, pass that destination from the dashboard, and add the new Astro route using the existing layout and authenticated user's email. Do not add a second auth guard because the `/dashboard` prefix remains the protection boundary.

#### 2. Interactive creation island

**File**: `src/components/flashcards/NewFlashcardsForm.tsx`

**Intent**: Let users submit the smallest useful creation request and immediately see the deterministic proposal while keeping S-02 review actions absent.

**Contract**: Render required title and source-text controls, a Unicode-aware 10,000-character counter, inline client validation, a pending state, and a `fetch` POST to `/api/flashcards/generate`. Preserve both fields and show an accessible inline error after any non-success response. On success, show only the returned question/answer, a visible "Demo proposal" label, and text explaining that review and saving arrive in S-02. Do not render edit, delete, accept, save, or generation-settings controls.

### Success Criteria:

#### Automated Verification:

- Astro type checking accepts the new route, React island, and shell navigation contract.
- Linting accepts the new client state and request handling without unused values or client-side server imports.

#### Manual Verification:

- An unauthenticated visit to `/dashboard/new` redirects to sign-in.
- A signed-in user can reach `/dashboard/new` from "New set", submit valid data, and see exactly one labelled demo proposal.
- Blank or oversized input is rejected without sending a usable request, and a server error preserves the entered title and source text.
- Refreshing after success removes the displayed proposal while no S-02 card editing or save action is available.

---

## Phase 3: Regression Coverage and Delivery Validation

### Overview

Prove the mock flow works without weakening the existing private-data, authentication, or Workers build contracts.

### Changes Required:

#### 1. Focused unit and route tests

**Files**: `src/lib/flashcard-proposals.test.ts`, `src/pages/api/flashcards/generate.test.ts`

**Intent**: Lock the temporary mock contract and failure behavior so a later AI-provider change replaces one deliberate boundary rather than changing the user journey accidentally.

**Contract**: Mock the existing Supabase client and flashcard repository in route tests; assert only the existing `createSet` input is passed and no source text appears in successful or failed response payloads.

#### 2. Project validation

**Files**: no production-file change required

**Intent**: Validate the complete change against repository gates and the Cloudflare-compatible server build.

**Contract**: Run the repository's Vitest suite, ESLint, Astro type checker, and production build. Do not require an AI credential for any validation command.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including proposal and endpoint coverage.
- `npm run lint`, `npx astro check`, and `npm run build` pass without an AI credential.

#### Manual Verification:

- The authenticated end-to-end creation journey works in a local Supabase-backed session, and another user cannot access the created set or source through existing data paths.

## Testing Strategy

### Unit Tests:

- Validate Unicode-aware source limits, blank values, and the exact fixed demo proposal.
- Verify endpoint authentication, validation, repository failures, unavailable configuration, and absence of sensitive response data.

### Integration Tests:

- Reuse F-01's RLS tests for owner-only source and set access; S-01 adds no schema or policy change.

### Manual Testing Steps:

1. Sign in, use the dashboard's "New set" control, and submit a title plus valid text.
2. Confirm a single labelled demo card appears and no proposal-management action appears.
3. Submit blank and oversized inputs, then simulate a server failure; confirm the form retains values and presents an inline error.
4. Refresh after a successful request and confirm the proposal is gone while the private set remains owner-scoped.

## Performance Considerations

The mock is synchronous and local. The 10,000-code-point ceiling is retained for the later external AI integration and keeps Worker request processing bounded.

## Migration Notes

No migration is required. The plan reuses F-01's additive schema and atomic set/source RPC; later durable proposal support must be introduced by S-02 with its own model decision.

## References

- `context/foundation/prd.md`
- `context/foundation/roadmap.md`
- `context/changes/private-flashcard-data-access/plan.md`
- `src/lib/flashcards.ts:82`
- `src/lib/supabase.ts:1`
- `src/middleware.ts:4`
- `src/components/AppShell.tsx:13`
- `src/design/NewFlashcards.jsx:41`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Server-Side Mock Proposal Contract

#### Automated

- [x] 1.1 Test proposal input validation and the Unicode source limit — 7ab4119
- [x] 1.2 Test deterministic demo-proposal output — 7ab4119
- [x] 1.3 Test authenticated generation endpoint success and safe error responses — 7ab4119

#### Manual

- [x] 1.4 Confirm the server contract introduces no AI or sensitive-data exposure — 7ab4119

### Phase 2: Protected Creation Experience

#### Automated

- [x] 2.1 Pass Astro type checking for the route, island, and navigation contract — dcfedf9
- [x] 2.2 Pass linting for the form state and request handling — dcfedf9

#### Manual

- [x] 2.3 Verify unauthenticated access redirects to sign-in — dcfedf9
- [x] 2.4 Verify dashboard navigation and successful demo-proposal display — dcfedf9
- [x] 2.5 Verify validation and server errors preserve the form state — dcfedf9
- [x] 2.6 Verify refresh clears the proposal and excludes S-02 controls — dcfedf9

### Phase 3: Regression Coverage and Delivery Validation

#### Automated

- [x] 3.1 Pass the complete Vitest suite with proposal and endpoint coverage — 7186d0a
- [x] 3.2 Pass linting, Astro type checking, and production build without AI credentials — 7186d0a

#### Manual

- [x] 3.3 Verify the local authenticated flow and owner-only private-data access — 7186d0a
