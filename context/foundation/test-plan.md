# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-10-05

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in an area"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is produced
   by `/10x-research` during each rollout phase. If the plan and research
   disagree about where the failure lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`.

## 2. Risk Map

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | After submitting text, a user receives no flashcard proposals. | High | High | PRD US-01, FR-001–002; interview Q1; hot-spot directories `src/pages`, `src/components`, `src/lib` (30d scan) |
| 2 | An invalid AI-provider response ends the flow without a clear user message or safe state. | High | High | roadmap S-01 provider decision; interview Q3–Q4 |
| 3 | A user can access another user's source text, sets, or flashcards. | High | Medium | PRD guardrails and NFR; roadmap F-01 |
| 4 | Accepting or saving proposals loses, corrupts, or mixes selected flashcards. | High | Medium | PRD US-01, FR-003; roadmap S-02; hot-spot directories `src/pages`, `src/lib` (30d scan) |
| 5 | Generated proposals violate product rules for count, duplication, or usable answers. | Medium | High | PRD Business Logic; interview Q4; hot-spot directories `src/lib`, `src/pages` (30d scan) |
| 6 | Unauthorized or repeated generation requests expose data or create uncontrolled AI-provider cost. | High | Medium | PRD Access Control and NFR; tech-stack.md: auth + AI |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | A valid submission reaches a visible proposal result. | A submitted request necessarily produces usable UI state. | Request boundary, session state, response contract. | integration | happy-path-only |
| #2 | Provider failure produces a clear recoverable outcome and no misleading saved result. | Any error response is safe and understandable. | Provider boundary, error translation, persisted state. | integration | over-mocking internals |
| #3 | A signed-in user can access only resources they own. | Authentication alone proves ownership. | Ownership rule, data boundary, session shape. | integration | testing only logged-in happy paths |
| #4 | Accepted cards persist exactly as chosen or the user sees a truthful failure. | Success status proves every intended side effect. | Save contract, transaction behavior, fixture source. | integration | brittle ordering |
| #5 | Outputs violating agreed limits are marked or rejected before saving. | Provider output is automatically product-valid. | Product rules, normalization, source of truth. | unit + integration | implementation mirror |
| #6 | Requests without valid authority cannot read data or repeatedly trigger costly work unchecked. | Client-side controls protect the server. | Auth boundary, rate/cost guard, external side effect. | integration | client-only assertions |

## 3. Phased Rollout

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Generation resilience | Prove that generation succeeds visibly or fails safely and clearly. | #1, #2, #5 | unit + integration | change opened | testing-generation-resilience |
| 2 | Private and durable save | Prove data ownership and accurate persistence around accepted proposals. | #3, #4, #6 | integration | not started | — |
| 3 | Critical-flow confidence | Add the least-cost browser-level proof and lock the required test floor. | cross-cutting | selective e2e + gates | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | 5.0.1 | Configured for Node tests under `src/**/*.test.ts`. |
| API mocking | none yet — see Phase 1 | — | Choose only after the provider boundary is grounded. |
| e2e | none yet — see Phase 3 | — | Add only where integration cannot prove the critical flow. |

**Stack grounding tools (current session):**
- Docs: none — no documentation MCP available; checked: 2026-10-05
- Search: none — no search MCP available; checked: 2026-10-05
- Runtime/browser: browser automation — available for selective critical-flow validation, not used yet; checked: 2026-10-05
- Provider/platform: none — no GitHub, Cloudflare, or Supabase MCP available; checked: 2026-10-05

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required | syntactic and type drift |
| unit + integration | local + CI | required after §3 Phase 1 | logic and boundary regressions |
| e2e on critical flow | CI on PR | required after §3 Phase 3 | broken user-facing flow across browser boundaries |

## 6. Cookbook Patterns

### 6.1 Generation success and provider-failure tests

TBD — see §3 Phase 1 for generation-result and recoverable-error patterns.

### 6.2 Private data and proposal-save tests

TBD — see §3 Phase 2 for ownership and accurate-persistence patterns.

### 6.3 Critical browser-flow test

TBD — see §3 Phase 3 for the minimum browser-level regression pattern.

### 6.4 Per-rollout-phase notes

TBD — added as rollout phases ship.

## 7. What We Deliberately Don't Test

- **Marketing UI snapshots** — low signal for the main user flow. Re-evaluate if marketing becomes a conversion-critical surface. (Source: Phase 2 interview Q5.)
- **Rare administrative tools** — small trusted audience and low current blast radius. Re-evaluate if their use or permissions expand. (Source: Phase 2 interview Q5.)
- **Visual details without main-flow impact** — prioritize behavioral protection. Re-evaluate if a visual defect can block task completion. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-10-05
- Stack versions last verified: 2026-10-05
- AI-native tool references last verified: 2026-10-05

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
