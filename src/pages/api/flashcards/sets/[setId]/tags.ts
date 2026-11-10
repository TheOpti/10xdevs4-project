import type { APIRoute } from "astro";
import { isUuid } from "@/lib/flashcard-validation";
import { toTags } from "@/lib/flashcard-tags";
import { createFlashcardRepository } from "@/lib/flashcards";
import { parseJsonRequestBody } from "@/lib/request-body";

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

export const PATCH: APIRoute = async (context) => {
  if (!isUuid(context.params.setId)) return jsonError("Invalid request", 400);

  let body: unknown;
  try {
    body = await parseJsonRequestBody(context.request);
  } catch {
    return jsonError("Invalid request", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonError("Invalid request", 400);
  const tags = toTags((body as Record<string, unknown>).tags);
  if (!tags) return jsonError("Invalid request", 400);

  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) return jsonError("Service unavailable", 503);

  try {
    const result = await repository.updateSetTags(context.params.setId, tags);
    if (!result.ok) {
      if (result.error === "not-found") return jsonError("Set not found", 404);
      if (result.error === "invalid-input") return jsonError("Invalid request", 400);
      return jsonError("Unable to update tags", 500);
    }
    return Response.json({ tags: result.data });
  } catch {
    return jsonError("Unable to update tags", 500);
  }
};
