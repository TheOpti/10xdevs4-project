import { describe, expect, it } from "vitest";
import { initialTagState, tagEditorReducer as reduce, tagsFromResponse } from "./tag-editor-state";

describe("tag editor state", () => {
  it("initializes with confirmed tags and empty input", () => {
    const state = initialTagState(["biology", "exam 1"]);
    expect(state.confirmedTags).toEqual(["biology", "exam 1"]);
    expect(state.draftTags).toEqual(["biology", "exam 1"]);
    expect(state.input).toBe("");
    expect(state.pending).toBe(false);
    expect(state.missing).toBe(false);
    expect(state.message).toBeNull();
  });

  it("adds and normalizes tags with spaces and punctuation", () => {
    let state = initialTagState(["biology"]);
    state = reduce(state, { type: "input", value: "  C++ / C#, SQL  " });
    state = reduce(state, { type: "add" });
    expect(state.draftTags).toEqual(["biology", "c++ / c#, sql"]);
    expect(state.input).toBe("");
    expect(state.message).toBeNull();
  });

  it("rejects blank or invalid labels and limits code points", () => {
    let state = initialTagState([]);
    state = reduce(state, { type: "input", value: "   " });
    state = reduce(state, { type: "add" });
    expect(state.draftTags).toEqual([]);
    expect(state.message).toBe("Enter a tag containing 1–30 characters.");

    state = reduce(state, { type: "input", value: "a".repeat(31) });
    state = reduce(state, { type: "add" });
    expect(state.draftTags).toEqual([]);
    expect(state.message).toBe("Tags must contain between 1 and 30 characters.");
  });

  it("deduplicates tags after normalization", () => {
    let state = initialTagState(["react"]);
    state = reduce(state, { type: "input", value: "  REACT  " });
    state = reduce(state, { type: "add" });
    expect(state.draftTags).toEqual(["react"]);
    expect(state.message).toBe("This tag is already in your list.");
  });

  it("enforces the 10-tag limit per set", () => {
    const existing = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
    let state = initialTagState(existing);
    state = reduce(state, { type: "input", value: "extra" });
    state = reduce(state, { type: "add" });
    expect(state.draftTags).toEqual(existing);
    expect(state.message).toBe("Sets are limited to 10 tags.");
  });

  it("removes draft tags without affecting confirmed tags", () => {
    let state = initialTagState(["a", "b"]);
    state = reduce(state, { type: "remove", tag: "a" });
    expect(state.draftTags).toEqual(["b"]);
    expect(state.confirmedTags).toEqual(["a", "b"]);
  });

  it("cancels edits and restores the most recently confirmed values", () => {
    let state = initialTagState(["initial"]);
    state = reduce(state, { type: "input", value: "draft-tag" });
    state = reduce(state, { type: "add" });
    state = reduce(state, { type: "remove", tag: "initial" });
    expect(state.draftTags).toEqual(["draft-tag"]);

    state = reduce(state, { type: "cancel" });
    expect(state.draftTags).toEqual(["initial"]);
    expect(state.confirmedTags).toEqual(["initial"]);
    expect(state.input).toBe("");
  });

  it("blocks modifications while saving is pending", () => {
    let state = initialTagState(["initial"]);
    state = reduce(state, { type: "pending" });
    expect(state.pending).toBe(true);

    expect(reduce(state, { type: "input", value: "foo" })).toBe(state);
    expect(reduce(state, { type: "add" })).toBe(state);
    expect(reduce(state, { type: "remove", tag: "initial" })).toBe(state);
    expect(reduce(state, { type: "cancel" })).toBe(state);
  });

  it("preserves draft tags on operational failure and allows retry", () => {
    let state = initialTagState(["initial"]);
    state = reduce(state, { type: "add" });
    state = reduce(state, { type: "input", value: "unsaved" });
    state = reduce(state, { type: "add" });
    state = reduce(state, { type: "pending" });

    const failed = reduce(state, {
      type: "failed",
      message: "Could not save tags. Your changes are kept here.",
    });
    expect(failed.pending).toBe(false);
    expect(failed.draftTags).toEqual(["initial", "unsaved"]);
    expect(failed.confirmedTags).toEqual(["initial"]);
    expect(failed.message).toBe("Could not save tags. Your changes are kept here.");
    expect(failed.missing).toBe(false);
  });

  it("preserves draft tags and marks set missing on 404 response", () => {
    let state = initialTagState(["initial"]);
    state = reduce(state, { type: "input", value: "unsaved" });
    state = reduce(state, { type: "add" });
    state = reduce(state, { type: "pending" });

    const missing = reduce(state, {
      type: "failed",
      missing: true,
      message: "This set is no longer available.",
    });
    expect(missing.pending).toBe(false);
    expect(missing.missing).toBe(true);
    expect(missing.draftTags).toEqual(["initial", "unsaved"]);
    expect(missing.confirmedTags).toEqual(["initial"]);

    // Further additions/removals are blocked when missing
    expect(reduce(missing, { type: "add" })).toBe(missing);
    expect(reduce(missing, { type: "remove", tag: "initial" })).toBe(missing);
  });

  it("updates confirmed tags and clears draft input on successful save", () => {
    let state = initialTagState(["initial"]);
    state = reduce(state, { type: "input", value: "new-tag" });
    state = reduce(state, { type: "add" });
    state = reduce(state, { type: "pending" });

    const saved = reduce(state, { type: "saved", tags: ["initial", "new-tag"] });
    expect(saved.pending).toBe(false);
    expect(saved.confirmedTags).toEqual(["initial", "new-tag"]);
    expect(saved.draftTags).toEqual(["initial", "new-tag"]);
    expect(saved.message).toBe("Tags saved.");
  });

  it("validates server response using tagsFromResponse", () => {
    expect(tagsFromResponse({ tags: ["Biology", " Math "] })).toEqual(["biology", "math"]);
    expect(tagsFromResponse({ tags: [] })).toEqual([]);
    expect(tagsFromResponse(null)).toBeNull();
    expect(tagsFromResponse({})).toBeNull();
    expect(tagsFromResponse({ tags: "not-an-array" })).toBeNull();
    expect(tagsFromResponse({ tags: [123] })).toBeNull();
    expect(tagsFromResponse({ tags: [""] })).toBeNull();
    expect(tagsFromResponse({ tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`) })).toBeNull();
  });
});
