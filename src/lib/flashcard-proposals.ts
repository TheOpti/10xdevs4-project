export const MAX_SOURCE_TEXT_CODE_POINTS = 10_000;

export interface FlashcardProposalInput {
  title: string;
  sourceText: string;
}

export interface FlashcardProposal {
  question: string;
  answer: string;
  isDemo: true;
  qualityFlags: string[];
}

export type FlashcardProposalValidationResult =
  | { valid: true }
  | { valid: false; error: "title-required" | "source-text-required" | "source-text-too-long" };

export function validateFlashcardProposalInput(
  input: FlashcardProposalInput,
): FlashcardProposalValidationResult {
  if (input.title.trim().length === 0) {
    return { valid: false, error: "title-required" };
  }

  if (input.sourceText.trim().length === 0) {
    return { valid: false, error: "source-text-required" };
  }

  if (Array.from(input.sourceText).length > MAX_SOURCE_TEXT_CODE_POINTS) {
    return { valid: false, error: "source-text-too-long" };
  }

  return { valid: true };
}

export function generateDemoFlashcardProposal(): FlashcardProposal {
  return {
    question: "What is a flashcard?",
    answer: "A small prompt-and-answer study aid used for active recall.",
    isDemo: true,
    qualityFlags: [],
  };
}
