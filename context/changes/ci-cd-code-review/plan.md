# Automated PR Code Review Implementation Plan

## Overview

Add an advisory AI review workflow for same-repository pull requests targeting `main`. A local composite action sends bounded PR context to an explicitly selected OpenRouter model, validates six scores, computes the verdict, and maintains one summary comment and the current outcome label.

This plan incorporates the requirements, existing research, and the approved planning decisions. OpenRouter supersedes the earlier Gemini and Codex-action options. The four implementation phases were approved before persistence. Implementation and live service configuration have not been performed.

## Current State Analysis

The repository has application CI but no automated review action. `.github/workflows/ci.yml:3` handles pushes and PRs to `main`; its job runs lint, Astro checks, Vitest, and build. Its Supabase secrets belong to application validation and are not needed by the review workflow.

`package.json:15` defines `npm run verify`. `vitest.config.ts:12` currently discovers source and hook tests, but not new review scripts. `eslint.config.js:74` already configures Node scripts under `scripts/**/*.mjs`. The existing Gemini adapter is specific to flashcard generation and should not become a CI dependency.

The supplied research establishes the integration points and scoring contract. Planning resolves its open product decisions below. No live GitHub event policy, branch protection, labels, OpenRouter credentials, or selected model was inspected; these are explicit rollout prerequisites, not presumed configuration.

## Desired End State

- Review non-draft, open, same-repository PRs targeting `main` on `opened`, `synchronize`, `reopened`, and `ready_for_review`; accept an on-demand request when a human adds `ai-cr:review`.
- Skip forks and drafts, including manual requests on drafts. Title/body-only edits do not initiate a review; use the retry label after such edits.
- Use a dedicated `OPENROUTER_API_KEY` Actions secret and required `AI_REVIEW_MODEL` repository variable. The owner selects a concrete structured-output-compatible model; there is no implicit model, automatic router, or fallback to another model.
- Include title, a disclosed description excerpt of at most 8,000 Unicode code points, and a complete supported diff of at most 102,400 UTF-8 bytes (100 KiB). Never truncate the diff to fit.
- Request at most 4,000 output tokens per attempt, with a 90-second deadline per attempt including response-body consumption and at most one transient retry. Allow at most 10 seconds of retry waiting and a 10-minute workflow-job timeout.
- Require all six named integer scores, 1–10 inclusive. Fail if any score is at most 3 or their sum is below 36; otherwise pass. Display the average, but never round it before deciding.
- Maintain one bot-owned summary containing the reviewed head/base SHAs, model, scores, explanations, verdict, evidence limits, and workflow-run link. Apply exactly one of red `ai-cr:failed` or green `ai-cr:passed` after a complete current review.
- A valid quality fail remains advisory: the Actions job succeeds after publishing it. Operational failure makes the optional job fail, publishes a safe explanation when GitHub is reachable, and removes previous outcome labels. Incomplete/unsupported input produces no quality verdict or outcome label and is reported as review unavailable with a failed optional job.
- Consume `ai-cr:review` when an eligible retry is accepted. Preserve unrelated labels and discard superseded results. Do not configure this workflow as a required merge check.

### Key Discoveries:

- `context/changes/ci-cd-code-review/requirements.md:14` specifies the score scale; its verdict rule requires local calculation rather than trusting a model-provided verdict.
- `.github/workflows/ci.yml:1` is existing application CI; the new workflow can remain independent.
- `vitest.config.ts:12` needs an explicit review-test include so tests are exercised by existing CI.
- `src/lib/gemini.ts:82` provides a native-fetch precedent, but its partial-result filtering is unsuitable for an all-six-scores review contract.
- GitHub comments and labels are separate writes, and PR state can change between a freshness check and publication. The design must not claim atomic publication or guaranteed current-head status at every instant.
- OpenRouter may return an error payload even with HTTP 200. Structured output still requires local validation; a token-limited reasoning model can fail to produce a complete result within the accepted output cap.

## What We're NOT Doing

