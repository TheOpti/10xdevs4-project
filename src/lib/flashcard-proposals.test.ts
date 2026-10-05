import { describe, expect, it } from "vitest";
import {
  generateDemoFlashcardProposals,
  MAX_SOURCE_TEXT_CODE_POINTS,
  MAX_TITLE_CODE_POINTS,
  validateFlashcardProposalInput,
} from "@/lib/flashcard-proposals";

describe("validateFlashcardProposalInput", () => {
  it("rejects blank title and source text", () => {
    expect(validateFlashcardProposalInput({ title: "  ", sourceText: "Source" })).toEqual({
      valid: false,
      error: "title-required",
    });
    expect(validateFlashcardProposalInput({ title: "Biology", sourceText: "\n\t" })).toEqual({
      valid: false,
      error: "source-text-required",
    });
  });

  it("rejects a title over the Unicode code-point limit", () => {
    expect(
      validateFlashcardProposalInput({
        title: "😀".repeat(MAX_TITLE_CODE_POINTS + 1),
        sourceText: "Source",
      }),
    ).toEqual({ valid: false, error: "title-too-long" });
  });

  it("counts Unicode code points when enforcing the source limit", () => {
    expect(
      validateFlashcardProposalInput({
        title: "Emoji",
        sourceText: "😀".repeat(MAX_SOURCE_TEXT_CODE_POINTS),
      }),
    ).toEqual({ valid: true });
    expect(
      validateFlashcardProposalInput({
        title: "Emoji",
        sourceText: "😀".repeat(MAX_SOURCE_TEXT_CODE_POINTS + 1),
      }),
    ).toEqual({ valid: false, error: "source-text-too-long" });
  });
});

describe("generateDemoFlashcardProposals", () => {
  it("always returns three fixed, individually valid demo proposals", () => {
    const proposals = generateDemoFlashcardProposals();

    expect(proposals).toEqual([
      {
        question: "What is a flashcard?",
        answer: "A small prompt-and-answer study aid used for active recall.",
        isDemo: true,
        qualityFlags: [],
      },
      {
        question: "What does active recall mean?",
        answer: "Trying to retrieve an answer from memory before checking it.",
        isDemo: true,
        qualityFlags: [],
      },
      {
        question: "Why use short flashcards?",
        answer: "They make each recall prompt focused and easier to review.",
        isDemo: true,
        qualityFlags: [],
      },
    ]);
    expect(proposals).toHaveLength(3);
    expect(proposals.every((proposal) => proposal.question.trim() && proposal.answer.trim())).toBe(true);
  });
});
