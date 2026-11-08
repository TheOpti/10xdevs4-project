import { describe, expect, it } from "vitest";
import { isUuid, toCard } from "./flashcard-validation";

describe("flashcard validation", () => {
  it("normalizes fields and excludes ownership and relation fields", () => {
    expect(
      toCard({ question: " Q\n", answer: " A ", owner_id: "other", set_id: "other", save_operation_id: "other" }),
    ).toEqual({ question: "Q", answer: "A" });
  });

  it.each([
    null,
    [],
    "card",
    {},
    { question: 1, answer: "A" },
    { question: "Q", answer: null },
    { question: " \n", answer: "A" },
    { question: "Q", answer: "\t" },
  ])("rejects invalid fields: %j", (value) => {
    expect(toCard(value)).toBeNull();
  });

  it.each(["question", "answer"])("counts Unicode code points in %s after trimming", (field) => {
    expect(
      toCard({ question: "Q", answer: "A", [field]: ` ${"😀".repeat(1000)} ` })?.[field as "question" | "answer"],
    ).toBe("😀".repeat(1000));
    expect(toCard({ question: "Q", answer: "A", [field]: "😀".repeat(1001) })).toBeNull();
  });

  it("validates UUIDs using the existing save contract", () => {
    expect(isUuid("123E4567-E89B-42D3-A456-426614174000")).toBe(true);
    for (const value of [null, 123, "", "card-id", "123e4567-e89b-02d3-a456-426614174000"]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});