- Fork reviews, draft reviews, automatic reviews for title/body-only edits, or deployment automation.
- Required merge checks, automatic PR approval, code edits, agent tools, execution of PR code, or test execution inside the review action.
- Business-alignment or architectural-fit scoring, repository-wide retrieval, or claims about code outside the supplied diff context.
- Partial-diff quality verdicts, chunking large PRs, binary analysis, automatic model selection, or model fallback.
- Reusing application Supabase/Gemini credentials or changing application endpoints and authentication.
- A dollar guarantee derived from character/token limits. The owner configures the dedicated OpenRouter key's cumulative spending cap.
- Repairing unrelated legacy documentation or changing immutable `context/archive/` material.

## Implementation Approach

Use `.github/workflows/ai-code-review.yml` for event filters, trusted checkout, permissions, concurrency, and timeouts. Invoke `.github/actions/ai-code-review/action.yml` for review orchestration. Keep dependency-free Node helpers and tests in `scripts/ai-code-review/`, where the existing lint conventions apply; extend Vitest discovery to include these tests.

Use `pull_request_target` with an explicit same-repository guard and only trusted default-branch workflow/action code. Checkout the event's trusted immutable `github.sha`, with persisted credentials disabled. Fetch PR metadata, file inventory, and diff through GitHub's API as data. Never checkout the PR head or install/run its dependencies, configuration, scripts, or local actions. Give the model no tools. A provider prompt cannot enforce security by itself; the action exposes only inference, while trusted local code owns validation and publication.

Use `contents: read` and `pull-requests: write` job permissions. Pin third-party actions to reviewed full commit SHAs with version comments at implementation time. The local composite accepts token, provider key, and model as explicit inputs; PR identity comes from the event payload, never shell interpolation of PR title/body. Pass untrusted data through JSON/files or process environment, not generated shell commands. Do not print credentials, raw prompts/diffs, or provider error bodies.

### Timing and publication constraints

Use guarded job-level, PR-specific concurrency so unrelated label events cannot cancel a real review. Serialize accepted runs with `cancel-in-progress: false`; queued obsolete runs check current state and exit before a paid call. Capture current head/base SHAs and metadata, then verify they stayed stable after fetching input and before publishing. Also recheck open/non-draft/main/same-repository eligibility. An in-flight title/body change invalidates that result without scheduling an automatic replacement; a manual retry is required.

Clear old AI outcome labels and mark the summary pending before inference. Publish the validated summary before adding the outcome label, recheck freshness around publication, and remove a just-written outcome if a post-write check detects staleness. On detected supersession, leave no current outcome and mark the summary superseded without publishing obsolete scores. GitHub does not offer a transaction across metadata, comments, and labels; retain the reviewed SHA and document the remaining narrow race. If GitHub becomes unavailable, cleanup can fail too: fail the job visibly and recover idempotently on the next retry.

Draft/closed events do not initiate new reviews or cleanup-only runs in this version. Any retained summary is historical and identified by SHA; the next eligible run clears its outcome before review. An `ai-cr:review` label added to a draft is not consumed until an eligible run accepts it.

## Phase 1: Review contract and tests

### Overview

Establish pure, testable rules for review results and supported input before adding network effects.

### Changes Required:

#### 1. Review schema, verdict, and input validation

**Files**: `scripts/ai-code-review/contract.mjs`, `scripts/ai-code-review/input.mjs`, `scripts/ai-code-review/prompt.md`

**Intent**: Make assessment rules deterministic and prevent incomplete evidence from yielding a successful review. Keep the prompt grounded in the six requested criteria and visible diff context.

**Contract**: Require `summary` plus a `criteria` object with exactly `implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`, `documentation`, and `securitySafety`. Each criterion has an integer `score` in 1–10 and nonempty `explanation` of at most 1,000 Unicode code points; summary is nonempty and at most 2,000 code points. Reject unknown fields, missing entries, strings as scores, fractions, and invalid JSON. The model supplies no authoritative verdict. Return distinct complete, unavailable, operational-error, skipped, and superseded outcomes to orchestration.

The input contract limits description and diff as specified above; a description excerpt is explicitly disclosed and does not make the code diff incomplete. Validate a paginated unique file inventory against PR `changed_files` and raw diff file/hunk structure and addition/deletion counts. The API's 3,000-file maximum is a coverage bound, not evidence that a capped response is complete. Reject missing textual patches, missing files/hunks, binary markers, malformed/truncated diffs, unsupported submodule/mode-only entries, empty diffs, and any ambiguous coverage. Do not exclude lockfiles, generated files, or deletion changes silently. Preserve old/new paths for renames; accept metadata-only changes only if their complete supported representation is proven by fixtures. Otherwise report unavailable. Exact equality to the byte cap is allowed; one extra byte is unavailable.

