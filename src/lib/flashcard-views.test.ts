import { describe, expect, it, vi } from "vitest";
import {
  formatCatalogHref,
  formatCatalogQuery,
  formatSetHref,
  loadSetListView,
  loadSetView,
  parseCatalogFilter,
} from "./flashcard-views";
import type { FlashcardSetSummary } from "./flashcards";

const id = "123e4567-e89b-42d3-a456-426614174000";
const set = { id, title: "Empty set", createdAt: "2026-11-08", tags: [], cards: [] };

function repository(result: unknown) {
  return {
    getSetWithCards: vi.fn().mockResolvedValue(result),
    listSets: vi.fn().mockResolvedValue(result),
  };
}

describe("set page read states", () => {
  it("preserves an accessible empty set", async () => {
    await expect(loadSetView(repository({ ok: true, data: set }), id)).resolves.toEqual({ status: "ready", set });
  });

  it("returns not-found for invalid IDs without reading data", async () => {
    const repo = repository(null);
    for (const invalid of [undefined, "bad-id"]) {
      await expect(loadSetView(repo, invalid)).resolves.toEqual({ status: "not-found" });
    }
    expect(repo.getSetWithCards).not.toHaveBeenCalled();
  });

  it("returns the same not-found state for hidden and missing sets", async () => {
    await expect(loadSetView(repository({ ok: false, error: "not-found" }), id)).resolves.toEqual({
      status: "not-found",
    });
  });

  it("distinguishes failures and missing configuration from empty data", async () => {
    await expect(loadSetView(null, id)).resolves.toEqual({ status: "unavailable" });
    await expect(loadSetView(repository({ ok: false, error: "request-failed" }), id)).resolves.toEqual({
      status: "unavailable",
    });
    const repo = repository(null);
    vi.mocked(repo.getSetWithCards).mockRejectedValue(new Error("private detail"));
    await expect(loadSetView(repo, id)).resolves.toEqual({ status: "unavailable" });
  });
});

describe("catalog filter parsing and url formatting", () => {
  it.each(["?tag=%ZZ", "?tag=%FF", "?tag=%", "?tag=%C4", "?untagged=%FF"])(
    "resets malformed query encoding %s to all sets",
    (query) => {
      expect(parseCatalogFilter(query)).toEqual({ type: "all" });
    },
  );

  it.each(["100%", "%ZZ", "język polski", "c++", "�"])("preserves valid encoded label %s", (tag) => {
    expect(parseCatalogFilter(`?tag=${encodeURIComponent(tag)}`)).toEqual({ type: "tag", tag: tag.toLowerCase() });
  });

  it("parses valid tag filter and normalizes case and whitespace", () => {
    expect(parseCatalogFilter("?tag=biology")).toEqual({ type: "tag", tag: "biology" });
    expect(parseCatalogFilter("?tag=%20%20Biology%20%20")).toEqual({ type: "tag", tag: "biology" });
    expect(parseCatalogFilter(new URLSearchParams("tag=Polski%20J%C4%99zyk"))).toEqual({
      type: "tag",
      tag: "polski język",
    });
  });

  it("parses valid untagged filter parameter", () => {
    expect(parseCatalogFilter("?untagged=1")).toEqual({ type: "untagged" });
    expect(parseCatalogFilter(new URLSearchParams("untagged=1"))).toEqual({ type: "untagged" });
  });

  it("resets to all sets on conflicting or repeated parameters", () => {
    expect(parseCatalogFilter("?tag=biology&untagged=1")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?tag=biology&tag=chemistry")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?untagged=1&untagged=1")).toEqual({ type: "all" });
  });

  it("resets to all sets on malformed parameters or empty inputs", () => {
    expect(parseCatalogFilter("?untagged=0")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?untagged=true")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?untagged=")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?tag=")).toEqual({ type: "all" });
    expect(parseCatalogFilter("?tag=%20%20")).toEqual({ type: "all" });
    expect(parseCatalogFilter(`?tag=${"a".repeat(31)}`)).toEqual({ type: "all" });
    expect(parseCatalogFilter("?unrelated=1")).toEqual({ type: "all" });
    expect(parseCatalogFilter("")).toEqual({ type: "all" });
    expect(parseCatalogFilter(null)).toEqual({ type: "all" });
    expect(parseCatalogFilter(undefined)).toEqual({ type: "all" });
  });

  it("formats catalog queries and safe navigation links", () => {
    expect(formatCatalogQuery({ type: "all" })).toBe("");
    expect(formatCatalogQuery({ type: "untagged" })).toBe("?untagged=1");
    expect(formatCatalogQuery({ type: "tag", tag: "c++ / c#" })).toBe("?tag=c%2B%2B%20%2F%20c%23");

    expect(formatCatalogHref({ type: "all" })).toBe("/dashboard");
    expect(formatCatalogHref({ type: "untagged" })).toBe("/dashboard?untagged=1");
    expect(formatCatalogHref({ type: "tag", tag: "biology" })).toBe("/dashboard?tag=biology");

    expect(formatSetHref("123", { type: "all" })).toBe("/dashboard/sets/123");
    expect(formatSetHref("123", { type: "untagged" })).toBe("/dashboard/sets/123?untagged=1");
    expect(formatSetHref("123", { type: "tag", tag: "biology" })).toBe("/dashboard/sets/123?tag=biology");
  });
});

