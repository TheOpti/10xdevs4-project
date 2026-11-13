import type { AstroCookies } from "astro";
import { isUuid } from "@/lib/flashcard-validation";
import { createClient } from "@/lib/supabase";

export type ReviewRating = "dont_know" | "hard" | "know";
export interface ReviewCard {
  id: string;
  question: string;
  answer: string;
  dueAt: string;
  revision: number;
}
export interface ReviewQueue {
  setId: string;
  title: string;
  totalCards: number;
  cards: ReviewCard[];
}
export interface ReviewInput {
  requestId: string;
  expectedRevision: number;
  rating: ReviewRating;
}
export interface ReviewReceipt extends ReviewInput {
  cardId: string;
  revision: number;
  ratedAt: string;
  dueAt: string;
}
export type ReviewError = "invalid-input" | "unauthenticated" | "not-found" | "conflict" | "request-failed";
export type ReviewResult<T> = { ok: true; data: T } | { ok: false; error: ReviewError };
export interface ReviewRepository {
  getQueue(setId: string): Promise<ReviewResult<ReviewQueue>>;
  rateCard(cardId: string, input: ReviewInput): Promise<ReviewResult<ReviewReceipt>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 2147483647;
}
function isRating(value: unknown): value is ReviewRating {
  return value === "dont_know" || value === "hard" || value === "know";
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function toReviewInput(value: unknown): ReviewInput | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["requestId", "expectedRevision", "rating"].includes(key))
  ) {
    return null;
  }
  const { requestId, expectedRevision, rating } = value;
  return isUuid(requestId) && isRevision(expectedRevision) && isRating(rating)
    ? { requestId, expectedRevision, rating }
    : null;
}

function toReviewCard(value: unknown): ReviewCard | null {
  if (!isRecord(value)) return null;
  const { id, question, answer, dueAt, revision } = value;
  return isUuid(id) && isText(question) && isText(answer) && isTimestamp(dueAt) && isRevision(revision)
    ? { id, question, answer, dueAt, revision }
    : null;
}

function toQueue(value: unknown, requestedSetId: string): ReviewQueue | null {
  if (!isRecord(value)) return null;
  const { setId, title, totalCards, cards } = value;
  if (
    !isUuid(setId) ||
    setId.toLowerCase() !== requestedSetId.toLowerCase() ||
    !isText(title) ||
    typeof totalCards !== "number" ||
    !Number.isSafeInteger(totalCards) ||
    totalCards < 0 ||
    !Array.isArray(cards)
  )
    return null;
  const parsed: ReviewCard[] = [];
  for (const card of cards) {
    const result = toReviewCard(card);
    if (!result) return null;
    parsed.push(result);
  }
  if (parsed.length > totalCards || new Set(parsed.map((card) => card.id.toLowerCase())).size !== parsed.length)
    return null;
  // Preserve database ordering and precision; do not re-filter using the application clock.
  return { setId, title, totalCards, cards: parsed };
}

function toReceipt(value: unknown, cardId: string, input: ReviewInput): ReviewReceipt | null {
  if (!isRecord(value)) return null;
  const { requestId, cardId: returnedCardId, rating, expectedRevision, revision, ratedAt, dueAt } = value;
  if (
    !isUuid(requestId) ||
    requestId.toLowerCase() !== input.requestId.toLowerCase() ||
    !isUuid(returnedCardId) ||
    returnedCardId.toLowerCase() !== cardId.toLowerCase() ||
    !isRating(rating) ||
    rating !== input.rating ||
    expectedRevision !== input.expectedRevision ||
    !isRevision(revision) ||
    revision !== input.expectedRevision + 1 ||
    !isTimestamp(ratedAt) ||
    !isTimestamp(dueAt) ||
    Date.parse(dueAt) <= Date.parse(ratedAt)
  )
    return null;
  return {
    requestId,
    cardId: returnedCardId,
    rating,
    expectedRevision: input.expectedRevision,
    revision,
    ratedAt,
    dueAt,
  };
}

function mapError(error: unknown): ReviewError {
  if (!isRecord(error)) return "request-failed";
  switch (error.code) {
    case "22023":
      return "invalid-input";
    case "42501":
      return "unauthenticated";
    case "P0002":
      return "not-found";
    case "P0001":
      return "conflict";
    default:
      return "request-failed";
  }
}

export function createReviewRepository(headers: Headers, cookies: AstroCookies): ReviewRepository | null {
  const client = createClient(headers, cookies);
  if (!client) return null;
  return {
    async getQueue(setId) {
      if (!isUuid(setId)) return { ok: false, error: "invalid-input" };
      try {
        const { data, error } = (await client.rpc("get_flashcard_review_queue", { set_id: setId })) as {
          data: unknown;
          error: unknown;
        };
        if (error) return { ok: false, error: mapError(error) };
        const queue = toQueue(data, setId);
        return queue ? { ok: true, data: queue } : { ok: false, error: "request-failed" };
      } catch {
        return { ok: false, error: "request-failed" };
      }
    },
    async rateCard(cardId, value) {
      const input = toReviewInput(value);
      if (!isUuid(cardId) || !input) return { ok: false, error: "invalid-input" };
      try {
        const { data, error } = (await client.rpc("rate_flashcard", {
          card_id: cardId,
          request_id: input.requestId,
          expected_revision: input.expectedRevision,
          rating: input.rating,
        })) as { data: unknown; error: unknown };
        if (error) return { ok: false, error: mapError(error) };
        const receipt = toReceipt(data, cardId, input);
        return receipt ? { ok: true, data: receipt } : { ok: false, error: "request-failed" };
      } catch {
        return { ok: false, error: "request-failed" };
      }
    },
  };
}
