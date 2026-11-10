import { cardBatchesMatch, reconcileSavedDraft } from "@/lib/flashcard-save-reconciliation";
import { describe, expect, it } from "vitest";

describe("cardBatchesMatch", () => {
  it("recognizes the original batch returned by an idempotent retry", () => {
    const submitted = [{ question: "What is a cell?", answer: "The smallest unit of life." }];

    expect(cardBatchesMatch(submitted, [{ question: "What is a cell?", answer: "The smallest unit of life." }])).toBe(
      true,
    );
  });

  it("detects an edit made after an uncertain save before the retry", () => {
    const submitted = [{ question: "What is a cell?", answer: "The smallest unit of life." }];
    const editedDraft = [{ question: "What is a cell?", answer: "The basic unit of life." }];

    expect(cardBatchesMatch(submitted, editedDraft)).toBe(false);
  });

  it("matches batches even if cards are returned in a different order", () => {
    const batchA = [
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
      { question: "Q3", answer: "A3" },
    ];
    const batchB = [
      { question: "Q3", answer: "A3" },
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ];

    expect(cardBatchesMatch(batchA, batchB)).toBe(true);
  });
});

describe("saved draft reconciliation after editing", () => {
  const original = [{ question: "Q", answer: "A" }];
  it.each([{ saved: [{ question: "Q", answer: "Edited answer" }] }, { saved: [] }])(
    "does not confirm a draft after saved cards changed or were deleted",
    ({ saved }) => {
      expect(reconcileSavedDraft(saved, original, original)).toBe("saved-data-changed");
      expect(original).toEqual([{ question: "Q", answer: "A" }]);
    },
  );
  it("preserves edits made after an uncertain save even when the original batch was saved", () => {
    expect(reconcileSavedDraft(original, original, [{ question: "Q", answer: "New draft" }])).toBe("draft-changed");
  });
  it("confirms only when persisted data and the current draft match the submitted batch", () => {
    expect(reconcileSavedDraft(original, original, [{ question: " Q ", answer: " A " }])).toBe("confirmed");
  });
});
