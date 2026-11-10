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
        tags: ["biology"],
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
        tags: ["biology"],
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
    expect(select).toHaveBeenCalledWith("id, title, created_at, tags, flashcards(id, question, answer, created_at)");
  });
});

describe("card mutations", () => {
  function setup(data: unknown, error: unknown = null) {
    const query = {
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ data, error }),
    };
    const from = vi.fn().mockReturnValue(query);
    return { repository: createRepository({ from }), query, from };
  }

  it("updates text on the addressed card and maps its persisted result", async () => {
    const { repository, query, from } = setup({ id: "card-id", question: "Q", answer: "A", created_at: "timestamp" });
    await expect(repository.updateCard("card-id", { question: "Q", answer: "A" })).resolves.toEqual({
      ok: true,
      data: { id: "card-id", question: "Q", answer: "A", createdAt: "timestamp" },
    });
    expect(from).toHaveBeenCalledWith("flashcards");
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ question: "Q", answer: "A" });
    expect(query.eq).toHaveBeenCalledWith("id", "card-id");
  });

  it("deletes a single addressed card", async () => {
    const { repository, query, from } = setup({ id: "card-id" });
    await expect(repository.deleteCard("card-id")).resolves.toEqual({ ok: true, data: undefined });
    expect(from).toHaveBeenCalledExactlyOnceWith("flashcards");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith("id", "card-id");
  });

  it.each(["updateCard", "deleteCard"] as const)("distinguishes missing data from failures in %s", async (method) => {
    for (const error of [null, { message: "private database detail" }]) {
      const { repository } = setup(null, error);
      await expect(repository[method]("card-id", { question: "Q", answer: "A" })).resolves.toEqual({
        ok: false,
        error: error ? "request-failed" : "not-found",
      });
    }
  });
});

describe("set tag mutations", () => {
  const setId = "123e4567-e89b-42d3-a456-426614174000";
  function setup(data: unknown, error: unknown = null) {
    const query = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ data, error }),
    };
    const from = vi.fn().mockReturnValue(query);
    return { repository: createRepository({ from }), query, from };
  }

  it("replaces only tags for the addressed set and returns the persisted values", async () => {
    const { repository, query, from } = setup({ tags: ["confirmed"] });
    await expect(repository.updateSetTags(setId, [" React ", "react"])).resolves.toEqual({
      ok: true,
      data: ["confirmed"],
    });
    expect(from).toHaveBeenCalledExactlyOnceWith("flashcard_sets");
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ tags: ["react"] });
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("id", setId);
    expect(query.select).toHaveBeenCalledExactlyOnceWith("tags");
  });

  it("supports clearing and retrying the same replacement", async () => {
    const { repository, query } = setup({ tags: [] });
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(repository.updateSetTags(setId, [])).resolves.toEqual({ ok: true, data: [] });
    }
    expect(query.update.mock.calls).toEqual([[{ tags: [] }], [{ tags: [] }]]);
  });

  it("rejects invalid input before making a query", async () => {
    const { repository, from } = setup(null);
    await expect(repository.updateSetTags("bad-id", [])).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(repository.updateSetTags(setId, [" "])).resolves.toEqual({ ok: false, error: "invalid-input" });
    expect(from).not.toHaveBeenCalled();
  });

  it("distinguishes missing or hidden sets from database failures", async () => {
    await expect(setup(null).repository.updateSetTags(setId, [])).resolves.toEqual({ ok: false, error: "not-found" });
    await expect(setup(null, { message: "private" }).repository.updateSetTags(setId, [])).resolves.toEqual({
      ok: false,
      error: "request-failed",
    });
  });
});

describe("set reads", () => {
  function setup(data: unknown, error: unknown = null) {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      overrideTypes: vi.fn().mockResolvedValue({ data, error }),
    };
    return { repository: createRepository({ from: vi.fn().mockReturnValue(query) }), query };
  }

  it("orders sets newest first with an ID tie-breaker and includes empty sets", async () => {
    const { repository, query } = setup([
      { id: "empty-set", title: "Empty", created_at: "2026-11-08", tags: ["empty"] },
    ]);
    await expect(repository.listSets()).resolves.toEqual({
      ok: true,
      data: [{ id: "empty-set", title: "Empty", createdAt: "2026-11-08", tags: ["empty"] }],
    });
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: true }],
    ]);
    expect(query.select).toHaveBeenCalledWith("id, title, created_at, tags");
  });

  it("sorts cards by creation time then ID, regardless of text changes", async () => {
    const row = (id: string, created_at: string) => ({ id, created_at, question: "Q", answer: "A" });
    const data = {
      id: "set",
      title: "Title",
      tags: [],
      created_at: "2026-11-08",
      flashcards: [
        row("c", "2026-11-08T12:00:00Z"),
        row("b", "2026-11-08T10:00:00Z"),
        row("a", "2026-11-08T10:00:00Z"),
      ],
    };
    const { repository, query } = setup(data);
    const before = await repository.getSetWithCards("set");
    expect(before.ok && before.data.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
    data.flashcards[2].question = "Changed question";
    query.overrideTypes.mockResolvedValue({ data, error: null });
    const after = await repository.getSetWithCards("set");
    expect(after.ok && after.data.cards.map((card) => card.id)).toEqual(["a", "b", "c"]);
  });

  it("distinguishes an empty set, an invisible set, and a database error", async () => {
    const empty = setup({ id: "set", title: "Empty", created_at: "2026-11-08", tags: [], flashcards: null });
    await expect(empty.repository.getSetWithCards("set")).resolves.toEqual({
      ok: true,
      data: { id: "set", title: "Empty", createdAt: "2026-11-08", tags: [], cards: [] },
    });
    await expect(setup(null).repository.getSetWithCards("missing")).resolves.toEqual({ ok: false, error: "not-found" });
    const failed = setup(null, { message: "private error" }).repository;
    await expect(failed.getSetWithCards("set")).resolves.toEqual({ ok: false, error: "request-failed" });
    await expect(failed.listSets()).resolves.toEqual({ ok: false, error: "request-failed" });
  });
});
