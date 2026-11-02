export const CRITERIA = Object.freeze([
  "implementationCorrectness",
  "idiomaticity",
  "complexity",
  "testRiskCoverage",
  "documentation",
  "securitySafety",
]);

const textSchema = (maxLength) => ({ type: "string", minLength: 1, maxLength, pattern: "\\S" });

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "criteria"],
  properties: {
    summary: textSchema(2000),
    criteria: {
      type: "object",
      additionalProperties: false,
      required: [...CRITERIA],
      properties: Object.fromEntries(
        CRITERIA.map((name) => [
          name,
          {
            type: "object",
            additionalProperties: false,
            required: ["score", "explanation"],
            properties: { score: { type: "integer", minimum: 1, maximum: 10 }, explanation: textSchema(1000) },
          },
        ]),
      ),
    },
  },
};

// Non-review states deliberately have no scores or verdict.
export function nonReviewOutcome(status, reason) {
  if (!["unavailable", "operational-error", "skipped", "superseded"].includes(status)) {
    throw new TypeError("Invalid non-review status");
  }
  return { status, reason };
}

function exactKeys(value, keys) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validText(value, maximum) {
  return typeof value === "string" && value.trim().length > 0 && [...value].length <= maximum;
}

export function parseReview(text) {
  const invalid = () => nonReviewOutcome("operational-error", "invalid-review");
  if (typeof text !== "string") return invalid();
  let review;
  try {
    review = JSON.parse(text);
  } catch {
    return invalid();
  }
  if (
    !exactKeys(review, ["summary", "criteria"]) ||
    !validText(review.summary, 2000) ||
    !exactKeys(review.criteria, CRITERIA)
  )
    return invalid();
  for (const name of CRITERIA) {
    const criterion = review.criteria[name];
    if (
      !exactKeys(criterion, ["score", "explanation"]) ||
      !Number.isInteger(criterion.score) ||
      criterion.score < 1 ||
      criterion.score > 10 ||
      !validText(criterion.explanation, 1000)
    )
      return invalid();
  }
  const scores = CRITERIA.map((name) => review.criteria[name].score);
  const sum = scores.reduce((total, score) => total + score, 0);
  return {
    status: "complete",
    review,
    average: sum / 6,
    verdict: scores.some((score) => score <= 3) || sum < 36 ? "fail" : "pass",
  };
}