Treat PR text as untrusted evidence in the prompt, require concise supporting explanations, and state that absence from diff context is not proof that a repository abstraction or test does not exist. A score of 10 is best for every criterion, including complexity.

#### 2. Test discovery and boundary fixtures

**Files**: `scripts/ai-code-review/contract.test.mjs`, `scripts/ai-code-review/input.test.mjs`, `scripts/ai-code-review/fixtures/`, `vitest.config.ts`

**Intent**: Exercise real failure boundaries through the existing test gate without paid calls.

**Contract**: Add `scripts/ai-code-review/**/*.test.mjs` to Vitest includes. Cover `[6,6,6,6,6,6]` pass; `[3,10,10,10,10,10]` fail; `[5,6,6,6,6,6]` fail; and `[4,4,7,7,7,7]` pass. Include invalid schema, exact input caps, Unicode description handling, binary/mixed changes, pagination mismatch, removed final file/hunk, malformed hunks, deletions, renames, and prompt-injection-like text treated only as data.

### Success Criteria:

#### Automated Verification:

- Contract and input fixtures pass: `npm test -- scripts/ai-code-review/contract.test.mjs scripts/ai-code-review/input.test.mjs`.
- Repository completion gate passes with the new test discovery: `npm run verify`.

## Phase 2: OpenRouter review action

### Overview

Implement provider transport and wire the reusable composite action around the deterministic contract.

### Changes Required:

#### 1. Bounded provider transport

**Files**: `scripts/ai-code-review/openrouter.mjs`, `scripts/ai-code-review/openrouter.test.mjs`

**Intent**: Allow the owner to select an inexpensive compatible model without weakening result validation or silently increasing request budgets.

**Contract**: Non-streaming native `fetch` to `https://openrouter.ai/api/v1/chat/completions` with bearer authentication, one concrete configured model, JSON-schema response format, `strict: true`, and `provider.require_parameters: true`. Require a model configuration rather than choosing a fallback; reject routing aliases and model fallback lists. Provider routing within that same model is allowed. Set `provider.data_collection: "deny"` to exclude providers that collect submitted data under that routing policy; document that this is not a blanket zero-retention guarantee.

Apply `max_tokens: 4000`, a 90-second per-attempt abort deadline, and a 256 KiB response-body cap before parsing. Accept only one complete textual result with `finish_reason: "stop"`, no tool calls/refusal/errors, and a locally valid schema. Inspect HTTP status, top-level error, and choice-level error. Reject truncated output even if some JSON can be recovered. Record returned model, generation ID, and available usage metadata without treating missing usage fields as a scoring error.

Retry at most once for network/timeouts, HTTP 408/429/5xx, or corresponding documented transient provider errors. Honor `Retry-After` only if it fits the 10-second wait budget; otherwise stop. Use a short bounded backoff when absent. Do not retry authentication/credit errors, invalid configuration, unsupported schema/context, refusals, malformed content, or token exhaustion. A timeout may still incur a charge, including a second charge after retry. No model switch, larger token budget, or automatic JSON-repair call is permitted.

#### 2. Composite action interface

**Files**: `.github/actions/ai-code-review/action.yml`, `scripts/ai-code-review/run.mjs`

**Intent**: Keep the top-level workflow small and expose one review operation that later receives GitHub transport/publication wiring.

**Contract**: Composite inputs are `github-token`, `openrouter-api-key`, and `model`; outputs are bounded `status` and `reviewed-head-sha`. Invoke Node 24 helpers from the trusted checkout using explicit `shell` and safe environment inputs. No runtime package installation is needed. Validate missing configuration before a provider request and return a safe operational error. Keep module entry-point execution separate from imports so orchestration can be tested with injected transports.

### Success Criteria:

#### Automated Verification:

- Mocked provider tests pass for valid JSON, HTTP-200 errors, invalid schema, refusal, output/body limits, timeout, and bounded retry: `npm test -- scripts/ai-code-review/openrouter.test.mjs`.
- Repository completion gate passes with provider transport and composite scaffolding: `npm run verify`.