describe("catalog list view and filtering", () => {
  const set1: FlashcardSetSummary = {
    id: "set-1",
    title: "Zestaw 1",
    createdAt: "2026-11-10T12:00:00Z",
    tags: ["chemia", "biologia"],
  };
  const set2: FlashcardSetSummary = {
    id: "set-2",
    title: "Zestaw 2",
    createdAt: "2026-11-09T12:00:00Z",
    tags: ["fizyka", "biologia"],
  };
  const emptySet: FlashcardSetSummary = {
    id: "set-3",
    title: "Zestaw 3 (Empty / Untagged)",
    createdAt: "2026-11-08T12:00:00Z",
    tags: [],
  };

  it("keeps an empty collection distinct from a failed read", async () => {
    await expect(loadSetListView(repository({ ok: true, data: [] }))).resolves.toEqual({
      status: "ready",
      sets: [],
      totalSetsCount: 0,
      availableTags: [],
      filter: { type: "all" },
    });
    await expect(loadSetListView(repository({ ok: false, error: "request-failed" }))).resolves.toEqual({
      status: "unavailable",
    });
    await expect(loadSetListView(null)).resolves.toEqual({ status: "unavailable" });
    const repo = repository(null);
    vi.mocked(repo.listSets).mockRejectedValue(new Error("private detail"));
    await expect(loadSetListView(repo)).resolves.toEqual({ status: "unavailable" });
  });

  it("derives distinct sorted available tags from owner sets", async () => {
    const result = await loadSetListView(repository({ ok: true, data: [set1, set2, emptySet] }));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.availableTags).toEqual(["biologia", "chemia", "fizyka"]);
      expect(result.totalSetsCount).toBe(3);
      expect(result.sets).toHaveLength(3);
    }
  });

  it("filters by single tag while preserving relative ordering", async () => {
    const result = await loadSetListView(repository({ ok: true, data: [set1, set2, emptySet] }), "?tag=biologia");
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.filter).toEqual({ type: "tag", tag: "biologia" });
      expect(result.sets.map((s) => s.id)).toEqual(["set-1", "set-2"]);
      expect(result.totalSetsCount).toBe(3);
      expect(result.availableTags).toEqual(["biologia", "chemia", "fizyka"]);
    }
  });

  it("filters untagged sets including empty sets", async () => {
    const result = await loadSetListView(repository({ ok: true, data: [set1, set2, emptySet] }), "?untagged=1");
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.filter).toEqual({ type: "untagged" });
      expect(result.sets.map((s) => s.id)).toEqual(["set-3"]);
      expect(result.totalSetsCount).toBe(3);
    }
  });

  it("keeps a valid but unused tag selected and produces an empty matching sets view", async () => {
    const result = await loadSetListView(repository({ ok: true, data: [set1, set2, emptySet] }), "?tag=astronomia");
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.filter).toEqual({ type: "tag", tag: "astronomia" });
      expect(result.sets).toEqual([]);
      expect(result.totalSetsCount).toBe(3);
      expect(result.availableTags).toEqual(["biologia", "chemia", "fizyka"]);
    }
  });
});
