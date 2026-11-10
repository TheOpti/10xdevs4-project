import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlashcardRepository } from "@/lib/flashcards";
import { PATCH } from "./tags";

vi.mock("@/lib/flashcards", () => ({ createFlashcardRepository: vi.fn() }));
const setId = "123e4567-e89b-42d3-a456-426614174000";
const updateSetTags = vi.fn();

function context(body = JSON.stringify({ tags: [" React ", "react"] }), id = setId, headers?: HeadersInit) {
  return {
    params: { setId: id },
    cookies: {},
    request: new Request(`http://localhost/api/flashcards/sets/${id}/tags`, { method: "PATCH", body, headers }),
  } as unknown as Parameters<typeof PATCH>[0];
}

describe("set tags API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createFlashcardRepository).mockReturnValue({ updateSetTags } as never);
    updateSetTags.mockResolvedValue({ ok: true, data: ["react"] });
  });

  it("writes normalized tags only and returns confirmed data", async () => {
    updateSetTags.mockResolvedValue({ ok: true, data: ["confirmed"] });
    const response = await PATCH(
      context(JSON.stringify({ tags: [" React ", "react"], title: "stolen", owner_id: "other" })),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tags: ["confirmed"] });
    expect(updateSetTags).toHaveBeenCalledExactlyOnceWith(setId, ["react"]);
  });

  it("accepts an empty array to clear all assignments", async () => {
    updateSetTags.mockResolvedValue({ ok: true, data: [] });
    const response = await PATCH(context('{"tags":[]}'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tags: [] });
    expect(updateSetTags).toHaveBeenCalledExactlyOnceWith(setId, []);
  });

  it.each([
    "not json",
    "null",
    "[]",
    "{}",
    '{"tags":"react"}',
    '{"tags":[null]}',
    '{"tags":[" "]}',
    JSON.stringify({ tags: ["😀".repeat(31)] }),
    JSON.stringify({ tags: Array.from({ length: 11 }, (_, index) => `tag${index}`) }),
    " ".repeat(48 * 1024) + "{}",
  ])("rejects invalid bodies without accessing data", async (body) => {
    expect((await PATCH(context(body))).status).toBe(400);
    expect(createFlashcardRepository).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and declared oversized requests", async () => {
    expect((await PATCH(context(undefined, "invalid"))).status).toBe(400);
    expect((await PATCH(context("{}", setId, { "content-length": String(48 * 1024 + 1) }))).status).toBe(400);
    expect(createFlashcardRepository).not.toHaveBeenCalled();
  });

  it("returns 503 when configuration is unavailable", async () => {
    vi.mocked(createFlashcardRepository).mockReturnValue(null);
    const response = await PATCH(context());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Service unavailable" });
  });

  it.each([
    ["not-found", 404, "Set not found"],
    ["invalid-input", 400, "Invalid request"],
    ["request-failed", 500, "Unable to update tags"],
  ])("maps repository error %s to a safe response", async (error, status, message) => {
    updateSetTags.mockResolvedValue({ ok: false, error });
    const response = await PATCH(context());
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
  });

  it("does not disclose thrown database details", async () => {
    updateSetTags.mockRejectedValue(new Error("private database details"));
    const response = await PATCH(context());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to update tags" });
  });
});
