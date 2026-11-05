import { describe, expect, it } from "vitest";
import { formatDuration, truncate } from "./formatters";

describe("truncate", () => {
  it("returns empty string for invalid inputs or zero length", () => {
    // @ts-expect-error Testing invalid runtime input
    expect(truncate(null, 5)).toBe("");
    expect(truncate("hello", 0)).toBe("");
  });

  it("leaves text shorter than maxLength untouched", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates text and appends suffix when exceeding maxLength", () => {
    expect(truncate("hello world", 8)).toBe("hello...");
    expect(truncate("long text here", 7, "!")).toBe("long t!");
  });
});

describe("formatDuration", () => {
  it("formats seconds less than a minute", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats exact minutes", () => {
    expect(formatDuration(120)).toBe("2m");
  });

  it("formats combination of minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("handles non-positive or invalid values safely", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(-10)).toBe("0s");
    expect(formatDuration(NaN)).toBe("0s");
  });
});
