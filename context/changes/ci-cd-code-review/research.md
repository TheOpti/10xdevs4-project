---
date: 2026-11-01T22:49:47.9911148+01:00
researcher: Codex
git_commit: 8a519657e7a0e92abcd75b657f2a7653931dea7a
branch: main
repository: TheOpti/10xdevs4-project
topic: "Automated PR code review based on ci-cd-code-review requirements"
tags: [research, github-actions, code-review, llm]
status: complete
last_updated: 2026-11-01
last_updated_by: Codex
last_updated_note: "Persisted research from this conversation; current requirements resolve the target branch to main."
---

# Research: automated PR code review

## Research Question

What existing code, GitHub contracts, and unresolved decisions affect implementing
`context/changes/ci-cd-code-review/requirements.md` as a workflow and composite action?
This document records repository and feasibility research, not an approved implementation plan or a live configuration audit.
Source paths below are repository-relative, except `requirements.md`, which refers to the adjacent file.

## Summary

The requested separation fits a new review workflow invoking a local composite action. Existing CI
already performs application validation; review can remain independent of its Supabase credentials
(`.github/workflows/ci.yml:9`, `requirements.md:4`). In the inspected `.github` inventory, the existing
configuration is `.github/workflows/ci.yml`; no review composite action was present.

The target branch is now settled: current requirements specify `main` (`requirements.md:3`), matching
the CI branch filters (`.github/workflows/ci.yml:3`). This supersedes the earlier finding that requirements
named `master`; the requirements changed during this conversation.

Scoring is specified sufficiently for deterministic validation and verdict calculation. Provider/model,
budget, operational-error behavior, fork support, and merge-blocking behavior remain planning decisions.
The existing Gemini adapter is a flashcard-specific precedent, not a selected CI provider
(`requirements.md:6`, `requirements.md:25`, `src/lib/gemini.ts:1`).

## Detailed Findings

### Existing CI and integration points

- `.github/workflows/ci.yml:3` filters push and PR events to `main`. Its job installs dependencies,
  synchronizes Astro, runs lint, type checks, Vitest, and a production build
  (`.github/workflows/ci.yml:13`). The build receives Supabase secrets (`.github/workflows/ci.yml:24`).
- The inspected complete workflow has no explicit permissions, concurrency, timeout, review publication,
  or deployment job (`.github/workflows/ci.yml:1`). A separate review workflow can declare its own
  permissions and dedicated provider secret.
- `package.json:15` defines the completion gate; `package.json:20` runs Vitest. Tests placed under
  `.github/actions/` would not match the current includes in `vitest.config.ts:12`. The Node-script
  ESLint override covers `scripts/**/*.mjs` and `.codex/hooks/**/*.mjs` (`eslint.config.js:74`).
  Helper placement and lint/test discovery therefore need an explicit choice.
