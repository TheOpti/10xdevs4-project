export interface ReviewSaveCard {
  question: string;
  answer: string;
}

function normalizeCard(card: ReviewSaveCard): ReviewSaveCard {
  return {
    question: card.question.trim(),
    answer: card.answer.trim(),
  };
}

export function cardBatchesMatch(first: ReviewSaveCard[], second: ReviewSaveCard[]): boolean {
  if (first.length !== second.length) {
    return false;
  }

  const sortFn = (a: ReviewSaveCard, b: ReviewSaveCard) => {
    const qComp = a.question.localeCompare(b.question);
    if (qComp !== 0) return qComp;
    return a.answer.localeCompare(b.answer);
  };

  const sortedFirst = first.map(normalizeCard).sort(sortFn);
  const sortedSecond = second.map(normalizeCard).sort(sortFn);

  return sortedFirst.every(
    (card, index) => card.question === sortedSecond[index]?.question && card.answer === sortedSecond[index]?.answer,
  );
}
