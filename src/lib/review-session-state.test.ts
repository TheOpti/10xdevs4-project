import { describe, expect, it } from "vitest";
import {
  initialReviewState,
  matchesReviewReceipt,
  reviewSessionReducer,
  type ReviewSessionState,
} from "./review-session-state";

const cards = [0, 1].map((index) => ({
  id: `card-${index}`,
  question: `Question ${index}`,
  answer: `Answer ${index}`,
  dueAt: "2026-01-01T00:00:00Z",
  revision: index,
}));
function pending(): ReviewSessionState {
  return reviewSessionReducer(reviewSessionReducer(initialReviewState(cards), { type: "reveal" }), {
    type: "rate",
    rating: "hard",
    requestId: "request-1",
  });
}
function receipt(state = pending()) {
  return {
    review: {
      ...state.operation,
      revision: (state.operation?.expectedRevision ?? 0) + 1,
      ratedAt: "2026-01-01T00:00:00Z",
      dueAt: "2026-01-04T00:00:00Z",
    },
  };
}
function operation() {
  const value = pending().operation;
  if (!value) throw new Error("Expected a pending operation");
  return value;
}
describe("review session", () => {
  it("requires reveal and locks pending controls synchronously", () => {
    const initial = initialReviewState(cards);
    expect(reviewSessionReducer(initial, { type: "rate", rating: "know", requestId: "early" })).toBe(initial);
    const state = pending();
    expect(state.revealed).toBe(true);
    expect(reviewSessionReducer(state, { type: "rate", rating: "know", requestId: "double" })).toBe(state);
    expect(reviewSessionReducer(state, { type: "retry" })).toBe(state);
  });
  it("advances once on matching confirmation and conceals the next answer", () => {
    const state = pending();
    const action = { type: "response" as const, requestId: "request-1", status: 200, body: receipt() };
    const next = reviewSessionReducer(state, action);
    expect(next).toMatchObject({ index: 1, saved: 1, skipped: 0, revealed: false, operation: null, status: "ready" });
    expect(reviewSessionReducer(next, action)).toBe(next);
    expect(reviewSessionReducer(state, { ...action, requestId: "unrelated" })).toBe(state);
  });
  it.each([0, 500, 503, 200])("retains the selected operation after uncertain HTTP %s", (status) => {
    const state = pending();
    const uncertain = reviewSessionReducer(state, { type: "response", requestId: "request-1", status, body: {} });
    expect(uncertain).toMatchObject({ index: 0, saved: 0, status: "uncertain" });
    expect(uncertain.operation).toBe(state.operation);
    expect(reviewSessionReducer(uncertain, { type: "rate", requestId: "new", rating: "know" })).toBe(uncertain);
    const retry = reviewSessionReducer(uncertain, { type: "retry" });
    expect(retry.operation).toBe(state.operation);
    expect(
      reviewSessionReducer(retry, { type: "response", requestId: "request-1", status: 200, body: receipt() }).saved,
    ).toBe(1);
  });
  it.each(["requestId", "cardId", "rating", "expectedRevision", "revision", "ratedAt", "dueAt"])(
    "rejects a mismatched or malformed %s",
    (field) => {
      const body = receipt();
      expect(matchesReviewReceipt({ review: { ...body.review, [field]: "wrong" } }, operation())).toBe(false);
    },
  );
  it("rejects a non-future schedule", () => {
    const body = receipt();
    expect(matchesReviewReceipt({ review: { ...body.review, dueAt: body.review.ratedAt } }, operation())).toBe(false);
  });
  it.each([
    [409, "conflict"],
    [401, "unauthenticated"],
    [400, "rejected"],
  ] as const)("stops on %s without advancing", (status, expected) => {
    const next = reviewSessionReducer(pending(), { type: "response", requestId: "request-1", status });
    expect(next).toMatchObject({ status: expected, index: 0, saved: 0, skipped: 0 });
    expect(reviewSessionReducer(next, { type: "retry" })).toBe(next);
  });
  it("counts missing cards separately and finishes only the initial queue", () => {
    const saved = reviewSessionReducer(pending(), {
      type: "response",
      requestId: "request-1",
      status: 200,
      body: receipt(),
    });
    const second = reviewSessionReducer(reviewSessionReducer(saved, { type: "reveal" }), {
      type: "rate",
      requestId: "request-2",
      rating: "know",
    });
    const finished = reviewSessionReducer(second, { type: "response", requestId: "request-2", status: 404 });
    expect(finished).toMatchObject({ index: 2, saved: 1, skipped: 1, revealed: false });
    expect(finished.message).toContain("skipped");
    expect(reviewSessionReducer(finished, { type: "reveal" })).toBe(finished);
    expect(initialReviewState(cards)).toMatchObject({ index: 0, saved: 0, skipped: 0 });
  });
});
