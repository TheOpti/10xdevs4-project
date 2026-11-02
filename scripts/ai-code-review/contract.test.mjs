import { describe, expect, it } from "vitest";
import { CRITERIA, REVIEW_SCHEMA, nonReviewOutcome, parseReview } from "./contract.mjs";

const review = (scores = [6, 6, 6, 6, 6, 6]) => ({
  summary: "Evidence supports the change.",
  criteria: Object.fromEntries(
    CRITERIA.map((name, index) => [name, { score: scores[index], explanation: "Visible evidence." }]),
  ),
});
const parse = (value) => parseReview(JSON.stringify(value));

describe("strict review contract", () => {
  it.each([
    [[6, 6, 6, 6, 6, 6], "pass"],
    [[3, 10, 10, 10, 10, 10], "fail"],
    [[5, 6, 6, 6, 6, 6], "fail"],
    [[4, 4, 7, 7, 7, 7], "pass"],
    [[1, 1, 1, 1, 1, 1], "fail"],
    [[10, 10, 10, 10, 10, 10], "pass"],
  ])("calculates the verdict for %j", (scores, verdict) => {
    expect(parse(review(scores))).toMatchObject({
      status: "complete",
      verdict,
      average: scores.reduce((a, b) => a + b) / 6,
    });
  });

  it.each([0, 11, -1, 6.5, "6", null, true])("rejects invalid score %j", (score) => {
    expect(parse(review([score, 6, 6, 6, 6, 6]))).toEqual({ status: "operational-error", reason: "invalid-review" });
  });

  it.each([
    (value) => {
      delete value.summary;
    },
    (value) => {
      value.verdict = "pass";
    },
    (value) => {
      delete value.criteria.securitySafety;
    },
    (value) => {
      value.criteria.extra = { score: 10, explanation: "Extra" };
    },
    (value) => {
      value.criteria.complexity.extra = "unexpected";
    },
    (value) => {
      delete value.criteria.complexity.explanation;
    },
    (value) => {
      value.criteria = [];
    },
    (value) => {
      value.criteria.complexity = null;
    },
    (value) => {
      value.summary = " \n\t";
    },
    (value) => {
      value.criteria.complexity.explanation = "";
    },
    (value) => {
      value.summary = "😀".repeat(2001);
    },
    (value) => {
      value.criteria.complexity.explanation = "😀".repeat(1001);
    },
  ])("rejects missing/extra fields and invalid text %#", (mutate) => {
    const value = review();
    mutate(value);
    expect(parse(value).status).toBe("operational-error");
  });

  it.each(["{", "null", "[]", "42", '""', '{"summary":"x","criteria":null}', "not json", undefined])(
    "rejects malformed or non-object JSON %j",
    (text) => {
      expect(parseReview(text).status).toBe("operational-error");
    },
  );

  it("counts Unicode code points at the exact text boundaries", () => {
    const value = review();
    value.summary = "😀".repeat(2000);
    value.criteria.complexity.explanation = "😀".repeat(1000);
    expect(parse(value).status).toBe("complete");
  });

  it("publishes the same strict schema for provider use", () => {
    expect(REVIEW_SCHEMA.additionalProperties).toBe(false);
    expect(REVIEW_SCHEMA.properties.criteria.required).toEqual(CRITERIA);
    for (const name of CRITERIA) {
      const schema = REVIEW_SCHEMA.properties.criteria.properties[name];
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.score).toEqual({ type: "integer", minimum: 1, maximum: 10 });
      expect(schema.properties.explanation.maxLength).toBe(1000);
    }
  });

  it.each(["unavailable", "operational-error", "skipped", "superseded"])(
    "keeps %s separate from quality verdicts",
    (status) => {
      expect(nonReviewOutcome(status, "safe-code")).toEqual({ status, reason: "safe-code" });
    },
  );
  it("does not construct an unvalidated complete result", () => {
    expect(() => nonReviewOutcome("complete", "anything")).toThrow(TypeError);
  });
});
