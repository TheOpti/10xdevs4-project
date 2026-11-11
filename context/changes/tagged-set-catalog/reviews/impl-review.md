<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Tagged Set Catalog

- **Plan**: context/changes/tagged-set-catalog/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Updated after authorized triage on 2026-11-11: F1–F4 fixed. Original findings and initial-run evidence below are retained for audit history.

## Findings

### F1 — Saving tags silently clears an unadded label

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/flashcards/SetTagEditor.tsx:25; src/lib/tag-editor-state.ts:82
- **Detail**: Type a label and click Save tags without first clicking Add tag (also possible after adding another label). The request includes only draftTags. A successful response rebuilds the state with initialTagState, clearing the input and reporting “Tags saved.” The typed label is silently lost. Explicit Add is intentional, but silently clearing unsubmitted text is avoidable.
- **Fix**: Guard Save when input is nonempty, retain the text and explain that Add tag must be used first; cover this interaction with a regression test.
- **Decision**: FIXED — save guard preserves and focuses unadded input with guidance. Browser regression passes for first and second unadded labels, with zero PATCH requests before Add tag.

### F2 — Malformed URL encodings become selected tags

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/flashcard-views.ts:21
- **Detail**: The Phase 2 contract resets malformed filter parameters to All sets. URLSearchParams decodes forgivingly: ?tag=%ZZ becomes %ZZ and ?tag=%FF becomes the replacement character. normalizeTag accepts these as %zz and �, so the catalog displays no matches and propagates the malformed-derived filter. Both Astro routes pass searchParams, losing raw encoding evidence. Existing tests cover blank, repeated, conflicting and oversized values but not invalid percent escapes/UTF-8.
- **Fix**: Pass the raw query to the shared parser and validate filter-component decoding before normalization; test malformed encodings while retaining valid encoded percent signs and Unicode tags.
- **Decision**: FIXED — both Astro routes pass the raw query; strict decoding supplies the actual parameter keys/values. Ten unit cases and a production-preview browser regression pass.

### F3 — Integration checks are blocked and manual completion lacks recorded evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/tagged-set-catalog/plan.md:175
- **Detail**: Progress marks all 8 criteria complete. This review reproduced the completion gate, but database tests could not connect to 127.0.0.1:54322 and Playwright global setup could not inspect the local Supabase container because Docker's Linux engine pipe is absent. The checked manual rows 2.3 and 3.3 cite commits without an observable manual verification record. The browser suite covers obsolete-tag recovery, but not keyboard/narrow-screen/card-draft coexistence or two-tab last-write behavior. This does not establish that the earlier checks failed; it leaves current integration validation and the manual claims unconfirmed.
- **Fix**: Restore the local Docker/Supabase environment, rerun database and both browser suites, and record observations for keyboard/mobile/card-draft and two-tab scenarios.
- **Decision**: FIXED — local Supabase available; SQL, both browser suites and npm run verify pass. Reproducible browser scenarios and inspected screenshots now supply evidence for the previously undocumented manual claims; see follow-up verification below.

### F4 — Empty catalogs hide the selected filter and its recovery action

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/Dashboard.tsx:42
- **Detail**: With zero owned sets, /dashboard?tag=obsolete enters No sets yet before rendering the filter controls. The selected unused tag and Clear filter action are absent, as is Untagged. Phase 2 promises recoverable unused-tag URLs and an available Untagged choice without a zero-set exception. The separate empty-catalog message itself is appropriate.
- **Fix**: Render filter selection/recovery outside the zero-set branch while retaining the distinct No sets yet message.
- **Decision**: FIXED — filter controls now render for every ready catalog, including zero sets. All sets shows No sets yet; active tag/untagged filters show No matching sets and Clear filter. Three server-rendered component regressions verify selected values, recovery links and distinct empty states.

## Scope and implementation coverage

- Clean worktree at review start; reviewed ecc5d6c..28ae78b, identified by feature-specific commits 05d880a, eb82ac5 and 8d1284e plus closeout. The plan filename has no date, so feature history was used instead of a date-derived range.
- Canonical Progress: 8/8 complete, current phase 3. Reviewed every completed phase. No lessons.md exists.
- All 23 changed files were covered by two parallel reviews (plan drift and safety/patterns). Repository/API, middleware, SQL migration and tests implement the planned bounded tags, normalized replacement, request-scoped ownership and sanitized errors. No concrete cross-user access or injection defect was found.
- Catalog reads once, derives owner-only choices, preserves ordering/empty sets, and uses fixed local navigation. Tag/card editors are separate islands. URL and zero-set exceptions are F2/F4.
- Planned fixture and E2E source covers overlapping tags, untagged/empty sets, persistence, refresh, navigation, last-tag removal, clearing and failed-save retry. Cleanup targets created IDs.
- Additional state-helper files and tests support the planned editor. Roadmap and plan/change metadata are completion bookkeeping; no forbidden feature expansion was found. No wholly missing phase or unexplained production file addition was found.
- Compared endpoint/body/auth patterns with existing card mutations, repository/RLS patterns and editor state conventions. No material pattern mismatch was identified.

