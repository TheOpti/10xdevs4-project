## Overall concept

- GHA workflow run for every new pull request to main
- composite action for the review itself so that main workflow is easy to reason about

## Input parameters

- pull request title
- pull request description (?? cost tradeoff)
- git diff

## Code Review Criteria

Each criterion is scored on a 1–10 scale, where 1 is the worst outcome and 10 is the best.

| # | Criterion | What is scored | Fail signal (score ≤ 3) |
|---|-----------|----------------|-------------------------|
| 1 | **implementationCorrectness** | Does the code do what it claims across all edge cases and error paths, with no silent regressions? | Logic is broken, obvious edge/error cases are missing, or existing behaviour silently regresses. |
| 2 | **idiomaticity** | Does it follow the language, framework, and repo conventions visible in the diff context? | Fights the language or framework, ignores project conventions, or duplicates abstractions that already exist. |
| 3 | **complexity** | Is the solution as simple as the problem allows — free of needless abstraction or over-engineering? | Unnecessarily convoluted, over-abstracted, or adds indirection that makes the code harder to follow without a clear benefit. |
| 4 | **testRiskCoverage** | Are the risky paths tested in proportion to their risk? | Risky new logic ships with no tests; happy path only, or tests that don't exercise the changed behaviour. |
| 5 | **documentation** | Are non-obvious decisions and public surfaces explained where a reader would need it? | Public APIs undocumented; surprising design choices left unexplained; comments missing where intent is opaque. |
| 6 | **securitySafety** | Does the change avoid introducing vulnerabilities, leaking secrets, or trusting untrusted input unsafely? | Exploitable flaw introduced, secret hard-coded or logged, or untrusted input used without validation/sanitisation. |

### Verdict rule

The overall verdict is **fail** when **any single criterion scores ≤ 3**, or when the **average across all six criteria is < 6**.  
Otherwise the verdict is **pass**.

## Parked for later

- business alignment (require broader context)
- architectural fit (require broader context)

## Expected side-effects

- PR comment with summary
- labels: `ai-cr:failed` (red) OR `ai-cr:passed` (green)

## Expected behavior

- on-demand retry when label `ai-cr:review` is added  