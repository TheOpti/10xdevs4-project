# Implementation review follow-ups

User authorized fixes F1, F2 and F3 on 2026-11-11, then also authorized F4 before committing.

Status: F1–F4 implemented. F1–F3 verification: 411 Vitest tests, 72 SQL tests, 10 Playwright tests and full completion gate passed. F4 adds three server-rendered component regressions. Evidence and final verification are recorded in `../reviews/impl-review.md`.

- F1: Guard tag saving when the input contains an unadded label, show guidance and focus the preserved input. Browser regression covers the first label and a second label after an existing draft tag.
- F2: Pass raw query strings from both Astro routes. Strictly decode query pairs before appending to URLSearchParams. Unit tests cover malformed percent/UTF-8 encodings and valid Unicode/percent labels; browser regression covers catalog selection and detail return links.
- F3: Restore local Supabase access; run SQL tests, the catalog and saved-card browser suites, and the completion gate. Record keyboard/narrow-screen/card-draft and two-tab observations in the review verification evidence.
- F4: Keep filter controls available for an empty catalog. Show the first-set prompt for All sets and recoverable No matching sets for an active filter.

Implementation note: the initial F2 validation-only decodeURIComponent call was removed by production tree-shaking. The final parser uses decoded keys and values directly, and the production-preview browser test exercises this path.
