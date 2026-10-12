---
date: 2026-10-12T12:50:50.0950748+02:00
researcher: Codex
git_commit: ed62a7b39ed703f029f5fdb35ccaf09dc5294e26
branch: main
repository: 10xdevs4-project
topic: Reliable and inexpensive LLM generation of flashcards from pasted text
tags: [research, codebase, llm, openrouter, flashcards]
status: complete
last_updated: 2026-10-12
last_updated_by: user
last_updated_note: Decision locked — direct Gemini API free tier for dev, paid $5 prepaid key for production
---

# Research: real flashcards from pasted text

## Research question

How can Memoro replace its demo proposals with actual text-grounded flashcards? Compare OpenRouter, for which the user already has a key, with alternatives, prioritizing reliability and low cost. This research supersedes the stopped auth research; it does not authorize implementation or select a provider on the user's behalf.

## Summary

**Decision: direct Gemini API via Google AI Studio.** Use the **free tier** for development and model evaluation, then switch to a **paid key** ($5 minimum prepaid) for production. This eliminates the OpenRouter gateway dependency and platform fees. The model will be **Gemini 3.5 Flash-Lite** unless evaluation shows a newer Flash variant (e.g. 3.8 Flash) justifies the higher cost.

For an illustrative generation with **3,000 total input tokens and 1,500 total billed output tokens**, Gemini 3.5 Flash-Lite costs **$0.00465**, or **$4.65 for 1,000 such generations**, at the current standard text rates of **$0.30/$2.50 per million input/output tokens**. No gateway fee applies with direct access. [Google pricing](https://ai.google.dev/gemini-api/docs/pricing).

The free tier is suitable for development but **not for production with real user data**: prompts may be used by Google for model improvement, and rate limits are restrictive (~15 RPM). The paid tier ($5 prepaid minimum) disables data training and increases rate limits. See "Gemini API free tier" section below for details.

Integration is broader than replacing the generator: the client requires `isDemo === true` and exactly three proposals (`src/components/flashcards/NewFlashcardsForm.tsx:31`, `:44`). The current endpoint writes the set before producing proposals (`src/pages/api/flashcards/generate.ts:51–59`), so paid generation introduces partial-success and retry risks.

## Detailed findings

### Provider and model comparison

Prices checked on 2026-10-12. Rates below are USD per million text tokens for standard synchronous inference; not batch, Flex or cached pricing. Cost examples use the same 3,000-input/1,500-output assumption above.

| Option                                                 | Input / output  | Example per 1,000 generations       | Fit and tradeoff                                                                                                                                                                                                        |
| ------------------------------------------------------ | --------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **► Direct Gemini 3.5 Flash-Lite (free tier)**         | **$0 / $0**     | **$0** (rate-limited)               | **Selected for development.** ~15 RPM, ~1.5M tokens/day. Prompts may be used for training — not suitable for production with real user data. No billing account needed. [Pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| **► Direct Gemini 3.5 Flash-Lite (paid tier)**         | **$0.30 / $2.50** | **$4.65**                         | **Selected for production.** $5 minimum prepaid. Prompts not used for training. Higher rate limits. Same model, same integration. [Pricing](https://ai.google.dev/gemini-api/docs/pricing)                              |
| OpenRouter + Gemini 3.5 Flash-Lite                     | $0.30 / $2.50   | $4.65 + platform fees               | Not selected; adds gateway dependency and 5.5% fee. Retains model portability if a switch is needed later. [Model](https://openrouter.ai/google/gemini-3.5-flash-lite)                                                 |
| OpenRouter or direct Gemini 3.1 Flash-Lite             | $0.25 / $1.50   | $3.00 before applicable fees        | Not selected; lifecycle is shorter — Google lists shutdown on May 7, 2027. [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [lifecycle](https://ai.google.dev/gemini-api/docs/deprecations)                    |
| Workers AI, `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | $0.293 / $2.253 | $4.2585 before allowance/plan costs | Not selected; flashcard quality versus Gemini is unmeasured. [Model and price](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)                                                    |

Calculation: `(input_tokens × input_rate + output_tokens × output_rate) / 1,000,000`. Under the stated token assumption, Gemini 3.1 costs $0.003 per generation; the Workers AI model costs $0.0042585. Actual tokenization depends on language, prompt, JSON and generated content; the application's character ceiling is not a token ceiling. Additional billed reasoning output must be included in the output total. No caching savings are assumed.

OpenRouter Standard currently lists a **5.5%** platform fee and no contractual SLA. Credit-purchase overhead is distinct from model inference pricing; minimum transaction fees/taxes were not established here and are excluded from the calculation. [Pricing](https://openrouter.ai/pricing), [billing support](https://openrouter.ai/support).

Workers AI includes **10,000 neurons/day**; exceeding the free allocation requires the paid Workers plan, with listed additional usage at **$0.011 per 1,000 neurons**. Treat its allowance separately from token-price examples and any Workers subscription costs. JSON Mode can still fail and does not support streaming in the documented mode. [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/).

Do not select an old model solely because it is listed cheaply: Google currently restricts direct Gemini 2.5 access to previous active users and recommends newer models for new projects. This is not proof that an OpenRouter endpoint is unavailable, but rules out assuming fresh-account availability. [Google lifecycle](https://ai.google.dev/gemini-api/docs/deprecations).

Self-hosting is outside the evaluated shortlist: this repository deploys an edge application, not a GPU inference service (`astro.config.mjs:16`, `wrangler.jsonc:4`). Operating one would add a separate infrastructure responsibility. No self-hosted cost comparison or quality ranking was performed.

### Follow-up: DeepSeek is cheaper under the compared workloads

OpenRouter is a gateway, not a competing model family: the existing key can access DeepSeek as well as Gemini. Under the same **3,000 uncached input / 1,500 total billed output tokens per generation**, the following are materially cheaper than the $4.65 Gemini example:

- **DeepSeek V3.2 via OpenRouter:** the observed GMICloud promotional endpoint lists **$0.2088 input / $0.3096 output per million**, giving **$1.0908 per 1,000 generations**, about **76.5% below** the Gemini example. The page labels this a **28% discount**; do not treat it as a permanent rate or the rate of every eligible provider. [V3.2 provider prices](https://openrouter.ai/deepseek/deepseek-v3.2).
- **DeepSeek V4.1 Flash via OpenRouter:** the inspected DeepInfra standard endpoint lists promotional **$0.14/$0.42**, giving **$1.05 per 1,000 generations** under those assumptions. It is a **30% discount**; its listed undiscounted **$0.20/$0.60** would give **$1.50**. This is the standard model page, not its cheaper batch variant. [V4.1 Flash provider prices](https://openrouter.ai/deepseek/deepseek-v4.1-flash).
- **Direct DeepSeek Flash:** `deepseek-flash` currently resolves to V4.1 Flash. Uncached input/output prices are **$0.15/$0.60 off-peak** and **$0.30/$1.20 peak**, giving **$1.35/$2.70 per 1,000 generations** respectively. Peak periods are defined by the provider; the result depends on request time. No cache-hit discount is assumed. [Direct pricing](https://api-docs.deepseek.com/quick_start/pricing/).

OpenRouter examples exclude platform fees, taxes and retries. These arithmetic savings assume equal billed token counts, not equal measured card quality or completion lengths. Do not combine the cheapest input rate from one endpoint with another endpoint's output rate. Restricting schema support or privacy may change the eligible endpoint and price; this research has not established that the quoted promotional endpoints satisfy the final combined routing policy.

Direct DeepSeek's documented JSON mode uses `json_object`, requires JSON guidance in the prompt and warns of possible empty content. This is not evidence of strict JSON Schema enforcement. Its pricing page says thinking is enabled by default; evaluate non-thinking mode or bound the reasoning budget to avoid unnecessary output cost. [JSON Output](https://api-docs.deepseek.com/guides/json_mode/), [model details](https://api-docs.deepseek.com/quick_start/pricing/).

The OpenRouter V3.2 card advertises schema output, but the gateway's endpoint-specific validation caveat still applies. **Decision note:** the user has selected direct Gemini API as the provider. DeepSeek and OpenRouter pricing comparisons above are retained for reference if a provider switch is needed later. No evidence here establishes that DeepSeek is less accurate or less reliable for this task; it was not selected due to the user's preference for Gemini's free tier and simpler direct integration.

### What reliability means here

**Availability:** OpenRouter's provider fallback can try another endpoint serving the same model. Cross-model fallback is a separate `models` configuration; it does not judge whether a successful answer is educationally useful. Routing remains subject to model, parameter and privacy filters. A gateway outage is still a dependency failure. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [model fallback](https://openrouter.ai/docs/guides/routing/model-fallbacks).

**Format:** use `response_format` with `type: "json_schema"`, request strict mode and set `provider.require_parameters: true`. Support is endpoint-specific, and strict enforcement varies by provider. Validate the actual response server-side even when schema mode is enabled. [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

**Meaning:** valid JSON does not establish that an answer is supported by the text. Google explicitly recommends application validation for semantic correctness. Source grounding and educational quality require a representative evaluation. [Gemini structured output guidance](https://ai.google.dev/gemini-api/docs/structured-output).

**Capacity:** direct Gemini quotas depend on project/account tier and actual available capacity; public limits are not an availability guarantee. Record observed latency, failures and token usage instead of deriving an uptime promise from a model card. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### Suggested generation design, for planning

Use a small server-only provider adapter behind the existing generation endpoint. A single text-to-JSON request is sufficient to evaluate this product; no retrieval database, agent loop, web search or fine-tuning is needed for the current bounded pasted-text input. This is a design recommendation based on the input already arriving in the request (`generate.ts:14–15`, `flashcard-proposals.ts:2`), not a restriction on future features.

Proposed sequence:

1. Authenticate and validate before incurring provider cost; keep title/source limits and owner-scoped data access.
2. Send the source as untrusted content, separate from instructions. Ask for focused question/answer pairs grounded in that source, in the source's language, with no invented facts. Explicitly ignore instructions embedded in the source. Language and insufficient-text behavior remain product choices below.
3. Request a bounded array of question/answer objects. Keep `setId`, ownership, `qualityFlags` and persistence decisions under application control, not model control. An optional supporting quotation can aid evaluation but does not prove entailment merely by matching a substring.
4. Validate types, non-empty trimmed strings, card count, output limits and finish status; handle refusal, truncation, invalid JSON and insufficient material explicitly. Compute quality flags deterministically and render them before user acceptance.
5. Return valid proposals for the existing edit/accept/save journey. Preserve the user's source and draft on a recoverable failure.

The product cap is **15 proposals**, with advisory flags for answers longer than **300 characters**, near-identical question/answer and normalized duplicates against cards in the set (`context/foundation/prd.md:73`). The save endpoint accepts **1–15 cards**, and each trimmed field has a **1,000-code-point** hard ceiling (`src/pages/api/flashcards/save.ts:25–31`, `:45`). Keep the advisory threshold separate from the hard save limit; do not reject every answer above the advisory threshold.

For a new automatically created set, there may be no saved cards to compare against. Within-batch deduplication is useful but is not a substitute for the PRD's existing-set rule. The exact near-identity metric and regeneration behavior need to be specified in the plan.

### Cost controls and safe retries

Recommended controls: server-configured model allowlist, output-token cap, authenticated per-user generation quota, bounded concurrency, provider-key budget and application spend accounting. Do not let a browser select arbitrary expensive models. Keep any fallback list short, evaluated and subject to the same limits.

Use a total request deadline and a bounded retry budget for retryable failures such as 429/temporary upstream errors; honor retry guidance where available. Do not retry authentication/configuration failures or malformed schema requests indiscriminately. A client timeout is not proof that the provider did no billable work. Avoid stacking gateway fallback, SDK retry and application retry without accounting for the combined attempts.

The current generation body contains `{ title, sourceText }` with no operation key (`NewFlashcardsForm.tsx:92–95`). Its RPC inserts a fresh set/source (`supabase/migrations/20260924000000_create_private_flashcard_data.sql:138–154`). The save request's UUID is generated later (`NewFlashcardsForm.tsx:146`) and protects save replay, not generation.

Before implementation, choose a generation-operation lifecycle. Preserving create-set-first requires a resumable operation/status and a way to reuse the same set on retry. Generating first avoids that particular empty-set failure but can spend inference money before a failed database write. A durable owner-scoped operation key, payload identity and saved validated result can prevent duplicate completed work; they cannot guarantee exactly-once provider billing after an ambiguous network failure unless the upstream offers a usable guarantee. Do not promise this from the existing save idempotency.

Log operation ID, selected model/provider, duration, safe failure category and token/cost metadata. Exclude API keys, cookies, source text and generated content from routine logs. Apply the prior audit's cause-preservation lesson at this new boundary, without expanding this change into the paused auth repair.

### Gemini API free tier

The Gemini API (via Google AI Studio) provides a **free tier** for development and prototyping. Key characteristics:

- **Cost:** $0 — no billing account required.
- **Models:** Gemini 3.5 Flash-Lite, 3.8 Flash, and older variants are available.
- **Rate limits:** ~15 RPM, ~1.5M tokens/day. Sufficient for development and evaluation; insufficient for production under concurrent use.
- **Structured output:** Full `response_format` / `json_schema` / `response_mime_type` support — same as the paid tier.
- **Privacy trade-off:** On the free tier, Google **may use prompts and responses to improve its products** (human reviewers can read them). This is acceptable for development with synthetic/test data but not for production with real user source text.
- **Upgrade path:** Link a billing account with a minimum $5 prepaid. This disables data training, increases rate limits, and provides the same model/API surface. No code change required — only the API key configuration changes.

[Google AI Studio](https://aistudio.google.com/), [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### Privacy and secrets

Add the Gemini API key through the project's server-secret convention (`astro.config.mjs:18–20`, `src/lib/supabase.ts:3`). The shared `flashcard-proposals.ts` is imported by React, so it must not become the credential-bearing provider module (`NewFlashcardsForm.tsx:2–7`). No key was read or used during research.

**Free tier (development only):** prompts may be used by Google to improve products. Use only synthetic or test source texts during development. Do not send real user data through the free tier.

**Paid tier (production):** prompts/responses are not used to improve products, but limited abuse-monitoring retention may still apply. The terms distinguish EEA/UK/Swiss treatment. [Gemini service terms](https://ai.google.dev/gemini-api/terms).

OpenRouter ZDR and routing details are retained in the DeepSeek section above for reference if a provider switch is needed later.

Database owner-only access remains required (`context/foundation/prd.md:68–69`); external inference adds a new processor of source text. Explain that processing in the product's privacy information. Do not imply private Supabase storage means text stays within Supabase.

## Code references and affected contracts

- `src/lib/flashcard-proposals.ts:1–13`, `:43–63`: shared input/type contract and deterministic demo generator.
- `src/pages/api/flashcards/generate.ts:30–59`: authentication, repository write and generation response.
- `src/components/flashcards/NewFlashcardsForm.tsx:25–44`, `:97–115`, `:194`: demo-only guards, error handling and demo copy.
- `src/components/flashcards/NewFlashcardsForm.tsx:255–293`: review rows do not currently show quality flags.
- `src/pages/api/flashcards/save.ts:25–45`: normalized saved-field limits and batch bound.
- `src/lib/flashcard-proposals.test.ts:9–71`, `src/pages/api/flashcards/generate.test.ts:32–114`: reusable input tests and demo-specific assertions that must change with the requirement.
- `tests/e2e/seed.spec.ts:6–10`: browser seed covers anonymous access, not actual generation quality.

## Architecture insights and evaluation

Keep provider transport replaceable behind an application-owned proposal type. For the initial single request, native server-side fetch is a reasonable minimal option; no SDK or framework dependency is selected by this research. A richer SDK can be assessed when its retry, schema or telemetry features remove concrete work.

Before adopting a candidate, run a small human-reviewed evaluation on representative Polish/English study texts, short/long passages, lists, ambiguous material, instruction-like source text and insufficient content. Compare DeepSeek V4.1 Flash and Gemini 3.5 Flash-Lite using the same prompt and rubric; add the older V3.2/3.1 budget candidates if needed. Assess factual support, useful coverage, atomic questions, language, duplication, valid response rate, latency and cost per accepted card. This evaluation has **not** been run; provider documentation cannot establish the winner.

Deterministic automated tests should mock the provider boundary and cover valid variable-length output, malformed/empty/oversized output, refusal/truncation, timeouts, 429/5xx, unauthorized requests without inference, quality flags and operation replay. Add a browser test for review of variable proposal counts and flags, then save. Keep live paid evaluations separate from ordinary CI. These are proposed checks, not tests added or passed during research.

## Historical context and related research

- `context/changes/pasted-text-proposals/plan.md:5` deliberately deferred provider selection: still supported as the scope of that historical change. Its one-demo-card description is superseded by the current three-card generator (`flashcard-proposals.ts:43–63`); its lack-of-review description is superseded by the current review/save UI. Do not copy those historical counts or exclusions into the new contract.
- `context/changes/proposal-review-and-save/plan.md:29` excluded AI from that change, not from the product. Its advisory quality threshold remains supported (`:62`, PRD `:73`).
- [Observability audit](../../audits/observability/2026-10-12_auth-generation-save.md): relevant evidence for preserving provider causes and reporting failures that the UI handles. No auth research artifact was created during the stopped investigation.

## Open questions for planning

- ~~Confirm provider/model and privacy routing policy.~~ **Decided:** direct Gemini API; free tier for dev, paid ($5 prepaid) for production.
- Decide generation-operation persistence, retry/resume behavior and treatment of abandoned sets before adding paid calls.
- Set the spend ceiling, per-user quotas, timeout and retry/fallback budget using expected traffic. Monthly budget: $5 initial prepaid; no traffic volume estimate supplied.
- Specify language selection, adaptive card count within the cap, insufficient-source behavior and exact quality/duplicate rules.
- Validate Gemini 3.5 Flash-Lite quality and latency on user-representative Polish/English material using the free tier. Compare with 3.8 Flash if quality is insufficient.

## Method and validation

Repository metadata was read from commit `ed62a7b39ed703f029f5fdb35ccaf09dc5294e26`, branch `main`, at the timestamp in frontmatter. `AGENTS.md` was already modified. No existing change/archive folder matched `llm-flashcard-generation`; the new identity follows the 10x-new schema. `context/foundation/lessons.md` was absent.

Read-only workers examined OpenRouter, Workers AI, and code/test integration independently; the parent researched direct Gemini and verified decisive client guards, persistence ordering, pricing and lifecycle evidence. Sources are official vendor pages retrieved on the research date. No API key, paid generation, production request, build or test run was needed for this comparison. Findings distinguish inspected code, vendor claims, calculated examples and proposed design. Research is complete for this comparison; implementation, measured quality and final product choices remain open.
