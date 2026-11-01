# Automated PR Code Review — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Add advisory AI reviews to pull requests targeting `main`, with six explicit scores and a predictable pass/fail rule.
Use OpenRouter so the owner can select a cheaper compatible model without changing workflow code.

## Starting Point

Application CI already runs lint, type checks, Vitest, and build. No AI review workflow or composite action exists.
The review will use separate credentials and remain independent of the application’s Supabase/Gemini integration.

## Desired End State

Eligible PRs receive one updated summary with scores, explanations, reviewed commit, model, and an outcome label.
New commits and a human-added retry label can request another review. Unavailable reviews never produce a quality verdict.
The review is advisory and does not become a required merge check.

## Key Decisions Made

| Decision         | Choice                                                                                               | Why                                                           | Source              |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------- |
| Provider         | Direct OpenRouter API; required `AI_REVIEW_MODEL` variable and dedicated `OPENROUTER_API_KEY` secret | Owner controls model cost; no automatic model fallback        | Plan                |
| Architecture     | Separate workflow, local composite, trusted Node helpers                                             | Keeps workflow readable and PR content treated as data        | Requirements + Plan |
| Eligibility      | Same-repository, open, non-draft PRs to `main`                                                       | Limits initial scope and draft spending                       | Plan                |
| Triggers         | Open, new commits, reopen, ready-for-review; manual `ai-cr:review`                                   | Follows code updates; title/body-only edits need manual retry | Plan                |
| Inputs           | Title, up to 8,000 description code points, complete diff up to 100 KiB                              | Adds intent context with bounded input                        | Plan                |
| Request limits   | 4,000 output tokens; 90 seconds per attempt; one transient retry, at most 10 seconds wait            | Bounds usage without inventing a dollar guarantee             | Plan                |
| Scoring          | Six integer scores, 1–10; fail if any ≤3 or sum <36                                                  | Implements the exact average/minimum rule locally             | Requirements + Plan |
| Incomplete input | No verdict or outcome label; unavailable explanation and failed optional job                         | Prevents partial evidence from appearing complete             | Plan                |
| Merge behavior   | Quality fail is advisory and publishes successfully; operational errors fail the optional job        | Makes outages visible without blocking delivery               | Plan                |
| Publication      | One bot-owned summary; consume accepted retry label; replace only AI outcome labels                  | Avoids comment noise and preserves unrelated metadata         | Plan                |
| Freshness        | Check head/base and metadata; discard superseded output                                              | Reduces stale results; GitHub writes remain non-atomic        | Research + Plan     |

## Scope

**In scope:** Workflow/action, OpenRouter transport, strict validation, input-completeness checks, labels/comments, offline tests, setup and rollout evidence.

**Out of scope:** Forks/drafts, partial-diff verdicts, binary analysis, required merge gates, deployment, code execution/edits, repository-wide retrieval, business/architecture scoring, automatic model selection.

## Architecture / Approach

A guarded `pull_request_target` workflow checks out trusted default-branch code and invokes the composite action.
Helpers fetch PR input as data, call OpenRouter without tools, validate the response, compute the verdict, and publish.
Clear prior outcome labels before inference; publish the summary before its label. Use PR-specific serialization and freshness checks.

## Phases at a Glance

| Phase                              | What it delivers                                           | Key risk                                               |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 1. Review contract and tests       | Score/schema rules, completeness checks, boundary fixtures | Incorrect verdict or unnoticed truncated diff          |
| 2. OpenRouter review action        | Configurable bounded transport and composite interface     | Provider errors or output exhaustion                   |
| 3. GitHub workflow and publication | Events, trusted execution, one summary, labels/retry       | Stale results and partial publication                  |
| 4. Verification and setup guide    | Required checks, configuration instructions, live evidence | Missing credentials, model compatibility, event policy |

**Prerequisites:** Node 24 and dependencies for local tests; `actionlint` for workflow validation. Live rollout requires a capped OpenRouter key, explicit compatible model, permitted GitHub event policy, and trusted workflow on the default branch.
**Estimated effort:** Roughly 3–5 focused implementation sessions plus owner configuration and sample-PR validation; not a delivery commitment.

## Open Risks & Assumptions

- Model selection and the spending-cap amount are owner-controlled setup values; no default model is assumed. Token limits are not dollar ceilings.
- Reasoning can consume the 4,000-token budget. Invalid/truncated output remains an operational error, without an automatic budget increase.
- GitHub writes are non-atomic; SHA attribution and checks reduce races. If GitHub is unavailable, cleanup may also fail until retry.
- Draft/closed transitions do not start cleanup runs; retained summaries are historical. Forks and manual draft requests are skipped.
- Repository event policy and live credentials were not inspected. Offline tests cannot establish rollout readiness or model review quality.

## Success Criteria (Summary)

- Exact verdict boundaries, provider errors, incomplete input, and publication recovery pass offline tests and `npm run verify`.
- Live sample PRs confirm useful reviews, one updated summary, correct labels, and reusable manual retries.
- Owner verifies spending controls, optional-check status, safe logs, and rollback without affecting application CI.
