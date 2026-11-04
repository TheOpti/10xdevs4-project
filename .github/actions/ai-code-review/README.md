# AI Code Review Action

A composite GitHub Action that performs advisory, automated pull-request code reviews using an owner-selected OpenRouter model.

The action analyzes the pull request metadata and unified diff against six predefined criteria, computes an advisory verdict locally, maintains a single bot-owned summary comment on the pull request, and sets an outcome label (`ai-cr:passed` or `ai-cr:failed`).

---

## Prerequisites and Setup

### 1. OpenRouter API Key

1. Create a dedicated API key at [openrouter.ai](https://openrouter.ai/).
2. **Configure a cumulative spending cap** for this dedicated key in the OpenRouter dashboard to guarantee hard spend limits.
3. In your GitHub repository settings, go to **Settings → Secrets and variables → Actions → Secrets**, and add:
   - Name: `OPENROUTER_API_KEY`
   - Value: `<your-openrouter-key>`

### 2. Selected Review Model

1. Select a concrete, structured-output-compatible model ID from OpenRouter (e.g. `openai/gpt-4o`, `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-chat`).
   - The model must support JSON schema structured outputs (`response_format: { type: "json_schema", strict: true }`).
   - **Do not use routing aliases** (such as `openrouter/auto`) or fallback lists.
   - **Reasoning tokens:** Note that models with internal reasoning tokens (e.g. `o1`, `o3-mini`, `r1`) consume output tokens from the fixed 4,000-token budget. If reasoning tokens deplete the budget, the output may be truncated and rejected.
   - **Model calibration:** Selecting a cheap model does not establish acceptable review quality. The repository owner should calibrate review utility on representative PRs when selecting or changing models.
2. In your GitHub repository settings, go to **Settings → Secrets and variables → Actions → Variables**, and add:
   - Name: `AI_REVIEW_MODEL`
   - Value: `<model-id>`

### 3. GitHub Permissions & Policy

- The workflow `.github/workflows/ai-code-review.yml` uses the `pull_request_target` event and requests minimal job permissions:
  - `contents: read`
  - `pull-requests: write`
- **Default branch requirement:** In GitHub Actions, `pull_request_target` always runs the workflow definition and action code from the repository's default branch (`main`). The workflow must be merged into `main` before it can run on pull requests.
- **Repository Actions policy:** Ensure that repository settings do not disable or restrict `pull_request_target` workflows.
- **Branch protection:** Confirm that `AI code review` is **not** configured as a required merge check in repository branch protection or rulesets.

---

## Operational Behavior

### Event Triggers

The review workflow runs on non-draft pull requests targeting `main` from the same repository for the following events:

- `opened`
- `synchronize` (new commit pushed)
- `reopened`
- `ready_for_review`
- `labeled` with `ai-cr:review` (added by a human user)

### Excluded / Skipped Workflows

- **Forked repositories:** Fork PRs are skipped to protect repository secrets and credentials.
- **Draft pull requests:** Draft PRs are ignored until marked ready for review.
- **Title/body-only edits:** Edits to the PR title or description alone do not trigger an automatic review. To trigger a review after updating title/body, apply the `ai-cr:review` label.

### Manual Review & Retry via Label

Adding the `ai-cr:review` label to an eligible open PR queues an on-demand review. Once the workflow begins processing the eligible request, it automatically removes ("consumes") the label so it can be re-added later. Adding `ai-cr:review` to a draft PR is ignored and the label is preserved until the PR becomes eligible.

### Budget & Evidence Limits

To ensure predictable latency, cost, and reliability, the action enforces strict boundaries:

- **PR Description:** Up to 8,000 Unicode code points. If longer, a disclosed excerpt is used.
- **PR Diff:** Up to 102,400 UTF-8 bytes (100 KiB) and 3,000 changed files. The diff must be complete and textual.
- **Unsupported Input:** Binary files, submodule changes, mode-only changes, or diffs exceeding the 100 KiB cap are marked **Review unavailable**. The action never guesses based on partial or truncated diffs.
- **Provider Response Cap:** 256 KiB response body cap.
- **Output Token Cap:** At most 4,000 tokens requested per attempt.
- **Request Timeout:** 90 seconds per attempt.
- **Retry Budget:** At most 1 retry for transient network errors or HTTP 408/429/5xx, with a maximum 10-second wait.
- **Workflow Timeout:** 10 minutes total job timeout.

---

## Scoring Contract and Verdict

The model evaluates six criteria on a 1–10 integer scale (where 10 is always the best possible score):

1. `implementationCorrectness`
2. `idiomaticity`
3. `complexity`
4. `testRiskCoverage`
5. `documentation`
6. `securitySafety`

### Verdict Calculation

The verdict is **calculated locally** by the review runner, never trusted from model output:

- **Pass (`ai-cr:passed`):** Every criterion score is at least 4, **and** the sum of all six scores is at least 36 (an average of 6.0 or higher).
- **Fail (`ai-cr:failed`):** Any score is 3 or lower, **or** the sum of all six scores is below 36.

### Advisory Job Semantics

- **Quality Failures:** When code fails the review criteria, `ai-cr:failed` is attached and the summary comment details the issues, but the **GitHub Actions workflow run finishes successfully**. This prevents an advisory AI opinion from blocking CI or development.
- **Operational Failures / Unsupported Input:** If GitHub is unreachable, OpenRouter fails, or the PR exceeds size/format limits, the summary comment is updated with a safe diagnostic explanation, outcome labels are removed, and the optional Actions job fails.

---

## Comment and Label Lifecycle

1. **Labels:**
   - `ai-cr:passed` (Green `#0e8a16`): The latest reviewed commit passed all scoring criteria.
   - `ai-cr:failed` (Red `#d73a4a`): The latest reviewed commit failed one or more criteria.
   - `ai-cr:review` (Blue `#1d76db`): On-demand review trigger.
2. **Bot Comment:**
   - Marked with `<!-- ai-cr:summary:v1 -->` and authored by `github-actions[bot]`.
   - Exactly one comment is maintained per PR; subsequent runs update the existing comment in-place.
   - Contains reviewed commit SHAs, model attribution, criteria breakdown, and evidence boundaries.

---

## Diagnostics and Log Safety

- The action redacts sensitive tokens and secrets. Raw API tokens, raw git diffs, and raw provider payloads are never logged to standard output or published in comments.
- Error reports in comments summarize operational failures safely without exposing internal network traces or sensitive configuration.

---

## Rollback Procedure

If the automated review workflow needs to be paused or decommissioned:

1. **Disable the workflow:** Go to **Actions → AI code review → "..." → Disable workflow**.
2. **Clean up PR labels:** Remove `ai-cr:passed` and `ai-cr:failed` from open pull requests if desired.
3. **Revoke the key:** In [openrouter.ai](https://openrouter.ai/), revoke or disable the dedicated API key.
4. Existing summary comments remain as historical records and require no cleanup.
5. Application CI (`.github/workflows/ci.yml`) is completely decoupled and will continue operating normally.
