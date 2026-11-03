import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { URL } from "node:url";
import { REVIEW_SCHEMA, nonReviewOutcome, parseReview } from "./contract.mjs";
import { validateInput } from "./input.mjs";

export const RESPONSE_BYTE_LIMIT = 256 * 1024;
export const ATTEMPT_TIMEOUT_MS = 90_000;
const prompt = readFileSync(new URL("./prompt.md", import.meta.url), "utf8");
const failure = (reason) => nonReviewOutcome("operational-error", reason);

export function validModel(model) {
  // Explicit vendor/model IDs only. Router namespaces and presets are not models.
  return (
    typeof model === "string" &&
    model.length <= 200 &&
    /^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]*(?::[a-z0-9_-]+)?$/.test(model) &&
    !/^(?:openrouter|@preset|auto)\//.test(model) &&
    !/\/(?:auto|free|router)(?::|$)/.test(model)
  );
}

export function validProviderConfig({ apiKey, model } = {}) {
  return typeof apiKey === "string" && apiKey.trim().length > 0 && !/[\r\n]/.test(apiKey) && validModel(model);
}

class TransportError extends Error {
  constructor(reason, retryable = false, retryAfter = null) {
    super(reason);
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

// transientStatus handles generic HTTP codes; transientTypes overrides it for typed provider errors,
// letting a named permanent failure win over a generic 5xx status (see providerError below).
const transientStatus = (code) => code === 408 || code === 429 || (code >= 500 && code <= 599);
const transientTypes = new Set(["rate_limit_exceeded", "provider_overloaded", "provider_unavailable"]);

function providerError(error, status, retryAfter) {
  const type = error?.metadata?.error_type;
  // A typed permanent failure takes precedence over a generic 5xx status.
  const retryable = type ? transientTypes.has(type) : transientStatus(Number(error?.code ?? status));
  return new TransportError("provider-error", retryable, retryAfter);
}

function retryDelay(header, now) {
  if (header === null) return 1000;
  const seconds = /^\d+(?:\.\d+)?$/.test(header.trim()) ? Number(header) : null;
  const delay = seconds === null ? Date.parse(header) - now() : seconds * 1000;
  return Number.isFinite(delay) && delay <= 10_000 ? Math.max(0, delay) : null;
}

async function readBounded(response) {
  if (!response.body) throw new TransportError("invalid-response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTE_LIMIT) throw new TransportError("response-too-large");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    // Do not let cancellation of a failed/oversized body extend the deadline.
    void reader.cancel().catch(() => {
      // The original read failure is authoritative; cancellation is best effort.
    });
    reader.releaseLock();
  }
}

function metadata(payload) {
  const bounded = (value) => (typeof value === "string" && value.length <= 200 ? value : undefined);
  const usage = {};
  for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "cost"]) {
    const value = payload.usage?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) usage[key] = value;
  }
  for (const [group, keys] of [
    ["completion_tokens_details", ["reasoning_tokens"]],
    ["prompt_tokens_details", ["cached_tokens", "cache_write_tokens"]],
  ]) {
    const details = {};
    for (const key of keys) {
      const value = payload.usage?.[group]?.[key];
      if (Number.isSafeInteger(value) && value >= 0) details[key] = value;
    }
    if (Object.keys(details).length) usage[group] = details;
  }
  return {
    model: bounded(payload.model),
    generationId: bounded(payload.id),
    usage: Object.keys(usage).length ? usage : undefined,
  };
}

async function attempt(body, apiKey, fetchImpl) {
  const controller = new globalThis.AbortController();
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort();
      reject(new TransportError("provider-timeout", true));
    }, ATTEMPT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          redirect: "error",
        });
        const text = await readBounded(response);
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          if (!response.ok) throw providerError(null, response.status, response.headers.get("retry-after"));
          throw new TransportError("invalid-response");
        }
        const choice = payload?.choices?.[0];
        const error = payload?.error ?? choice?.error ?? choice?.message?.error;
        if (!response.ok || error != null) {
          throw providerError(error, response.status, response.headers.get("retry-after"));
        }
        if (
          !Array.isArray(payload?.choices) ||
          payload.choices.length !== 1 ||
          choice?.finish_reason !== "stop" ||
          choice?.message?.role !== "assistant" ||
          typeof choice.message.content !== "string" ||
          choice.message.refusal != null ||
          choice.message.function_call != null ||
          (choice.message.tool_calls != null &&
            (!Array.isArray(choice.message.tool_calls) || choice.message.tool_calls.length > 0))
        )
          throw new TransportError("incomplete-or-refused-response");
        const result = parseReview(choice.message.content);
        return result.status === "complete" ? { ...result, ...metadata(payload) } : result;
      })(),
    ]);
  } catch (error) {
    const wasTimeout = controller.signal.aborted;
    controller.abort();
    if (error instanceof TransportError) throw error;
    throw new TransportError(wasTimeout ? "provider-timeout" : "provider-network-error", true);
  } finally {
    if (timer !== null) globalThis.clearTimeout(timer);
  }
}

/** No logging, tools, model fallbacks or JSON-repair calls. A retry can incur a second charge. */
export async function reviewWithOpenRouter(
  { apiKey, model, input } = {},
  { fetchImpl = globalThis.fetch, sleepImpl = sleep, now = Date.now } = {},
) {
  if (!validProviderConfig({ apiKey, model })) return failure("invalid-provider-config");
  const validated = validateInput(input);
  if (validated.status !== "complete") return validated;
  const body = JSON.stringify({
    model,
    stream: false,
    max_tokens: 4000,
    // This routing filter excludes data-collecting providers; it is not a blanket zero-retention guarantee.
    provider: { require_parameters: true, data_collection: "deny" },
    response_format: { type: "json_schema", json_schema: { name: "pr_review", strict: true, schema: REVIEW_SCHEMA } },
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(validated.input) },
    ],
  });
  for (let index = 0; index < 2; index++) {
    try {
      return await attempt(body, apiKey, fetchImpl);
    } catch (error) {
      if (!(error instanceof TransportError)) return failure("provider-error");
      const delay = retryDelay(error.retryAfter, now);
      if (index === 1 || !error.retryable || delay === null) return failure(error.message);
      await sleepImpl(delay);
    }
  }
}
