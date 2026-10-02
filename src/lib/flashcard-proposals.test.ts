import { describe, expect, it } from "vitest";
import {
  generateDemoFlashcardProposal,
  MAX_SOURCE_TEXT_CODE_POINTS,
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

describe("generateDemoFlashcardProposal", () => {
  it("always returns the fixed, clearly marked demo proposal", () => {
    expect(generateDemoFlashcardProposal()).toEqual({
      question: "What is a flashcard?",
      answer: "A small prompt-and-answer study aid used for active recall.",
      isDemo: true,
      qualityFlags: [],
    });
  });
});
