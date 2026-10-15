# Generate Source-Grounded Flashcards with an LLM — Plan Brief

> Full plan: `context/changes/llm-flashcard-generation/plan.md`
> Research: `context/changes/llm-flashcard-generation/research.md`

## What & Why

Replace the static demo flashcard proposal generator with real, text-grounded flashcard generation powered by the Google Gemini API. This delivers on the primary product promise (North Star S-01): rapid creation of high-quality, source-grounded flashcards with low cost and high reliability.

## Starting Point

The current code in `src/lib/flashcard-proposals.ts` returns three static demo flashcards, while `NewFlashcardsForm.tsx` requires an `isDemo === true` flag and exactly three proposals. The `generate.ts` endpoint creates a database set before calling the generator, risking orphaned empty sets if upstream LLM calls fail.

## Desired End State

An authenticated user pastes text, the server-side API securely queries Google's Gemini model, and the application returns 3–15 focused, source-grounded flashcards in the language of the input text. Cards display quality warning badges (answer length >300 characters, duplicates, identical question/answer), prompt-injection attempts or insufficient factual content return a clean HTTP 422 error, and the database set is created only after proposals are successfully received.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Provider & Model | Google Gemini API (`gemini-2.5-flash-lite`) | Free tier for development and $5 prepaid for production eliminate OpenRouter gateway overhead while providing fast inference and low cost. | Research |
| Database Lifecycle | Generate before create (`generate-before-create`) | Prevents empty, orphaned flashcard sets in the database during network or LLM failures. | Plan |
| Card Count | Adaptive (3–15 flashcards) | Scales the number of cards to the volume and density of facts in the source text without bloating short notes. | Plan |
| Insufficient Content | Explicit refusal with HTTP 422 | The system prompt returns an empty array when facts are absent, the API returns 422, and the form preserves entered text. | Plan |
| Quality Flags in UI | Advisory warning badges in review cards | Displays quality warnings to the user per PRD requirements without blocking valid cards. | Plan |
| Target Language | Match source text language | The model preserves the input language, supporting Polish, English, and foreign-language study. | Plan |
| Missing API Key in Env | Explicit HTTP 503 + Vitest mocks | Clear error boundary without silent fallback to demo cards, enabling reliable CI runs without keys. | Plan |

## Scope

**In scope:**
- Server-side integration with Google Gemini API (`gemini-2.5-flash-lite` / `gemini-3.5-flash-lite`) using native `fetch`.
- Environment variable configuration for `GEMINI_API_KEY` in `astro.config.mjs` (`astro:env/server`).
- New set-creation lifecycle in `src/pages/api/flashcards/generate.ts`.
- Deterministic `qualityFlags` computation (>300 chars, duplicates, question equals answer).
- Quality flag badges and HTTP 422/503 error handling in `NewFlashcardsForm.tsx`.
- Comprehensive Vitest unit and integration test coverage.

**Out of scope:**
- Multi-provider gateways (OpenRouter, Cloudflare Workers AI).
- Changes to Supabase table schemas or stored procedures.
- Streaming responses (SSE / WebSockets).

## Architecture / Approach

```
[Browser / React Client]
        |
        | POST /api/flashcards/generate { title, sourceText }
        v
[Astro Endpoint: generate.ts]
        |
        +---> [src/lib/gemini.ts] ---> Google AI Studio (Gemini REST API)
        |          | (Structured JSON Schema: Array<{question, answer}>)
        |          v
        +---> [src/lib/flashcard-proposals.ts] -> computeQualityFlags()
        |          | (Validation: empty -> 422 error)
        v
[Supabase Repository] -> createSet({ title, sourceText })
        |
        v
[JSON Response: { setId, proposals }] -> Render in NewFlashcardsForm (badges, review, save)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Contracts, Quality Flags & Env | `GEMINI_API_KEY` env schema, `computeQualityFlags` helper, unit tests | Env schema mismatch in Astro |
| 2. Gemini API Client Adapter | `src/lib/gemini.ts` module, injection-resistant prompt, mocked tests | JSON Schema formatting in REST API |
| 3. Proposal Generation Endpoint | Generate-before-create flow in `generate.ts`, 422 and 503 handling, integration tests | Timeout handling and error statuses |
| 4. Review UI & Quality Badges | Flexible `NewFlashcardsForm.tsx`, quality warning badges, 422 preservation | UI state handling with dynamic card counts |
| 5. End-to-End Verification | CI compliance, `npm run verify` gate passing, manual user flow validation | Regressions in existing card flows |

**Prerequisites:** Google AI Studio API key access (or mock client in test environments).  
**Estimated effort:** ~1–2 working sessions across 5 structured phases.

## Open Risks & Assumptions

- **Free Tier Rate Limits**: Google AI Studio free tier enforces ~15 RPM. Sufficient for development; production requires a prepaid key.
- **Prompt Adherence**: Gemini 2.5 Flash-Lite reliably returns an empty JSON array for non-factual content, validated server-side.

## Success Criteria (Summary)

- Authenticated users paste text and receive 3–15 source-grounded flashcards in the language of the source text.
- On LLM failure or empty input facts, no empty database set is created, and user draft text is preserved in the form.
- Proposals with potential quality issues display clear advisory badges in the review view before saving.
- The repository passes `npm run verify` (lint, astro check, Vitest suite, production build).
