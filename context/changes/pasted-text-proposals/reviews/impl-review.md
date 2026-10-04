<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Pasted Text Flashcard Proposals Implementation Plan

- **Plan**: context/changes/pasted-text-proposals/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-04
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Ambiguous retries can create duplicate private sets

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/NewFlashcardsForm.tsx:59; src/pages/api/flashcards/generate.ts:50
- **Detail**: The endpoint durably creates the set and source before writing its 201 response. If that response is lost or malformed after the write, the form treats the outcome as a failure and tells the user to retry. A retry makes a second durable private set/source; the request has no idempotency or recovery mechanism.
- **Fix A ⭐ Recommended**: Make creation idempotent with a client-generated request key, persisted and uniquely enforced by the server/RPC; return the originally created set for a repeated key.
  - Strength: Preserves the plan's durable-before-proposal ordering without allowing an ambiguous retry to duplicate data.
  - Tradeoff: Requires a small schema/RPC contract addition beyond this MVP's planned persistence model.
  - Confidence: HIGH — the current write happens before the response and is otherwise not recoverable by the client.
  - Blind spot: This review did not measure how frequently Workers responses fail after an RPC succeeds.
- **Fix B**: Remove the retry guidance and present ambiguous network/parse failures as an outcome requiring manual reconciliation.
  - Strength: Reduces accidental duplicate submissions without expanding the persistence model.
  - Tradeoff: Does not give the user a reliable path to recover the created set or fully prevent intentional re-submission.
  - Confidence: MEDIUM — safer messaging reduces the common retry path but cannot solve the underlying ambiguity.
  - Blind spot: No existing set-recovery UI was found.
- **Decision**: FIXED via Fix B — removed retry guidance for ambiguous response and network failures.

### F2 — The endpoint accepts unbounded title and body sizes before validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/flashcards/generate.ts:18
- **Detail**: `request.json()` consumes and parses the complete body before the 10,000-code-point source check. The validator has no title-length limit, so an authenticated caller can consume Worker memory parsing an oversized payload and persist an oversized title. Platform request limits reduce but do not establish this application-level storage or resource invariant.
- **Fix**: Add a conservative request-size guard before parsing, enforce a bounded title and source size server-side, and add a matching database constraint for durable storage.
  - Strength: Makes the resource and storage limits enforceable even when the endpoint is called outside the React form.
  - Tradeoff: Requires choosing product limits and a migration/contract update.
  - Confidence: HIGH — the only current server limits run after JSON parsing, and title has no limit.
  - Blind spot: This review did not establish the configured Cloudflare request-body limit.
- **Decision**: FIXED — added bounded request streaming, shared title validation, and matching database constraints.

### F3 — Local authenticated/RLS acceptance check lacks recorded execution evidence

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/pasted-text-proposals/plan.md:171
- **Detail**: Phase 3.3 is checked off, but the implementation diff and this review's validation only evidence unit tests, lint, Astro checking, and the build. The repository has an RLS SQL test and CI smoke workflow, but no recorded local Supabase/owner-isolation execution accompanies this change.
- **Fix**: Run the local Supabase DB/smoke workflow and record the resulting command or CI run in the change notes.
- **Decision**: SKIPPED — local Supabase DB/smoke execution was not requested during triage.
