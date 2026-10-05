import { describe, expect, it } from "vitest";
import { cardBatchesMatch } from "@/lib/flashcard-save-reconciliation";

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
});
