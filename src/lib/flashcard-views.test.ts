import { describe, expect, it, vi } from "vitest";
import { loadSetListView, loadSetView } from "./flashcard-views";

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

describe("dashboard read states", () => {
  it("keeps an empty list distinct from a failed read", async () => {
    await expect(loadSetListView(repository({ ok: true, data: [] }))).resolves.toEqual({ status: "ready", sets: [] });
    await expect(loadSetListView(repository({ ok: false, error: "request-failed" }))).resolves.toEqual({
      status: "unavailable",
    });
    await expect(loadSetListView(null)).resolves.toEqual({ status: "unavailable" });
    const repo = repository(null);
    vi.mocked(repo.listSets).mockRejectedValue(new Error("private detail"));
    await expect(loadSetListView(repo)).resolves.toEqual({ status: "unavailable" });
  });
});
