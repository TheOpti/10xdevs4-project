import type { APIRoute } from "astro";
import { createReviewRepository, toReviewInput, type ReviewError } from "@/lib/flashcard-reviews";
import { isUuid } from "@/lib/flashcard-validation";
import { parseJsonRequestBody } from "@/lib/request-body";

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const errors: Record<ReviewError, { status: number; error: string }> = {
  "invalid-input": { status: 400, error: "Invalid request" },
  unauthenticated: { status: 401, error: "Authentication required" },
  "not-found": { status: 404, error: "Card not found" },
  conflict: { status: 409, error: "Card changed or was already reviewed" },
  "request-failed": { status: 500, error: "Unable to save review" },
};

export const POST: APIRoute = async (context) => {
  if (!isUuid(context.params.cardId)) return json({ error: "Invalid request" }, 400);
  let body: unknown;
  try {
    body = await parseJsonRequestBody(context.request);
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const input = toReviewInput(body);
  if (!input) return json({ error: "Invalid request" }, 400);
  try {
    const repository = createReviewRepository(context.request.headers, context.cookies);
    if (!repository) return json({ error: "Service unavailable" }, 503);
    const result = await repository.rateCard(context.params.cardId, input);
    if (!result.ok) {
      const { status, error } = errors[result.error];
      return json({ error }, status);
    }
    return json({ review: result.data }, 200);
  } catch {
    return json({ error: "Unable to save review" }, 500);
  }
};