## Phase 3: GitHub workflow and publication

### Overview

Connect events to the action and make publication repeatable, scoped, and freshness-aware.

### Changes Required:

#### 1. Trusted workflow

**File**: `.github/workflows/ai-code-review.yml`

**Intent**: Review the approved event set without exposing credentials to PR-controlled execution or duplicating existing application CI.

**Contract**: `pull_request_target`, target `main`, event types `opened`, `synchronize`, `reopened`, `ready_for_review`, and `labeled`. The job-level condition admits only same-repository non-draft PRs and either a non-label event or exactly `ai-cr:review`. Recheck eligibility through the API before effects. Use trusted SHA checkout, no persisted checkout credentials, Node 24 consistent with `.nvmrc`, minimal job permissions, guarded PR concurrency, and a 10-minute timeout. Pass the dedicated secret and repository model variable to the local action. Do not change `.github/workflows/ci.yml` or require application environment values in this job.

#### 2. GitHub transport and publication state

**Files**: `scripts/ai-code-review/github.mjs`, `scripts/ai-code-review/report.mjs`, `scripts/ai-code-review/run.mjs`

**Intent**: Acquire complete input and maintain an honest latest assessment without overwriting unrelated PR metadata.

**Contract**: Use GitHub API metadata/file/diff reads with bounded responses, pagination, per-request deadlines, and completeness checks from Phase 1. Capture a stable head/base/metadata snapshot. Provision missing labels idempotently: `ai-cr:failed` red `d73a4a`, `ai-cr:passed` green `0e8a16`, and `ai-cr:review` blue `1d76db`; normalize the two owned outcome-label colors. Handle create conflicts by rereading, not failing unnecessarily.

Find the marked summary by marker `<!-- ai-cr:summary:v1 -->` AND verified GitHub Actions bot ownership, with comment pagination. Never edit a user-authored comment merely containing the marker. Render bounded Markdown, escape model-supplied markup/mentions, and include scores, locally calculated verdict/average, reviewed SHAs, model, available usage, and evidence limitations. No unbounded provider text or secrets appear in comments or logs.

Use individual label removals/additions and preserve unrelated labels. Consume the request label only when an eligible run accepts the request; clear stale outcome labels before paid work and publish pending state. On success, follow the freshness/publication sequence above. On failure/unavailable input, remove outcomes and update the same summary with a safe reason and retry guidance, then fail the optional job. A valid quality failure publishes `ai-cr:failed` and exits successfully. Skipped or superseded runs make no paid request when detectable beforehand and do not overwrite a newer result.

GitHub-token-generated label events do not normally trigger another workflow; the documented retry path is a human adding the label. Outcome-label events must never launch inference, even if delivered by another token. Repeated delivery or a rerun may repeat inference, but must not duplicate the marked comment or leave opposing labels; a durable exactly-once inference ledger is outside scope.

#### 3. Orchestration and publication tests

**Files**: `scripts/ai-code-review/github.test.mjs`, `scripts/ai-code-review/run.test.mjs`, `scripts/ai-code-review/report.test.mjs`

**Intent**: Verify the integration's trust and failure boundaries with controlled API fixtures.

**Contract**: Cover fork/draft/closed/retargeted skips, accepted retry consumption, unrelated label events, missing config, comment ownership/pagination, label preservation, both verdicts, unsupported input without provider calls, stale head/base/body before and after inference, detected post-write staleness, provider failure, and partial GitHub publication failures followed by recovery. Assert that no fixture can cause PR code execution, shell interpolation, or secret/raw-diff logging.

### Success Criteria:

#### Automated Verification:

- Review integration tests pass without network calls: `npm test -- scripts/ai-code-review`.
- Workflow syntax and action references pass `actionlint .github/workflows/ai-code-review.yml`; the composite metadata passes `npx prettier --check .github/actions/ai-code-review/action.yml`.
- Repository completion gate passes with workflow integration: `npm run verify`.

## Phase 4: Verification and setup guide

### Overview

Document deployment prerequisites and prove the user-visible workflow on representative PRs after configuration.

### Changes Required:

#### 1. Setup and operational documentation

