import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReviewRepository } from "@/lib/flashcard-reviews";
import { POST } from "./review";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/flashcard-reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/flashcard-reviews")>()),
  createReviewRepository: vi.fn(),
}));
const cardId = "20000000-0000-4000-8000-000000000001";
const input = { requestId: "30000000-0000-4000-8000-000000000001", expectedRevision: 0, rating: "hard" };
const receipt = { ...input, cardId, revision: 1, ratedAt: "2026-11-13T12:00:00Z", dueAt: "2026-11-16T12:00:00Z" };
const rateCard = vi.fn();
function context(body = JSON.stringify(input), id = cardId, headers?: HeadersInit) {
  return {
    params: { cardId: id },
    cookies: {},
    request: new Request(`http://localhost/api/flashcards/cards/${id}/review`, { method: "POST", body, headers }),
  } as unknown as Parameters<typeof POST>[0];
}

describe("review POST", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createReviewRepository).mockReturnValue({ rateCard } as never);
    rateCard.mockResolvedValue({ ok: true, data: receipt });
  });
  it("returns the same receipt for success and replay without caching", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await POST(context());
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ review: receipt });
    }
    expect(rateCard.mock.calls).toEqual([
      [cardId, input],
      [cardId, input],
    ]);
  });
  it.each([
    "not JSON",
    "null",
    "[]",
    "{}",
    " ".repeat(48 * 1024) + "{}",
    ...[
      { ...input, rating: "good" },
      { ...input, expectedRevision: -1 },
      { ...input, expectedRevision: 0.5 },
      { ...input, requestId: "bad" },
      { ...input, owner_id: "intruder" },
      { ...input, dueAt: "2099-01-01" },
    ].map((value) => JSON.stringify(value)),
  ])("rejects invalid or oversized bodies %# before accessing data", async (body) => {
    const response = await POST(context(body));
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(createReviewRepository).not.toHaveBeenCalled();
  });
  it("rejects invalid card IDs and excessive declared lengths", async () => {
    expect((await POST(context(JSON.stringify(input), "bad"))).status).toBe(400);
    expect((await POST(context(JSON.stringify(input), cardId, { "content-length": "49153" }))).status).toBe(400);
    expect(rateCard).not.toHaveBeenCalled();
  });
  it.each([
    ["invalid-input", 400, "Invalid request"],
    ["unauthenticated", 401, "Authentication required"],
    ["not-found", 404, "Card not found"],
    ["conflict", 409, "Card changed or was already reviewed"],
    ["request-failed", 500, "Unable to save review"],
  ] as const)("maps %s to %s with sanitized JSON", async (error, status, message) => {
    rateCard.mockResolvedValue({ ok: false, error });
    const response = await POST(context());
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: message });
  });
  it("returns uncached 503 for missing configuration", async () => {
    vi.mocked(createReviewRepository).mockReturnValue(null);
    const response = await POST(context());
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Service unavailable" });
  });
  it.each(["factory", "request"])("sanitizes unexpected %s failures", async (where) => {
    if (where === "factory")
      vi.mocked(createReviewRepository).mockImplementation(() => {
        throw new Error("secret");
      });
    else rateCard.mockRejectedValue(new Error("secret"));
    const response = await POST(context());
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Unable to save review" });
  });
});
