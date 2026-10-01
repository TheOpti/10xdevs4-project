# Pasted Text Flashcard Proposals — Plan Brief

> Full plan: `context/changes/pasted-text-proposals/plan.md`

## What & Why

Memoro needs its first end-to-end creation journey before selecting a real AI provider. This change lets an authenticated user create a private set from pasted text and see a predictable demo proposal, validating navigation, persistence, validation, and the review-screen shape without provider cost or credentials.

## Starting Point

F-01 already provides private, RLS-protected sets and sources plus an atomic server repository operation. The dashboard is protected but its "New set" button is inert; its visual mock includes later review controls that must not ship in this slice.

## Desired End State

A signed-in user opens `/dashboard/new`, supplies a title and no more than 10,000 Unicode code points of text, then sees one labelled demo card. The set and source are stored privately before the response; the proposal remains only in the current page state and disappears after refresh.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| AI integration | Deterministic local mock | Validate the MVP journey before choosing a provider or holding a secret. | Plan |
| Proposal content | One fixed demo card | Makes behavior deterministic and tests independent of an LLM. | Plan |
| Entry route | `/dashboard/new` | Inherits the existing central route protection. | Plan / Codebase |
| Set title | Required user input | Gives each automatically created set a meaningful name without model inference. | Plan |
| Source limit | 10,000 Unicode code points | Bounds current input and prepares the future provider boundary. | Plan |
| Persistence | Set/source only; proposal is ephemeral | Keeps review-and-save model decisions in S-02. | Plan / Roadmap |
| Failure UX | Preserve form and show inline error | Prevents loss of pasted study material. | Plan |

## Scope

**In scope:**

- Authenticated JSON generation endpoint using the existing private repository.
- Deterministic demo proposal, protected route, dashboard navigation, and React form states.
- Unit/route coverage plus repository validation commands.

**Out of scope:**

- AI provider, secret, SDK, network call, or provider privacy policy.
- Proposal persistence, card acceptance, editing, deletion, saving, tags, or reviews.
- Database migration or any client-side Supabase access.

## Architecture / Approach

`React form → POST /api/flashcards/generate → session check → existing atomic createSet RPC → deterministic proposal → current-page display`.

The endpoint never returns source text or owner data. It writes the private set/source first, then returns the fixed demo card; RLS remains the enforcement boundary.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server contract | Validation, mock generator, authenticated endpoint | Avoid leaking source text or bypassing session/RLS behavior. |
| 2. Creation UX | `/dashboard/new`, navigation, form and result states | Preserve user input across errors while excluding S-02 controls. |
| 3. Validation | Tests and full repository gates | Keep the change AI-secret-free and Workers-build-compatible. |

**Prerequisites:** F-01's migration and `createFlashcardRepository` must be present in the target environment.

**Estimated effort:** ~2 focused implementation sessions across three phases.

## Open Risks & Assumptions

- A real AI provider, model, secret name, cost boundary, and external text-processing policy remain intentionally deferred.
- A successful mock request creates an owner-private empty set because cards are not persisted until S-02.
- The demo card is explicitly labelled so users do not mistake it for text-derived output.

## Success Criteria (Summary)

- Authenticated users can create a private set from valid pasted text and view exactly one labelled demo proposal.
- Invalid or failed requests retain form values and reveal no sensitive details.
- Tests, linting, type checking, and production build pass without an AI credential.
