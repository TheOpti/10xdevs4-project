import type { APIRoute } from "astro";
import { isUuid, toCard } from "@/lib/flashcard-validation";
import { createFlashcardRepository } from "@/lib/flashcards";
import { parseJsonRequestBody } from "@/lib/request-body";

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

export const PATCH: APIRoute = async (context) => {
  if (!isUuid(context.params.cardId)) return jsonError("Invalid request", 400);

  let body: unknown;
  try {
    body = await parseJsonRequestBody(context.request);
  } catch {
    return jsonError("Invalid request", 400);
  }
  const input = toCard(body);
  if (!input) return jsonError("Invalid request", 400);

  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) return jsonError("Service unavailable", 503);

  try {
    const result = await repository.updateCard(context.params.cardId, input);
    if (!result.ok) {
      return result.error === "not-found"
        ? jsonError("Card not found", 404)
        : jsonError("Unable to update flashcard", 500);
    }
    return Response.json({ card: result.data });
  } catch {
    return jsonError("Unable to update flashcard", 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!isUuid(context.params.cardId)) return jsonError("Invalid request", 400);
  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) return jsonError("Service unavailable", 503);

  try {
    const result = await repository.deleteCard(context.params.cardId);
    if (!result.ok) {
      return result.error === "not-found"
        ? jsonError("Card not found", 404)
        : jsonError("Unable to delete flashcard", 500);
    }
    return new Response(null, { status: 204 });
  } catch {
    return jsonError("Unable to delete flashcard", 500);
  }
};