- Proposed locations, not existing implementations: `.github/workflows/ai-code-review.yml` and
  `.github/actions/ai-code-review/action.yml`, with Node helpers for transport, validation, calculation,
  and publication. Composite actions support steps and inputs; a local action needs repository content
  available to the runner. [Composite action documentation](https://docs.github.com/en/actions/tutorials/create-actions/create-a-composite-action).

### Events, trust, and permissions

The minimum requirement implies `opened` plus `labeled`, with the latter gated on the event label being
`ai-cr:review` (`requirements.md:3`, `requirements.md:42`). Whether to add `synchronize`, `reopened`,
`edited`, or draft transitions is not specified. Explicit event types avoid relying on defaults;
branch filters select the PR target branch.
[GitHub event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target).

Fork support affects architecture. A fork-triggered `pull_request` normally lacks provider secrets
and has a read-only token. A `pull_request_target` workflow can use trusted default-branch code for
commenting and labeling. The privileged path should not execute PR-head code, dependencies, scripts,
or a composite action loaded from the PR; fetch its diff as data through the API. A split privileged
publisher is an alternative, but downloaded artifacts remain untrusted data.
[GitHub trust model](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target).

The GitHub documentation consulted during this research describes a default public-repository policy
affecting `pull_request_target`, with enforcement scheduled for December 2, 2026 for affected repositories.
Actual repository policy was not inspected; verify it before choosing this trigger.
[Policy documentation](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target#default-policy-for-pull_request_target).

For a trusted local-action checkout, a candidate minimal job permission set is `contents: read` and
`pull-requests: write`. Comment create/update and label add/remove endpoints accept pull-request write
permission. Label provisioning also needs consideration. This proposal has not been exercised against
the repository's GitHub settings.
[Comments API](https://docs.github.com/en/rest/issues/comments),
[Labels API](https://docs.github.com/en/rest/issues/labels).

Design implications: pass title/body/diff as serialized data or files rather than interpolated shell code;
use a dedicated provider secret, bounded calls, and redacted diagnostics. Give the review model no command
execution capability. Treat its output as untrusted and validate it locally, even when structured
generation is requested.
[GitHub secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).

### Input and completeness

Title and diff are settled inputs; description inclusion is explicitly undecided (`requirements.md:8`).
GitHub exposes diff media output and a paginated changed-files endpoint; the latter documents a maximum
of 3,000 files. Planning should address incomplete responses, missing patches, binary changes, and input
limits rather than silently present a partial input as a complete review.
[Pull requests API](https://docs.github.com/en/rest/pulls/pulls).

Proposed behavior: capture base/head SHAs with the input, record the reviewed SHA in the summary, and
re-fetch PR state before publication. Discard or clearly mark superseded work when the head changes;
concurrency control alone does not establish freshness. Select input/output caps, deadline, retry budget,
and oversized-diff behavior before implementation. Description cost depends on the chosen model and
token usage; no price or cost estimate is established here.

The idiomaticity criterion explicitly refers to visible diff context (`requirements.md:19`). Diff-only
review cannot establish repository-wide abstraction reuse or unseen caller behavior. Summaries should
disclose this evidence limit. Broader repository context would be a separate scope decision.

### Scoring and operational errors

The mandatory keys are `implementationCorrectness`, `idiomaticity`, `complexity`, `testRiskCoverage`,
`documentation`, and `securitySafety` (`requirements.md:18`). For these six scores, the scale is 1–10;
fail when a score is at most 3 or their average is below 6 (`requirements.md:14`, `requirements.md:27`).
Business alignment and architectural fit remain deferred (`requirements.md:30`).

Proposed validator: require the complete named criterion set, finite numeric scores within the scale,
and bounded explanations. Calculate the verdict in code rather than trust an LLM-provided verdict.
Integer versus fractional scores is unspecified. Missing scores, malformed JSON, refusal, or timeout
must not become invented scores or a successful assessment.

Boundary cases derived from `requirements.md:27`, for exactly six valid scores:

- `[6,6,6,6,6,6]` passes: average 6 and minimum 6.
- `[3,10,10,10,10,10]` fails because the minimum is 3, despite its high average.
- `[5,6,6,6,6,6]` fails: sum 35 divided by 6 is below 6.

Operational failure is not defined as a quality verdict. Planning needs a separate error path,
including how a prior success label becomes visibly stale. Whether a quality failure should fail the
Actions job or block merging is also unspecified (`requirements.md:25`, `requirements.md:35`).

### Comments, labels, and retry

Requirements call for a summary comment, red `ai-cr:failed` or green `ai-cr:passed`, and retry when
`ai-cr:review` is added (`requirements.md:37`). Proposed publication contract: update a bot-owned marked
summary, include scores and reviewed SHA, remove the opposing outcome label, and preserve unrelated
labels. Additive and individual removal operations avoid replacing the full PR label collection.
Exact colors and pre-provisioning versus creation need specification.
[Labels API](https://docs.github.com/en/rest/issues/labels).

Removing the request label when a retry is accepted would allow it to be added for a later request;
this is a proposal, not a settled requirement. Filter on the triggering label to avoid launching reviews
for outcome-label events. Decide whether comments are updated or appended and how partial publication
failures are recovered. PR summary comments can use the issue-comment endpoints.
[Comments API](https://docs.github.com/en/rest/issues/comments).

### Existing provider precedent

`src/lib/gemini.ts:13` defaults to `gemini-2.5-flash-lite`; the route supplies an optional model override
and server-side key (`src/pages/api/flashcards/generate.ts:48`). The adapter uses native fetch, a system
instruction, JSON schema requests, and local parsing (`src/lib/gemini.ts:82`). This establishes an existing
integration pattern, not suitability of that model or availability of an Actions secret.

Its prompt/result schema are flashcard-specific. It filters invalid proposal entries
(`src/lib/gemini.ts:152`), whereas review requires the complete criterion set. Its inspected response path
does not check `finishReason`, and its generation configuration has no explicit output-token cap
(`src/lib/gemini.ts:102`, `src/lib/gemini.ts:126`). Review needs a separate validation contract.

## Architecture Insights

Keep event selection and permissions in the workflow, with review orchestration in the requested composite
action. Separate pure validation/verdict logic from provider and GitHub transport so boundary scores,
malformed output, incomplete inputs, stale results, retry, and partial publication can be tested without
paid model calls. This is a planning direction, not an approved implementation plan.

## Historical Context and Related Research

- `README.md:104` names `master`; the current workflow and updated requirements specify `main`
  (`.github/workflows/ci.yml:3`, `requirements.md:3`).
- `README.md:103` and `AGENTS.md:26` describe CI smoke execution; the inspected complete workflow does
  not run it. The smoke script still exists (`package.json:17`); these are separate claims.
- `AGENTS.md:30` says there is no standalone unit runner, contradicted by `package.json:20` and
  `vitest.config.ts:12`. Its completion-gate instruction remains applicable (`AGENTS.md:24`).
- `context/changes/llm-flashcard-generation/research.md:23` records a direct Gemini choice for flashcards
  and names a different model than the current default at `src/lib/gemini.ts:13`. Runtime override,
  availability, and historical pricing were not verified. This does not select the CI review provider.
- No `context/foundation/lessons.md` was present during research. Targeted searches of context Markdown
  for automated review and `ai-cr` surfaced this change and unrelated manual-review material, not another
  applicable automated-review decision. This is a bounded search result.

## Open Questions and Planning Handoff

The branch decision is settled as `main`. Remaining decisions:

1. Fork support and the permitted GitHub event/trust model.
2. Provider/model and dedicated secret; description inclusion; input/output limits, deadline, retry
   budget, and acceptable spend.
3. Automatic re-review events and draft policy; incomplete, binary, or oversized-diff behavior.
4. Integer versus fractional scores; operational-error comments/labels; advisory versus merge-blocking review.
5. Comment update versus append, retry-label consumption, label provisioning/colors, and stale-result handling.

Live GitHub settings, labels, secrets, branch protection, workflow runs, and provider behavior were not
inspected. Local analysis and official documentation establish feasibility, not deployment readiness.
The earlier read-only CI and provider/contract investigations completed; this persistence step reused
their findings and the follow-up verification rather than repeating discovery. No application tests,
builds, paid API calls, PR comments, or label changes were performed for this research.

## Code References

- `context/changes/ci-cd-code-review/requirements.md:3` — workflow and action requirements.
- `.github/workflows/ci.yml:3` — current CI triggers and validation job.
- `package.json:15`, `vitest.config.ts:12`, `eslint.config.js:74` — validation integration points.
- `src/lib/gemini.ts:82`, `src/pages/api/flashcards/generate.ts:48` — existing provider integration.

Source anchors refer to inspected local files; no remote commit permalinks are asserted. Bounded claims,
score calculations, superseded branch findings, and unresolved decisions were reviewed before saving.
No structured facts companion was requested, so the prose/JSON checker is not applicable.
