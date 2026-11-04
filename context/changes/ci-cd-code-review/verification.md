# Verification Evidence: Automated PR Code Review (`ci-cd-code-review`)

## Overview

This document records the verification results for the `ci-cd-code-review` change. In accordance with the implementation plan, automated tests and linting gates verify deterministic logic, error classification, provider transport boundaries, and workflow schema offline without live network dependencies. Live GitHub Actions and OpenRouter execution are tracked in the pending manual verification checklist for the repository owner.

---

## 1. Automated Verification Gates

All automated verification gates are executed and verified locally.

### Command Execution Log

1. **Review Unit & Input Tests**:
   - Command: `npm test -- scripts/ai-code-review/contract.test.mjs scripts/ai-code-review/input.test.mjs`
   - Target: Scoring thresholds (`[6,6,6,6,6,6]` pass, `[3,10,10,10,10,10]` fail, `[5,6,6,6,6,6]` fail, `[4,4,7,7,7,7]` pass), strict schema validation, diff size limits (100 KiB cap), hunk parsing, Unicode description handling, and binary file rejection.
   - Result: **PASSED** (all tests green).

2. **OpenRouter Provider Tests**:
   - Command: `npm test -- scripts/ai-code-review/openrouter.test.mjs`
   - Target: Native `fetch` client, bearer authentication, JSON Schema structured output request format, 4,000 output token limit, 90s abort signal, 256 KiB response-body cap, single-retry on HTTP 408/429/5xx and transient network failures, refusal handling, and error payloads.
   - Result: **PASSED** (all tests green).

3. **GitHub API & Orchestration Tests**:
   - Command: `npm test -- scripts/ai-code-review`
   - Target: Complete integration suite including `github.test.mjs`, `report.test.mjs`, and `run.test.mjs`. Tests fork/draft skips, label idempotency (`ai-cr:passed`, `ai-cr:failed`, `ai-cr:review`), single bot summary comment updates (`<!-- ai-cr:summary:v1 -->`), staleness/supersession checks, and advisory job exit code semantics.
   - Result: **PASSED** (all tests green).

4. **Workflow Schema & Composite Action Linting**:
   - Commands:
     - `npx --yes @kjanat/actionlint .github/workflows/ai-code-review.yml`
     - `npx prettier --check .github/actions/ai-code-review/action.yml`
   - Target: Validates GitHub Actions workflow triggers (`pull_request_target`), expressions, concurrency keys, step definitions, and action metadata.
   - Result: **PASSED** (no syntax or type errors).

5. **Full Repository Completion Gate**:
   - Command: `npm run verify`
   - Pipeline: ESLint, Astro type checks (`astro check`), Vitest test suite, and production build (`npm run build`).
   - Result: **PASSED** (clean build, 0 lint errors, 0 type errors).

6. **Documentation Formatting Check**:
   - Command: `npx prettier --check .github/actions/ai-code-review README.md context/changes/ci-cd-code-review/verification.md`
   - Result: Verified to adhere to repository formatting standards.

---

## 2. Tested Architecture & Commit Revisions

- **Repository Commits**:
  - `ffd0163`: Phase 1 — Review contract, score evaluation, input boundaries, and Vitest discovery.
  - `87d4a2c`: Phase 2 — Bounded OpenRouter provider transport and composite action scaffolding.
  - `7873c4d`: Phase 3 — GitHub REST API client, Markdown summary reporting, orchestration runner, and workflow definition.
- **Component Inventory**:
  - `.github/workflows/ai-code-review.yml`: Secure `pull_request_target` entry point with concurrency serialization and 10-minute timeout.
  - `.github/actions/ai-code-review/action.yml`: Reusable local composite action interface.
  - `.github/actions/ai-code-review/README.md`: Operational guide and setup instructions.
  - `scripts/ai-code-review/contract.mjs`: Pure score validation and verdict calculation.
  - `scripts/ai-code-review/input.mjs`: Complete patch diff and description validation.
  - `scripts/ai-code-review/openrouter.mjs`: Bounded OpenRouter client with transient error retries.
  - `scripts/ai-code-review/github.mjs`: GitHub REST API client for comments, labels, and metadata.
  - `scripts/ai-code-review/report.mjs`: Safe summary Markdown formatter with diagnostic notices.
  - `scripts/ai-code-review/run.mjs`: Orchestrator managing PR state, freshness checks, and label synchronization.

---

## 3. Manual Verification Checklist (Pending Rollout)

In accordance with the plan instructions, live checks against GitHub Actions and OpenRouter are **not** marked complete based on mock tests. They require owner configuration upon merging to `main`:

- [ ] **Repository Secret**: Configure `OPENROUTER_API_KEY` in GitHub repository settings with a dedicated key carrying an explicit spending cap in OpenRouter.
- [ ] **Repository Variable**: Configure `AI_REVIEW_MODEL` with a concrete, structured-output-compatible model ID (e.g. `openai/gpt-4o`).
- [ ] **GitHub Policy**: Verify that the repository allows `pull_request_target` workflows and that the review workflow exists on the default branch (`main`).
- [ ] **Branch Protection**: Confirm that `AI code review` is **not** set as a required status check in branch protection or rulesets.
- [ ] **Live Test PR (Pass/Fail Flow)**:
  - Open a representative text-only PR against `main`.
  - Verify that a single summary comment is created by `github-actions[bot]` with detailed criteria scores and explanations.
  - Confirm that the appropriate outcome label (`ai-cr:passed` or `ai-cr:failed`) is added.
  - Verify that the Actions job completes successfully (advisory pass), even when criteria fail.
- [ ] **Update & Retry Lifecycle**:
  - Push a new commit to the PR and verify that the existing comment is updated in-place rather than creating a duplicate comment.
  - Add the `ai-cr:review` label and verify that an on-demand review is executed and the label is consumed upon acceptance.
- [ ] **Edge Case & Log Inspection**:
  - Test draft PR and fork PR to confirm they are safely skipped without billable inference calls.
  - Inspect GitHub Actions run logs to verify that no credentials (`OPENROUTER_API_KEY`, `GITHUB_TOKEN`) or raw diff contents appear in the logs.
