import { describe, expect, it } from "vitest";
import { cardEditorReducer as reduce, initialCardState, savedCardFromResponse } from "./saved-card-state";

const card = { id: "card-id", question: "Original Q", answer: "Original A", createdAt: "2026-11-08" };

describe("saved card editing", () => {
  it("keeps edits local and cancels to the most recently confirmed values", () => {
    let state = reduce(initialCardState(card), { type: "edit" });
    state = reduce(state, { type: "draft", field: "question", value: "Draft Q" });
    expect(state.card).toEqual(card);
    expect(reduce(state, { type: "cancel" })).toEqual(initialCardState(card));
    state = reduce(state, { type: "saved", card: { ...card, question: "Persisted Q" } });
    state = reduce(state, { type: "edit" });
    state = reduce(state, { type: "draft", field: "question", value: "Later draft" });
    expect(reduce(state, { type: "cancel" }).draft.question).toBe("Persisted Q");
  });
  it("blocks changes during saving and preserves drafts after errors including 404", () => {
    let state = reduce(initialCardState(card), { type: "edit" });
    state = reduce(state, { type: "draft", field: "answer", value: "Unsaved answer" });
    state = reduce(state, { type: "pending" });
    expect(reduce(state, { type: "cancel" })).toBe(state);
    expect(reduce(state, { type: "delete" })).toBe(state);
    expect(reduce(state, { type: "draft", field: "answer", value: "Oops" })).toBe(state);
    for (const missing of [false, true]) {
      const failed = reduce(state, { type: "failed", missing, message: "Could not confirm" });
      expect(failed.draft.answer).toBe("Unsaved answer");
      expect(failed.card).toEqual(card);
      expect(failed.mode).toBe("edit");
      expect(failed.pending).toBe(false);
      expect(failed.missing).toBe(missing);
    }
  });
  it("keeps a card visible through deletion confirmation, cancellation and failure", () => {
    const state = reduce(initialCardState(card), { type: "delete" });
    expect(state.card).toEqual(card);
    expect(reduce(state, { type: "cancel" }).mode).toBe("preview");
    const failed = reduce(reduce(state, { type: "pending" }), {
      type: "failed",
      missing: true,
      message: "Unavailable",
    });
    expect(failed.mode).toBe("delete");
    expect(failed.card).toEqual(card);
    expect(failed.missing).toBe(true);
  });
  it("accepts only a response for the addressed card and strips unrelated fields", () => {
    expect(savedCardFromResponse({ card: { ...card, sourceText: "private" } }, card.id)).toEqual(card);
    for (const value of [null, {}, { card: { ...card, id: "other" } }, { card: { id: card.id } }]) {
      expect(savedCardFromResponse(value, card.id)).toBeNull();
    }
  });
});
