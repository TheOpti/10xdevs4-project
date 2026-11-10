import { describe, expect, it } from "vitest";
import { toTags } from "./flashcard-tags";

describe("tag validation", () => {
  it("normalizes whitespace and case, deduplicates, and preserves Polish characters", () => {
    expect(toTags(["React", "react", " react ", "\tŻÓŁĆ\u00a0  i\nKOŚĆ "])).toEqual(["react", "żółć i kość"]);
  });

  it("allows clearing tags and punctuation within a label", () => {
    expect(toTags([])).toEqual([]);
    expect(toTags(["C++ / C#, SQL"])).toEqual(["c++ / c#, sql"]);
  });

  it("counts Unicode code points after normalization", () => {
    expect(toTags(["😀".repeat(30)])).toEqual(["😀".repeat(30)]);
    expect(toTags(["😀".repeat(31)])).toBeNull();
    expect(toTags([" A".repeat(15) + " "])).toEqual(["a ".repeat(14) + "a"]);
    // Lowercasing can expand a character into multiple code points.
    expect(toTags(["İ".repeat(16)])).toBeNull();
  });

  it("limits distinct normalized tags rather than the original number of entries", () => {
    const tags = Array.from({ length: 10 }, (_, index) => `tag ${index}`);
    expect(toTags([...tags, " TAG 0 "])).toEqual(tags);
    expect(toTags([...tags, "extra"])).toBeNull();
  });

  it.each([null, undefined, {}, "react", [null], [2], [[]], [""], [" \t\n\u00a0\ufeff"], ["react", " "]])(
    "rejects malformed input or blank labels: %j",
    (input) => {
      expect(toTags(input)).toBeNull();
    },
  );
});