**Files**: `.github/actions/ai-code-review/README.md`, `README.md`

**Intent**: Make the action usable with owner-selected models and explicit operational expectations.

**Contract**: Add a dedicated AI-review section linking to action setup. Document required `OPENROUTER_API_KEY`, required concrete `AI_REVIEW_MODEL`, schema/context compatibility, a dedicated key spending cap configured by the owner, fixed limits, model-change calibration, event/draft/fork behavior, label retry, unavailable results, advisory job semantics, and safe diagnostics. State that 4,000 tokens may include reasoning and that selecting a cheap model does not establish acceptable review quality.

Document GitHub permission/event policy prerequisites for `pull_request_target`, including any repository policy that blocks the trigger. Require verification of policy before rollout; do not silently switch to a PR-controlled workflow or relax repository policy. The workflow must exist on the default branch before production events can exercise it. Validate in a disposable test repository if needed before merging trusted workflow code. Confirm the review check remains optional in branch protection.

Document rollback by disabling only the review workflow and removing the two outcome labels from affected PRs; retain summaries as historical records and optionally revoke the dedicated key. No database migration is involved. Existing application CI continues unchanged.

#### 2. Evidence of completion

**File**: `context/changes/ci-cd-code-review/verification.md`

**Intent**: Distinguish local correctness from real GitHub/OpenRouter readiness.

**Contract**: Record automated commands and outcomes, tested workflow revision/model, sample-PR/run links, observed retry/comment/label behavior, and any blocked rollout prerequisite. Record only redacted metadata. Never mark live checks complete based only on mocked tests; missing credentials, policy access, or a representative model remain explicitly pending manual checks.

### Success Criteria:

#### Automated Verification:

- Final repository completion gate passes: `npm run verify`.
- Final workflow and document checks pass: `actionlint .github/workflows/ai-code-review.yml` and `npx prettier --check .github/actions/ai-code-review README.md context/changes/ci-cd-code-review/verification.md`.

#### Manual Verification:

- Owner configures the dedicated capped OpenRouter key and compatible model, verifies the GitHub event policy, and confirms AI review is not a required merge check.
- Representative non-draft same-repository PRs show useful scored summaries; new commits and human retry-label additions update the same comment and maintain only one outcome label.
- Draft/fork skips and unavailable/error cases show the documented behavior; logs contain no credentials or raw review input, and disabling the workflow leaves application CI operational.

**Implementation Note**: Local implementation may proceed through the automated phases without live credentials. Completion requires the Phase 4 manual checks; leave them pending until a human verifies them. This plan does not authorize publishing PR comments or configuring external services during planning.

## Testing Strategy

### Unit Tests:

Use Vitest for score boundaries, strict schema validation, input completeness, safe Markdown rendering, and provider error classification. Include an average exactly 6, a sum of 35, and a minimum exactly 3. Use synthetic diffs with entire omitted terminal hunks/files, not just invalid trailing bytes. Test multibyte text against the byte cap independently of the description character cap.

### Integration Tests:

Inject fake GitHub/OpenRouter transports and clocks into orchestration. Verify ordering (clear outcomes, pending summary, infer, freshness check, final summary, label), cancellation/supersession behavior, bounded retries, no paid calls for unsupported input, and recovery after each publication step fails. Score/transport tests must remain deterministic and offline; a real model is not a test oracle for exact numeric scores.

### Manual Testing Steps:

1. Configure a disposable repository or the merged trusted workflow with the capped key and an explicit model. Confirm the review job is optional and application CI remains independent.
2. Open a small representative text-only PR. Inspect usefulness, score explanations, SHA/model attribution, limits, and outcome label. Use offline fixtures to prove precise verdict thresholds rather than requiring a model to emit a particular score.
3. Push a new commit, then add `ai-cr:review` after completion. Confirm the request label is consumed and the same summary is updated; unrelated labels remain.
4. Exercise a draft and a fork without paid calls. Use a binary/oversized PR and controlled missing-model/error setup to verify unavailable/error reporting and stale-label removal.
5. Exercise a superseded in-flight result using controlled fixtures and inspect a real update run; record that atomic freshness cannot be guaranteed by GitHub's separate APIs.
6. Review sanitized logs and disable/re-enable the review workflow to verify the rollback path. Record evidence without credentials or raw provider payloads.

