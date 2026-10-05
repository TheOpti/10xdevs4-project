export interface ReviewSaveCard {
  question: string;
  answer: string;
}

export function cardBatchesMatch(first: ReviewSaveCard[], second: ReviewSaveCard[]): boolean {
  return (
    first.length === second.length &&
    first.every((card, index) => card.question === second[index]?.question && card.answer === second[index]?.answer)
  );
}
