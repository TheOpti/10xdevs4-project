import type { ReviewCard, ReviewInput, ReviewRating } from "@/lib/flashcard-reviews";

export interface ReviewOperation extends ReviewInput {
  cardId: string;
}
export interface ReviewSessionState {
  cards: ReviewCard[];
  index: number;
  revealed: boolean;
  operation: ReviewOperation | null;
  status: "ready" | "pending" | "uncertain" | "conflict" | "unauthenticated" | "rejected";
  saved: number;
  skipped: number;
  message: string;
}
export type ReviewAction =
  | { type: "reveal" }
  | { type: "retry" }
  | { type: "rate"; rating: ReviewRating; requestId: string }
  | { type: "response"; requestId: string; status: number; body?: unknown };

export function initialReviewState(cards: ReviewCard[]): ReviewSessionState {
  return { cards, index: 0, revealed: false, operation: null, status: "ready", saved: 0, skipped: 0, message: "" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function matchesReviewReceipt(body: unknown, operation: ReviewOperation): boolean {
  if (!isRecord(body) || !isRecord(body.review)) return false;
  const receipt = body.review;
  return (
    receipt.requestId === operation.requestId &&
    receipt.cardId === operation.cardId &&
    receipt.rating === operation.rating &&
    receipt.expectedRevision === operation.expectedRevision &&
    receipt.revision === operation.expectedRevision + 1 &&
    isTimestamp(receipt.ratedAt) &&
    isTimestamp(receipt.dueAt) &&
    Date.parse(receipt.dueAt) > Date.parse(receipt.ratedAt)
  );
}

export function reviewSessionReducer(state: ReviewSessionState, action: ReviewAction): ReviewSessionState {
  const card = state.cards.at(state.index);
  if (action.type === "reveal") {
    return state.status === "ready" && card ? { ...state, revealed: true } : state;
  }
  if (action.type === "rate") {
    if (state.status !== "ready" || !state.revealed || !card) return state;
    return {
      ...state,
      status: "pending",
      message: "Saving rating…",
      operation: {
        cardId: card.id,
        expectedRevision: card.revision,
        rating: action.rating,
        requestId: action.requestId,
      },
    };
  }
  if (action.type === "retry") {
    return state.status === "uncertain" && state.operation
      ? { ...state, status: "pending", message: "Retrying the same rating…" }
      : state;
  }
  if (state.status !== "pending" || action.requestId !== state.operation?.requestId) return state;
  if (action.status === 200 && matchesReviewReceipt(action.body, state.operation)) {
    return {
      ...state,
      index: state.index + 1,
      revealed: false,
      operation: null,
      status: "ready",
      saved: state.saved + 1,
      message: "Rating saved.",
    };
  }
  if (action.status === 404) {
    return {
      ...state,
      index: state.index + 1,
      revealed: false,
      operation: null,
      status: "ready",
      skipped: state.skipped + 1,
      message: "The previous card is no longer available and was skipped.",
    };
  }
  if (action.status === 409) {
    return {
      ...state,
      status: "conflict",
      message: "This card changed or was already reviewed. Reload reviews to continue.",
    };
  }
  if (action.status === 401) {
    return { ...state, status: "unauthenticated", message: "Your session expired. Sign in to continue reviewing." };
  }
  if (action.status >= 400 && action.status < 500) {
    return { ...state, status: "rejected", message: "This rating could not be accepted. Reload reviews to continue." };
  }
  return {
    ...state,
    status: "uncertain",
    message:
      "We could not confirm the rating. It may have been saved. Retry the same rating or reload reviews to check the saved state.",
  };
}
