import { isUuid, toCard } from "@/lib/flashcard-validation";
import type { APIRoute } from "astro";
import { createFlashcardRepository, type FlashcardInput, type SaveFlashcardsInput } from "@/lib/flashcards";
import { parseJsonRequestBody } from "@/lib/request-body";
import { createClient } from "@/lib/supabase";

const jsonError = (message: string, status: number) => Response.json({ error: message }, { status });

function toSaveFlashcardsInput(value: unknown): SaveFlashcardsInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { setId, requestId, cards } = value as Record<string, unknown>;
  if (!isUuid(setId) || !isUuid(requestId) || !Array.isArray(cards) || cards.length === 0 || cards.length > 15) {
    return null;
  }

  const normalizedCards: FlashcardInput[] = [];
  for (const card of cards) {
    const normalizedCard = toCard(card);
    if (!normalizedCard) {
      return null;
    }
    normalizedCards.push(normalizedCard);
  }

  return { setId, requestId, cards: normalizedCards };
}

export const POST: APIRoute = async (context) => {
  let body: unknown;
  try {
    body = await parseJsonRequestBody(context.request);
  } catch {
    return jsonError("Invalid request", 400);
  }

  const input = toSaveFlashcardsInput(body);
  if (!input) {
    return jsonError("Invalid request", 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError("Service unavailable", 503);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return jsonError("Authentication required", 401);
  }

  const repository = createFlashcardRepository(context.request.headers, context.cookies);
  if (!repository) {
    return jsonError("Service unavailable", 503);
  }

  const result = await repository.saveCards(input);
  if (!result.ok) {
    return jsonError("Unable to save flashcards", 500);
  }

  return Response.json(
    { setId: result.data.setId, cards: result.data.cards },
    { status: result.data.created ? 201 : 200 },
  );
};
