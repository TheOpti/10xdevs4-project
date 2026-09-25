<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Private Flashcard Data Access Implementation Plan

- **Plan**: context/changes/private-flashcard-data-access/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-25
- **Verdict**: APPROVED
- **Findings**: 0 critical 3 warnings 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — CI smoke step loses local Supabase credentials

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .github/workflows/ci.yml:57
- **Detail**: `API_URL` and `SERVICE_ROLE_KEY` are sourced only in the prior “Configure secrets for build and preview” step (lines 47–51). GitHub Actions gives the smoke step a fresh shell, so both variables are unset when it calls `npm run smoke`; `scripts/smoke.mjs:17-19` rejects the missing values. The Phase 3 CI-equivalent smoke criterion therefore cannot pass as written.
- **Fix**: Add `source supabase.env` before the preview/smoke commands, or persist the required variables through `$GITHUB_ENV` while keeping the service-role key scoped and masked.
- **Decision**: FIXED — source `supabase.env` inside the smoke-test step so its fresh shell receives the local API URL and service-role key.

### F2 — Local seed command can delete data in a remote project

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/seed.mjs:12
- **Detail**: The unplanned local-development seed commit accepts arbitrary `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then deletes and recreates its fixed user and fixture rows (`scripts/seed.mjs:51-69`). The README presents this as local mock data, but there is no locality guard. Exported hosted service-role credentials could therefore make `npm run seed` destructive against a remote project.
- **Fix A ⭐ Recommended**: Reject non-loopback Supabase URLs unless a deliberately named opt-in flag is supplied.
  - Strength: Makes the documented local-default workflow safe while retaining an explicit escape hatch for intentional remote testing.
  - Tradeoff: Remote seeding gains a confirmation-style configuration step.
  - Confidence: HIGH — the URL and command context are already available in the script.
  - Blind spot: We have not established whether a remote seed workflow is intentionally required.
- **Fix B**: Remove support for externally supplied credentials and use only the local CLI environment.
  - Strength: Eliminates the remote-destruction class completely.
  - Tradeoff: Removes any valid remote fixture workflow.
  - Confidence: MEDIUM — depends on intended developer operations.
  - Blind spot: No documented remote seed requirement was found.
- **Decision**: FIXED — reject non-loopback Supabase URLs unless `ALLOW_REMOTE_SEED=true` is explicitly set; documented the opt-in.

### F3 — Production build fails on the repository's required Node version

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: N/A (command execution)
- **Detail**: On Node v26.9.0, the same version configured in `package.json` and CI, `npm run build` exits 1 while loading Astro config: `source-map-js/lib/source-map-generator.js:11:17` raises `require is not defined`. This contradicts Phase 3 automated criterion 3.2. Lint and Astro type checking pass.
- **Fix A ⭐ Recommended**: Reproduce the toolchain incompatibility in a clean install and update or pin the incompatible Astro/Vite/source-map dependency combination to a Node 26-compatible release.
  - Strength: Preserves the declared Node 26 contract used by CI.
  - Tradeoff: Requires dependency-resolution investigation and lockfile changes.
  - Confidence: MEDIUM — the error is inside a transitive dependency, not an application module.
  - Blind spot: A clean CI runner has not been available locally to rule out installation corruption.
- **Fix B**: Change the supported Node/CI version to one compatible with the current dependency tree.
  - Strength: May restore builds with a narrow configuration change.
  - Tradeoff: Changes the repository runtime contract and may conflict with project requirements.
  - Confidence: LOW — compatibility with an earlier Node version was not verified.
  - Blind spot: No prior supported Node version is documented.
- **Decision**: FIXED — pinned the project, CI, local-version file, and operational documentation to Node 24.21.0; build, lint, and Astro check pass under Node 24.
