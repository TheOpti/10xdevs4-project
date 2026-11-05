# Frame Brief: Flashcard language mismatch

## Reported Observation

Seems like flashcards were created in Polish, but I pasted English text.

## Initial Framing (preserved)

- User's stated cause or approach: "I also don't see anything wrong in system prompt for open router"
- User's proposed direction: Investigate the unexpected language; no specific fix requested.
- Pre-dispatch narrowing: Asked whether local/deployed and whether both fields/repeated generations were affected. Answers pending.

## Dimension Map and Hypothesis Investigation

| Dimension / hypothesis                                           | Evidence                                                                                                                                                                                                         | Verdict                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Prompt requires Polish                                           | `src/lib/openrouter.ts:19` explicitly requires source-language matching; `:83` sends this system message.                                                                                                        | NONE in current code                                                                       |
| Input or output is translated by the application                 | Form submits source unchanged (`src/components/flashcards/NewFlashcardsForm.tsx:117`); endpoint forwards it (`src/pages/api/flashcards/generate.ts:55`); helper only trims output (`src/lib/openrouter.ts:153`). | NONE in inspected path                                                                     |
| Model response violates the language instruction and is accepted | Validation checks structure and nonempty strings, not language (`src/lib/openrouter.ts:133–166`). The actual upstream response is unavailable.                                                                   | STRONG evidence of validation gap; unconfirmed incident cause                              |
| Running code differs from inspected code                         | OpenRouter migration is uncommitted. HEAD uses Gemini, but its language instruction is identical. Running build/provider is unknown.                                                                             | WEAK; possible, unverified                                                                 |
| Previous Polish proposals remain after a failed English request  | `NewFlashcardsForm.tsx:102–145` does not clear the existing draft before submitting or on failure; review remains visible at `:290`.                                                                             | Plausible conditional path; prior Polish generation and failed English request unconfirmed |

## Narrowing Signals

- No locale, title, or conversation history enters the model request.
- Current language test checks prompt wording, not real model compliance (`src/lib/openrouter.test.ts:309`).
- Exact source, affected output, and runtime identity are not yet available.

## Cross-check

Compared the preceding Gemini implementation at HEAD: it also explicitly requires English output for English source. An older provider does not by itself explain Polish output. Inspected frontend response assignment and rendering: returned strings are retained.

## Problem Statement

The current prompt correctly states the language requirement, but the application accepts responses without verifying that requirement. The reported incident needs a concrete input/output and runtime trace before attributing its cause to the model or changing the prompt.

## Confidence

LOW for incident root cause; HIGH for the absence of output-language validation. Next evidence: affected source text and generated cards, local versus deployed context, actual provider/model, and the generation response before rendering. No live generation was performed.

## What Changes for Planning

Reproduce and locate the mismatch before choosing a fix. Do not assume mentioning Polish in the prompt caused it.

## References

- `src/lib/openrouter.ts`
- `src/lib/openrouter.test.ts`
- `src/pages/api/flashcards/generate.ts`
- `src/components/flashcards/NewFlashcardsForm.tsx`
- Read-only investigation tasks: `language_request`, `language_flow`.
