import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlashcardRepository } from "@/lib/flashcards";
import { PATCH, DELETE } from "./[cardId]";

vi.mock("@/lib/flashcards", () => ({ createFlashcardRepository: vi.fn() }));
const cardId = "123e4567-e89b-42d3-a456-426614174000";
const card = { id: cardId, question: "Q", answer: "A", createdAt: "2026-11-08T12:00:00Z" };
const updateCard = vi.fn();
const deleteCard = vi.fn();

function context(
  method = "PATCH",
  body = JSON.stringify({ question: " Q ", answer: " A " }),
  id = cardId,
  headers?: HeadersInit,
) {
  return {
    params: { cardId: id },
    cookies: {} as AstroCookies,
    request: new Request(`http://localhost/api/flashcards/cards/${id}`, {
      method,
      ...(method === "PATCH" ? { body } : {}),
      headers,
    }),
  } as unknown as Parameters<typeof PATCH>[0];
}

describe("saved card API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createFlashcardRepository).mockReturnValue({ updateCard, deleteCard } as never);
    updateCard.mockResolvedValue({ ok: true, data: card });
    deleteCard.mockResolvedValue({ ok: true, data: undefined });
  });

  it("updates normalized text only and returns the persisted card", async () => {
    const response = await PATCH(
      context(
        "PATCH",
        JSON.stringify({
          question: " Q ",
          answer: " A ",
          owner_id: "intruder",
          setId: "other",
          save_operation_id: "other",
        }),
      ),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ card });
    expect(updateCard).toHaveBeenCalledExactlyOnceWith(cardId, { question: "Q", answer: "A" });
  });

  it("deletes only the addressed card and returns an empty 204", async () => {
    const response = await DELETE(context("DELETE"));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(deleteCard).toHaveBeenCalledExactlyOnceWith(cardId);
  });

  it.each([
    "not json",
    "null",
    "{}",
    JSON.stringify({ question: " ", answer: "A" }),
    JSON.stringify({ question: "Q", answer: "😀".repeat(1001) }),
    " ".repeat(48 * 1024) + "{}",
  ])("rejects invalid or oversized bodies before writing", async (body) => {
    expect((await PATCH(context("PATCH", body))).status).toBe(400);
    expect(createFlashcardRepository).not.toHaveBeenCalled();
  });

  it("rejects a declared oversized body", async () => {
    expect((await PATCH(context("PATCH", "{}", cardId, { "content-length": String(48 * 1024 + 1) }))).status).toBe(400);
    expect(updateCard).not.toHaveBeenCalled();
  });

  it.each([PATCH, DELETE])("rejects invalid IDs before accessing data", async (handler) => {
    expect((await handler(context("DELETE", "", "bad-id"))).status).toBe(400);
    expect(createFlashcardRepository).not.toHaveBeenCalled();
  });

  it.each([PATCH, DELETE])("returns 503 when the repository is unavailable", async (handler) => {
    vi.mocked(createFlashcardRepository).mockReturnValue(null);
    const response = await handler(context());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Service unavailable" });
  });

  it.each([PATCH, DELETE])("uses the same 404 for hidden and missing cards", async (handler) => {
    updateCard.mockResolvedValue({ ok: false, error: "not-found" });
    deleteCard.mockResolvedValue({ ok: false, error: "not-found" });
    const response = await handler(context());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Card not found" });
  });

  it.each([PATCH, DELETE])("hides database failures and rejected requests", async (handler) => {
    for (const rejected of [false, true]) {
      for (const operation of [updateCard, deleteCard]) {
        if (rejected) operation.mockRejectedValue(new Error("secret database details"));
        else operation.mockResolvedValue({ ok: false, error: "request-failed" });
      }
      const response = await handler(context());
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("secret");
    }
  });
});
