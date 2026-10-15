export const MAX_TITLE_CODE_POINTS = 255;
export const MAX_SOURCE_TEXT_CODE_POINTS = 10_000;

export const MAX_ANSWER_QUALITY_CODE_POINTS = 300;

export interface FlashcardProposalInput {
  title: string;
  sourceText: string;
}

export interface FlashcardProposal {
  question: string;
  answer: string;
  isDemo?: boolean;
  qualityFlags: string[];
}

export function normalizeFlashcardText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeQualityFlags(
  question: string,
  answer: string,
  existingCards: { question: string; answer: string }[] = [],
): string[] {
  const flags: string[] = [];

  if (Array.from(answer.trim()).length > MAX_ANSWER_QUALITY_CODE_POINTS) {
    flags.push("long-answer");
  }

  const normQ = normalizeFlashcardText(question);
  const normA = normalizeFlashcardText(answer);

  if (normQ.length > 0 && normQ === normA) {
    flags.push("identical-qa");
  }

  if (normQ.length > 0 && existingCards.some((card) => normalizeFlashcardText(card.question) === normQ)) {
    flags.push("duplicate-question");
  }

  if (normA.length > 0 && existingCards.some((card) => normalizeFlashcardText(card.answer) === normA)) {
    flags.push("duplicate-answer");
  }

  return flags;
}

export type FlashcardProposalValidationResult =
  | { valid: true }
  | {
      valid: false;
      error: "title-required" | "title-too-long" | "source-text-required" | "source-text-too-long";
    };

export function validateFlashcardProposalInput(input: FlashcardProposalInput): FlashcardProposalValidationResult {
  if (input.title.trim().length === 0) {
    return { valid: false, error: "title-required" };
  }

  if (Array.from(input.title).length > MAX_TITLE_CODE_POINTS) {
    return { valid: false, error: "title-too-long" };
  }

  if (input.sourceText.trim().length === 0) {
    return { valid: false, error: "source-text-required" };
  }

  if (Array.from(input.sourceText).length > MAX_SOURCE_TEXT_CODE_POINTS) {
    return { valid: false, error: "source-text-too-long" };
  }

  return { valid: true };
}

export function generateDemoFlashcardProposals(): FlashcardProposal[] {
  return [
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
  ];
}