## Verification evidence

| Command | Result | Observed output |
|---------|--------|-----------------|
| npm run verify | PASS, exit 0 | ESLint: 0 errors, 3 existing no-console warnings in openrouter.ts. Astro: 102 files, 0 errors/warnings/hints. Vitest: 21 files, 401 tests passed. Production build complete. Existing sitemap site-option warning. |
| npx supabase test db | BLOCKED, exit 1 | LegacyDbConnectError: ECONNREFUSED 127.0.0.1:54322. |
| docker info --format '{{.ServerVersion}}' | BLOCKED, exit 1 | dockerDesktopLinuxEngine pipe: system cannot find the file specified. |
| npx playwright test tests/e2e/tagged-set-catalog.spec.ts tests/e2e/saved-card-editing.spec.ts --project=chromium --reporter=line | BLOCKED, exit 1 | Initial sandbox attempt: spawn EPERM. Escalated retry reached global setup, then seed-e2e-user.mjs failed at supabase status because Docker engine pipe was absent. No browser assertions ran. |

At initial review, the full Vitest run covered the Phase 1 normalization/repository/API tests and Phase 2 catalog/editor-state tests. SQL and E2E execution were blocked. Manual rows were inspected rather than re-enacted. These limitations were addressed in the authorized follow-up below. Progress checkboxes remain unchanged.

## Follow-up verification — 2026-11-11

Final gate after F4: `npm run verify` PASS (exit 0), 103 Astro files with no diagnostics, 22 Vitest files / 414 tests passed and production build complete. The first attempt repeated the source-map-js config-loading error noted below; the complete rerun passed. F4 regressions render the actual Dashboard component for empty All sets, unused-tag and Untagged states. Earlier SQL/E2E results below remain the F1–F3 evidence; those suites were not rerun for the F4 rendering-only change.

- `npm run verify`: PASS (exit 0), 102 Astro files with no errors/warnings/hints, 21 Vitest files / 411 tests passed, production build completed. Existing three no-console lint warnings and sitemap configuration warning remain.
- `npx supabase test db`: PASS (exit 0), 3 files / 72 tests, including actual RLS and tag constraints.
- `npx playwright test tests/e2e/tagged-set-catalog.spec.ts tests/e2e/saved-card-editing.spec.ts --project=chromium --reporter=line --workers=2`: PASS (exit 0), 10 tests including authentication setup, in 13.4 seconds.
- Initial browser run caught production tree-shaking of a validation-only decoding call. The final parser uses strict decoding results directly; malformed catalog and detail URLs pass against the production preview.
- One intermediate completion-gate run failed loading Astro config with `require is not defined` in source-map-js. The complete rerun passed without dependency/configuration changes. It is recorded as a transient tooling failure, not a skipped gate.

### Observations for Progress 2.3

At 375 × 812, a real browser test entered an unsaved card answer, added tags with Enter, moved to Save tags with Tab and saved with Enter. The card answer retained `Keep this card draft`; Tags saved appeared. Both unadded-label cases preserved the input, focused it and sent no PATCH request. The filter was focused and changed using Home/ArrowDown/Enter, navigating to `?untagged=1`. Both pages had document width no greater than viewport width.

Screenshots were captured and visually inspected: [tag editor and card draft](evidence/narrow-tag-editor.png), [narrow catalog filter](evidence/narrow-filter.png). The editor full-page capture includes the sticky navigation at its scrolled position; this capture artifact is not evidence of fixed-position overlap at the page top. These are agent-run browser observations and visual checks, not a claim of a separate human usability session.

### Observations for Progress 3.3

Two browser tabs loaded the same initial set before either saved. Tab A saved a unique tag; stale tab B then saved `last writer`. Reloading A showed exactly `last writer`, proving replacement by the last successful write. Visiting the now-obsolete unique-tag URL showed No matching sets; Clear filter restored the fixture in the catalog. The dedicated regression passed, along with existing persistence, failure/retry and saved-card-editing tests.
