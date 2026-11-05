import { cardBatchesMatch } from "@/lib/flashcard-save-reconciliation";
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
