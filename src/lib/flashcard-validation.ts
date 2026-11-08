import type { FlashcardInput } from "@/lib/flashcards";

const MAX_CARD_FIELD_CODE_POINTS = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function toCard(value: unknown): FlashcardInput | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { question, answer } = value as Record<string, unknown>;
  if (typeof question !== "string" || typeof answer !== "string") {
    return null;
  }

  const trimmedQuestion = question.trim();
  const trimmedAnswer = answer.trim();
  if (
    trimmedQuestion.length === 0 ||
    trimmedAnswer.length === 0 ||
    Array.from(trimmedQuestion).length > MAX_CARD_FIELD_CODE_POINTS ||
    Array.from(trimmedAnswer).length > MAX_CARD_FIELD_CODE_POINTS
  ) {
    return null;
  }

  return { question: trimmedQuestion, answer: trimmedAnswer };
}