## Performance Considerations

The action makes bounded API calls and at most two inference attempts per accepted run. The description limit is 8,000 code points, diff limit 102,400 bytes, provider response limit 256 KiB, and model output limit 4,000 tokens. Each inference attempt is limited to 90 seconds with at most 10 seconds between attempts. The 10-minute job timeout also bounds GitHub operations and setup. Enforce smaller per-GitHub-request timeouts and bounded pagination in the implementation so failures leave time for cleanup.

Per-PR serialization reduces publication races; superseded queued work exits before inference. It does not guarantee exactly one billable request per commit. Model pricing, reasoning overhead, tokenization, and provider-side continuation after client timeout vary; the configured key cap remains the cumulative spending control.

## Migration Notes

No application/data migration is required. Introduce the trusted workflow and action on the default branch, then enable it only with the required repository secret, model variable, event policy, and optional-check configuration. Provision the three action-owned labels idempotently. Do not copy credentials into source or application configuration.

The original research remains a historical baseline: this plan resolves its open questions and supersedes provider proposals. `context/foundation/roadmap.md` has no item with Change ID `ci-cd-code-review`, so no roadmap status is changed.

## References

- [Requirements](requirements.md) and [research](research.md).
- Existing CI: `.github/workflows/ci.yml:3`; completion gate: `package.json:15`; test discovery: `vitest.config.ts:12`; script lint rules: `eslint.config.js:74`.
- [GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target) and [trusted event security/policy](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).
- [GitHub PR API](https://docs.github.com/en/rest/pulls/pulls), [comment API](https://docs.github.com/en/rest/issues/comments), and [label API](https://docs.github.com/en/rest/issues/labels).
- [GitHub token-trigger behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
- [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), and [API overview](https://openrouter.ai/docs/api_reference/overview).
- [OpenRouter errors](https://openrouter.ai/docs/api_reference/errors-and-debugging), [reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens), and [credit limits](https://openrouter.ai/docs/api_reference/limits).

## Progress

> Convention: pending rows are completed only after verification; append the closing commit SHA when implementation lands. Step titles remain stable.

### Phase 1: Review contract and tests

#### Automated

- [x] 1.1 Contract and input fixtures pass: `npm test -- scripts/ai-code-review/contract.test.mjs scripts/ai-code-review/input.test.mjs`. — 211f4d4
- [x] 1.2 Repository completion gate passes with the new test discovery: `npm run verify`. — 211f4d4

### Phase 2: OpenRouter review action

#### Automated

- [ ] 2.1 Mocked provider tests pass for valid JSON, HTTP-200 errors, invalid schema, refusal, output/body limits, timeout, and bounded retry: `npm test -- scripts/ai-code-review/openrouter.test.mjs`.
- [ ] 2.2 Repository completion gate passes with provider transport and composite scaffolding: `npm run verify`.

### Phase 3: GitHub workflow and publication

#### Automated

- [ ] 3.1 Review integration tests pass without network calls: `npm test -- scripts/ai-code-review`.
- [ ] 3.2 Workflow syntax and action references pass `actionlint .github/workflows/ai-code-review.yml`; the composite metadata passes `npx prettier --check .github/actions/ai-code-review/action.yml`.
- [ ] 3.3 Repository completion gate passes with workflow integration: `npm run verify`.

### Phase 4: Verification and setup guide

#### Automated

- [ ] 4.1 Final repository completion gate passes: `npm run verify`.
- [ ] 4.2 Final workflow and document checks pass: `actionlint .github/workflows/ai-code-review.yml` and `npx prettier --check .github/actions/ai-code-review README.md context/changes/ci-cd-code-review/verification.md`.

#### Manual

- [ ] 4.3 Owner configures the dedicated capped OpenRouter key and compatible model, verifies the GitHub event policy, and confirms AI review is not a required merge check.
- [ ] 4.4 Representative non-draft same-repository PRs show useful scored summaries; new commits and human retry-label additions update the same comment and maintain only one outcome label.
- [ ] 4.5 Draft/fork skips and unavailable/error cases show the documented behavior; logs contain no credentials or raw review input, and disabling the workflow leaves application CI operational.
