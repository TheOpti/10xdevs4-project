import { describe, expect, it, vi } from "vitest";
import { loadReviewView } from "./review-views";

const setId = "10000000-0000-4000-8000-000000000001";
const queue = { setId, title: "Study", totalCards: 0, cards: [] };
const repository = (result: unknown) => ({ getQueue: vi.fn().mockResolvedValue(result) });

describe("review view", () => {
  it.each([0, 3])("keeps empty sets and no-due-card sets distinguishable (%s)", async (totalCards) => {
    const data = { ...queue, totalCards };
    await expect(loadReviewView(repository({ ok: true, data }), setId)).resolves.toEqual({
      status: "ready",
      queue: data,
      filter: { type: "all" },
    });
  });
  it.each([undefined, "bad"])("does not read invalid ID %s", async (id) => {
    const repo = repository(null);
    await expect(loadReviewView(repo, id)).resolves.toEqual({ status: "not-found" });
    expect(repo.getQueue).not.toHaveBeenCalled();
  });
  it("distinguishes hidden/missing data from unavailable data", async () => {
    await expect(loadReviewView(repository({ ok: false, error: "not-found" }), setId)).resolves.toEqual({
      status: "not-found",
    });
    await expect(loadReviewView(repository({ ok: false, error: "request-failed" }), setId)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(loadReviewView(null, setId)).resolves.toEqual({ status: "unavailable" });
    const repo = repository(null);
    repo.getQueue.mockRejectedValue(new Error("private"));
    await expect(loadReviewView(repo, setId)).resolves.toEqual({ status: "unavailable" });
  });
  it.each([
    ["?tag=C%2B%2B", { type: "tag", tag: "c++" }],
    ["?untagged=1", { type: "untagged" }],
    ["?tag=%FF", { type: "all" }],
    ["?tag=a&tag=b", { type: "all" }],
    ["?returnUrl=https://evil.example", { type: "all" }],
  ])("parses the raw query safely: %s", async (search, filter) => {
    await expect(loadReviewView(repository({ ok: true, data: queue }), setId, search)).resolves.toEqual({
      status: "ready",
      queue,
      filter,
    });
  });
});
