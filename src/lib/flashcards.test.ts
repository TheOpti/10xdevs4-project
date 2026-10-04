import type { AstroCookies } from "astro";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFlashcardRepository } from "@/lib/flashcards";
import { createClient } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

const mockedCreateClient = vi.mocked(createClient);
const requestHeaders = new Headers();
const cookies = {} as AstroCookies;

function createRepository(supabase: object) {
  mockedCreateClient.mockReturnValue(supabase as never);

  const repository = createFlashcardRepository(requestHeaders, cookies);
  if (!repository) {
    throw new Error("Expected the configured repository");
  }

  return repository;
}

describe("createFlashcardRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when Supabase is not configured", () => {
    mockedCreateClient.mockReturnValue(null);

    expect(createFlashcardRepository(requestHeaders, cookies)).toBeNull();
  });

  it("rejects an empty set input before issuing a database request", async () => {
    const rpc = vi.fn();
    const repository = createRepository({ rpc });

    await expect(repository.createSet({ title: "  ", sourceText: "Source" })).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates a set through the atomic RPC without accepting an owner ID", async () => {
    const overrideTypes = vi.fn().mockResolvedValue({ data: "set-id", error: null });
    const single = vi.fn().mockReturnValue({ overrideTypes });
    const rpc = vi.fn().mockReturnValue({ single });
    const repository = createRepository({ rpc });

    await expect(repository.createSet({ title: "Biology", sourceText: "Cells are alive." })).resolves.toEqual({
      ok: true,
      data: { id: "set-id" },
    });
    expect(rpc).toHaveBeenCalledWith("create_flashcard_set_with_source", {
      set_title: "Biology",
      set_source_text: "Cells are alive.",
    });
  });

  it("saves a reviewed batch through the idempotent RPC without accepting an owner ID", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          was_created: true,
          id: "card-id",
          question: "What is a cell?",
          answer: "The smallest unit of life.",
          created_at: "2026-10-04T12:00:00.000Z",
        },
      ],
      error: null,
    });
    const repository = createRepository({ rpc });
    const input = {
      setId: "set-id",
      requestId: "request-id",
      cards: [{ question: "What is a cell?", answer: "The smallest unit of life." }],
    };

    await expect(repository.saveCards(input)).resolves.toEqual({
      ok: true,
      data: {
        setId: "set-id",
        created: true,
        cards: [
          {
            id: "card-id",
            question: "What is a cell?",
            answer: "The smallest unit of life.",
            createdAt: "2026-10-04T12:00:00.000Z",
          },
        ],
      },
    });
    expect(rpc).toHaveBeenCalledWith("save_reviewed_flashcards", {
      set_id: input.setId,
      request_id: input.requestId,
      cards: input.cards,
    });
  });

  it("rejects an empty reviewed batch before issuing a database request", async () => {
    const rpc = vi.fn();
    const repository = createRepository({ rpc });

    await expect(repository.saveCards({ setId: "set-id", requestId: "request-id", cards: [] })).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns cards without selecting or exposing stored source text", async () => {
    const overrideTypes = vi.fn().mockResolvedValue({
      data: {
        id: "set-id",
        title: "Biology",
        created_at: "2026-09-24T12:00:00.000Z",
        flashcards: [
          {
            id: "card-id",
            question: "What is a cell?",
            answer: "The smallest unit of life.",
            created_at: "2026-09-24T12:00:00.000Z",
          },
        ],
      },
      error: null,
    });
    const maybeSingle = vi.fn().mockReturnValue({ overrideTypes });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const repository = createRepository({ from });

    await expect(repository.getSetWithCards("set-id")).resolves.toEqual({
      ok: true,
      data: {
        id: "set-id",
        title: "Biology",
        createdAt: "2026-09-24T12:00:00.000Z",
        cards: [
          {
            id: "card-id",
            question: "What is a cell?",
            answer: "The smallest unit of life.",
            createdAt: "2026-09-24T12:00:00.000Z",
          },
        ],
      },
    });
    expect(from).toHaveBeenCalledWith("flashcard_sets");
    expect(select).toHaveBeenCalledWith("id, title, created_at, flashcards(id, question, answer, created_at)");
  });
});
